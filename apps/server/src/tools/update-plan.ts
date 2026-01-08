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

STATUS WORKFLOW:
- draft: Initial state, not ready for review
- pending_review: Ready for human feedback, triggers review notifications
- in_progress: Work has started, artifacts being attached
- approved: Human reviewer accepted the plan
- changes_requested: Human reviewer requested modifications
- completed: All deliverables attached, task finished (set by complete_task)

TYPICAL FLOW:
1. create_plan (status=draft)
2. update_plan (status=pending_review) - signals ready for review
3. [Human reviews, adds comments, approves/requests changes]
4. update_plan (status=in_progress) - start work
5. add_artifact (upload deliverables)
6. complete_task (status=completed)`,
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
