/**
 * Review status checking and feedback formatting.
 * Delegates approval blocking to server-side Y.Doc observer.
 *
 * NOTE: The approval observer logic is now in apps/server/src/hook-handlers.ts.
 * The hook simply calls the server API and waits for the response.
 */
import {
  assertNever,
  createPlanWebUrl,
  type Deliverable,
  type GetReviewStatusResponse,
  type ReviewFeedback,
} from '@shipyard/schema';
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
import { HOOK_LOG_FILE, logger } from '../logger.js';
import { generateSessionToken, hashSessionToken } from '../session-token.js';
import { createPlan } from './plan-manager.js';

interface ReviewDecision {
  approved: boolean;
  feedback?: string;
  deliverables?: Deliverable[];
  reviewComment?: string;
  reviewedBy?: string;
  status?: string;
}

/** --- Approval Handling Helpers --- */

/**
 * Build the approval message with deliverable count and optional reviewer comment.
 */
function buildApprovalMessage(
  prefix: string,
  deliverableCount: number,
  reviewComment?: string
): string {
  const countText = `${deliverableCount} deliverable${deliverableCount === 1 ? '' : 's'}`;
  const feedbackText = reviewComment ? `\n\nReviewer comment: ${reviewComment}` : '';
  return `${prefix} You have ${countText}. Use add_artifact(filePath, deliverableId) to upload proof-of-work.${feedbackText}`;
}

/**
 * Generate session token and store it on the server.
 * Returns a CoreResponse for either success or failure.
 */
async function handleApproval(
  planId: string,
  decision: ReviewDecision,
  messagePrefix: string
): Promise<CoreResponse> {
  const sessionToken = generateSessionToken();
  const sessionTokenHash = hashSessionToken(sessionToken);
  const deliverableCount = (decision.deliverables ?? []).length;

  logger.info({ planId }, 'Generating session token for approved plan');

  try {
    const tokenResult = await setSessionToken(planId, sessionTokenHash);
    const url = tokenResult.url;

    logger.info(
      { planId, url, deliverableCount },
      'Session token set and stored by server with deliverables'
    );

    return {
      allow: true,
      message: buildApprovalMessage(messagePrefix, deliverableCount, decision.reviewComment),
      planId,
      sessionToken,
      url,
    };
  } catch (err) {
    logger.error({ err, planId }, 'Failed to set session token, approving without it');
    return {
      allow: true,
      message: `${messagePrefix.replace('!', '')} (session token unavailable)`,
      planId,
    };
  }
}

/**
 * Handle rejection/changes requested response.
 */
function handleRejection(planId: string, decision: ReviewDecision): CoreResponse {
  return {
    allow: false,
    message: decision.reviewComment || 'Changes requested',
    planId,
  };
}

/**
 * Wait for review decision via server-side observer.
 * Server watches Y.Doc and returns when status changes to approved or rejected.
 * Uses a unique reviewRequestId to prevent stale decisions from previous cycles.
 */
async function waitForReviewDecision(planId: string): Promise<ReviewDecision> {
  logger.info({ planId }, 'Waiting for approval via server endpoint');

  const result = await waitForApproval(planId, planId);

  logger.info({ planId, approved: result.approved }, 'Received approval decision from server');

  return {
    approved: result.approved,
    feedback: result.feedback,
    deliverables: result.deliverables,
    reviewComment: result.reviewComment,
    reviewedBy: result.reviewedBy,
    status: result.status,
  };
}

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

  logger.info({ planId }, 'Syncing updated plan content');
  try {
    await updatePlanContent(planId, { content: planContent });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (errorMessage?.includes('404')) {
      logger.warn(
        { planId, sessionId },
        'Plan not found (404), creating new plan with updated content'
      );
      return await checkReviewStatus(sessionId, planContent, _originMetadata);
    }
    throw err;
  }

  const baseUrl = webConfig.SHIPYARD_WEB_URL;
  logger.info(
    { planId, url: createPlanWebUrl(baseUrl, planId) },
    'Content synced, browser already open. Waiting for server approval...'
  );

  const decision = await waitForReviewDecision(planId);
  logger.info({ planId, approved: decision.approved }, 'Decision received via Y.Doc');

  if (decision.approved) {
    return handleApproval(planId, decision, 'Plan re-approved with updates!');
  }

  logger.debug({ planId }, 'Changes requested - server will manage state cleanup');
  return handleRejection(planId, decision);
}

/**
 * Handle the flow when creating a new plan and waiting for approval.
 */
async function handleNewPlanCreation(
  sessionId: string,
  planContent: string,
  originMetadata?: Record<string, unknown>
): Promise<CoreResponse> {
  logger.info(
    { sessionId, contentLength: planContent.length },
    'Creating plan from ExitPlanMode (blocking mode)'
  );

  const result = await createPlan({
    sessionId,
    agentType: DEFAULT_AGENT_TYPE,
    metadata: {
      source: 'ExitPlanMode',
      ...originMetadata,
    },
  });

  const planId = result.planId;

  logger.info({ planId }, 'Syncing plan content');
  await updatePlanContent(planId, { content: planContent });

  logger.info(
    { planId, url: result.url },
    'Plan created and synced, browser opened. Waiting for server approval...'
  );

  const decision = await waitForReviewDecision(planId);
  logger.info({ planId, approved: decision.approved }, 'Decision received via Y.Doc');

  if (decision.approved) {
    return handleApproval(planId, decision, 'Plan approved!');
  }

  logger.debug({ sessionId }, 'Changes requested - server will manage state cleanup');
  return handleRejection(planId, decision);
}

/**
 * Build response for each review status.
 */
function buildStatusResponse(
  status: GetReviewStatusResponse,
  planId: string,
  baseUrl: string
): CoreResponse {
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
        message: `Plan is pending review.\n\nOpen: ${createPlanWebUrl(baseUrl, planId)}`,
        planId,
      };

    case 'draft':
      return {
        allow: false,
        message: `Plan is still in draft.\n\nSubmit for review at: ${createPlanWebUrl(baseUrl, planId)}`,
        planId,
      };

    case 'in_progress':
      return {
        allow: true,
        message:
          'Plan approved. Work is in progress. Use add_artifact(filePath, deliverableId) to upload deliverable proofs.',
        planId,
      };

    case 'completed':
      return {
        allow: true,
        message: `Task completed by ${status.completedBy}`,
        planId,
      };

    default:
      assertNever(status);
  }
}

export async function checkReviewStatus(
  sessionId: string,
  planContent?: string,
  originMetadata?: Record<string, unknown>
): Promise<CoreResponse> {
  const state = await getSessionContext(sessionId);

  /** Case 1: New plan creation (no state, but have content) */
  if (!state.found && planContent) {
    return handleNewPlanCreation(sessionId, planContent, originMetadata);
  }

  /** Case 2: No state and no content - allow exit */
  if (!state.found) {
    logger.info({ sessionId }, 'No session state or plan content, allowing exit');
    return { allow: true };
  }

  /** Case 3: State exists but planId missing (should not happen) */
  if (!state.planId && planContent) {
    logger.error(
      { sessionId, hasPlanContent: !!planContent, hasState: !!state, statePlanId: state?.planId },
      'Unreachable state: plan content exists but no session state'
    );
    return {
      allow: false,
      message: `Internal error: Plan content found but session state missing. Check ${HOOK_LOG_FILE} and report this issue.`,
    };
  }

  if (!state.planId) {
    throw new Error('Unreachable: state.planId should exist at this point');
  }

  const planId = state.planId;

  /** Case 4: Plan update (have planId and new content) */
  if (planContent) {
    logger.info({ planId }, 'Plan content provided, triggering re-review');
    return await handleUpdatedPlanReview(sessionId, planId, planContent, originMetadata);
  }

  /** Case 5: Just checking status (no new content) */
  logger.info({ sessionId, planId }, 'Checking review status');

  let status: GetReviewStatusResponse;
  try {
    status = await getReviewStatus(planId);
  } catch (err) {
    logger.warn({ err, planId }, 'Failed to get review status, blocking exit');
    return {
      allow: false,
      message:
        'Cannot verify plan approval status. Ensure the Shipyard MCP server is running. Check server-debug.log in your Shipyard state directory for details.',
      planId,
    };
  }

  logger.info({ sessionId, planId, status: status.status }, 'Review status retrieved');

  const baseUrl = webConfig.SHIPYARD_WEB_URL;
  return buildStatusResponse(status, planId, baseUrl);
}

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
