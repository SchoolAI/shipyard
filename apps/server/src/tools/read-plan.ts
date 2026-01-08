import { formatDeliverablesForLLM, getDeliverables, getPlanMetadata } from '@peer-plan/schema';
import { z } from 'zod';
import { exportPlanToMarkdown } from '../export-markdown.js';
import { verifySessionToken } from '../session-token.js';
import { getOrCreateDoc } from '../ws-server.js';
import { TOOL_NAMES } from './tool-names.js';

const ReadPlanInput = z.object({
  planId: z.string().describe('The plan ID to read'),
  sessionToken: z.string().describe('Session token from create_plan'),
  includeAnnotations: z
    .boolean()
    .optional()
    .describe('Include comment threads/annotations in the response (default: false)'),
});

export const readPlanTool = {
  definition: {
    name: TOOL_NAMES.READ_PLAN,
    description: `Read a specific plan by ID, returning its metadata and content in markdown format.

OUTPUT INCLUDES:
- Metadata: title, status, repo, PR, timestamps
- Content: Full markdown with block IDs (<!-- block:id --> comments)
- Deliverables section: Shows deliverable IDs {id="block-id"} and completion status [x]/[ ]
- Annotations: Comment threads if includeAnnotations=true

USE CASES:
- Get deliverable IDs for artifact linking (set includeAnnotations=false)
- Get block IDs for update_block_content operations
- Review feedback from human reviewers (set includeAnnotations=true)
- Check plan status and completion state`,
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'The plan ID to read' },
        sessionToken: { type: 'string', description: 'Session token from create_plan' },
        includeAnnotations: {
          type: 'boolean',
          description:
            'Include comment threads/annotations in the response (default: false). Set true to see human feedback.',
        },
      },
      required: ['planId', 'sessionToken'],
    },
  },

  handler: async (args: unknown) => {
    const { planId, sessionToken, includeAnnotations = false } = ReadPlanInput.parse(args);
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

    // Verify session token
    if (
      !metadata.sessionTokenHash ||
      !verifySessionToken(sessionToken, metadata.sessionTokenHash)
    ) {
      return {
        content: [
          {
            type: 'text',
            text: `Invalid session token for plan "${planId}".`,
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

    // Append deliverables section if any exist (uses shared formatter)
    const deliverables = getDeliverables(doc);
    const deliverablesText = formatDeliverablesForLLM(deliverables);
    if (deliverablesText) {
      output += '\n\n---\n\n';
      output += deliverablesText;
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
