/**
 * Pure handler functions for hook API operations.
 * These functions contain the business logic extracted from Express handlers.
 * They are called by both tRPC procedures and can be tested independently.
 */

import type { Block } from '@blocknote/core';
import { ServerBlockNoteEditor } from '@blocknote/server-util';
import {
  type ApprovalResult,
  addDeliverable,
  type CreateHookSessionRequest,
  type CreateHookSessionResponse,
  createUserResolver,
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
  type SessionContextResult,
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
import { computeHash } from '@peer-plan/shared';
import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import open from 'open';
import type * as Y from 'yjs';
import { webConfig } from './config/env/web.js';
import { hasActiveConnections } from './doc-store.js';
import { getGitHubUsername, getRepositoryFullName } from './server-identity.js';
import {
  assertNever,
  getSessionIdByPlanId,
  getSessionState,
  getSessionStateByPlanId,
  isSessionStateApproved,
  isSessionStateReviewed,
  isSessionStateSynced,
  setSessionState,
} from './session-registry.js';

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

  // Register session in registry
  setSessionState(input.sessionId, {
    lifecycle: 'created',
    planId,
    createdAt: now,
    lastSyncedAt: now,
  });
  ctx.logger.info({ sessionId: input.sessionId, planId }, 'Session registered in registry');

  // Open browser or navigate existing browser
  // NOTE: TOCTOU race condition - browser could close between hasActiveConnections check
  // and navigation.set(). This is acceptable because:
  // 1. The window is very small (milliseconds)
  // 2. If it happens, the browser simply won't navigate (user can do it manually)
  // 3. Adding synchronization would add complexity without significant benefit
  if (await hasActiveConnections(PLAN_INDEX_DOC_NAME)) {
    // Browser already connected - navigate it via CRDT
    // NOTE: navigation.target is never cleared by the server (acceptable race condition).
    // The browser clears it after reading. If multiple plans are created rapidly,
    // the browser may miss some navigations, but this is acceptable since the user
    // can always navigate manually via the plan list.
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

  // Update session registry with new content hash
  const sessionId = getSessionIdByPlanId(planId);
  if (sessionId) {
    const session = getSessionStateByPlanId(planId);
    if (session) {
      const contentHash = computeHash(input.content);

      // Preserve lifecycle state and add contentHash if applicable
      switch (session.lifecycle) {
        case 'created':
          // Can't add contentHash to created state - it doesn't have that field yet
          // Just update planFilePath if needed
          setSessionState(sessionId, {
            ...session,
            planFilePath: input.filePath,
          });
          break;

        case 'synced':
          // Update contentHash and planFilePath
          setSessionState(sessionId, {
            ...session,
            contentHash,
            planFilePath: input.filePath,
          });
          break;

        case 'approved':
          // Update contentHash and planFilePath, preserve all approved fields
          setSessionState(sessionId, {
            ...session,
            contentHash,
            planFilePath: input.filePath,
          });
          break;

        case 'reviewed':
          // Update contentHash and planFilePath, preserve all reviewed fields
          setSessionState(sessionId, {
            ...session,
            contentHash,
            planFilePath: input.filePath,
          });
          break;

        default:
          assertNever(session);
      }

      ctx.logger.info(
        { planId, sessionId, contentHash, lifecycle: session.lifecycle },
        'Updated session registry with content hash'
      );
    }
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

  // Return discriminated union based on status
  switch (metadata.status) {
    case 'draft':
      return { status: 'draft' };

    case 'pending_review':
      return {
        status: 'pending_review',
        reviewRequestId: metadata.reviewRequestId,
      };

    case 'changes_requested': {
      // Extract feedback from threads
      const threadsMap = ydoc.getMap('threads');
      const threadsData = threadsMap.toJSON() as Record<string, unknown>;
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

      return {
        status: 'changes_requested',
        reviewedAt: metadata.reviewedAt,
        reviewedBy: metadata.reviewedBy,
        reviewComment: metadata.reviewComment,
        feedback: feedback.length > 0 ? feedback : undefined,
      };
    }

    case 'in_progress':
      return {
        status: 'in_progress',
        reviewedAt: metadata.reviewedAt,
        reviewedBy: metadata.reviewedBy,
      };

    case 'completed':
      return {
        status: 'completed',
        completedAt: metadata.completedAt,
        completedBy: metadata.completedBy,
        snapshotUrl: metadata.snapshotUrl,
      };

    default:
      assertNever(metadata);
  }
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

  // Update session registry with session token hash - transition to 'synced' if needed
  const session = getSessionStateByPlanId(planId);
  const sessionId = getSessionIdByPlanId(planId);
  if (session && sessionId) {
    switch (session.lifecycle) {
      case 'created':
        // Transition from created to synced
        // Note: contentHash may not be set yet (happens in updateContent after token)
        setSessionState(sessionId, {
          lifecycle: 'synced',
          planId: session.planId,
          planFilePath: session.planFilePath,
          createdAt: session.createdAt,
          lastSyncedAt: session.lastSyncedAt,
          contentHash: '', // Will be updated by next updateContent call
          sessionToken: sessionTokenHash,
          url,
        });
        ctx.logger.info({ planId, sessionId }, 'Transitioned session to synced state');
        break;

      case 'synced':
        // Update sessionToken and url
        setSessionState(sessionId, {
          ...session,
          sessionToken: sessionTokenHash,
          url,
        });
        ctx.logger.info({ planId, sessionId }, 'Updated session token in synced state');
        break;

      case 'approved':
        // Update sessionToken and url, preserve all approved fields
        setSessionState(sessionId, {
          ...session,
          sessionToken: sessionTokenHash,
          url,
        });
        ctx.logger.info({ planId, sessionId }, 'Updated session token in approved state');
        break;

      case 'reviewed':
        // Update sessionToken and url, preserve all reviewed fields
        setSessionState(sessionId, {
          ...session,
          sessionToken: sessionTokenHash,
          url,
        });
        ctx.logger.info({ planId, sessionId }, 'Updated session token in reviewed state');
        break;

      default:
        assertNever(session);
    }
  }

  ctx.logger.info({ planId }, 'Session token set successfully');

  return { url };
}

/**
 * Wait for approval decision by observing Y.Doc metadata changes.
 * Server-side blocking observer that survives hook process restarts.
 * Generates reviewRequestId, sets it on Y.Doc, then waits for status change.
 * Returns approval decision after status changes to 'in_progress' or 'changes_requested'.
 *
 * NOTE: Observer cleanup on server crash/restart:
 * In-memory observers are lost on server restart, which is expected behavior.
 * The next hook call will create a new observer and continue waiting.
 * This is acceptable because the review state is persisted in Y.Doc.
 *
 * @param planId - The plan ID to wait for approval on
 * @param _reviewRequestIdParam - DEPRECATED: Previously used to provide a reviewRequestId from the client,
 *                                but this created race conditions. Now the server always generates a new
 *                                reviewRequestId to ensure uniqueness. This parameter is kept for API
 *                                compatibility but is ignored. Will be removed in a future version.
 */
export async function waitForApprovalHandler(
  planId: string,
  _reviewRequestIdParam: string,
  ctx: HookContext
): Promise<ApprovalResult> {
  let ydoc: Y.Doc;
  try {
    ydoc = await ctx.getOrCreateDoc(planId);
  } catch (err) {
    ctx.logger.error({ err, planId }, 'Failed to get or create doc for approval waiting');
    throw err;
  }

  const metadata = ydoc.getMap(YDOC_KEYS.METADATA);

  // Generate unique review request ID to prevent stale decisions
  const reviewRequestId = nanoid();

  // Set reviewRequestId and status on Y.Doc
  // CRITICAL: Only set reviewRequestId if status is not already 'pending_review'
  // This prevents race condition where two hooks overwrite each other's reviewRequestId
  ydoc.transact(() => {
    const currentStatus = metadata.get('status') as string | undefined;
    if (currentStatus === 'pending_review') {
      ctx.logger.warn(
        { planId, currentStatus },
        'Status already pending_review, another hook may be waiting. Skipping reviewRequestId update.'
      );
      return;
    }
    metadata.set('reviewRequestId', reviewRequestId);
    metadata.set('status', 'pending_review');
    metadata.set('updatedAt', Date.now());
  });

  ctx.logger.info(
    { planId, reviewRequestId },
    '[SERVER OBSERVER] Set reviewRequestId and status, starting observation'
  );

  // Extract common review data from Y.Doc metadata
  const getReviewData = () => ({
    reviewComment: metadata.get('reviewComment') as string | undefined,
    reviewedBy: metadata.get('reviewedBy') as string | undefined,
  });

  // Update session registry with review decision data
  // NOTE: This read-modify-write pattern has a potential race condition if multiple
  // approval handlers update the same session concurrently. However, this is acceptable
  // because:
  // 1. The race condition check at the top of this function prevents concurrent calls
  // 2. If a race still occurs, the last write wins, which is acceptable for review decisions
  // 3. Adding proper atomicity (e.g., with locks) would add complexity without significant benefit
  const updateSessionRegistry = (
    status: string,
    extraData: { approvedAt?: number; deliverables?: Array<{ id: string; text: string }> } = {}
  ) => {
    const session = getSessionStateByPlanId(planId);
    const sessionId = getSessionIdByPlanId(planId);
    if (!session || !sessionId) return;

    const { reviewComment, reviewedBy } = getReviewData();

    // Must be synced, approved, or reviewed to transition
    if (
      !isSessionStateSynced(session) &&
      !isSessionStateApproved(session) &&
      !isSessionStateReviewed(session)
    ) {
      ctx.logger.warn(
        { sessionId, lifecycle: session.lifecycle },
        'Cannot transition to approved/reviewed from non-synced state'
      );
      return;
    }

    // Base fields from current session
    const baseState = {
      planId: session.planId,
      planFilePath: session.planFilePath,
      createdAt: session.createdAt,
      lastSyncedAt: session.lastSyncedAt,
    };

    // Get synced state fields (contentHash, sessionToken, url) using type guards
    const syncedFields = {
      contentHash: session.contentHash,
      sessionToken: session.sessionToken,
      url: session.url,
    };

    if (status === 'in_progress' && extraData.approvedAt && extraData.deliverables) {
      // Transition to approved state
      setSessionState(sessionId, {
        lifecycle: 'approved',
        ...baseState,
        ...syncedFields,
        approvedAt: extraData.approvedAt,
        deliverables: extraData.deliverables,
        reviewComment,
        reviewedBy,
      });
    } else if (status === 'changes_requested' && reviewedBy) {
      // Transition to reviewed state
      // Get deliverables from current session or from extraData
      const deliverables =
        extraData.deliverables ||
        (isSessionStateApproved(session) || isSessionStateReviewed(session)
          ? session.deliverables
          : []);

      setSessionState(sessionId, {
        lifecycle: 'reviewed',
        ...baseState,
        ...syncedFields,
        deliverables,
        reviewComment: reviewComment || '',
        reviewedBy,
        reviewStatus: status,
      });
    } else {
      ctx.logger.warn(
        {
          sessionId,
          status,
          hasApprovedAt: !!extraData.approvedAt,
          hasDeliverables: !!extraData.deliverables,
          hasReviewedBy: !!reviewedBy,
        },
        'Cannot transition - missing required fields for lifecycle transition'
      );
      return;
    }

    ctx.logger.info(
      {
        planId,
        sessionId,
        ...(extraData.deliverables && { deliverableCount: extraData.deliverables.length }),
      },
      `Stored ${status === 'in_progress' ? 'approval' : 'rejection'} data in session registry`
    );
  };

  // Handle approved status - plan is ready for implementation
  const handleApproved = (): ApprovalResult => {
    const deliverables = getDeliverables(ydoc);
    const deliverableInfos = deliverables.map((d) => ({ id: d.id, text: d.text }));
    updateSessionRegistry('in_progress', {
      approvedAt: Date.now(),
      deliverables: deliverableInfos,
    });

    const { reviewComment, reviewedBy } = getReviewData();
    ctx.logger.info(
      { planId, reviewRequestId, reviewedBy },
      '[SERVER OBSERVER] Plan approved via Y.Doc - resolving promise'
    );
    return {
      approved: true,
      deliverables,
      reviewComment,
      reviewedBy: reviewedBy || 'unknown', // Required by schema
      status: 'in_progress' as const,
    };
  };

  // Handle changes_requested status - reviewer wants modifications
  const handleChangesRequested = (): ApprovalResult => {
    updateSessionRegistry('changes_requested');
    const feedback = extractFeedbackFromYDoc(ydoc, ctx);
    const { reviewComment, reviewedBy } = getReviewData();

    ctx.logger.info(
      { planId, reviewRequestId, feedback },
      '[SERVER OBSERVER] Changes requested via Y.Doc'
    );
    return {
      approved: false,
      feedback: feedback || 'Changes requested', // Required by schema
      status: 'changes_requested' as const,
      reviewComment,
      reviewedBy,
    };
  };

  return new Promise((resolve, reject) => {
    const APPROVAL_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes (matches client timeout)
    let timeout: NodeJS.Timeout | null = null;
    let checkStatus: (() => void) | null = null;

    // Helper: Check if status change should be processed (matching review ID + terminal state)
    const shouldProcessStatusChange = (
      currentReviewId: string | undefined,
      status: string | undefined
    ): boolean => {
      // Ignore stale decisions from previous review requests
      if (currentReviewId !== reviewRequestId) {
        ctx.logger.warn(
          { planId, expected: reviewRequestId, actual: currentReviewId, status },
          '[SERVER OBSERVER] Review ID mismatch, ignoring status change'
        );
        return false;
      }
      // Only handle terminal states (approved or changes requested)
      const isTerminalState = status === 'in_progress' || status === 'changes_requested';
      return isTerminalState;
    };

    // Helper: Clean up observer and timeout
    const cleanupObserver = () => {
      if (timeout) clearTimeout(timeout);
      if (checkStatus) metadata.unobserve(checkStatus);
    };

    try {
      // NOTE: Timeout resolves (not rejects) with approved: false.
      // This is intentional behavior - timeouts are treated as "no approval"
      // rather than errors. The hook can handle this gracefully by blocking
      // the agent with a timeout message instead of crashing.
      timeout = setTimeout(() => {
        if (checkStatus) {
          metadata.unobserve(checkStatus);
        }
        resolve({
          approved: false,
          feedback: 'Review timeout - no decision received in 30 minutes',
          status: 'timeout' as const,
        });
      }, APPROVAL_TIMEOUT_MS);

      checkStatus = () => {
        const currentReviewId = metadata.get('reviewRequestId') as string | undefined;
        const status = metadata.get('status') as string | undefined;

        ctx.logger.debug(
          { planId, status, currentReviewId, expectedReviewId: reviewRequestId },
          '[SERVER OBSERVER] Metadata changed, checking status'
        );

        if (!shouldProcessStatusChange(currentReviewId, status)) return;

        cleanupObserver();
        resolve(status === 'in_progress' ? handleApproved() : handleChangesRequested());
      };

      // Observe changes to metadata
      ctx.logger.info(
        { planId, reviewRequestId },
        '[SERVER OBSERVER] Registering metadata observer'
      );
      metadata.observe(checkStatus);

      // Check status immediately in case it's already set (shouldn't happen since we just set it to pending_review)
      checkStatus();
    } catch (err) {
      // Cleanup observer and timeout if setup fails
      if (timeout) clearTimeout(timeout);
      if (checkStatus) {
        try {
          metadata.unobserve(checkStatus);
        } catch (unobserveErr) {
          ctx.logger.warn({ err: unobserveErr }, 'Failed to unobserve during error cleanup');
        }
      }
      ctx.logger.error({ err, planId }, 'Failed to setup approval observer');
      reject(err);
    }
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
 * Get formatted deliverable context for Claude Code injection.
 * Formats session info, deliverables, and reviewer feedback for post-exit injection.
 * @param planId - Plan ID
 * @param sessionToken - Plaintext session token (stored in hook's local state, not on server)
 * @param ctx - Hook context
 */
export async function getDeliverableContextHandler(
  planId: string,
  sessionToken: string,
  ctx: HookContext
): Promise<{ context: string }> {
  const ydoc = await ctx.getOrCreateDoc(planId);
  const metadata = getPlanMetadata(ydoc);

  if (!metadata) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Plan not found',
    });
  }

  const deliverables = getDeliverables(ydoc);
  const webUrl = webConfig.PEER_PLAN_WEB_URL;
  const url = `${webUrl}/plan/${planId}`;

  // Format deliverables section
  let deliverablesSection = '';
  if (deliverables.length > 0) {
    deliverablesSection = `\n## Deliverables\n\nAttach proof to each deliverable using add_artifact:\n\n`;
    for (const d of deliverables) {
      deliverablesSection += `- ${d.text}\n  deliverableId="${d.id}"\n`;
    }
  } else {
    deliverablesSection = `\n## Deliverables\n\nNo deliverables marked in this plan. You can still upload artifacts without linking them.`;
  }

  // Build feedback section if reviewer provided a comment
  let feedbackSection = '';
  if (metadata.status === 'changes_requested' && metadata.reviewComment?.trim()) {
    feedbackSection = `\n## Reviewer Feedback\n\n${metadata.reviewedBy ? `**From:** ${metadata.reviewedBy}\n\n` : ''}${metadata.reviewComment}\n\n`;
  }

  // Build approval message based on status
  const approvalMessage =
    metadata.status === 'changes_requested'
      ? '[PEER-PLAN] Changes requested on your plan ⚠️'
      : '[PEER-PLAN] Plan approved! 🎉';

  const context = `${approvalMessage}
${deliverablesSection}${feedbackSection}
## Session Info

planId="${planId}"
sessionToken="${sessionToken}"
url="${url}"

## How to Attach Proof

For each deliverable above, call:
\`\`\`
add_artifact(
  planId="${planId}",
  sessionToken="${sessionToken}",
  type="screenshot",  // or "video", "test_results", "diff"
  filePath="/path/to/file.png",
  deliverableId="<id from above>"
)
\`\`\`

When the LAST deliverable gets an artifact, the task auto-completes and returns a snapshot URL for your PR.`;

  return { context };
}

/**
 * Get session context for post-exit injection.
 * Returns session data from registry without deleting it (idempotent).
 * TTL cleanup will handle deletion of stale sessions.
 * This eliminates the need for hook's local state.ts file.
 */
export async function getSessionContextHandler(
  sessionId: string,
  ctx: HookContext
): Promise<SessionContextResult> {
  ctx.logger.info({ sessionId }, 'Getting session context for post-exit injection');

  // Get session from registry (idempotent read)
  const sessionState = getSessionState(sessionId);

  if (!sessionState) {
    ctx.logger.warn({ sessionId }, 'Session not found in registry');
    return { found: false };
  }

  // Only approved or reviewed sessions have the required fields for post-exit injection
  if (isSessionStateApproved(sessionState)) {
    ctx.logger.info(
      { sessionId, planId: sessionState.planId },
      'Session context retrieved (approved state, idempotent)'
    );

    return {
      found: true,
      planId: sessionState.planId,
      sessionToken: sessionState.sessionToken,
      url: sessionState.url,
      deliverables: sessionState.deliverables,
      reviewComment: sessionState.reviewComment,
      reviewedBy: sessionState.reviewedBy,
    };
  }

  if (isSessionStateReviewed(sessionState)) {
    ctx.logger.info(
      { sessionId, planId: sessionState.planId },
      'Session context retrieved (reviewed state, idempotent)'
    );

    return {
      found: true,
      planId: sessionState.planId,
      sessionToken: sessionState.sessionToken,
      url: sessionState.url,
      deliverables: sessionState.deliverables,
      reviewComment: sessionState.reviewComment,
      reviewedBy: sessionState.reviewedBy,
      reviewStatus: sessionState.reviewStatus,
    };
  }

  // Session exists but not in a terminal state yet
  ctx.logger.warn(
    { sessionId, lifecycle: sessionState.lifecycle },
    'Session not ready for post-exit injection'
  );
  return { found: false };
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
    getDeliverableContext: (planId: string, sessionToken: string, ctx: HookContext) =>
      getDeliverableContextHandler(planId, sessionToken, ctx),
    getSessionContext: (sessionId: string, ctx: HookContext) =>
      getSessionContextHandler(sessionId, ctx),
  };
}
