/**
 * Review status checking and feedback formatting.
 * Delegates approval blocking to server-side Y.Doc observer.
 *
 * NOTE: The approval observer logic is now in apps/server/src/hook-handlers.ts.
 * The hook simply calls the server API and waits for the response.
 */
import {
  assertNever,
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
import { logger } from '../logger.js';
import { generateSessionToken, hashSessionToken } from '../session-token.js';
import { createPlan } from './plan-manager.js';

interface ReviewDecision {
  approved: boolean;
  feedback?: string;
  deliverables?: Deliverable[];
}

/**
 * Wait for review decision via server-side observer.
 * Server watches Y.Doc and returns when status changes to approved or rejected.
 * Uses a unique reviewRequestId to prevent stale decisions from previous cycles.
 */
async function waitForReviewDecision(
  planId: string,
  _wsUrl: string
): Promise<ReviewDecision & { reviewComment?: string; reviewedBy?: string; status?: string }> {
  logger.info({ planId }, 'Waiting for approval via server endpoint');

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
    await updatePlanContent(planId, {
      content: planContent,
    });
  } catch (err) {
    const error = err as Error;
    if (error.message?.includes('404')) {
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
    { planId, url: `${baseUrl}/plan/${planId}` },
    'Content synced, browser already open. Waiting for server approval...'
  );

  const decision = await waitForReviewDecision(planId, '');
  logger.info({ planId, approved: decision.approved }, 'Decision received via Y.Doc');

  if (decision.approved) {
    const sessionToken = generateSessionToken();
    const sessionTokenHash = hashSessionToken(sessionToken);

    logger.info({ planId }, 'Generating new session token for re-approved plan');

    try {
      const tokenResult = await setSessionToken(planId, sessionTokenHash);
      const url = tokenResult.url;

      const deliverableCount = (decision.deliverables ?? []).length;

      logger.info(
        { planId, url, deliverableCount },
        'Session token set and stored by server with updated content hash'
      );

      return {
        allow: true,
        message: `Plan re-approved with updates! You have ${deliverableCount} deliverable${deliverableCount === 1 ? '' : 's'}. Use add_artifact(filePath, deliverableId) to upload proof-of-work.`,
        planId,
        sessionToken,
        url,
      };
    } catch (err) {
      logger.error({ err, planId }, 'Failed to set session token, but plan was approved');
      return {
        allow: true,
        message: 'Updated plan approved (session token unavailable)',
        planId,
      };
    }
  }

  logger.debug({ planId }, 'Changes requested - server will manage state cleanup');

  return {
    allow: false,
    message: decision.feedback || 'Changes requested',
    planId,
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex review flow requires conditional logic
export async function checkReviewStatus(
  sessionId: string,
  planContent?: string,
  originMetadata?: Record<string, unknown>
): Promise<CoreResponse> {
  const state = await getSessionContext(sessionId);
  let planId: string;

  if (!state.found && planContent) {
    logger.info(
      { sessionId, contentLength: planContent.length, hasState: !!state },
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

    planId = result.planId;

    logger.info({ planId }, 'Syncing plan content');
    await updatePlanContent(planId, {
      content: planContent,
    });

    logger.info(
      { planId, url: result.url },
      'Plan created and synced, browser opened. Waiting for server approval...'
    );

    const decision = await waitForReviewDecision(planId, '');
    logger.info({ planId, approved: decision.approved }, 'Decision received via Y.Doc');

    if (decision.approved) {
      const sessionToken = generateSessionToken();
      const sessionTokenHash = hashSessionToken(sessionToken);

      logger.info({ planId }, 'Generating session token for approved plan');

      try {
        const tokenResult = await setSessionToken(planId, sessionTokenHash);
        const url = tokenResult.url;

        const deliverableCount = (decision.deliverables ?? []).length;

        logger.info(
          { planId, url, deliverableCount },
          'Session token set and stored by server with deliverables'
        );

        return {
          allow: true,
          message: `Plan approved! You have ${deliverableCount} deliverable${deliverableCount === 1 ? '' : 's'}. Use add_artifact(filePath, deliverableId) to upload proof-of-work.`,
          planId,
          sessionToken,
          url,
        };
      } catch (err) {
        logger.error({ err, planId }, 'Failed to set session token, approving without it');
        return {
          allow: true,
          message:
            'Plan approved, but session token unavailable. You may need to refresh the plan in the browser. Check ~/.shipyard/server-debug.log for details.',
          planId,
        };
      }
    }

    logger.debug({ sessionId }, 'Changes requested - server will manage state cleanup');

    return {
      allow: false,
      message: decision.feedback || 'Changes requested',
      planId,
    };
  }

  if (!state.found) {
    logger.info({ sessionId }, 'No session state or plan content, allowing exit');
    return { allow: true };
  }

  if ((!state || !state.planId) && planContent) {
    logger.error(
      { sessionId, hasPlanContent: !!planContent, hasState: !!state, statePlanId: state?.planId },
      'Unreachable state: plan content exists but no session state'
    );
    return {
      allow: false,
      message:
        'Internal error: Plan content found but session state missing. Check ~/.shipyard/hook-debug.log and report this issue.',
    };
  }

  if (!state.planId) {
    throw new Error('Unreachable: state.planId should exist at this point');
  }
  planId = state.planId;

  if (planContent) {
    logger.info({ planId }, 'Plan content provided, triggering re-review');
    return await handleUpdatedPlanReview(sessionId, planId, planContent, originMetadata);
  }

  logger.info({ sessionId, planId }, 'Checking review status');

  let status: GetReviewStatusResponse;
  try {
    status = await getReviewStatus(planId);
  } catch (err) {
    logger.warn({ err, planId }, 'Failed to get review status, blocking exit');
    return {
      allow: false,
      message:
        'Cannot verify plan approval status. Ensure the Shipyard MCP server is running. Check ~/.shipyard/server-debug.log for details.',
      planId,
    };
  }

  logger.info({ sessionId, planId, status: status.status }, 'Review status retrieved');

  const baseUrl = webConfig.SHIPYARD_WEB_URL;

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

    default: {
      assertNever(status);
    }
  }
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
