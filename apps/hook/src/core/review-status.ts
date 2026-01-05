/**
 * Review status checking and feedback formatting.
 */

import type { GetReviewStatusResponse, ReviewFeedback } from '@peer-plan/schema';
import type { CoreResponse } from '../adapters/types.js';
import { getReviewStatus } from '../http-client.js';
import { logger } from '../logger.js';
import { getSessionState } from '../state.js';

// --- Review Status Check ---

/**
 * Check review status for a session's plan.
 * Called when agent tries to exit plan mode.
 */
export async function checkReviewStatus(sessionId: string): Promise<CoreResponse> {
  const state = getSessionState(sessionId);

  if (!state) {
    // No tracked plan - allow exit
    logger.info({ sessionId }, 'No session state, allowing exit');
    return { allow: true };
  }

  const { planId } = state;

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

  const baseUrl = process.env.PEER_PLAN_WEB_URL ?? 'http://localhost:5173';

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
