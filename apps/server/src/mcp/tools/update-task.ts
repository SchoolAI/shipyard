/**
 * MCP Tool: update_task
 *
 * Updates task metadata in the Loro document.
 * Ported from apps/server-legacy/src/tools/update-task.ts
 *
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import type { TaskStatus } from "@shipyard/loro-schema";
import { z } from "zod";
import { getGitHubUsername } from "../../utils/identity.js";
import { logger } from "../../utils/logger.js";
import type { McpServer } from "../index.js";
import {
	errorResponse,
	getTaskDocument,
	successResponse,
	verifySessionToken,
} from "./helpers.js";

/** Tool name constant */
const TOOL_NAME = "update_task";

/** Valid task statuses - must match TaskStatus type */
const TASK_STATUSES = [
	"draft",
	"pending_review",
	"changes_requested",
	"in_progress",
	"completed",
] as const satisfies readonly TaskStatus[];

/** Input Schema */
const UpdateTaskInput = z.object({
	taskId: z.string().describe("The task ID to update"),
	sessionToken: z.string().describe("Session token from create_task"),
	title: z.string().optional().describe("New title"),
	status: z.enum(TASK_STATUSES).optional().describe("New status"),
	tags: z
		.array(z.string())
		.optional()
		.describe("Updated tags (replaces existing tags)"),
});

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
			taskId: { type: "string", description: "The task ID to update" },
			sessionToken: {
				type: "string",
				description: "Session token from create_task",
			},
			title: { type: "string", description: "New title (optional)" },
			status: {
				type: "string",
				enum: [
					"draft",
					"pending_review",
					"changes_requested",
					"in_progress",
					"completed",
				],
				description:
					"New status (optional). Use 'pending_review' to signal ready for human feedback.",
			},
			tags: {
				type: "array",
				items: { type: "string" },
				description: "Updated tags (optional, replaces existing tags)",
			},
		},
		async (args: unknown) => {
			const input = UpdateTaskInput.parse(args);

			/** Get task document */
			const taskResult = await getTaskDocument(input.taskId);
			if (!taskResult.success) {
				return errorResponse(taskResult.error);
			}
			const { doc, meta: existingMeta } = taskResult;

			/** Verify session token */
			const tokenError = verifySessionToken(
				input.sessionToken,
				existingMeta.sessionTokenHash,
				input.taskId,
			);
			if (tokenError) {
				return errorResponse(tokenError);
			}

			/** Get actor name for event logging */
			const actorName = await getGitHubUsername();

			/** Handle status change */
			if (input.status && input.status !== existingMeta.status) {
				doc.updateStatus(input.status, actorName);
			}

			/** Update title if provided */
			if (input.title && input.title !== existingMeta.title) {
				const oldTitle = existingMeta.title;
				doc.meta.title = input.title;
				doc.meta.updatedAt = Date.now();
				doc.syncTitleToRoom();

				doc.logEvent("title_changed", actorName, {
					fromTitle: oldTitle,
					toTitle: input.title,
				});
			}

			if (input.tags !== undefined) {
				const tagsContainer = doc.meta.tags;
				while (tagsContainer.length > 0) {
					tagsContainer.delete(0, 1);
				}
				for (const tag of input.tags) {
					tagsContainer.push(tag);
				}
				doc.meta.updatedAt = Date.now();
			}

			logger.info(
				{
					taskId: input.taskId,
					updates: {
						title: input.title,
						status: input.status,
						tags: input.tags,
					},
				},
				"Task updated",
			);

			return successResponse(`Task "${input.taskId}" updated successfully.`);
		},
	);
}
