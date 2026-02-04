/**
 * MCP Tool: update_task
 *
 * Updates task metadata in the Loro document.
 * Ported from apps/server-legacy/src/tools/update-task.ts
 *
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import type { TaskDocument, TaskStatus } from '@shipyard/loro-schema';
import { z } from 'zod';
import { getGitHubUsername } from '../../utils/identity.js';
import { logger } from '../../utils/logger.js';
import { errorResponse, getTaskDocument, successResponse, verifySessionToken } from '../helpers.js';
import type { McpServer } from '../index.js';

/** Minimal interface for tag list operations (from Loro typed container) */
interface TagsList {
  readonly length: number;
  push(tag: string): void;
  delete(start: number, count: number): void;
}

/** Tool name constant */
const TOOL_NAME = 'update_task';

/** Valid task statuses - must match TaskStatus type */
const TASK_STATUSES = [
  'draft',
  'pending_review',
  'changes_requested',
  'in_progress',
  'completed',
] as const satisfies readonly TaskStatus[];

/** Input Schema */
const UpdateTaskInput = z.object({
  taskId: z.string().describe('The task ID to update'),
  sessionToken: z.string().describe('Session token from create_task'),
  title: z.string().optional().describe('New title'),
  status: z.enum(TASK_STATUSES).optional().describe('New status'),
  tags: z.array(z.string()).optional().describe('Updated tags (replaces existing tags)'),
});

type UpdateTaskInputType = z.infer<typeof UpdateTaskInput>;

/** Helper: Update task status if changed */
function updateStatusIfChanged(
  doc: TaskDocument,
  newStatus: TaskStatus | undefined,
  currentStatus: TaskStatus,
  actorName: string
): void {
  if (!newStatus || newStatus === currentStatus) {
    return;
  }
  doc.updateStatus(newStatus, actorName);
}

/** Helper: Update task title if changed */
function updateTitleIfChanged(
  doc: TaskDocument,
  newTitle: string | undefined,
  currentTitle: string,
  actorName: string
): void {
  if (!newTitle || newTitle === currentTitle) {
    return;
  }
  doc.meta.title = newTitle;
  doc.meta.updatedAt = Date.now();
  doc.syncTitleToRoom();
  doc.logEvent('title_changed', actorName, {
    fromTitle: currentTitle,
    toTitle: newTitle,
  });
}

/** Helper: Replace all tags in container */
function replaceTags(tagsContainer: TagsList, newTags: string[] | undefined): void {
  if (newTags === undefined) {
    return;
  }
  // Clear existing tags
  while (tagsContainer.length > 0) {
    tagsContainer.delete(0, 1);
  }
  // Add new tags
  for (const tag of newTags) {
    tagsContainer.push(tag);
  }
}

/** Helper: Update tags if provided */
function updateTagsIfProvided(doc: TaskDocument, newTags: string[] | undefined): void {
  if (newTags === undefined) {
    return;
  }
  replaceTags(doc.meta.tags, newTags);
  doc.meta.updatedAt = Date.now();
}

/** Main handler for update_task tool */
async function handleUpdateTask(input: UpdateTaskInputType) {
  const taskResult = await getTaskDocument(input.taskId);
  if (!taskResult.success) {
    return errorResponse(taskResult.error);
  }

  const { doc, meta: existingMeta } = taskResult;

  const tokenError = verifySessionToken(
    input.sessionToken,
    existingMeta.sessionTokenHash,
    input.taskId
  );
  if (tokenError) {
    return errorResponse(tokenError);
  }

  const actorName = await getGitHubUsername();

  updateStatusIfChanged(doc, input.status, existingMeta.status, actorName);
  updateTitleIfChanged(doc, input.title, existingMeta.title, actorName);
  updateTagsIfProvided(doc, input.tags);

  logger.info(
    {
      taskId: input.taskId,
      updates: {
        title: input.title,
        status: input.status,
        tags: input.tags,
      },
    },
    'Task updated'
  );

  return successResponse(`Task "${input.taskId}" updated successfully.`);
}

/**
 * Register the update_task tool.
 */
export function registerUpdateTaskTool(server: McpServer): void {
  server.tool(
    TOOL_NAME,
    `Update an existing task's metadata (title, status). Does not modify content - use update_block_content for that.

NOTE: Most status transitions are automatic. You rarely need to call this tool.

AUTOMATIC TRANSITIONS:
- draft -> in_progress/changes_requested: Set by human in browser
- in_progress -> completed: Auto-set when all deliverables have artifacts

MANUAL USE CASES (rare):
- Resetting a task to draft status
- Changing title after creation
- Edge cases where automatic transitions don't apply

STATUSES:
- draft: Initial state
- pending_review: Submitted for review
- changes_requested: Human requested modifications
- in_progress: Work started (usually auto-set)
- completed: All deliverables fulfilled (usually auto-set by add_artifact)`,
    {
      taskId: { type: 'string', description: 'The task ID to update' },
      sessionToken: {
        type: 'string',
        description: 'Session token from create_task',
      },
      title: { type: 'string', description: 'New title (optional)' },
      status: {
        type: 'string',
        enum: ['draft', 'pending_review', 'changes_requested', 'in_progress', 'completed'],
        description:
          "New status (optional). Use 'pending_review' to signal ready for human feedback.",
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Updated tags (optional, replaces existing tags)',
      },
    },
    async (args: unknown) => {
      const input = UpdateTaskInput.parse(args);
      return handleUpdateTask(input);
    }
  );
}
