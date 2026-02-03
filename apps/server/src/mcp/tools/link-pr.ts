/**
 * MCP Tool: link_pr
 *
 * Links a GitHub PR to the task.
 * Ported from apps/server-legacy/src/tools/link-pr.ts
 *
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import { z } from "zod";
import { parseRepoString } from "../../utils/artifact-helpers.js";
import { getGitHubUsername } from "../../utils/identity.js";
import { logger } from "../../utils/logger.js";
import type { McpServer } from "../index.js";
import {
	errorResponse,
	getTaskDocument,
	verifySessionToken,
} from "./helpers.js";

/** Tool name constant */
const TOOL_NAME = "link_pr";

/** Input Schema */
const LinkPRInput = z.object({
	taskId: z.string().describe("Task ID"),
	sessionToken: z.string().describe("Session token from create_task"),
	prNumber: z.number().describe("PR number to link"),
	branch: z
		.string()
		.optional()
		.describe("Branch name (optional, will be fetched if omitted)"),
	repo: z
		.string()
		.optional()
		.describe("Repository override (org/repo). Uses plan repo if omitted."),
});

/** GitHub PR response schema for validation */
const GitHubPRResponseSchema = z.object({
	html_url: z.string(),
	title: z.string(),
	state: z.enum(["open", "closed"]),
	draft: z.boolean().optional(),
	merged: z.boolean().optional(),
	head: z.object({
		ref: z.string(),
	}),
});

/**
 * Register the link_pr tool.
 */
export function registerLinkPRTool(server: McpServer): void {
	server.tool(
		TOOL_NAME,
		`Link a GitHub PR to a task.

Manually associate a PR with a task. Useful when:
- PR was created after task completion
- Multiple PRs implement parts of the same task
- You want to link a PR in a different repo

USAGE:
- prNumber: The GitHub PR number
- repo (optional): Defaults to task's repo. Use "owner/repo" format for cross-repo linking.
- branch (optional): Will be fetched from GitHub if not provided

The linked PR will appear in the task's Changes tab with status, diff, and review comments.

EXAMPLE:
link_pr({
  taskId: "abc123",
  sessionToken: "token",
  prNumber: 42
})`,
		{
			taskId: { type: "string", description: "Task ID" },
			sessionToken: {
				type: "string",
				description: "Session token from create_task",
			},
			prNumber: { type: "number", description: "PR number to link" },
			branch: {
				type: "string",
				description: "Branch name (optional, will be fetched if omitted)",
			},
			repo: {
				type: "string",
				description:
					"Repository override (org/repo). Uses task repo if omitted.",
			},
		},
		async (args: unknown) => {
			const input = LinkPRInput.parse(args);

			logger.info(
				{ taskId: input.taskId, prNumber: input.prNumber, repo: input.repo },
				"Linking PR to task",
			);

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

			/** Determine repo */
			const repo = input.repo || meta.repo;
			if (!repo) {
				return errorResponse(
					"No repository specified. Provide repo parameter or set task repo.",
				);
			}

			/** Check for GitHub token */
			const githubToken = process.env.GITHUB_TOKEN;
			if (!githubToken) {
				return errorResponse(
					"GitHub authentication required. Set GITHUB_TOKEN environment variable or run: gh auth login",
				);
			}

			/** Parse repo */
			const { owner, repoName } = parseRepoString(repo);

			try {
				/** Fetch PR details from GitHub */
				const response = await fetch(
					`https://api.github.com/repos/${owner}/${repoName}/pulls/${input.prNumber}`,
					{
						headers: {
							Authorization: `Bearer ${githubToken}`,
							Accept: "application/vnd.github.v3+json",
							"User-Agent": "shipyard-mcp-server",
						},
					},
				);

				if (!response.ok) {
					if (response.status === 404) {
						return errorResponse(
							`PR #${input.prNumber} not found in ${repo}. Make sure the PR exists and you have access.`,
						);
					}
					throw new Error(`GitHub API error: ${response.status}`);
				}

				const pr = await response.json();

				/** Validate GitHub API response */
				const validatedPR = GitHubPRResponseSchema.parse(pr);

				/** Determine PR status */
				const status = validatedPR.merged
					? "merged"
					: validatedPR.state === "closed"
						? "closed"
						: validatedPR.draft
							? "draft"
							: "open";

				const linkedPR = {
					prNumber: input.prNumber,
					status: status as "draft" | "open" | "merged" | "closed",
					branch: input.branch || validatedPR.head.ref,
					title: validatedPR.title,
				};

				/** Get actor name for event logging */
				const actorName = await getGitHubUsername();

				/** Store in Loro doc */
				const linkedPRs = doc.linkedPRs;
				linkedPRs.push(linkedPR);

				/** Log PR linked event */
				doc.logEvent("pr_linked", actorName, {
					prNumber: linkedPR.prNumber,
					title: linkedPR.title,
				});

				logger.info(
					{
						taskId: input.taskId,
						prNumber: input.prNumber,
						status: linkedPR.status,
					},
					"PR linked successfully",
				);

				return {
					content: [
						{
							type: "text",
							text: `PR linked successfully!

PR: #${linkedPR.prNumber} - ${linkedPR.title}
Status: ${linkedPR.status}
Branch: ${linkedPR.branch}
URL: ${validatedPR.html_url}

The PR is now visible in the "Changes" tab of your task.`,
						},
					],
				};
			} catch (error) {
				logger.error(
					{ error, taskId: input.taskId, prNumber: input.prNumber },
					"Failed to link PR",
				);

				if (error instanceof z.ZodError) {
					const fieldErrors = error.issues
						.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
						.join(", ");
					return errorResponse(
						`GitHub API returned invalid data for PR #${input.prNumber}\n\nValidation errors: ${fieldErrors}`,
					);
				}

				const message =
					error instanceof Error
						? error.message
						: "Unknown error while fetching PR from GitHub";

				return errorResponse(
					`Failed to link PR #${input.prNumber}: ${message}\n\nMake sure:\n- The PR exists in the repository\n- You have access to the repository\n- GitHub token has correct permissions`,
				);
			}
		},
	);
}
