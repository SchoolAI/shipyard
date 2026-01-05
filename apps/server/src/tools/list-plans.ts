import { getPlanIndex, PLAN_INDEX_DOC_NAME } from '@peer-plan/schema';
import { getOrCreateDoc } from '../ws-server.js';
import { TOOL_NAMES } from './tool-names.js';

export const listPlansTool = {
  definition: {
    name: TOOL_NAMES.LIST_PLANS,
    description: 'List all plans with their current status',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },

  handler: async (_args: unknown) => {
    const indexDoc = await getOrCreateDoc(PLAN_INDEX_DOC_NAME);
    const plans = getPlanIndex(indexDoc);

    if (plans.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No plans found.',
          },
        ],
      };
    }

    const formatted = plans
      .map(
        (p) =>
          `- ${p.title} (${p.id})\n  Status: ${p.status}\n  Updated: ${new Date(p.updatedAt).toLocaleString()}`
      )
      .join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `Found ${plans.length} plan(s):\n\n${formatted}`,
        },
      ],
    };
  },
};
