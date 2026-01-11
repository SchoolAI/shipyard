import {
  getPlanMetadata,
  PLAN_INDEX_DOC_NAME,
  type PlanStatusType,
  setPlanIndexEntry,
  setPlanMetadata,
} from '@peer-plan/schema';
import { z } from 'zod';
import { logger } from '../logger.js';
import { verifySessionToken } from '../session-token.js';
import { getOrCreateDoc } from '../ws-server.js';
import { TOOL_NAMES } from './tool-names.js';

const UpdatePlanInput = z.object({
  planId: z.string().describe('The plan ID to update'),
  sessionToken: z.string().describe('Session token from create_plan'),
  title: z.string().optional().describe('New title'),
  status: z
    .enum(['draft', 'pending_review', 'approved', 'changes_requested', 'in_progress'])
    .optional()
    .describe('New status'),
});

export const updatePlanTool = {
  definition: {
    name: TOOL_NAMES.UPDATE_PLAN,
    description: `Update an existing plan's metadata (title, status). Does not modify content—use update_block_content for that.

NOTE: Most status transitions are automatic. You rarely need to call this tool.

AUTOMATIC TRANSITIONS:
- draft → approved/changes_requested: Set by human in browser
- approved → in_progress: Auto-set when first artifact is uploaded
- in_progress → completed: Auto-set when all deliverables have artifacts

MANUAL USE CASES (rare):
- Resetting a plan to draft status
- Changing title after creation
- Edge cases where automatic transitions don't apply

STATUSES:
- draft: Initial state
- approved: Human accepted the plan
- changes_requested: Human requested modifications
- in_progress: Work started (usually auto-set)
- completed: All deliverables fulfilled (usually auto-set by add_artifact)`,
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'The plan ID to update' },
        sessionToken: { type: 'string', description: 'Session token from create_plan' },
        title: { type: 'string', description: 'New title (optional)' },
        status: {
          type: 'string',
          enum: ['draft', 'pending_review', 'approved', 'changes_requested', 'in_progress'],
          description:
            "New status (optional). Use 'pending_review' to signal ready for human feedback.",
        },
      },
      required: ['planId', 'sessionToken'],
    },
  },

  handler: async (args: unknown) => {
    const input = UpdatePlanInput.parse(args);
    const doc = await getOrCreateDoc(input.planId);
    const existingMetadata = getPlanMetadata(doc);

    if (!existingMetadata) {
      return {
        content: [
          {
            type: 'text',
            text: `Plan "${input.planId}" not found.`,
          },
        ],
        isError: true,
      };
    }

    // Verify session token
    if (
      !existingMetadata.sessionTokenHash ||
      !verifySessionToken(input.sessionToken, existingMetadata.sessionTokenHash)
    ) {
      return {
        content: [
          {
            type: 'text',
            text: `Invalid session token for plan "${input.planId}".`,
          },
        ],
        isError: true,
      };
    }

    const updates: { title?: string; status?: PlanStatusType; updatedAt: number } = {
      updatedAt: Date.now(),
    };
    if (input.title) updates.title = input.title;
    if (input.status) updates.status = input.status;

    setPlanMetadata(doc, updates);

    const indexDoc = await getOrCreateDoc(PLAN_INDEX_DOC_NAME);
    setPlanIndexEntry(indexDoc, {
      id: existingMetadata.id,
      title: input.title ?? existingMetadata.title,
      status: input.status ?? existingMetadata.status,
      createdAt: existingMetadata.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    });

    logger.info({ planId: input.planId, updates }, 'Plan updated');

    return {
      content: [
        {
          type: 'text',
          text: `Plan "${input.planId}" updated successfully.`,
        },
      ],
    };
  },
};
