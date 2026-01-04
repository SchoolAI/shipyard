import { getPlanMetadata, parseThreads } from '@peer-plan/schema';
import { z } from 'zod';
import { exportPlanToMarkdown } from '../export-markdown.js';
import { logger } from '../logger.js';
import { getOrCreateDoc } from '../ws-server.js';

// --- Input Schema ---

const getFeedbackInputSchema = z.object({
  planId: z.string().describe('The plan ID to get feedback for'),
});

type GetFeedbackInput = z.infer<typeof getFeedbackInputSchema>;

// --- Public Export ---

export const getFeedbackTool = {
  definition: {
    name: 'get_feedback',
    description:
      'Get reviewer comments and approval status for a plan. Returns structured feedback that the agent can use to understand reviewer concerns and make updates.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        planId: {
          type: 'string',
          description: 'The plan ID to get feedback for',
        },
      },
      required: ['planId'],
    },
  },
  handler: async (args: Record<string, unknown>) => {
    const input = getFeedbackInputSchema.parse(args);
    return getFeedbackHandler(input);
  },
};

// --- Private Helpers ---

/**
 * Handler for get_feedback tool
 */
async function getFeedbackHandler(input: GetFeedbackInput): Promise<{
  content: Array<{ type: 'text'; text: string }>;
}> {
  const { planId } = input;

  logger.info({ planId }, 'Getting feedback for plan');

  try {
    const ydoc = await getOrCreateDoc(planId);
    const metadata = getPlanMetadata(ydoc);

    if (!metadata) {
      return {
        content: [
          {
            type: 'text',
            text: `Plan "${planId}" not found or has no metadata.`,
          },
        ],
      };
    }

    // Get comment count for header
    const threadsMap = ydoc.getMap('threads');
    const threadsData = threadsMap.toJSON() as Record<string, unknown>;
    const threads = parseThreads(threadsData);
    const unresolvedCount = threads.filter((t) => !t.resolved).length;

    // Export full plan with feedback as markdown
    const planMarkdown = await exportPlanToMarkdown(ydoc);

    // Build response with metadata header
    let text = `# ${metadata.title}\n\n`;
    text += `**Status:** ${metadata.status.replace('_', ' ')}\n`;
    text += `**Comments:** ${unresolvedCount} unresolved`;
    if (threads.length > unresolvedCount) {
      text += ` (${threads.length - unresolvedCount} resolved)`;
    }
    text += '\n';

    if (metadata.reviewedBy) {
      text += `**Reviewed by:** ${metadata.reviewedBy}\n`;
    }
    if (metadata.reviewedAt) {
      text += `**Reviewed at:** ${new Date(metadata.reviewedAt).toISOString()}\n`;
    }

    text += '\n---\n\n';
    text += planMarkdown;

    return {
      content: [{ type: 'text', text }],
    };
  } catch (err) {
    logger.error({ err, planId }, 'Error getting feedback');
    return {
      content: [
        {
          type: 'text',
          text: `Error getting feedback for plan "${planId}": ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    };
  }
}
