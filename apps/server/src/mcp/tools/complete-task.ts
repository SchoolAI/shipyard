/**
 * MCP Tool: complete_task
 *
 * Marks a task as completed in the Loro document.
 * Ported from apps/server-legacy/src/tools/complete-task.ts
 *
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import { z } from "zod";
import { getGitHubUsername } from "../../utils/identity.js";
import { logger } from "../../utils/logger.js";
import type { McpServer } from "../index.js";
import {
	errorResponse,
	getTaskDocument,
	verifySessionToken,
} from "./helpers.js";

/** Tool name constant */
const TOOL_NAME = "complete_task";

/** Input Schema */
const CompleteTaskInput = z.object({
	taskId: z.string().describe("ID of the task to complete"),
	sessionToken: z.string().describe("Session token from create_task"),
	summary: z.string().optional().describe("Optional completion summary"),
});

/**
 * Register the complete_task tool.
 */
export function registerCompleteTaskTool(server: McpServer): void {
	server.tool(
		TOOL_NAME,
		`Mark a task as complete and generate a snapshot URL for embedding in a PR.

NOTE: You usually DON'T need this tool! When you use add_artifact to upload proof for ALL deliverables, the task auto-completes and returns the snapshot URL automatically.

USE THIS TOOL ONLY IF:
- You need to force completion without all deliverables fulfilled
- The plan has no deliverables marked
- Auto-complete didn't trigger for some reason

REQUIREMENTS:
- Plan status must be 'in_progress'
- At least one artifact should be uploaded

RETURNS:
- Snapshot URL with complete plan state embedded
- Auto-links PR from current git branch if available`,
		{
			taskId: { type: "string", description: "ID of the task to complete" },
			sessionToken: {
				type: "string",
				description: "Session token from create_task",
			},
			summary: {
				type: "string",
				description: "Optional completion summary for PR description",
			},
		},
		async (args: unknown) => {
			const input = CompleteTaskInput.parse(args);

			/** Get task document */
			const taskResult = await getTaskDocument(input.taskId);
			if (!taskResult.success) {
				return errorResponse(taskResult.error);
			}
			const { doc, meta } = taskResult;

			/** Verify session token */
			const tokenError = verifySessionToken(
				input.sessionToken,
				meta.sessionTokenHash,
				input.taskId,
			);
			if (tokenError) {
				return errorResponse(tokenError);
			}

			/** Validate status */
			if (meta.status !== "in_progress") {
				return errorResponse(
					`Cannot complete: task status is '${meta.status}', must be 'in_progress'`,
				);
			}

			/** Check artifacts exist */
			const artifacts = doc.artifacts.toJSON() as Array<{ id: string }>;
			if (artifacts.length === 0) {
				return errorResponse(
					"Cannot complete: no deliverables attached. Upload artifacts first using add_artifact.",
				);
			}

			/** Get actor name */
			const actorName = await getGitHubUsername();

			/** Update status to completed */
			doc.updateStatus("completed", actorName);

			logger.info({ taskId: input.taskId }, "Task marked complete");

			// TODO: Generate snapshot URL with history
			// TODO: Auto-link PR from current branch
			const snapshotUrl = `(Snapshot URL generation pending - taskId: ${input.taskId})`;

			return {
				content: [
					{
						type: "text",
						text: `Task completed!

Snapshot URL: ${snapshotUrl}

${input.summary ? `Summary: ${input.summary}` : ""}

Note: PR auto-linking and full snapshot URL generation pending Loro integration.`,
					},
				],
			};
		},
	);
}
