/**
 * Review status checking and feedback formatting.
 * Uses Y.Doc observer for distributed approval flow.
 */

import {
  createUserResolver,
  formatDeliverablesForLLM,
  formatThreadsForLLM,
  type GetReviewStatusResponse,
  getDeliverables,
  parseThreads,
  type ReviewFeedback,
} from '@peer-plan/schema';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import type { CoreResponse } from '../adapters/types.js';
import { DEFAULT_AGENT_TYPE, DEFAULT_WEB_URL } from '../constants.js';
import {
  getReviewStatus,
  getWebSocketUrl,
  setSessionToken,
  updatePlanContent,
} from '../http-client.js';
import { logger } from '../logger.js';
import { generateSessionToken, hashSessionToken } from '../session-token.js';
import { deleteSessionState, getSessionState, setSessionState } from '../state.js';
import { createPlan } from './plan-manager.js';

// --- Review Decision Types ---

interface ReviewDecision {
  approved: boolean;
  feedback?: string;
}

// --- Y.Doc Observer for Review Decision ---

const REVIEW_TIMEOUT_MS = 25 * 60 * 1000; // 25 minutes

/**
 * Wait for review decision by observing Y.Doc metadata changes.
 * Connects to MCP server's WebSocket and watches for status changes.
 */
async function waitForReviewDecision(planId: string, wsUrl: string): Promise<ReviewDecision> {
  const ydoc = new Y.Doc();

  logger.info({ planId, wsUrl }, 'Connecting to WebSocket for Y.Doc sync');

  const provider = new WebsocketProvider(wsUrl, planId, ydoc, {
    connect: true,
  });

  return new Promise((resolve) => {
    const metadata = ydoc.getMap('metadata');
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        provider.destroy();
      }
    };

    const checkStatus = () => {
      if (resolved) return;

      const status = metadata.get('status') as string | undefined;
      logger.debug({ planId, status }, 'Checking Y.Doc status');

      if (status === 'approved') {
        logger.info({ planId }, 'Plan approved via Y.Doc');
        cleanup();
        resolve({ approved: true });
      } else if (status === 'changes_requested') {
        // Extract feedback from threads if available
        const feedback = extractFeedbackFromYDoc(ydoc);
        logger.info({ planId, feedback }, 'Changes requested via Y.Doc');
        cleanup();
        resolve({ approved: false, feedback });
      }
    };

    // Wait for sync before resetting status for fresh review
    provider.on('sync', (isSynced: boolean) => {
      if (isSynced) {
        logger.info({ planId }, 'Y.Doc synced, resetting status for fresh review');

        // Reset status to pending_review to force new decision
        // This prevents using stale approve/deny from previous review
        ydoc.transact(() => {
          metadata.set('status', 'pending_review');
          metadata.set('updatedAt', Date.now());
        });

        logger.info({ planId }, 'Status reset to pending_review, waiting for decision');
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
 * Returns: plan content + comments + deliverables for LLM.
 */
function extractFeedbackFromYDoc(ydoc: Y.Doc): string | undefined {
  try {
    const threadsMap = ydoc.getMap('threads');
    const threadsData = threadsMap.toJSON() as Record<string, unknown>;
    const threads = parseThreads(threadsData);

    if (threads.length === 0) {
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

    // Combine: plan content + reviewer feedback
    let output = 'Changes requested:\n\n';

    if (planText) {
      output += '## Current Plan\n\n';
      output += planText;
      output += '\n\n---\n\n';
    }

    output += '## Reviewer Feedback\n\n';
    output += feedbackText;

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
 * Check review status for a session's plan.
 * Called when agent tries to exit plan mode.
 */
export async function checkReviewStatus(
  sessionId: string,
  planContent?: string
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
      // Fail open if we can't connect
      return {
        allow: true,
        message: 'Warning: Could not connect to peer-plan server. Plan review skipped.',
      };
    }

    // Create plan (this opens browser)
    const result = await createPlan({
      sessionId,
      agentType: DEFAULT_AGENT_TYPE,
      metadata: { source: 'ExitPlanMode' },
    });

    planId = result.planId;

    // Sync content immediately
    logger.info({ planId }, 'Syncing plan content');
    await updatePlanContent(planId, {
      content: planContent,
      filePath: '/.claude/plans/plan.md',
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

        // Store in state for PostToolUse hook to read
        const currentState = getSessionState(sessionId);
        if (currentState) {
          setSessionState(sessionId, {
            ...currentState,
            sessionToken,
            url,
            approvedAt: Date.now(),
          });
        }

        logger.info({ planId, url }, 'Session token set and stored');

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

  planId = state.planId;

  logger.info({ sessionId, planId }, 'Checking review status');

  let status: GetReviewStatusResponse;
  try {
    status = await getReviewStatus(planId);
  } catch (err) {
    // If we can't check status, fail open
    logger.warn({ err, planId }, 'Failed to get review status, allowing exit');
    return { allow: true };
  }

  logger.info({ sessionId, planId, status: status.status }, 'Review status retrieved');

  const baseUrl = process.env.PEER_PLAN_WEB_URL ?? DEFAULT_WEB_URL;

  switch (status.status) {
    case 'approved':
      return {
        allow: true,
        message: status.reviewedBy ? `Plan approved by ${status.reviewedBy}` : 'Plan approved',
        planId,
      };

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
