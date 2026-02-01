import { getPlanMetadata, logPlanEvent } from "@shipyard/schema";
import { z } from "zod";
import { getOrCreateDoc } from "../doc-store.js";
import { logger } from "../logger.js";
import { getGitHubUsername } from "../server-identity.js";
import { verifySessionToken } from "../session-token.js";
import { TOOL_NAMES } from "./tool-names.js";

/** --- Input Schema --- */

const PostUpdateInput = z.object({
	taskId: z.string().describe("The task ID"),
	sessionToken: z.string().describe("Session token from create_task"),
	message: z.string().describe("Update content (markdown)"),
});

/** --- Response Helpers --- */

type ToolResponse = {
	content: Array<{ type: string; text: string }>;
	isError?: boolean;
};

function errorResponse(message: string): ToolResponse {
	return { content: [{ type: "text", text: message }], isError: true };
}

function successResponse(message: string): ToolResponse {
	return { content: [{ type: "text", text: message }] };
}

/** --- Public Export --- */

export const postUpdateTool = {
	definition: {
		name: TOOL_NAMES.POST_UPDATE,
		description: `Post a progress update to the task timeline.

Use this to communicate status updates to humans watching your work:
- "Starting work on authentication module"
- "Milestone: API integration complete"
- "Found edge case with rate limiting, investigating"

Updates appear in the Activity tab and keep reviewers informed.`,
		inputSchema: {
			type: "object",
			properties: {
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
			required: ["taskId", "sessionToken", "message"],
		},
	},

	handler: async (args: unknown): Promise<ToolResponse> => {
		const input = PostUpdateInput.parse(args);
		const { taskId, sessionToken, message } = input;

		/** Get task document and metadata */
		const doc = await getOrCreateDoc(taskId);
		const metadata = getPlanMetadata(doc);

		if (!metadata) {
			return errorResponse(`Task "${taskId}" not found.`);
		}

		/** Verify session token */
		if (
			!sessionToken ||
			sessionToken === "undefined" ||
			sessionToken === "null"
		) {
			return errorResponse(
				`sessionToken is required for task "${taskId}". ` +
					"Use the sessionToken returned from createTask(). " +
					"If you lost your token, use regenerateSessionToken(taskId).",
			);
		}
		if (
			!metadata.sessionTokenHash ||
			!verifySessionToken(sessionToken, metadata.sessionTokenHash)
		) {
			return errorResponse(
				`Invalid session token for task "${taskId}". ` +
					"The sessionToken must be the one returned from createTask(). " +
					"If you lost your token, use regenerateSessionToken(taskId) to get a new one.",
			);
		}

		/** Get actor name for event logging */
		const actorName = await getGitHubUsername();

		/** Log the agent activity event */
		const eventId = logPlanEvent(doc, "agent_activity", actorName, {
			activityType: "update",
			message,
		});

		logger.info(
			{ taskId, eventId, messageLength: message.length },
			"Agent update posted",
		);

		return successResponse(`Update posted to task "${taskId}".`);
	},
};
