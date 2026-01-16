/**
 * Review status checking and feedback formatting.
 * Uses Y.Doc observer for distributed approval flow.
 *
 * NOTE: Shared formatting utilities (parseThreads, formatThreadsForLLM, formatDeliverablesForLLM,
 * getDeliverables, createUserResolver) are already extracted to @peer-plan/schema.
 * Hook-specific logic (waitForReviewDecision, extractFeedbackFromYDoc, checkReviewStatus)
 * remains here because it handles the hook's blocking Y.Doc observer pattern.
 */
import {
  createUserResolver,
  type Deliverable,
  formatDeliverablesForLLM,
  formatThreadsForLLM,
  type GetReviewStatusResponse,
  getDeliverables,
  parseThreads,
  type ReviewFeedback,
} from '@peer-plan/schema';
import { computeHash } from '@peer-plan/shared';
import { nanoid } from 'nanoid';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import type { CoreResponse } from '../adapters/types.js';
import { webConfig } from '../config/env/web.js';
import { DEFAULT_AGENT_TYPE } from '../constants.js';
import {
  getReviewStatus,
  getWebSocketUrl,
  setSessionToken,
  updatePlanContent,
} from '../http-client.js';
import { logger } from '../logger.js';
import { generateSessionToken, hashSessionToken } from '../session-token.js';
import {
  type DeliverableInfo,
  deleteSessionState,
  getSessionState,
  type SessionState,
  setSessionState,
} from '../state.js';
import { createPlan } from './plan-manager.js';

// --- Review Decision Types ---

interface ReviewDecision {
  approved: boolean;
  feedback?: string;
  deliverables?: Deliverable[];
}

// --- Y.Doc Observer for Review Decision ---

const REVIEW_TIMEOUT_MS = 25 * 60 * 1000; // 25 minutes

/**
 * Wait for review decision by observing Y.Doc metadata changes.
 * Connects to MCP server's WebSocket and watches for status changes.
 * Uses a unique reviewRequestId to prevent stale decisions from previous cycles.
 */
async function waitForReviewDecision(
  planId: string,
  wsUrl: string
): Promise<ReviewDecision & { reviewComment?: string; reviewedBy?: string; status?: string }> {
  const ydoc = new Y.Doc();

  // Generate unique ID for this review request to prevent stale decisions
  const reviewRequestId = nanoid();

  logger.info({ planId, wsUrl, reviewRequestId }, 'Connecting to WebSocket for Y.Doc sync');

  const provider = new WebsocketProvider(wsUrl, planId, ydoc, {
    connect: true,
  });

  // Add ping/pong keep-alive every 30 seconds
  const pingInterval = setInterval(() => {
    if (provider.wsconnected && provider.ws?.readyState === provider.ws?.OPEN) {
      // In Node.js, y-websocket uses the 'ws' package which has a ping() method
      (provider.ws as unknown as { ping: () => void }).ping();
    }
  }, 30000);

  return new Promise((resolve) => {
    const metadata = ydoc.getMap('metadata');
    let resolved = false;
    let syncComplete = false;

    const cleanup = () => {
      clearInterval(pingInterval);
      if (!resolved) {
        resolved = true;
        provider.destroy();
      }
    };

    const checkStatus = () => {
      if (resolved) return;

      // Don't check until sync complete and reviewRequestId is set
      if (!syncComplete) {
        logger.debug({ planId }, 'Ignoring status check until sync complete');
        return;
      }

      const currentReviewId = metadata.get('reviewRequestId') as string | undefined;

      // Only accept decisions that match OUR review request
      if (currentReviewId !== reviewRequestId) {
        logger.debug(
          { planId, expected: reviewRequestId, actual: currentReviewId },
          'Review ID mismatch, ignoring status change'
        );
        return;
      }

      const status = metadata.get('status') as string | undefined;
      logger.debug({ planId, status, reviewRequestId }, 'Checking Y.Doc status');

      if (status === 'in_progress') {
        logger.info({ planId, reviewRequestId }, 'Plan approved via Y.Doc');
        // Extract deliverables to include in approval response
        const deliverables = getDeliverables(ydoc);
        // Extract reviewer metadata
        const reviewComment = metadata.get('reviewComment') as string | undefined;
        const reviewedBy = metadata.get('reviewedBy') as string | undefined;
        cleanup();
        resolve({ approved: true, deliverables, reviewComment, reviewedBy, status });
      } else if (status === 'changes_requested') {
        // Extract feedback from threads if available
        const feedback = extractFeedbackFromYDoc(ydoc);
        // Extract reviewer metadata
        const reviewComment = metadata.get('reviewComment') as string | undefined;
        const reviewedBy = metadata.get('reviewedBy') as string | undefined;
        logger.info({ planId, reviewRequestId, feedback }, 'Changes requested via Y.Doc');
        cleanup();
        resolve({ approved: false, feedback, reviewComment, reviewedBy, status });
      }
    };

    // Wait for sync before setting review request ID
    provider.on('sync', (isSynced: boolean) => {
      if (isSynced && !syncComplete) {
        logger.info({ planId, reviewRequestId }, 'Y.Doc synced, setting review request ID');

        // Set unique review request ID and reset status
        // This prevents using stale approve/deny from previous review cycle
        ydoc.transact(() => {
          metadata.set('reviewRequestId', reviewRequestId);
          metadata.set('status', 'pending_review');
          metadata.set('updatedAt', Date.now());
        });

        // Mark sync as complete so checkStatus can now process changes
        syncComplete = true;

        logger.info({ planId, reviewRequestId }, 'Review request ID set, waiting for decision');
      }
    });

    // Observe changes to metadata
    metadata.observe(() => {
      checkStatus();
    });

    // Log when connection is established
    provider.on('status', ({ status }: { status: string }) => {
      logger.debug({ planId, status }, 'WebSocket status changed');
    });

    // Timeout after 25 minutes
    setTimeout(() => {
      if (!resolved) {
        logger.warn({ planId }, 'Review timeout - no decision received');
        cleanup();
        resolve({
          approved: false,
          feedback: 'Review timeout - no decision received in 25 minutes',
        });
      }
    }, REVIEW_TIMEOUT_MS);

    // Handle connection errors
    provider.on('connection-error', (event: Event) => {
      logger.error({ planId, event }, 'WebSocket connection error');
    });

    provider.on('connection-close', (event: CloseEvent | null) => {
      if (!resolved) {
        logger.warn({ planId, code: event?.code }, 'WebSocket connection closed unexpectedly');
      }
    });
  });
}

/**
 * Extract feedback from Y.Doc with full plan context.
 * Returns: plan content + reviewer comment + thread comments + deliverables for LLM.
 */
function extractFeedbackFromYDoc(ydoc: Y.Doc): string | undefined {
  try {
    // Get reviewer comment from metadata
    const metadataMap = ydoc.getMap('metadata');
    const reviewComment = metadataMap.get('reviewComment') as string | undefined;
    const reviewedBy = metadataMap.get('reviewedBy') as string | undefined;

    const threadsMap = ydoc.getMap('threads');
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

    // Add reviewer comment if present (this is the top-level feedback from approve/request changes)
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

    // Add deliverables section if any exist (uses shared formatter)
    const deliverables = getDeliverables(ydoc);
    const deliverablesText = formatDeliverablesForLLM(deliverables);
    if (deliverablesText) {
      output += '\n\n---\n\n';
      output += deliverablesText;
    }

    return output;
  } catch (err) {
    logger.warn({ err }, 'Failed to extract feedback from Y.Doc');
    return 'Changes requested. Check the plan for reviewer comments.';
  }
}

// --- Review Status Check ---

/**
 * Handle review of updated plan content.
 * Called when plan content has changed since last approval.
 * Re-syncs content and blocks for new review decision.
 */
async function handleUpdatedPlanReview(
  sessionId: string,
  planId: string,
  planContent: string,
  sessionState: SessionState,
  _originMetadata?: Record<string, unknown>
): Promise<CoreResponse> {
  logger.info(
    { planId, contentLength: planContent.length },
    'Plan content changed, triggering re-review'
  );

  // Get WebSocket URL from registry
  const wsUrl = await getWebSocketUrl();
  if (!wsUrl) {
    logger.error({ planId }, 'No WebSocket server available - MCP server not running?');
    // Fail closed if we can't connect
    return {
      allow: false,
      message: 'Cannot connect to peer-plan server. Please start the MCP server and try again.',
    };
  }

  // Sync updated content
  logger.info({ planId }, 'Syncing updated plan content');
  try {
    await updatePlanContent(planId, {
      content: planContent,
    });
  } catch (err) {
    const error = err as Error;
    // If plan doesn't exist (404), create a new plan seamlessly
    if (error.message?.includes('404')) {
      logger.warn(
        { planId, sessionId },
        'Plan not found (404), creating new plan with updated content'
      );
      deleteSessionState(sessionId);

      // Recursively call the new plan creation path
      // This will create the plan, sync content, and block for approval
      return await checkReviewStatus(sessionId, planContent, _originMetadata);
    }
    throw err;
  }

  const baseUrl = webConfig.PEER_PLAN_WEB_URL;
  logger.info(
    { planId, url: `${baseUrl}/plan/${planId}` },
    'Content synced, browser already open. Waiting for Y.Doc status change...'
  );

  // Block until user approves/denies via Y.Doc observer
  const decision = await waitForReviewDecision(planId, wsUrl);
  logger.info({ planId, approved: decision.approved }, 'Decision received via Y.Doc');

  if (decision.approved) {
    // Generate NEW session token on re-approval
    const sessionToken = generateSessionToken();
    const sessionTokenHash = hashSessionToken(sessionToken);

    logger.info({ planId }, 'Generating new session token for re-approved plan');

    try {
      // Set the token hash on the server
      const tokenResult = await setSessionToken(planId, sessionTokenHash);
      const url = tokenResult.url;

      // Convert deliverables to simplified format for state storage
      const deliverableInfos: DeliverableInfo[] = (decision.deliverables ?? []).map((d) => ({
        id: d.id,
        text: d.text,
      }));

      // Update state with new token and content hash
      const newContentHash = computeHash(planContent);
      setSessionState(sessionId, {
        ...sessionState,
        sessionToken,
        url,
        approvedAt: Date.now(),
        contentHash: newContentHash,
        deliverables: deliverableInfos,
        reviewComment: decision.reviewComment,
        reviewedBy: decision.reviewedBy,
        reviewStatus: decision.status,
      });

      logger.info(
        { planId, url, deliverableCount: deliverableInfos.length },
        'Session token set and stored with updated content hash'
      );

      return {
        allow: true,
        message: 'Updated plan approved',
        planId,
        sessionToken,
        url,
      };
    } catch (err) {
      logger.error({ err, planId }, 'Failed to set session token, but plan was approved');
      // Still approve since human approved, just without token
      deleteSessionState(sessionId);
      return {
        allow: true,
        message: 'Updated plan approved (session token unavailable)',
        planId,
      };
    }
  }

  // Changes requested - clear state for fresh review cycle
  deleteSessionState(sessionId);
  logger.debug({ planId }, 'Cleared session state for fresh review cycle');

  return {
    allow: false,
    message: decision.feedback || 'Changes requested',
    planId,
  };
}

/**
 * Check review status for a session's plan.
 * Called when agent tries to exit plan mode.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex review flow requires conditional logic
export async function checkReviewStatus(
  sessionId: string,
  planContent?: string,
  originMetadata?: Record<string, unknown>
): Promise<CoreResponse> {
  let state = getSessionState(sessionId);
  let planId: string;

  // Blocking approach: Create plan from ExitPlanMode if we have content
  if (!state && planContent) {
    logger.info(
      { sessionId, contentLength: planContent.length },
      'Creating plan from ExitPlanMode (blocking mode)'
    );

    // Get WebSocket URL from registry
    const wsUrl = await getWebSocketUrl();
    if (!wsUrl) {
      logger.error({ sessionId }, 'No WebSocket server available - MCP server not running?');
      // Fail closed if we can't connect
      return {
        allow: false,
        message: 'Cannot connect to peer-plan server. Please start the MCP server and try again.',
      };
    }

    // Create plan (this opens browser)
    const result = await createPlan({
      sessionId,
      agentType: DEFAULT_AGENT_TYPE,
      metadata: {
        source: 'ExitPlanMode',
        ...originMetadata, // Spread origin fields (originSessionId, originTranscriptPath, originCwd)
      },
    });

    planId = result.planId;

    // Sync content immediately
    logger.info({ planId }, 'Syncing plan content');
    await updatePlanContent(planId, {
      content: planContent,
      // filePath removed - server doesn't use it, was metadata only
    });

    state = getSessionState(sessionId);
    logger.info(
      { planId, url: result.url },
      'Plan created and synced, browser opened. Waiting for Y.Doc status change...'
    );

    // Block until user approves/denies via Y.Doc observer
    const decision = await waitForReviewDecision(planId, wsUrl);
    logger.info({ planId, approved: decision.approved }, 'Decision received via Y.Doc');

    if (decision.approved) {
      // Generate session token on approval so Claude can call add_artifact, etc.
      const sessionToken = generateSessionToken();
      const sessionTokenHash = hashSessionToken(sessionToken);

      logger.info({ planId }, 'Generating session token for approved plan');

      try {
        // Set the token hash on the server
        const tokenResult = await setSessionToken(planId, sessionTokenHash);
        const url = tokenResult.url;

        // Convert deliverables to simplified format for state storage
        const deliverableInfos: DeliverableInfo[] = (decision.deliverables ?? []).map((d) => ({
          id: d.id,
          text: d.text,
        }));

        // Store in state for PostToolUse hook to read
        const currentState = getSessionState(sessionId);
        if (currentState) {
          setSessionState(sessionId, {
            ...currentState,
            sessionToken,
            url,
            approvedAt: Date.now(),
            deliverables: deliverableInfos,
            reviewComment: decision.reviewComment,
            reviewedBy: decision.reviewedBy,
            reviewStatus: decision.status,
          });
        }

        logger.info(
          { planId, url, deliverableCount: deliverableInfos.length },
          'Session token set and stored with deliverables'
        );

        return {
          allow: true,
          message: 'Plan approved',
          planId,
          sessionToken,
          url,
        };
      } catch (err) {
        logger.error({ err, planId }, 'Failed to set session token, approving without it');
        // Still approve, just without token - clear state
        deleteSessionState(sessionId);
        return {
          allow: true,
          message: 'Plan approved (session token unavailable)',
          planId,
        };
      }
    }

    // Changes requested - clear state for fresh review cycle
    deleteSessionState(sessionId);
    logger.debug({ sessionId }, 'Cleared session state for fresh review cycle');

    return {
      allow: false,
      message: decision.feedback || 'Changes requested',
      planId,
    };
  }

  if (!state) {
    // No state and no plan content - allow exit
    logger.info({ sessionId }, 'No session state or plan content, allowing exit');
    return { allow: true };
  }

  // Check if content has changed since last approval
  if (state && planContent) {
    const newHash = computeHash(planContent);
    // Treat missing contentHash as "changed" to handle legacy state
    if (!state.contentHash || state.contentHash !== newHash) {
      logger.info(
        { planId: state.planId, oldHash: state.contentHash, newHash },
        'Plan content changed, triggering re-review'
      );
      return await handleUpdatedPlanReview(
        sessionId,
        state.planId,
        planContent,
        state,
        originMetadata
      );
    }
    // Hash matches - fall through to normal status check
    logger.debug({ planId: state.planId }, 'Plan content unchanged, checking status');
  }

  planId = state.planId;

  logger.info({ sessionId, planId }, 'Checking review status');

  let status: GetReviewStatusResponse;
  try {
    status = await getReviewStatus(planId);
  } catch (err) {
    // If we can't check status, fail closed
    logger.warn({ err, planId }, 'Failed to get review status, blocking exit');
    return {
      allow: false,
      message: 'Cannot verify plan approval status. Please check the peer-plan server.',
      planId,
    };
  }

  logger.info({ sessionId, planId, status: status.status }, 'Review status retrieved');

  const baseUrl = webConfig.PEER_PLAN_WEB_URL;

  switch (status.status) {
    case 'changes_requested':
      return {
        allow: false,
        message: formatFeedbackMessage(status.feedback),
        feedback: status.feedback,
        planId,
      };

    case 'pending_review':
      return {
        allow: false,
        message: `Plan is pending review.\n\nOpen: ${baseUrl}/plan/${planId}`,
        planId,
      };

    case 'draft':
      return {
        allow: false,
        message: `Plan is still in draft.\n\nSubmit for review at: ${baseUrl}/plan/${planId}`,
        planId,
      };

    case 'in_progress':
      // Plan is approved and work is in progress - allow exit to continue work
      return {
        allow: true,
        message: 'Plan approved. Work is in progress.',
        planId,
      };

    case 'completed':
      // Task is completed - allow exit
      return {
        allow: true,
        message: status.reviewedBy ? `Task completed by ${status.reviewedBy}` : 'Task completed',
        planId,
      };

    default: {
      // Exhaustive check for unknown status values
      const _exhaustive: never = status.status;
      logger.warn({ status: _exhaustive }, 'Unknown plan status, treating as draft');
      return {
        allow: false,
        message: `Plan status unknown.\n\nOpen: ${baseUrl}/plan/${planId}`,
        planId,
      };
    }
  }
}

// --- Feedback Formatting ---

/**
 * Format review feedback into a human-readable message.
 */
function formatFeedbackMessage(feedback?: ReviewFeedback[]): string {
  if (!feedback?.length) {
    return 'Changes requested. Check the plan for reviewer comments.';
  }

  const lines = feedback.map((f) => {
    const blockInfo = f.blockId ? `Block ${f.blockId}` : 'General';
    const comments = f.comments.map((c) => `  - ${c.author}: ${c.content}`).join('\n');
    return `${blockInfo}:\n${comments}`;
  });

  return `Changes requested:\n\n${lines.join('\n\n')}`;
}
