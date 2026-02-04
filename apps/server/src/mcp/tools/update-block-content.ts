/**
 * MCP Tool: update_block_content
 *
 * Updates content blocks in the task document.
 * Ported from apps/server-legacy/src/tools/update-block-content.ts
 *
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import { z } from 'zod';
import { assertNever } from '../../utils/assert-never.js';
import { getGitHubUsername } from '../../utils/identity.js';
import { logger } from '../../utils/logger.js';
import { errorResponse, getTaskDocument, successResponse, verifySessionToken } from '../helpers.js';
import type { McpServer } from '../index.js';

/** Tool name constant */
const TOOL_NAME = 'update_block_content';

/** Block operation schema */
const BlockOperationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('update'),
    blockId: z.string().describe('The block ID to update (from read_plan output)'),
    content: z.string().describe('New markdown content for this block'),
  }),
  z.object({
    type: z.literal('insert'),
    afterBlockId: z
      .string()
      .nullable()
      .describe('Insert after this block ID (null = insert at beginning)'),
    content: z.string().describe('Markdown content to insert as new block(s)'),
  }),
  z.object({
    type: z.literal('delete'),
    blockId: z.string().describe('The block ID to delete'),
  }),
  z.object({
    type: z.literal('replace_all'),
    content: z.string().describe('Complete markdown content to replace the entire plan'),
  }),
]);

/** Input Schema */
const UpdateBlockContentInput = z.object({
  taskId: z.string().describe('The task ID to modify'),
  sessionToken: z.string().describe('Session token from create_task'),
  operations: z
    .array(BlockOperationSchema)
    .min(1)
    .describe('Array of operations to perform atomically'),
});

/**
 * Register the update_block_content tool.
 */
export function registerUpdateBlockContentTool(server: McpServer): void {
  server.tool(
    TOOL_NAME,
    `Modify task content by updating, inserting, or deleting specific blocks. Use read_task first to get block IDs.

DELIVERABLES: When inserting/updating content, you can mark checkbox items as deliverables using {#deliverable} marker. These can later be linked to artifacts via add_artifact tool.

Operations:
- update: Replace an existing block with new markdown content
- insert: Add new blocks after a specific block (or at beginning if afterBlockId is null)
- delete: Remove a specific block
- replace_all: Replace entire task content with new markdown

Example with deliverables:
{ "type": "insert", "afterBlockId": "block-123", "content": "- [ ] Screenshot of feature {#deliverable}" }`,
    {
      taskId: { type: 'string', description: 'The task ID to modify' },
      sessionToken: {
        type: 'string',
        description: 'Session token from create_task',
      },
      operations: {
        type: 'array',
        description: 'Array of operations to perform atomically',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['update', 'insert', 'delete', 'replace_all'],
              description: 'Operation type',
            },
            blockId: {
              type: 'string',
              description: 'Block ID for update/delete operations (from read_task output)',
            },
            afterBlockId: {
              type: 'string',
              nullable: true,
              description: 'Insert after this block ID (null = beginning)',
            },
            content: {
              type: 'string',
              description:
                'Markdown content for update/insert/replace_all. Can include {#deliverable} markers on checkbox items.',
            },
          },
          required: ['type'],
        },
      },
    },
    async (args: unknown) => {
      const input = UpdateBlockContentInput.parse(args);
      const { taskId, sessionToken, operations } = input;

      logger.info({ taskId, operationCount: operations.length }, 'Updating block content');

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

      /** Get actor name */
      const actorName = await getGitHubUsername();

      /*
       * TODO: Implement block operations when loro-prosemirror integration is ready
       * For now, log the operations and return a placeholder response
       */

      const results: string[] = [];
      for (const op of operations) {
        switch (op.type) {
          case 'update':
            results.push(`Would update block ${op.blockId}`);
            break;
          case 'insert':
            results.push(`Would insert after ${op.afterBlockId ?? 'beginning'}`);
            break;
          case 'delete':
            results.push(`Would delete block ${op.blockId}`);
            break;
          case 'replace_all':
            results.push(`Would replace all content (${op.content.length} chars)`);
            break;

          default:
            return assertNever(op);
        }
      }

      /** Log content edited event */
      const summary =
        operations.length === 1
          ? results[0] || 'Content updated'
          : `${operations.length} operations`;

      doc.logEvent('content_edited', actorName, {
        summary,
      });

      /** Update metadata timestamp */
      doc.meta.updatedAt = Date.now();

      logger.info({ taskId, results }, 'Block content update logged');

      return successResponse(
        `Updated task "${taskId}":\n${results.map((r) => `- ${r}`).join('\n')}\n\nNote: Full block operations pending loro-prosemirror integration.`
      );
    }
  );
}
