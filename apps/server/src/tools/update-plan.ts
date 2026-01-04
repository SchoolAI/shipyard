import {
  getPlanMetadata,
  PLAN_INDEX_DOC_NAME,
  type PlanStatusType,
  setPlanIndexEntry,
  setPlanMetadata,
} from '@peer-plan/schema';
import { z } from 'zod';
import { logger } from '../logger.js';
import { getOrCreateDoc } from '../ws-server.js';

const UpdatePlanInput = z.object({
  planId: z.string().describe('The plan ID to update'),
  title: z.string().optional().describe('New title'),
  status: z
    .enum(['draft', 'pending_review', 'approved', 'changes_requested'])
    .optional()
    .describe('New status'),
});

export const updatePlanTool = {
  definition: {
    name: 'update_plan',
    description: 'Update an existing plan metadata (title, status)',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'The plan ID to update' },
        title: { type: 'string', description: 'New title (optional)' },
        status: {
          type: 'string',
          enum: ['draft', 'pending_review', 'approved', 'changes_requested'],
          description: 'New status (optional)',
        },
      },
      required: ['planId'],
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
