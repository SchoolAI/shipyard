/**
 * HTTP API handlers for hook integration.
 * These endpoints allow the peer-plan-hook CLI to communicate with the server.
 */

import type { Block } from '@blocknote/core';
import { ServerBlockNoteEditor } from '@blocknote/server-util';
import {
  CreateHookSessionRequestSchema,
  type CreateHookSessionResponse,
  clearAgentPresence,
  type GetReviewStatusResponse,
  getPlanMetadata,
  initPlanMetadata,
  PLAN_INDEX_DOC_NAME,
  parseThreads,
  type ReviewFeedback,
  setAgentPresence,
  setPlanIndexEntry,
  setPlanMetadata,
  UpdatePlanContentRequestSchema,
  UpdatePresenceRequestSchema,
} from '@peer-plan/schema';
import type { Request, Response } from 'express';
import { nanoid } from 'nanoid';
import { logger } from './logger.js';
import { getOrCreateDoc } from './ws-server.js';

// --- Helper Functions ---

async function parseMarkdownToBlocks(markdown: string): Promise<Block[]> {
  const editor = ServerBlockNoteEditor.create();
  return await editor.tryParseMarkdownToBlocks(markdown);
}

/**
 * Extract title from first block of parsed content.
 */
function extractTitleFromBlocks(blocks: Block[]): string {
  const UNTITLED = 'Untitled Plan';
  const firstBlock = blocks[0];
  if (!firstBlock) return UNTITLED;

  const content = firstBlock.content;
  if (!content || !Array.isArray(content) || content.length === 0) {
    return UNTITLED;
  }

  const firstContent = content[0];
  if (!firstContent || typeof firstContent !== 'object' || !('text' in firstContent)) {
    return UNTITLED;
  }

  const text = (firstContent as { text: string }).text;
  // For headings, use full text; for paragraphs, truncate
  if (firstBlock.type === 'heading') {
    return text;
  }
  return text.slice(0, 50);
}

// --- POST /api/hook/session - Create a new plan session ---

export async function handleCreateSession(req: Request, res: Response): Promise<void> {
  try {
    const input = CreateHookSessionRequestSchema.parse(req.body);

    const planId = nanoid();
    const now = Date.now();

    logger.info(
      { planId, sessionId: input.sessionId, agentType: input.agentType },
      'Creating plan from hook'
    );

    const PLAN_IN_PROGRESS = 'Plan in progress...';

    // Create the Y.Doc for this plan
    const ydoc = await getOrCreateDoc(planId);
    initPlanMetadata(ydoc, {
      id: planId,
      title: PLAN_IN_PROGRESS,
      status: 'draft',
    });

    // Set initial presence
    setAgentPresence(ydoc, {
      agentType: input.agentType ?? 'claude-code',
      sessionId: input.sessionId,
      connectedAt: now,
      lastSeenAt: now,
    });

    // Update plan index
    const indexDoc = await getOrCreateDoc(PLAN_INDEX_DOC_NAME);
    setPlanIndexEntry(indexDoc, {
      id: planId,
      title: PLAN_IN_PROGRESS,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });

    // Generate URL - use simple plan ID (not snapshot) for live updates
    // In dev mode, base is '/' so route is /plan/{id}
    // In production, base is '/peer-plan/' so route is /peer-plan/plan/{id}
    const webUrl = process.env.PEER_PLAN_WEB_URL ?? 'http://localhost:5173';
    const isDev = !process.env.PEER_PLAN_WEB_URL; // If env var not set, assume dev
    const url = isDev ? `${webUrl}/plan/${planId}` : `${webUrl}/peer-plan/plan/${planId}`;

    // Note: Browser opening is handled by the hook CLI, not the server
    logger.info({ url }, 'Plan URL generated');

    const response: CreateHookSessionResponse = {
      planId,
      url,
    };

    res.json(response);
  } catch (err) {
    logger.error({ err }, 'Failed to create session');
    res.status(400).json({ error: 'Invalid request' });
  }
}

// --- PUT /api/hook/plan/:id/content - Update plan content ---

export async function handleUpdateContent(req: Request, res: Response): Promise<void> {
  try {
    const planId = req.params.id;
    if (!planId) {
      res.status(400).json({ error: 'Missing plan ID' });
      return;
    }

    const input = UpdatePlanContentRequestSchema.parse(req.body);

    logger.info({ planId, contentLength: input.content.length }, 'Updating plan content from hook');

    const ydoc = await getOrCreateDoc(planId);
    const metadata = getPlanMetadata(ydoc);

    if (!metadata) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }

    // Parse markdown to blocks and extract title
    const blocks = await parseMarkdownToBlocks(input.content);
    const title = extractTitleFromBlocks(blocks);

    // Update Y.Doc content
    const editor = ServerBlockNoteEditor.create();
    ydoc.transact(() => {
      const fragment = ydoc.getXmlFragment('document');
      // Clear existing content
      while (fragment.length > 0) {
        fragment.delete(0, 1);
      }
      editor.blocksToYXmlFragment(blocks, fragment);
    });

    // Update metadata
    const now = Date.now();
    setPlanMetadata(ydoc, {
      title,
      updatedAt: now,
    });

    // Update plan index
    const indexDoc = await getOrCreateDoc(PLAN_INDEX_DOC_NAME);
    setPlanIndexEntry(indexDoc, {
      id: planId,
      title,
      status: metadata.status,
      createdAt: metadata.createdAt ?? now,
      updatedAt: now,
    });

    logger.info({ planId, title, blockCount: blocks.length }, 'Plan content updated');

    res.json({ success: true, updatedAt: now });
  } catch (err) {
    logger.error({ err }, 'Failed to update content');
    res.status(400).json({ error: 'Invalid request' });
  }
}

// --- GET /api/hook/plan/:id/review - Get review status ---

export async function handleGetReview(req: Request, res: Response): Promise<void> {
  try {
    const planId = req.params.id;
    if (!planId) {
      res.status(400).json({ error: 'Missing plan ID' });
      return;
    }

    const ydoc = await getOrCreateDoc(planId);
    const metadata = getPlanMetadata(ydoc);

    if (!metadata) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }

    // Get feedback from threads if status is changes_requested
    let feedback: ReviewFeedback[] | undefined;
    if (metadata.status === 'changes_requested') {
      const threadsMap = ydoc.getMap('threads');
      const threadsData = threadsMap.toJSON() as Record<string, unknown>;
      const threads = parseThreads(threadsData);
      feedback = threads.map((thread) => ({
        threadId: thread.id,
        blockId: thread.selectedText, // Use selectedText as a proxy for block context
        comments: thread.comments.map((c) => ({
          author: c.userId ?? 'Reviewer',
          content: typeof c.body === 'string' ? c.body : JSON.stringify(c.body),
          createdAt: c.createdAt ?? Date.now(),
        })),
      }));
    }

    const response: GetReviewStatusResponse = {
      status: metadata.status,
      reviewedAt: metadata.reviewedAt,
      reviewedBy: metadata.reviewedBy,
      feedback,
    };

    res.json(response);
  } catch (err) {
    logger.error({ err }, 'Failed to get review status');
    res.status(500).json({ error: 'Internal error' });
  }
}

// --- POST /api/hook/plan/:id/presence - Update presence ---

export async function handleUpdatePresence(req: Request, res: Response): Promise<void> {
  try {
    const planId = req.params.id;
    if (!planId) {
      res.status(400).json({ error: 'Missing plan ID' });
      return;
    }

    const input = UpdatePresenceRequestSchema.parse(req.body);

    const ydoc = await getOrCreateDoc(planId);
    const now = Date.now();

    setAgentPresence(ydoc, {
      agentType: input.agentType,
      sessionId: input.sessionId,
      connectedAt: now, // Will be overwritten if already exists
      lastSeenAt: now,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Failed to update presence');
    res.status(400).json({ error: 'Invalid request' });
  }
}

// --- DELETE /api/hook/plan/:id/presence - Clear presence ---

export async function handleClearPresence(req: Request, res: Response): Promise<void> {
  try {
    const planId = req.params.id;
    if (!planId) {
      res.status(400).json({ error: 'Missing plan ID' });
      return;
    }

    const sessionId = req.query.sessionId as string | undefined;

    if (!sessionId) {
      res.status(400).json({ error: 'Missing sessionId' });
      return;
    }

    const ydoc = await getOrCreateDoc(planId);
    const cleared = clearAgentPresence(ydoc, sessionId);

    res.json({ success: cleared });
  } catch (err) {
    logger.error({ err }, 'Failed to clear presence');
    res.status(400).json({ error: 'Invalid request' });
  }
}
