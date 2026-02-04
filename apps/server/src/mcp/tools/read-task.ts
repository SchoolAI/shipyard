/**
 * MCP Tool: read_task
 *
 * Read task content, metadata, and deliverables.
 * Ported from apps/server-legacy/src/tools/read-task.ts
 *
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import { z } from 'zod';
import type { McpServer } from '../index.js';
import { errorResponse, formatTaskHeader, getTaskDocument, verifySessionToken } from './helpers.js';

/** Tool name constant */
const TOOL_NAME = 'read_task';

/** Input Schema */
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

/**
 * Format deliverables for LLM output.
 */
function formatDeliverablesForLLM(
  deliverables: Array<{
    id: string;
    text: string;
    linkedArtifactId: string | null;
  }>
): string {
  if (deliverables.length === 0) {
    return '';
  }

  let output = '## Deliverables\n\n';
  for (const d of deliverables) {
    const status = d.linkedArtifactId ? '[x]' : '[ ]';
    output += `- ${status} ${d.text}\n`;
    output += `  - ID: ${d.id}\n`;
    if (d.linkedArtifactId) {
      output += `  - Artifact: ${d.linkedArtifactId}\n`;
    }
  }
  return output;
}

/**
 * Format linked PRs for LLM output.
 */
function formatLinkedPRsSection(
  linkedPRs: Array<{
    prNumber: number;
    status: string;
    branch: string | null;
    title: string | null;
  }>
): string {
  if (linkedPRs.length === 0) {
    return '';
  }

  let output = '\n\n---\n\n## Linked PRs\n\n';
  for (const pr of linkedPRs) {
    output += `- **#${pr.prNumber}** (${pr.status})`;
    if (pr.title) {
      output += ` - ${pr.title}`;
    }
    output += '\n';
    if (pr.branch) {
      output += `  - Branch: ${pr.branch}\n`;
    }
  }
  return output;
}

/**
 * Register the read_task tool.
 */
export function registerReadTaskTool(server: McpServer): void {
  server.tool(
    TOOL_NAME,
    `Read a specific task by ID, returning its metadata and content in markdown format.

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
- Metadata: title, status, repo, timestamps
- Content: Full markdown with block IDs
- Deliverables section: Shows deliverable IDs and completion status
- Annotations: Comment threads if includeAnnotations=true
- Activity: Input requests and user responses if includeAnnotations=true
- Linked PRs: PR list with status, URL, branch if includeLinkedPRs=true
- PR Comments: Inline diff comments by file and line if includePRComments=true`,
    {
      taskId: { type: 'string', description: 'The task ID to read' },
      sessionToken: {
        type: 'string',
        description: 'Session token from create_task',
      },
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
    async (args: unknown) => {
      const {
        taskId,
        sessionToken,
        includeAnnotations: _includeAnnotations = false,
        includeLinkedPRs = false,
        includePRComments: _includePRComments = false,
      } = ReadTaskInput.parse(args);

      /** Get task document */
      const taskResult = await getTaskDocument(taskId);
      if (!taskResult.success) {
        return errorResponse(taskResult.error);
      }
      const { doc, meta } = taskResult;

      /** Verify session token */
      const tokenError = verifySessionToken(sessionToken, meta.sessionTokenHash, taskId);
      if (tokenError) {
        return errorResponse(tokenError);
      }

      /** Build output */
      let output = formatTaskHeader(meta);

      /*
       * TODO: Export content to markdown when loro-prosemirror integration is ready
       * For now, just note that content is in Loro format
       */
      output += '(Content stored in Loro format - export pending)\n';

      const deliverables: Array<{
        id: string;
        text: string;
        linkedArtifactId: string | null;
      }> = doc.deliverables.toJSON();
      const deliverablesText = formatDeliverablesForLLM(deliverables);
      if (deliverablesText) {
        output += '\n\n---\n\n';
        output += deliverablesText;
      }

      if (includeLinkedPRs) {
        const linkedPRs: Array<{
          prNumber: number;
          status: string;
          branch: string | null;
          title: string | null;
        }> = doc.linkedPRs.toJSON();
        output += formatLinkedPRsSection(linkedPRs);
      }

      /*
       * TODO: Include PR comments when comment formatting is implemented
       * TODO: Include annotations when comment export is implemented
       */

      return {
        content: [
          {
            type: 'text',
            text: output,
          },
        ],
      };
    }
  );
}
