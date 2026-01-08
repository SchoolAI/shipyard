import { getDeliverables, getPlanMetadata } from '@peer-plan/schema';
import { z } from 'zod';
import { exportPlanToMarkdown } from '../export-markdown.js';
import { getOrCreateDoc } from '../ws-server.js';
import { TOOL_NAMES } from './tool-names.js';

const ReadPlanInput = z.object({
  planId: z.string().describe('The plan ID to read'),
  includeAnnotations: z
    .boolean()
    .optional()
    .describe('Include comment threads/annotations in the response (default: false)'),
});

export const readPlanTool = {
  definition: {
    name: TOOL_NAMES.READ_PLAN,
    description:
      'Read a specific plan by ID, returning its metadata and content in markdown format',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'The plan ID to read' },
        includeAnnotations: {
          type: 'boolean',
          description: 'Include comment threads/annotations in the response (default: false)',
        },
      },
      required: ['planId'],
    },
  },

  handler: async (args: unknown) => {
    const { planId, includeAnnotations = false } = ReadPlanInput.parse(args);
    const doc = await getOrCreateDoc(planId);
    const metadata = getPlanMetadata(doc);

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

    // Export plan to markdown (with annotations if requested)
    const markdown = await exportPlanToMarkdown(doc, {
      includeResolved: includeAnnotations, // Include resolved comments if showing annotations
    });

    // Build metadata header
    let output = `# ${metadata.title}\n\n`;
    output += `**Status:** ${metadata.status.replace('_', ' ')}\n`;
    if (metadata.repo) {
      output += `**Repo:** ${metadata.repo}\n`;
    }
    if (metadata.pr) {
      output += `**PR:** #${metadata.pr}\n`;
    }
    output += `**Created:** ${new Date(metadata.createdAt).toISOString()}\n`;
    output += `**Updated:** ${new Date(metadata.updatedAt).toISOString()}\n`;
    output += '\n---\n\n';

    // Append markdown content
    output += markdown;

    // Append deliverables section if any exist
    const deliverables = getDeliverables(doc);
    if (deliverables.length > 0) {
      output += '\n\n---\n\n## Deliverables\n\n';
      output += 'Available deliverable IDs for artifact linking:\n\n';

      for (const deliverable of deliverables) {
        const checkbox = deliverable.linkedArtifactId ? '[x]' : '[ ]';
        const linkedInfo = deliverable.linkedArtifactId
          ? ` (linked to artifact: ${deliverable.linkedArtifactId})`
          : '';
        output += `- ${checkbox} ${deliverable.text} {id="${deliverable.id}"}${linkedInfo}\n`;
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: output,
        },
      ],
    };
  },
};
