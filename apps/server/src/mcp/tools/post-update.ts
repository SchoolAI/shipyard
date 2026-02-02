/**
 * MCP Tool: post_update
 *
 * Posts a status update event to the task timeline.
 * Ported from apps/server-legacy/src/tools/post-update.ts
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
	successResponse,
	verifySessionToken,
} from "./helpers.js";

/** Tool name constant */
const TOOL_NAME = "post_update";

/** Input Schema */
const PostUpdateInput = z.object({
	taskId: z.string().describe("The task ID"),
	sessionToken: z.string().describe("Session token from create_task"),
	message: z.string().describe("Update content (markdown)"),
});

/**
 * Register the post_update tool.
 */
export function registerPostUpdateTool(server: McpServer): void {
	server.tool(
		TOOL_NAME,
		`Post a progress update to the task timeline.

Use this to communicate status updates to humans watching your work:
- "Starting work on authentication module"
- "Milestone: API integration complete"
- "Found edge case with rate limiting, investigating"

Updates appear in the Activity tab and keep reviewers informed.`,
		{
			taskId: { type: "string", description: "The task ID" },
			sessionToken: {
				type: "string",
				description: "Session token from create_task",
			},
			message: {
				type: "string",
				description: "Update content (markdown supported)",
			},
		},
		async (args: unknown) => {
			const input = PostUpdateInput.parse(args);
			const { taskId, sessionToken, message } = input;

			/** Get task document */
			const taskResult = await getTaskDocument(taskId);
			if (!taskResult.success) {
				return errorResponse(taskResult.error);
			}
			const { doc, meta } = taskResult;

			/** Verify session token */
			const tokenError = verifySessionToken(
				sessionToken,
				meta.sessionTokenHash,
				taskId,
			);
			if (tokenError) {
				return errorResponse(tokenError);
			}

			/** Get actor name for event logging */
			const actorName = await getGitHubUsername();

			/** Log the agent activity event */
			const eventId = doc.logEvent("agent_activity", actorName, {
				message,
				isBlocker: null,
			});

			logger.info(
				{ taskId, eventId, messageLength: message.length },
				"Agent update posted",
			);

			return successResponse(`Update posted to task "${taskId}".`);
		},
	);
}
