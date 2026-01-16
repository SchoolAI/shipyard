/**
 * Pure handler functions for hook API operations.
 * These functions contain the business logic extracted from Express handlers.
 * They are called by both tRPC procedures and can be tested independently.
 */

import type { Block } from '@blocknote/core';
import { ServerBlockNoteEditor } from '@blocknote/server-util';
import {
  addDeliverable,
  type CreateHookSessionRequest,
  type CreateHookSessionResponse,
  extractDeliverables,
  type GetReviewStatusResponse,
  getPlanMetadata,
  type HookContext,
  type HookHandlers,
  initPlanMetadata,
  PLAN_INDEX_DOC_NAME,
  parseClaudeCodeOrigin,
  parseThreads,
  type ReviewFeedback,
  type SetSessionTokenResponse,
  setAgentPresence,
  setPlanIndexEntry,
  setPlanMetadata,
  type UpdatePlanContentRequest,
  type UpdatePlanContentResponse,
  type UpdatePresenceRequest,
  type UpdatePresenceResponse,
} from '@peer-plan/schema';
import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { webConfig } from './config/env/web.js';
import { getGitHubUsername, getRepositoryFullName } from './server-identity.js';

// --- Internal Helpers ---

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

  const text = (firstContent as { text: string }).text;
  // For headings, use full text; for paragraphs, truncate
  if (firstBlock.type === 'heading') {
    return text;
  }
  return text.slice(0, 50);
}

// --- Handler Implementations ---

export async function createSessionHandler(
  input: CreateHookSessionRequest,
  ctx: HookContext
): Promise<CreateHookSessionResponse> {
  const planId = nanoid();
  const now = Date.now();

  ctx.logger.info(
    { planId, sessionId: input.sessionId, agentType: input.agentType },
    'Creating plan from hook'
  );

  const PLAN_IN_PROGRESS = 'Plan in progress...';

  const ownerId = await getGitHubUsername();
  ctx.logger.info({ ownerId }, 'GitHub username for plan ownership');

  const repo = getRepositoryFullName() || undefined;
  if (repo) {
    ctx.logger.info({ repo }, 'Auto-detected repository from current directory');
  }

  const ydoc = await ctx.getOrCreateDoc(planId);

  const origin = parseClaudeCodeOrigin(input.metadata) || {
    platform: 'claude-code' as const,
    sessionId: input.sessionId,
    transcriptPath: '',
  };

  initPlanMetadata(ydoc, {
    id: planId,
    title: PLAN_IN_PROGRESS,
    status: 'draft',
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
    const metadata = ydoc.getMap('metadata');
    const initialVersion = {
      versionId: nanoid(),
      creator: input.metadata?.ownerId || 'unknown',
      platform: origin.platform,
      sessionId: origin.sessionId,
      messageCount: 0,
      createdAt: now,
    };
    metadata.set('conversationVersions', [initialVersion]);
    ctx.logger.info(
      { planId, versionId: initialVersion.versionId },
      'Added initial conversation version'
    );
  }

  const indexDoc = await ctx.getOrCreateDoc(PLAN_INDEX_DOC_NAME);
  setPlanIndexEntry(indexDoc, {
    id: planId,
    title: PLAN_IN_PROGRESS,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    ownerId,
  });

  const webUrl = webConfig.PEER_PLAN_WEB_URL;
  const url = `${webUrl}/plan/${planId}`;

  ctx.logger.info({ url }, 'Plan URL generated');

  return { planId, url };
}

export async function updateContentHandler(
  planId: string,
  input: UpdatePlanContentRequest,
  ctx: HookContext
): Promise<UpdatePlanContentResponse> {
  ctx.logger.info(
    { planId, contentLength: input.content.length },
    'Updating plan content from hook'
  );

  const ydoc = await ctx.getOrCreateDoc(planId);
  const metadata = getPlanMetadata(ydoc);

  if (!metadata) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Plan not found',
    });
  }

  const blocks = await parseMarkdownToBlocks(input.content);
  const title = extractTitleFromBlocks(blocks);

  const editor = ServerBlockNoteEditor.create();
  ydoc.transact(() => {
    const fragment = ydoc.getXmlFragment('document');
    while (fragment.length > 0) {
      fragment.delete(0, 1);
    }
    editor.blocksToYXmlFragment(blocks, fragment);

    const deliverables = extractDeliverables(blocks);
    for (const deliverable of deliverables) {
      addDeliverable(ydoc, deliverable);
    }

    if (deliverables.length > 0) {
      ctx.logger.info({ count: deliverables.length }, 'Deliverables extracted from hook content');
    }
  });

  const now = Date.now();
  setPlanMetadata(ydoc, {
    title,
    updatedAt: now,
  });

  const indexDoc = await ctx.getOrCreateDoc(PLAN_INDEX_DOC_NAME);
  if (metadata.ownerId) {
    setPlanIndexEntry(indexDoc, {
      id: planId,
      title,
      status: metadata.status,
      createdAt: metadata.createdAt ?? now,
      updatedAt: now,
      ownerId: metadata.ownerId,
    });
  } else {
    ctx.logger.warn({ planId }, 'Cannot update plan index: missing ownerId');
  }

  ctx.logger.info({ planId, title, blockCount: blocks.length }, 'Plan content updated');

  return { success: true, updatedAt: now };
}

export async function getReviewStatusHandler(
  planId: string,
  ctx: HookContext
): Promise<GetReviewStatusResponse> {
  const ydoc = await ctx.getOrCreateDoc(planId);
  const metadata = getPlanMetadata(ydoc);

  if (!metadata) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Plan not found',
    });
  }

  let feedback: ReviewFeedback[] | undefined;
  if (metadata.status === 'changes_requested') {
    const threadsMap = ydoc.getMap('threads');
    const threadsData = threadsMap.toJSON() as Record<string, unknown>;
    const threads = parseThreads(threadsData);
    feedback = threads.map((thread) => ({
      threadId: thread.id,
      blockId: thread.selectedText,
      comments: thread.comments.map((c) => ({
        author: c.userId ?? 'Reviewer',
        content: typeof c.body === 'string' ? c.body : JSON.stringify(c.body),
        createdAt: c.createdAt ?? Date.now(),
      })),
    }));
  }

  return {
    status: metadata.status,
    reviewedAt: metadata.reviewedAt,
    reviewedBy: metadata.reviewedBy,
    feedback,
  };
}

export async function updatePresenceHandler(
  planId: string,
  input: UpdatePresenceRequest,
  ctx: HookContext
): Promise<UpdatePresenceResponse> {
  const ydoc = await ctx.getOrCreateDoc(planId);
  const now = Date.now();

  setAgentPresence(ydoc, {
    agentType: input.agentType,
    sessionId: input.sessionId,
    connectedAt: now,
    lastSeenAt: now,
  });

  return { success: true };
}

export async function setSessionTokenHandler(
  planId: string,
  sessionTokenHash: string,
  ctx: HookContext
): Promise<SetSessionTokenResponse> {
  ctx.logger.info({ planId }, 'Setting session token from hook');

  const ydoc = await ctx.getOrCreateDoc(planId);
  const metadata = getPlanMetadata(ydoc);

  if (!metadata) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Plan not found',
    });
  }

  setPlanMetadata(ydoc, {
    sessionTokenHash,
    updatedAt: Date.now(),
  });

  const webUrl = webConfig.PEER_PLAN_WEB_URL;
  const url = `${webUrl}/plan/${planId}`;

  ctx.logger.info({ planId }, 'Session token set successfully');

  return { url };
}

/**
 * Creates hook handlers that use the provided context.
 * This is the factory function used by the tRPC context.
 */
export function createHookHandlers(): HookHandlers {
  return {
    createSession: (input, ctx) => createSessionHandler(input, ctx),
    updateContent: (planId, input, ctx) => updateContentHandler(planId, input, ctx),
    getReviewStatus: (planId, ctx) => getReviewStatusHandler(planId, ctx),
    updatePresence: (planId, input, ctx) => updatePresenceHandler(planId, input, ctx),
    setSessionToken: (planId, sessionTokenHash, ctx) =>
      setSessionTokenHandler(planId, sessionTokenHash, ctx),
  };
}
