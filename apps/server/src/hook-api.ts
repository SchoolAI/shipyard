import type { Block } from '@blocknote/core';
import { ServerBlockNoteEditor } from '@blocknote/server-util';
import {
  addConversationVersion,
  addDeliverable,
  assertNever,
  CreateHookSessionRequestSchema,
  type CreateHookSessionResponse,
  clearAgentPresence,
  createInitialConversationVersion,
  createPlanWebUrl,
  extractDeliverables,
  type GetReviewStatusResponse,
  getPlanMetadata,
  initPlanMetadata,
  PLAN_INDEX_DOC_NAME,
  parseClaudeCodeOrigin,
  parseThreads,
  type ReviewFeedback,
  setAgentPresence,
  setPlanIndexEntry,
  setPlanMetadata,
  UpdatePlanContentRequestSchema,
  UpdatePresenceRequestSchema,
  YDOC_KEYS,
} from '@shipyard/schema';
import type { Request, Response } from 'express';
import { nanoid } from 'nanoid';
import { webConfig } from './config/env/web.js';
import { getOrCreateDoc } from './doc-store.js';
import { logger } from './logger.js';
import { getGitHubUsername, getRepositoryFullName } from './server-identity.js';
import { getSessionState } from './session-registry.js';

/**
 * Extract a single string value from Express route params.
 * Handles Express 5.x type change where params can be string | string[].
 */
function getParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

async function parseMarkdownToBlocks(markdown: string): Promise<Block[]> {
  const editor = ServerBlockNoteEditor.create();
  return await editor.tryParseMarkdownToBlocks(markdown);
}

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

  const record = Object.fromEntries(Object.entries(firstContent));
  const text = record.text;
  if (typeof text !== 'string') {
    return UNTITLED;
  }
  /** For headings, use full text; for paragraphs, truncate */
  if (firstBlock.type === 'heading') {
    return text;
  }
  return text.slice(0, 50);
}

export async function handleCreateSession(req: Request, res: Response): Promise<void> {
  try {
    const input = CreateHookSessionRequestSchema.parse(req.body);

    /** Check if session already exists (idempotent - handles CLI process restarts) */
    const existingSession = getSessionState(input.sessionId);
    if (existingSession) {
      const url = createPlanWebUrl(webConfig.SHIPYARD_WEB_URL, existingSession.planId);
      logger.info(
        { planId: existingSession.planId, sessionId: input.sessionId },
        'Returning existing session (idempotent)'
      );
      const response: CreateHookSessionResponse = { planId: existingSession.planId, url };
      res.json(response);
      return;
    }

    const planId = nanoid();
    const now = Date.now();

    logger.info(
      { planId, sessionId: input.sessionId, agentType: input.agentType },
      'Creating plan from hook'
    );

    const PLAN_IN_PROGRESS = 'Plan in progress...';

    const ownerId = await getGitHubUsername();
    logger.info({ ownerId }, 'GitHub username for plan ownership');

    const repo = getRepositoryFullName() || undefined;
    if (repo) {
      logger.info({ repo }, 'Auto-detected repository from current directory');
    }

    const ydoc = await getOrCreateDoc(planId);

    const origin = parseClaudeCodeOrigin(input.metadata) || undefined;

    initPlanMetadata(ydoc, {
      id: planId,
      title: PLAN_IN_PROGRESS,
      ownerId,
      repo,
      origin,
    });

    setAgentPresence(ydoc, {
      agentType: input.agentType ?? 'claude-code',
      sessionId: input.sessionId,
      connectedAt: now,
      lastSeenAt: now,
    });

    if (origin && origin.platform === 'claude-code') {
      const creator =
        typeof input.metadata?.ownerId === 'string' ? input.metadata.ownerId : 'unknown';
      const initialVersion = createInitialConversationVersion({
        versionId: nanoid(),
        creator,
        platform: origin.platform,
        sessionId: origin.sessionId,
        messageCount: 0,
        createdAt: now,
      });
      addConversationVersion(ydoc, initialVersion);
      logger.info(
        { planId, versionId: initialVersion.versionId },
        'Added initial conversation version'
      );
    }

    const indexDoc = await getOrCreateDoc(PLAN_INDEX_DOC_NAME);
    setPlanIndexEntry(indexDoc, {
      id: planId,
      title: PLAN_IN_PROGRESS,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      ownerId,
      deleted: false,
    });

    const url = createPlanWebUrl(webConfig.SHIPYARD_WEB_URL, planId);

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

export async function handleUpdateContent(req: Request, res: Response): Promise<void> {
  try {
    const planId = getParam(req.params.id);
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

    const blocks = await parseMarkdownToBlocks(input.content);
    const title = extractTitleFromBlocks(blocks);

    const actorName = await getGitHubUsername();
    const editor = ServerBlockNoteEditor.create();
    ydoc.transact(
      () => {
        const fragment = ydoc.getXmlFragment('document');
        while (fragment.length > 0) {
          fragment.delete(0, 1);
        }
        editor.blocksToYXmlFragment(blocks, fragment);

        const deliverablesArray = ydoc.getArray(YDOC_KEYS.DELIVERABLES);
        deliverablesArray.delete(0, deliverablesArray.length);

        const deliverables = extractDeliverables(blocks);
        for (const deliverable of deliverables) {
          addDeliverable(ydoc, deliverable);
        }

        if (deliverables.length > 0) {
          logger.info({ count: deliverables.length }, 'Deliverables extracted from hook content');
        }
      },
      { actor: actorName }
    );

    const now = Date.now();
    setPlanMetadata(ydoc, {
      title,
    });

    const indexDoc = await getOrCreateDoc(PLAN_INDEX_DOC_NAME);
    if (metadata.ownerId) {
      setPlanIndexEntry(indexDoc, {
        id: planId,
        title,
        status: metadata.status,
        createdAt: metadata.createdAt ?? now,
        updatedAt: now,
        ownerId: metadata.ownerId,
        deleted: false,
      });
    } else {
      logger.warn({ planId }, 'Cannot update plan index: missing ownerId');
    }

    logger.info({ planId, title, blockCount: blocks.length }, 'Plan content updated');

    res.json({ success: true, updatedAt: now });
  } catch (err) {
    logger.error({ err }, 'Failed to update content');
    res.status(400).json({ error: 'Invalid request' });
  }
}

export async function handleGetReview(req: Request, res: Response): Promise<void> {
  try {
    const planId = getParam(req.params.id);
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

    /** Build discriminated union response based on status */
    let response: GetReviewStatusResponse;

    switch (metadata.status) {
      case 'draft':
        response = { status: 'draft' };
        break;

      case 'pending_review':
        response = {
          status: 'pending_review',
          reviewRequestId: metadata.reviewRequestId,
        };
        break;

      case 'changes_requested': {
        const threadsMap = ydoc.getMap(YDOC_KEYS.THREADS);
        const threadsData = threadsMap.toJSON();
        const threads = parseThreads(threadsData);
        const feedback: ReviewFeedback[] = threads.map((thread) => ({
          threadId: thread.id,
          blockId: thread.selectedText,
          comments: thread.comments.map((c) => ({
            author: c.userId ?? 'Reviewer',
            content: typeof c.body === 'string' ? c.body : JSON.stringify(c.body),
            createdAt: c.createdAt ?? Date.now(),
          })),
        }));

        response = {
          status: 'changes_requested',
          reviewedAt: metadata.reviewedAt,
          reviewedBy: metadata.reviewedBy,
          reviewComment: metadata.reviewComment,
          feedback: feedback.length > 0 ? feedback : undefined,
        };
        break;
      }

      case 'in_progress':
        response = {
          status: 'in_progress',
          reviewedAt: metadata.reviewedAt,
          reviewedBy: metadata.reviewedBy,
        };
        break;

      case 'completed':
        response = {
          status: 'completed',
          completedAt: metadata.completedAt,
          completedBy: metadata.completedBy,
          snapshotUrl: metadata.snapshotUrl,
        };
        break;

      default:
        assertNever(metadata);
    }

    res.json(response);
  } catch (err) {
    logger.error({ err }, 'Failed to get review status');
    res.status(500).json({ error: 'Internal error' });
  }
}

export async function handleSetSessionToken(req: Request, res: Response): Promise<void> {
  try {
    const planId = getParam(req.params.id);
    if (!planId) {
      res.status(400).json({ error: 'Missing plan ID' });
      return;
    }

    const body: unknown = req.body;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Invalid request body' });
      return;
    }
    const bodyRecord = Object.fromEntries(Object.entries(body));
    const sessionTokenHash = bodyRecord.sessionTokenHash;
    if (!sessionTokenHash || typeof sessionTokenHash !== 'string') {
      res.status(400).json({ error: 'Missing or invalid sessionTokenHash' });
      return;
    }

    logger.info({ planId }, 'Setting session token from hook');

    const ydoc = await getOrCreateDoc(planId);
    const metadata = getPlanMetadata(ydoc);

    if (!metadata) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }

    setPlanMetadata(ydoc, {
      sessionTokenHash,
    });

    const url = createPlanWebUrl(webConfig.SHIPYARD_WEB_URL, planId);

    logger.info({ planId }, 'Session token set successfully');

    res.json({ url });
  } catch (err) {
    logger.error({ err }, 'Failed to set session token');
    res.status(500).json({ error: 'Internal error' });
  }
}

export async function handleUpdatePresence(req: Request, res: Response): Promise<void> {
  try {
    const planId = getParam(req.params.id);
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
      connectedAt: now,
      lastSeenAt: now,
    });

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Failed to update presence');
    res.status(400).json({ error: 'Invalid request' });
  }
}

export async function handleClearPresence(req: Request, res: Response): Promise<void> {
  try {
    const planId = getParam(req.params.id);
    if (!planId) {
      res.status(400).json({ error: 'Missing plan ID' });
      return;
    }

    /** Validate query param - HTTP query params are untrusted external input */
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;

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
