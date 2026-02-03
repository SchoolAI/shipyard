/**
 * MCP Tool: regenerate_session_token
 *
 * Regenerates the session token for a task the caller owns.
 * Ported from apps/server-legacy/src/tools/regenerate-session-token.ts
 *
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import { z } from "zod";
import { getVerifiedGitHubUsername } from "../../utils/identity.js";
import { logger } from "../../utils/logger.js";
import type { McpServer } from "../index.js";
import { errorResponse, getTaskDocument } from "./helpers.js";
import { generateSessionToken, hashSessionToken } from "./session-token.js";

/** Tool name constant */
const TOOL_NAME = "regenerate_session_token";

/** Input Schema */
const RegenerateSessionTokenInput = z.object({
	taskId: z.string().describe("The task ID to regenerate token for"),
});

/**
 * Register the regenerate_session_token tool.
 */
export function registerRegenerateSessionTokenTool(server: McpServer): void {
	server.tool(
		TOOL_NAME,
		`Regenerate the session token for a task.

USE WHEN:
- Your Claude Code session ended and you lost the original token
- You need to resume work on a task you own
- The old token may have been compromised

REQUIREMENTS:
- You must be the task owner (verified via GitHub identity)
- The task must exist and have an ownerId set

RETURNS:
- New session token that can be used for add_artifact, read_task, etc.

SECURITY:
- Only the task owner can regenerate tokens
- Old token is immediately invalidated
- New token is returned only once - store it securely`,
		{
			taskId: {
				type: "string",
				description: "The task ID to regenerate token for",
			},
		},
		async (args: unknown) => {
			const { taskId } = RegenerateSessionTokenInput.parse(args);

			logger.info({ taskId }, "Attempting to regenerate session token");

			const currentUser = await getVerifiedGitHubUsername();

			if (!currentUser) {
				return errorResponse(
					`Token regeneration requires verified GitHub authentication.

Please configure ONE of:
1. GITHUB_USERNAME environment variable
2. GITHUB_TOKEN environment variable (will verify via API)
3. Run: gh auth login

Note: git config user.name is NOT accepted for security-critical operations.`,
				);
			}

			/** Get task document */
			const taskResult = await getTaskDocument(taskId);
			if (!taskResult.success) {
				return errorResponse(taskResult.error);
			}
			const { doc, meta } = taskResult;

			/** Verify ownership */
			if (!meta.ownerId) {
				return errorResponse(
					`Task "${taskId}" has no owner set. Cannot regenerate token for ownerless tasks.`,
				);
			}

			/** Check if current user is the owner */
			if (meta.ownerId.toLowerCase() !== currentUser.toLowerCase()) {
				logger.warn(
					{ taskId, expectedOwner: meta.ownerId, currentUser },
					"Token regeneration denied - not the owner",
				);
				return errorResponse(
					`Access denied. You do not have permission to regenerate the session token for task "${taskId}".`,
				);
			}

			/** Generate new token */
			const newToken = generateSessionToken();
			const newTokenHash = hashSessionToken(newToken);

			/** Update token hash in document */
			doc.meta.sessionTokenHash = newTokenHash;
			doc.meta.updatedAt = Date.now();

			doc.logEvent("title_changed", currentUser, {
				fromTitle: meta.title,
				toTitle: meta.title,
			});

			logger.info(
				{ taskId, ownerId: meta.ownerId },
				"Session token regenerated successfully",
			);

			return {
				content: [
					{
						type: "text",
						text: `Session token regenerated successfully!

Task: ${meta.title}
Task ID: ${taskId}

New Session Token: ${newToken}

IMPORTANT: Store this token securely. The old token has been invalidated.
Use this token for add_artifact, read_task, link_pr, and other task operations.`,
					},
				],
			};
		},
	);
}
