import { getPlanMetadata } from '@peer-plan/schema';
import { z } from 'zod';
import { getOrCreateDoc } from '../ws-server.js';

const ReadPlanInput = z.object({
  planId: z.string().describe('The plan ID to read'),
});

export const readPlanTool = {
  definition: {
    name: 'read_plan',
    description: 'Read a specific plan by ID, returning its metadata and content',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'The plan ID to read' },
      },
      required: ['planId'],
    },
  },

  handler: async (args: unknown) => {
    const { planId } = ReadPlanInput.parse(args);
    const doc = await getOrCreateDoc(planId);
    const metadata = getPlanMetadata(doc);
    const content = doc.getArray('content').toJSON();

    if (!metadata) {
      return {
        content: [
          {
            type: 'text',
            text: `Plan "${planId}" not found or has no metadata.`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              id: metadata.id,
              title: metadata.title,
              status: metadata.status,
              repo: metadata.repo,
              pr: metadata.pr,
              createdAt: metadata.createdAt,
              updatedAt: metadata.updatedAt,
              content,
            },
            null,
            2
          ),
        },
      ],
    };
  },
};
