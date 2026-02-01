import {
	getArtifacts,
	getDeliverables,
	getPlanMetadata,
} from "@shipyard/schema";
import { z } from "zod";
import { getOrCreateDoc } from "../doc-store.js";
import { logger } from "../logger.js";
import { getGitHubUsername } from "../server-identity.js";
import { verifySessionToken } from "../session-token.js";
import { performAutoComplete } from "./pr-helpers.js";
import { buildCompletionResponse } from "./response-formatters.js";
import { TOOL_NAMES } from "./tool-names.js";

const CompleteTaskInput = z.object({
	taskId: z.string().describe("ID of the task to complete"),
	sessionToken: z.string().describe("Session token from create_task"),
	summary: z.string().optional().describe("Optional completion summary"),
});

export const completeTaskTool = {
	definition: {
		name: TOOL_NAMES.COMPLETE_TASK,
		description: `Mark a task as complete and generate a snapshot URL for embedding in a PR.

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
		inputSchema: {
			type: "object",
			properties: {
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
			required: ["taskId", "sessionToken"],
		},
	},

	handler: async (args: unknown) => {
		const input = CompleteTaskInput.parse(args);
		const ydoc = await getOrCreateDoc(input.taskId);
		const metadata = getPlanMetadata(ydoc);

		if (!metadata) {
			return {
				content: [{ type: "text", text: "Task not found" }],
				isError: true,
			};
		}

		/** Verify session token */
		if (
			!input.sessionToken ||
			input.sessionToken === "undefined" ||
			input.sessionToken === "null"
		) {
			return {
				content: [
					{
						type: "text",
						text:
							`sessionToken is required for task "${input.taskId}". ` +
							"Use the sessionToken returned from createTask(). " +
							"If you lost your token, use regenerateSessionToken(taskId).",
					},
				],
				isError: true,
			};
		}
		if (
			!metadata.sessionTokenHash ||
			!verifySessionToken(input.sessionToken, metadata.sessionTokenHash)
		) {
			return {
				content: [
					{
						type: "text",
						text:
							`Invalid session token for task "${input.taskId}". ` +
							"The sessionToken must be the one returned from createTask(). " +
							"If you lost your token, use regenerateSessionToken(taskId) to get a new one.",
					},
				],
				isError: true,
			};
		}

		/** Validate status (must be in_progress) */
		if (metadata.status !== "in_progress") {
			return {
				content: [
					{
						type: "text",
						text: `Cannot complete: task status is '${metadata.status}', must be 'in_progress'`,
					},
				],
				isError: true,
			};
		}

		/** Check artifacts exist */
		const artifacts = getArtifacts(ydoc);
		if (artifacts.length === 0) {
			return {
				content: [
					{
						type: "text",
						text: "Cannot complete: no deliverables attached. Upload artifacts first using add_artifact.",
					},
				],
				isError: true,
			};
		}

		/** Get deliverables and actor name */
		const deliverables = getDeliverables(ydoc);
		const actorName = await getGitHubUsername();

		/** Perform auto-completion (shared with add-artifact) */
		const result = await performAutoComplete({
			ydoc,
			metadata,
			deliverables,
			actorName,
			snapshotMessage: "Task marked complete",
		});

		logger.info({ taskId: input.taskId }, "Task marked complete");

		/** Build response using extracted formatter */
		const responseText = buildCompletionResponse({
			metadata,
			snapshotUrl: result.snapshotUrl,
			linkedPR: result.linkedPR,
			existingLinkedPRs: result.existingLinkedPRs,
			hasLocalArtifacts: result.hasLocalArtifacts,
			summary: input.summary,
		});

		return {
			content: [{ type: "text", text: responseText }],
		};
	},
};
