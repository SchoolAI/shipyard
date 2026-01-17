/**
 * Review status checking and feedback formatting.
 * Delegates approval blocking to server-side Y.Doc observer.
 *
 * NOTE: The approval observer logic is now in apps/server/src/hook-handlers.ts.
 * The hook simply calls the server API and waits for the response.
 */
import type { Deliverable, GetReviewStatusResponse, ReviewFeedback } from '@peer-plan/schema';
import type { CoreResponse } from '../adapters/types.js';
import { webConfig } from '../config/env/web.js';
import { DEFAULT_AGENT_TYPE } from '../constants.js';
import {
  getReviewStatus,
  getSessionContext,
  setSessionToken,
  updatePlanContent,
  waitForApproval,
} from '../http-client.js';
import { logger } from '../logger.js';
import { generateSessionToken, hashSessionToken } from '../session-token.js';
import { createPlan } from './plan-manager.js';

// --- Review Decision Types ---

interface ReviewDecision {
  approved: boolean;
  feedback?: string;
  deliverables?: Deliverable[];
}

// --- Server-Side Approval Observer ---

/**
 * Wait for review decision via server-side observer.
 * Server watches Y.Doc and returns when status changes to approved or rejected.
 * Uses a unique reviewRequestId to prevent stale decisions from previous cycles.
 */
async function waitForReviewDecision(
  planId: string,
  _wsUrl: string
): Promise<ReviewDecision & { reviewComment?: string; reviewedBy?: string; status?: string }> {
  // Call server API which handles the Y.Doc observer and blocking logic
  logger.info({ planId }, 'Waiting for approval via server endpoint');

  // Server will generate reviewRequestId and manage the observer
  const result = await waitForApproval(planId, planId);

  logger.info({ planId, approved: result.approved }, 'Received approval decision from server');

  return {
    approved: result.approved,
    feedback: result.feedback,
    deliverables: result.deliverables as Deliverable[] | undefined,
    reviewComment: result.reviewComment,
    reviewedBy: result.reviewedBy,
    status: result.status,
  };
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
  _originMetadata?: Record<string, unknown>
): Promise<CoreResponse> {
  logger.info(
    { planId, contentLength: planContent.length },
    'Plan content changed, triggering re-review'
  );

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
      // Server manages state cleanup

      // Recursively call the new plan creation path
      // This will create the plan, sync content, and block for approval
      return await checkReviewStatus(sessionId, planContent, _originMetadata);
    }
    throw err;
  }

  const baseUrl = webConfig.PEER_PLAN_WEB_URL;
  logger.info(
    { planId, url: `${baseUrl}/plan/${planId}` },
    'Content synced, browser already open. Waiting for server approval...'
  );

  // Block until user approves/denies via server-side Y.Doc observer
  const decision = await waitForReviewDecision(planId, '');
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

      // Deliverables are stored by the server in waitForApprovalHandler
      const deliverableCount = (decision.deliverables ?? []).length;

      logger.info(
        { planId, url, deliverableCount },
        'Session token set and stored by server with updated content hash'
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
      return {
        allow: true,
        message: 'Updated plan approved (session token unavailable)',
        planId,
      };
    }
  }

  // Changes requested - server manages state cleanup
  logger.debug({ planId }, 'Changes requested - server will manage state cleanup');

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
  // Query server for session state
  const state = await getSessionContext(sessionId);
  let planId: string;

  // Blocking approach: Create plan from ExitPlanMode if we have content
  if (!state && planContent) {
    logger.info(
      { sessionId, contentLength: planContent.length },
      'Creating plan from ExitPlanMode (blocking mode)'
    );

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

    logger.info(
      { planId, url: result.url },
      'Plan created and synced, browser opened. Waiting for server approval...'
    );

    // Block until user approves/denies via server-side Y.Doc observer
    const decision = await waitForReviewDecision(planId, '');
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

        // Server stores deliverables and session data via waitForApprovalHandler
        const deliverableCount = (decision.deliverables ?? []).length;

        logger.info(
          { planId, url, deliverableCount },
          'Session token set and stored by server with deliverables'
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
        // Still approve, just without token
        return {
          allow: true,
          message: 'Plan approved (session token unavailable)',
          planId,
        };
      }
    }

    // Changes requested - server manages state cleanup
    logger.debug({ sessionId }, 'Changes requested - server will manage state cleanup');

    return {
      allow: false,
      message: decision.feedback || 'Changes requested',
      planId,
    };
  }

  if (!state || !state.planId) {
    // No state and no plan content - allow exit
    logger.info({ sessionId }, 'No session state or plan content, allowing exit');
    return { allow: true };
  }

  // Note: Server no longer tracks contentHash, so we always treat new content as changed
  // If we have new plan content, trigger re-review
  if (planContent) {
    logger.info(
      { planId: state.planId },
      'Plan content provided, triggering re-review'
    );
    return await handleUpdatedPlanReview(
      sessionId,
      state.planId,
      planContent,
      originMetadata
    );
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
