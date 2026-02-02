import {
	formatDiffCommentsForLLM,
	getLocalDiffComments,
	getPlanMetadata,
	getPRReviewComments,
	type PlanMetadata,
} from "@shipyard/schema";
import type * as Y from "yjs";
import { z } from "zod";
import { getOrCreateDoc } from "../doc-store.js";
import { getLocalChanges } from "../git-local-changes.js";
import { verifySessionToken } from "../session-token.js";
import { TOOL_NAMES } from "./tool-names.js";

/**
 * Get staleness context (HEAD SHA and files) for local diff comments.
 * Extracts cwd from plan metadata and fetches current git state.
 */
function getStalenessContext(doc: Y.Doc): {
	currentHeadSha?: string;
	files?: Array<{ path: string; patch?: string }>;
} {
	const planMetadata = getPlanMetadata(doc);
	const cwd = extractCwdFromMetadata(planMetadata);

	if (!cwd) {
		return {};
	}

	const localChanges = getLocalChanges(cwd);
	if (!localChanges.available) {
		return {};
	}

	return {
		currentHeadSha: localChanges.headSha,
		files: localChanges.files,
	};
}

/**
 * Extract cwd from plan metadata origin (supports claude-code and unknown platforms).
 */
function extractCwdFromMetadata(
	metadata: PlanMetadata | null,
): string | undefined {
	if (!metadata?.origin) {
		return undefined;
	}

	if (metadata.origin.platform === "claude-code") {
		return metadata.origin.cwd;
	}

	if (metadata.origin.platform === "unknown") {
		return metadata.origin.cwd;
	}

	return undefined;
}

const ReadDiffCommentsInput = z.object({
	taskId: z.string().describe("The task ID to read diff comments from"),
	sessionToken: z.string().describe("Session token from create_task"),
	includeLocal: z
		.boolean()
		.optional()
		.describe("Include local (uncommitted) diff comments (default: true)"),
	includePR: z
		.boolean()
		.optional()
		.describe("Include PR review diff comments (default: true)"),
	includeResolved: z
		.boolean()
		.optional()
		.describe("Include resolved comments (default: false)"),
});

export const readDiffCommentsTool = {
	definition: {
		name: TOOL_NAMES.READ_DIFF_COMMENTS,
		description: `Read inline diff comments on local changes and PR diffs.

USE CASES:
- Read human feedback on uncommitted local changes
- Read PR review comments on specific lines
- Check if diff feedback has been addressed (resolved status)
- Get context on what changes need attention

COMMENT TYPES:
- Local: Comments on uncommitted changes (git diff HEAD)
- PR: Comments on PR diffs from GitHub reviews

OUTPUT FORMAT:
- Grouped by comment type (Local vs PR)
- Within each type, grouped by file path
- Sorted by line number within files
- Shows author, line number, comment body, and resolved status`,
		inputSchema: {
			type: "object",
			properties: {
				taskId: {
					type: "string",
					description: "The task ID to read diff comments from",
				},
				sessionToken: {
					type: "string",
					description: "Session token from create_task",
				},
				includeLocal: {
					type: "boolean",
					description:
						"Include local (uncommitted) diff comments (default: true)",
				},
				includePR: {
					type: "boolean",
					description: "Include PR review diff comments (default: true)",
				},
				includeResolved: {
					type: "boolean",
					description: "Include resolved comments (default: false)",
				},
			},
			required: ["taskId", "sessionToken"],
		},
	},

	handler: async (args: unknown) => {
		const {
			taskId,
			sessionToken,
			includeLocal = true,
			includePR = true,
			includeResolved = false,
		} = ReadDiffCommentsInput.parse(args);

		const doc = await getOrCreateDoc(taskId);

		/** Verify session token */
		const metadata = doc.getMap("metadata").toJSON();
		const tokenHash =
			typeof metadata.sessionTokenHash === "string"
				? metadata.sessionTokenHash
				: "";

		if (
			!sessionToken ||
			sessionToken === "undefined" ||
			sessionToken === "null"
		) {
			return {
				content: [
					{
						type: "text",
						text:
							`sessionToken is required for task "${taskId}". ` +
							"Use the sessionToken returned from createTask(). " +
							"If you lost your token, use regenerateSessionToken(taskId).",
					},
				],
				isError: true,
			};
		}
		if (!tokenHash || !verifySessionToken(sessionToken, tokenHash)) {
			return {
				content: [
					{
						type: "text",
						text:
							`Invalid session token for task "${taskId}". ` +
							"The sessionToken must be the one returned from createTask(). " +
							"If you lost your token, use regenerateSessionToken(taskId) to get a new one.",
					},
				],
				isError: true,
			};
		}

		/** Gather comments based on filters */
		const allComments = [];

		if (includeLocal) {
			const localComments = getLocalDiffComments(doc);
			allComments.push(...localComments);
		}

		if (includePR) {
			const prComments = getPRReviewComments(doc);
			allComments.push(...prComments);
		}

		/** Format for LLM output */
		if (allComments.length === 0) {
			return {
				content: [
					{
						type: "text",
						text: "No diff comments found.",
					},
				],
			};
		}

		/** Get staleness context for local comments (HEAD SHA and current file diffs) */
		const stalenessContext = includeLocal ? getStalenessContext(doc) : {};

		const formatted = formatDiffCommentsForLLM(allComments, {
			includeResolved,
			...stalenessContext,
		});

		return {
			content: [
				{
					type: "text",
					text: formatted,
				},
			],
		};
	},
};
