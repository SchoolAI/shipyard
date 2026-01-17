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
  createUserResolver,
  type Deliverable,
  extractDeliverables,
  formatDeliverablesForLLM,
  formatThreadsForLLM,
  type GetReviewStatusResponse,
  getDeliverables,
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
  YDOC_KEYS,
} from '@peer-plan/schema';
import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import open from 'open';
import type * as Y from 'yjs';
import { webConfig } from './config/env/web.js';
import { hasActiveConnections } from './doc-store.js';
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

  // Open browser or navigate existing browser
  if (await hasActiveConnections(PLAN_INDEX_DOC_NAME)) {
    // Browser already connected - navigate it via CRDT
    indexDoc.getMap('navigation').set('target', planId);
    ctx.logger.info({ url, planId }, 'Browser already connected, navigating via CRDT');
  } else {
    // No browser connected - open new one
    await open(url);
    ctx.logger.info({ url }, 'Browser launched by server');
  }

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
 * Wait for approval decision by observing Y.Doc metadata changes.
 * Server-side blocking observer that survives hook process restarts.
 * Generates reviewRequestId, sets it on Y.Doc, then waits for status change.
 * Returns approval decision after status changes to 'in_progress' or 'changes_requested'.
 */
export async function waitForApprovalHandler(
  planId: string,
  _unusedParam: string, // Kept for API compatibility, will be removed in future
  ctx: HookContext
): Promise<{
  approved: boolean;
  feedback?: string;
  deliverables?: Deliverable[];
  reviewComment?: string;
  reviewedBy?: string;
  status?: string;
}> {
  const ydoc = await ctx.getOrCreateDoc(planId);
  const metadata = ydoc.getMap(YDOC_KEYS.METADATA);

  // Generate unique review request ID to prevent stale decisions
  const reviewRequestId = nanoid();

  // Set reviewRequestId and status on Y.Doc
  ydoc.transact(() => {
    metadata.set('reviewRequestId', reviewRequestId);
    metadata.set('status', 'pending_review');
    metadata.set('updatedAt', Date.now());
  });

  ctx.logger.info(
    { planId, reviewRequestId },
    '[SERVER OBSERVER] Set reviewRequestId and status, starting observation'
  );

  return new Promise((resolve) => {
    const timeout = setTimeout(
      () => {
        metadata.unobserve(checkStatus);
        resolve({
          approved: false,
          feedback: 'Review timeout - no decision received in 25 minutes',
        });
      },
      25 * 60 * 1000
    ); // 25 minutes

    const checkStatus = () => {
      const currentReviewId = metadata.get('reviewRequestId') as string | undefined;
      const status = metadata.get('status') as string | undefined;

      ctx.logger.debug(
        {
          planId,
          status,
          currentReviewId,
          expectedReviewId: reviewRequestId,
          reviewIdMatch: currentReviewId === reviewRequestId,
        },
        '[SERVER OBSERVER] Metadata changed, checking status'
      );

      // Only accept decisions that match the review request
      if (currentReviewId !== reviewRequestId) {
        ctx.logger.warn(
          {
            planId,
            expected: reviewRequestId,
            actual: currentReviewId,
            status,
          },
          '[SERVER OBSERVER] Review ID mismatch, ignoring status change'
        );
        return;
      }

      if (status === 'in_progress') {
        clearTimeout(timeout);
        metadata.unobserve(checkStatus);
        const deliverables = getDeliverables(ydoc);
        const reviewComment = metadata.get('reviewComment') as string | undefined;
        const reviewedBy = metadata.get('reviewedBy') as string | undefined;
        ctx.logger.info(
          { planId, reviewRequestId, reviewedBy },
          '[SERVER OBSERVER] Plan approved via Y.Doc - resolving promise'
        );
        resolve({ approved: true, deliverables, reviewComment, reviewedBy, status });
      } else if (status === 'changes_requested') {
        clearTimeout(timeout);
        metadata.unobserve(checkStatus);
        const feedback = extractFeedbackFromYDoc(ydoc, ctx);
        const reviewComment = metadata.get('reviewComment') as string | undefined;
        const reviewedBy = metadata.get('reviewedBy') as string | undefined;
        ctx.logger.info(
          { planId, reviewRequestId, feedback },
          '[SERVER OBSERVER] Changes requested via Y.Doc'
        );
        resolve({ approved: false, feedback, reviewComment, reviewedBy, status });
      }
    };

    // Observe changes to metadata
    ctx.logger.info({ planId, reviewRequestId }, '[SERVER OBSERVER] Registering metadata observer');
    metadata.observe(checkStatus);

    // Check status immediately in case it's already set (shouldn't happen since we just set it to pending_review)
    checkStatus();
  });
}

/**
 * Extract feedback from Y.Doc with full plan context.
 * Returns: plan content + reviewer comment + thread comments + deliverables for LLM.
 * Copied from hook's review-status.ts for server-side use.
 */
function extractFeedbackFromYDoc(ydoc: Y.Doc, ctx: HookContext): string | undefined {
  try {
    const metadataMap = ydoc.getMap(YDOC_KEYS.METADATA);
    const reviewComment = metadataMap.get('reviewComment') as string | undefined;
    const reviewedBy = metadataMap.get('reviewedBy') as string | undefined;

    const threadsMap = ydoc.getMap(YDOC_KEYS.THREADS);
    const threadsData = threadsMap.toJSON() as Record<string, unknown>;
    const threads = parseThreads(threadsData);

    // If no reviewComment and no threads, return generic message
    if (!reviewComment && threads.length === 0) {
      return 'Changes requested. Check the plan for reviewer comments.';
    }

    // Get plan content from Y.Doc for context
    const contentArray = ydoc.getArray('content');
    const blocks = contentArray.toJSON() as Array<{ content?: Array<{ text?: string }> }>;

    // Simple text extraction from BlockNote blocks
    const planText = blocks
      .map((block) => {
        if (!block.content || !Array.isArray(block.content)) return '';
        return block.content
          .map((item) => (typeof item === 'object' && item && 'text' in item ? item.text : ''))
          .join('');
      })
      .filter(Boolean)
      .join('\n');

    // Format threads using shared formatter with user name resolution
    const resolveUser = createUserResolver(ydoc);
    const feedbackText = formatThreadsForLLM(threads, {
      includeResolved: false,
      selectedTextMaxLength: 100,
      resolveUser,
    });

    // Combine: plan content + reviewer comment + thread feedback
    let output = 'Changes requested:\n\n';

    if (planText) {
      output += '## Current Plan\n\n';
      output += planText;
      output += '\n\n---\n\n';
    }

    // Add reviewer comment if present
    if (reviewComment) {
      output += '## Reviewer Comment\n\n';
      output += `> **${reviewedBy ?? 'Reviewer'}:** ${reviewComment}\n`;
      output += '\n---\n\n';
    }

    // Add inline thread feedback if any
    if (feedbackText) {
      output += '## Inline Feedback\n\n';
      output += feedbackText;
    }

    // Add deliverables section if any exist
    const deliverables = getDeliverables(ydoc);
    const deliverablesText = formatDeliverablesForLLM(deliverables);
    if (deliverablesText) {
      output += '\n\n---\n\n';
      output += deliverablesText;
    }

    return output;
  } catch (err) {
    ctx.logger.warn({ err }, 'Failed to extract feedback from Y.Doc');
    return 'Changes requested. Check the plan for reviewer comments.';
  }
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
    waitForApproval: (planId: string, reviewRequestId: string, ctx: HookContext) =>
      waitForApprovalHandler(planId, reviewRequestId, ctx),
  };
}
