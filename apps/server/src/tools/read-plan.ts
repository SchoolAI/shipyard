import {
  formatDeliverablesForLLM,
  getDeliverables,
  getLinkedPRs,
  getPlanMetadata,
} from '@peer-plan/schema';
import { z } from 'zod';
import { getOrCreateDoc } from '../doc-store.js';
import { exportPlanToMarkdown } from '../export-markdown.js';
import { verifySessionToken } from '../session-token.js';
import { TOOL_NAMES } from './tool-names.js';

const ReadPlanInput = z.object({
  planId: z.string().describe('The plan ID to read'),
  sessionToken: z.string().describe('Session token from create_plan'),
  includeAnnotations: z
    .boolean()
    .optional()
    .describe('Include comment threads/annotations in the response (default: false)'),
  includeLinkedPRs: z
    .boolean()
    .optional()
    .describe('Include linked PRs section in the response (default: false)'),
});

export const readPlanTool = {
  definition: {
    name: TOOL_NAMES.READ_PLAN,
    description: `Read a specific plan by ID, returning its metadata and content in markdown format.

NOTE FOR CLAUDE CODE USERS: If you just received plan approval via the hook, deliverable IDs were already provided in the approval message. You only need this tool if:
- You need to check human feedback (set includeAnnotations=true)
- You need to refresh state after changes
- You need to see linked PRs (set includeLinkedPRs=true)

USE CASES:
- Review feedback from human reviewers (set includeAnnotations=true)
- Check plan status and completion state
- Get block IDs for update_block_content operations
- View linked PRs and their status (set includeLinkedPRs=true)

OUTPUT INCLUDES:
- Metadata: title, status, repo, PR, timestamps
- Content: Full markdown with block IDs
- Deliverables section: Shows deliverable IDs and completion status
- Annotations: Comment threads if includeAnnotations=true
- Linked PRs: PR list with status, URL, branch if includeLinkedPRs=true`,
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
        includeLinkedPRs: {
          type: 'boolean',
          description:
            'Include linked PRs section in the response (default: false). Set true to see linked PRs.',
        },
      },
      required: ['planId', 'sessionToken'],
    },
  },

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Tool handler requires session validation, markdown export with deliverables/annotations/linked PRs sections
  handler: async (args: unknown) => {
    const {
      planId,
      sessionToken,
      includeAnnotations = false,
      includeLinkedPRs = false,
    } = ReadPlanInput.parse(args);
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
    if (metadata.status === 'changes_requested' && metadata.reviewComment) {
      output += `\n**Reviewer Comment:** ${metadata.reviewComment}\n`;
    }
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

    // Append linked PRs section if requested
    if (includeLinkedPRs) {
      const linkedPRs = getLinkedPRs(doc);
      if (linkedPRs.length > 0) {
        output += '\n\n---\n\n';
        output += '## Linked PRs\n\n';
        for (const pr of linkedPRs) {
          output += `- **#${pr.prNumber}** (${pr.status})`;
          if (pr.title) {
            output += ` - ${pr.title}`;
          }
          output += '\n';
          output += `  - URL: ${pr.url}\n`;
          if (pr.branch) {
            output += `  - Branch: ${pr.branch}\n`;
          }
          output += `  - Linked: ${new Date(pr.linkedAt).toISOString()}\n`;
        }
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
