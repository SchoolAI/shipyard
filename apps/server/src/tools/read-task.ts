import {
  formatDeliverablesForLLM,
  formatDiffCommentsForLLM,
  getDeliverables,
  getLinkedPRs,
  getPlanMetadata,
  getPRReviewComments,
} from '@shipyard/schema';
import { z } from 'zod';
import { getOrCreateDoc } from '../doc-store.js';
import { exportPlanToMarkdown } from '../export-markdown.js';
import { verifySessionToken } from '../session-token.js';
import { formatLinkedPRsSection, formatPlanHeader } from './response-formatters.js';
import { TOOL_NAMES } from './tool-names.js';

const ReadTaskInput = z.object({
  taskId: z.string().describe('The task ID to read'),
  sessionToken: z.string().describe('Session token from create_task'),
  includeAnnotations: z
    .boolean()
    .optional()
    .describe('Include comment threads/annotations in the response (default: false)'),
  includeLinkedPRs: z
    .boolean()
    .optional()
    .describe('Include linked PRs section in the response (default: false)'),
  includePRComments: z
    .boolean()
    .optional()
    .describe(
      'Include inline PR review comments (diff line comments) in the response (default: false)'
    ),
});

export const readTaskTool = {
  definition: {
    name: TOOL_NAMES.READ_TASK,
    description: `Read a specific task by ID, returning its metadata and content in markdown format.

NOTE FOR CLAUDE CODE USERS: If you just received task approval via the hook, deliverable IDs were already provided in the approval message. You only need this tool if:
- You need to check human feedback (set includeAnnotations=true)
- You need to refresh state after changes
- You need to see linked PRs (set includeLinkedPRs=true)
- You need to see inline diff comments (set includePRComments=true)
- You need to see user responses to input requests (set includeAnnotations=true)

USE CASES:
- Review feedback from human reviewers (set includeAnnotations=true)
- Check task status and completion state
- Get block IDs for update_block_content operations
- View linked PRs and their status (set includeLinkedPRs=true)
- View inline PR diff comments (set includePRComments=true)
- See user responses to requestUserInput() calls (set includeAnnotations=true)

OUTPUT INCLUDES:
- Metadata: title, status, repo, PR, timestamps
- Content: Full markdown with block IDs
- Deliverables section: Shows deliverable IDs and completion status
- Annotations: Comment threads if includeAnnotations=true
- Activity: Input requests and user responses if includeAnnotations=true
- Linked PRs: PR list with status, URL, branch if includeLinkedPRs=true
- PR Comments: Inline diff comments by file and line if includePRComments=true`,
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task ID to read' },
        sessionToken: { type: 'string', description: 'Session token from create_task' },
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
        includePRComments: {
          type: 'boolean',
          description:
            'Include inline PR review comments (diff line comments) in the response (default: false). Set true to see inline diff feedback.',
        },
      },
      required: ['taskId', 'sessionToken'],
    },
  },

  handler: async (args: unknown) => {
    const {
      taskId,
      sessionToken,
      includeAnnotations = false,
      includeLinkedPRs = false,
      includePRComments = false,
    } = ReadTaskInput.parse(args);
    const doc = await getOrCreateDoc(taskId);
    const metadata = getPlanMetadata(doc);

    if (!metadata) {
      return {
        content: [
          {
            type: 'text',
            text: `Task "${taskId}" not found or has no metadata.`,
          },
        ],
        isError: true,
      };
    }

    if (
      !metadata.sessionTokenHash ||
      !verifySessionToken(sessionToken, metadata.sessionTokenHash)
    ) {
      return {
        content: [
          {
            type: 'text',
            text: `Invalid session token for task "${taskId}".`,
          },
        ],
        isError: true,
      };
    }

    const markdown = await exportPlanToMarkdown(doc, {
      includeResolved: includeAnnotations,
      includeActivity: includeAnnotations,
    });

    let output = formatPlanHeader(metadata);
    output += markdown;

    const deliverables = getDeliverables(doc);
    const deliverablesText = formatDeliverablesForLLM(deliverables);
    if (deliverablesText) {
      output += '\n\n---\n\n';
      output += deliverablesText;
    }

    if (includeLinkedPRs) {
      const linkedPRs = getLinkedPRs(doc);
      output += formatLinkedPRsSection(linkedPRs);
    }

    if (includePRComments) {
      const prComments = getPRReviewComments(doc);
      if (prComments.length > 0) {
        const prCommentsText = formatDiffCommentsForLLM(prComments, {
          includeResolved: false,
        });
        if (prCommentsText) {
          output += '\n\n---\n\n';
          output += prCommentsText;
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
