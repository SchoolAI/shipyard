import {
	getLocalDiffCommentById,
	getPlanMetadata,
	getPRReviewCommentById,
	logPlanEvent,
	parseCommentId,
	replyToLocalDiffComment,
	replyToPRReviewComment,
} from "@shipyard/schema";
import { z } from "zod";
import { getOrCreateDoc } from "../doc-store.js";
import { logger } from "../logger.js";
import { getClientInfo } from "../mcp-client-info.js";
import { detectPlatform, getDisplayName } from "../platform-detection.js";
import { getGitHubUsername } from "../server-identity.js";
import { verifySessionToken } from "../session-token.js";
import { TOOL_NAMES } from "./tool-names.js";

/** --- Input Schema --- */

const ReplyToDiffCommentInput = z.object({
	taskId: z.string().describe("Plan ID"),
	sessionToken: z.string().describe("Session token from create_task"),
	commentId: z.string().describe("Comment ID (PR or local diff comment)"),
	body: z.string().describe("Reply text"),
});

/** --- Public Export --- */

export const replyToDiffCommentTool = {
	definition: {
		name: TOOL_NAMES.REPLY_TO_DIFF_COMMENT,
		description: `Reply to a PR review comment or local diff comment.

Allows AI to respond to code review feedback.
Replies appear inline in the Changes tab with the original comment.

USAGE:
- commentId: Comment ID from readDiffComments output (format: [pr:abc123] or [local:abc123])
- body: Reply text (markdown supported)

The tool automatically detects whether the comment is a PR or local diff comment.

EXAMPLE:
reply_to_diff_comment({
  taskId: "abc123",
  sessionToken: "token",
  commentId: "pr:xyz789",
  body: "Good point! I'll add that validation in the next commit."
})`,
		inputSchema: {
			type: "object",
			properties: {
				taskId: { type: "string", description: "Plan ID" },
				sessionToken: {
					type: "string",
					description: "Session token from create_task",
				},
				commentId: { type: "string", description: "Comment ID (PR or local)" },
				body: { type: "string", description: "Reply text" },
			},
			required: ["taskId", "sessionToken", "commentId", "body"],
		},
	},

	/**
	 * Complexity of 20 is acceptable here because the function handles:
	 * - Input validation and session verification
	 * - Comment ID parsing with type detection
	 * - Two distinct comment types (PR vs local) with separate error handling
	 * - Success/error responses for each code path
	 * Extracting helpers would fragment the error handling context.
	 */
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Tool handler needs unified error handling for two comment types
	handler: async (args: unknown) => {
		const input = ReplyToDiffCommentInput.parse(args);

		logger.info(
			{ taskId: input.taskId, commentId: input.commentId },
			"Replying to diff comment",
		);

		const ydoc = await getOrCreateDoc(input.taskId);
		const metadata = getPlanMetadata(ydoc);

		if (!metadata) {
			return {
				content: [{ type: "text", text: `Plan "${input.taskId}" not found.` }],
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

		/** Get actor name for event logging and platform detection for comment identity */
		const actorName = await getGitHubUsername();
		const clientInfoName = getClientInfo();
		const { platform } = detectPlatform(clientInfoName);
		const agentDisplayName = getDisplayName(platform, actorName);

		/**
		 * Parse comment ID to extract actual ID from wrapped format.
		 * Supports: "[pr:abc123]", "pr:abc123", "[local:abc123]", "local:abc123", or bare "abc123"
		 */
		const parsed = parseCommentId(input.commentId);

		logger.debug(
			{
				inputCommentId: input.commentId,
				parsedType: parsed.type,
				parsedId: parsed.id,
			},
			"Parsed comment ID from input",
		);

		/**
		 * Try to find as PR review comment first (if type is 'pr' or 'unknown').
		 * replyToPRReviewComment handles validation and atomicity internally.
		 */
		const prComment =
			parsed.type === "pr" || parsed.type === "unknown"
				? getPRReviewCommentById(ydoc, parsed.id)
				: null;
		if (prComment) {
			try {
				const reply = replyToPRReviewComment(
					ydoc,
					parsed.id,
					input.body,
					agentDisplayName,
					actorName,
				);

				/**
				 * Log event after successful reply.
				 * Note: This is not atomic with comment add due to helper function design.
				 * Consider refactoring replyToPRReviewComment to include event logging.
				 */
				logPlanEvent(ydoc, "comment_added", actorName, {
					commentId: reply.id,
					prNumber: prComment.prNumber,
				});

				logger.info(
					{
						taskId: input.taskId,
						commentId: reply.id,
						parentCommentId: parsed.id,
					},
					"PR review comment reply added",
				);

				return {
					content: [
						{
							type: "text",
							text: `Reply added to PR review comment!

Comment ID: ${reply.id}
Parent Comment ID: ${parsed.id}
PR: #${prComment.prNumber}
File: ${prComment.path}:${prComment.line}

The reply will appear in the Changes tab inline with the original comment.`,
						},
					],
				};
			} catch (error) {
				logger.error(
					{ error, commentId: parsed.id },
					"Failed to reply to PR comment",
				);
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text", text: `Error: ${errorMessage}` }],
					isError: true,
				};
			}
		}

		/**
		 * Try to find as local diff comment (if type is 'local' or 'unknown').
		 * replyToLocalDiffComment handles validation and atomicity internally.
		 */
		const localComment =
			parsed.type === "local" || parsed.type === "unknown"
				? getLocalDiffCommentById(ydoc, parsed.id)
				: null;
		if (localComment) {
			try {
				const reply = replyToLocalDiffComment(
					ydoc,
					parsed.id,
					input.body,
					agentDisplayName,
					actorName,
				);

				/**
				 * Log event after successful reply.
				 * Note: This is not atomic with comment add due to helper function design.
				 * Consider refactoring replyToLocalDiffComment to include event logging.
				 */
				logPlanEvent(ydoc, "comment_added", actorName, {
					commentId: reply.id,
				});

				logger.info(
					{
						taskId: input.taskId,
						commentId: reply.id,
						parentCommentId: parsed.id,
					},
					"Local diff comment reply added",
				);

				return {
					content: [
						{
							type: "text",
							text: `Reply added to local diff comment!

Comment ID: ${reply.id}
Parent Comment ID: ${parsed.id}
File: ${localComment.path}:${localComment.line}

The reply will appear in the Changes tab inline with the original comment.`,
						},
					],
				};
			} catch (error) {
				logger.error(
					{ error, commentId: parsed.id },
					"Failed to reply to local comment",
				);
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text", text: `Error: ${errorMessage}` }],
					isError: true,
				};
			}
		}

		/** Comment not found in either PR or local */
		return {
			content: [
				{
					type: "text",
					text: `Comment "${parsed.id}" not found in plan "${input.taskId}".${
						input.commentId !== parsed.id
							? ` (parsed from input: "${input.commentId}")`
							: ""
					} Make sure the comment ID is correct and the comment exists.`,
				},
			],
			isError: true,
		};
	},
};
