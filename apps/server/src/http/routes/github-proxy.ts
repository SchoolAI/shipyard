/**
 * GitHub API proxy endpoints.
 *
 * These exist because browser can't call GitHub API directly (CORS).
 * Only 2 endpoints for PR data needed by the diff viewer.
 */

import { Hono } from "hono";
import { ROUTES } from "../../client/index.js";
import type { GitHubClient, PRFile } from "../helpers/github.js";

export interface GitHubProxyContext {
	getClient: () => GitHubClient | null;
	parseRepo: (planId: string) => { owner: string; repo: string } | null;
}

export interface GitHubProxyError {
	code: "not_found" | "github_error" | "not_initialized" | "invalid_plan";
	message: string;
}

/**
 * Create GitHub proxy routes with injected dependencies.
 */
export function createGitHubProxyRoutes(ctx: GitHubProxyContext) {
	const app = new Hono();

	app.get(ROUTES.PR_DIFF, async (c) => {
		const { id: planId, prNumber } = c.req.param();
		const prNum = Number(prNumber);

		if (Number.isNaN(prNum) || prNum <= 0) {
			return c.json<GitHubProxyError>(
				{ code: "not_found", message: "Invalid PR number" },
				404,
			);
		}

		const client = ctx.getClient();
		if (!client) {
			return c.json<GitHubProxyError>(
				{ code: "not_initialized", message: "GitHub client not initialized" },
				500,
			);
		}

		const repoInfo = ctx.parseRepo(planId);
		if (!repoInfo) {
			return c.json<GitHubProxyError>(
				{ code: "invalid_plan", message: "Could not determine repository" },
				400,
			);
		}

		try {
			const diff = await client.getPRDiff(repoInfo.owner, repoInfo.repo, prNum);
			return c.text(diff);
		} catch (error) {
			const err = error as Error & { status?: number };
			if (err.status === 404) {
				return c.json<GitHubProxyError>(
					{ code: "not_found", message: "PR not found" },
					404,
				);
			}
			return c.json<GitHubProxyError>(
				{ code: "github_error", message: err.message || "GitHub API error" },
				500,
			);
		}
	});

	app.get(ROUTES.PR_FILES, async (c) => {
		const { id: planId, prNumber } = c.req.param();
		const prNum = Number(prNumber);

		if (Number.isNaN(prNum) || prNum <= 0) {
			return c.json<GitHubProxyError>(
				{ code: "not_found", message: "Invalid PR number" },
				404,
			);
		}

		const client = ctx.getClient();
		if (!client) {
			return c.json<GitHubProxyError>(
				{ code: "not_initialized", message: "GitHub client not initialized" },
				500,
			);
		}

		const repoInfo = ctx.parseRepo(planId);
		if (!repoInfo) {
			return c.json<GitHubProxyError>(
				{ code: "invalid_plan", message: "Could not determine repository" },
				400,
			);
		}

		try {
			const files = await client.getPRFiles(
				repoInfo.owner,
				repoInfo.repo,
				prNum,
			);
			return c.json<PRFile[]>(files);
		} catch (error) {
			const err = error as Error & { status?: number };
			if (err.status === 404) {
				return c.json<GitHubProxyError>(
					{ code: "not_found", message: "PR not found" },
					404,
				);
			}
			return c.json<GitHubProxyError>(
				{ code: "github_error", message: err.message || "GitHub API error" },
				500,
			);
		}
	});

	return app;
}
