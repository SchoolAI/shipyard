/**
 * GitHub artifact upload helpers.
 *
 * Ported from apps/server-legacy/src/github-artifacts.ts
 * Handles uploading artifacts to GitHub's plan-artifacts branch.
 */

import { execSync } from "node:child_process";
import { Octokit } from "@octokit/rest";
import { parseEnv } from "../../env.js";
import { logger } from "../../utils/logger.js";

const ARTIFACTS_BRANCH = "plan-artifacts";

/**
 * Parse a "owner/repo" string into owner and repo components.
 */
export function parseRepoString(repo: string): {
	owner: string;
	repoName: string;
} {
	const parts = repo.split("/");
	if (parts.length !== 2 || !parts[0] || !parts[1]) {
		throw new Error(`Invalid repo format: "${repo}". Expected "owner/repo".`);
	}
	return { owner: parts[0], repoName: parts[1] };
}

/**
 * Get GitHub token from environment.
 */
function getGitHubToken(): string | null {
	const env = parseEnv();
	return env.GITHUB_TOKEN ?? null;
}

/**
 * Check if GitHub is configured (has valid token).
 */
export function isGitHubConfigured(): boolean {
	return !!getGitHubToken();
}

/**
 * Custom error class for GitHub authentication failures.
 */
export class GitHubAuthError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "GitHubAuthError";
	}
}

/**
 * Get Octokit instance with token.
 * Returns null if no token is available.
 */
export function getOctokit(): Octokit | null {
	const token = getGitHubToken();
	if (!token) {
		return null;
	}
	return new Octokit({ auth: token });
}

/**
 * Extract status code from an error if it has one.
 */
function getErrorStatus(error: unknown): number | undefined {
	if (!error || typeof error !== "object") return undefined;
	const record = Object.fromEntries(Object.entries(error));
	const status = record.status;
	return typeof status === "number" ? status : undefined;
}

/**
 * Check if an error is an authentication error (401/403).
 */
function isAuthError(error: unknown): boolean {
	const status = getErrorStatus(error);
	return status === 401 || status === 403;
}

/**
 * Ensures the artifacts branch exists.
 * Creates it from the default branch if it doesn't exist.
 */
export async function ensureArtifactsBranch(repo: string): Promise<void> {
	const octokit = getOctokit();
	if (!octokit) {
		throw new Error("GITHUB_TOKEN not set");
	}

	const { owner, repoName } = parseRepoString(repo);

	/** Check if branch exists */
	try {
		await octokit.repos.getBranch({
			owner,
			repo: repoName,
			branch: ARTIFACTS_BRANCH,
		});
		logger.debug({ repo }, "Artifacts branch exists");
		return;
	} catch (error: unknown) {
		if (getErrorStatus(error) !== 404) {
			throw error;
		}
		/** Branch doesn't exist, need to create it */
	}

	logger.info({ repo }, "Creating artifacts branch");

	try {
		/** Get the default branch SHA */
		const { data: repoData } = await octokit.repos.get({
			owner,
			repo: repoName,
		});
		const defaultBranch = repoData.default_branch;

		const { data: refData } = await octokit.git.getRef({
			owner,
			repo: repoName,
			ref: `heads/${defaultBranch}`,
		});

		/** Create the artifacts branch from default branch */
		await octokit.git.createRef({
			owner,
			repo: repoName,
			ref: `refs/heads/${ARTIFACTS_BRANCH}`,
			sha: refData.object.sha,
		});

		logger.info({ repo, branch: ARTIFACTS_BRANCH }, "Created artifacts branch");
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : "Unknown error";
		throw new Error(
			`Failed to create "${ARTIFACTS_BRANCH}" branch. Please create it manually:\n\n` +
				`  git checkout --orphan ${ARTIFACTS_BRANCH}\n` +
				`  git rm -rf .\n` +
				`  git commit --allow-empty -m "Initialize plan artifacts"\n` +
				`  git push -u origin ${ARTIFACTS_BRANCH}\n` +
				`  git checkout main\n\n` +
				`Error: ${message}`,
		);
	}
}

export interface UploadArtifactParams {
	repo: string;
	taskId: string;
	filename: string;
	content: string; // base64 encoded
}

/**
 * Upload an artifact to GitHub.
 * Returns the raw URL for accessing the artifact.
 */
export async function uploadArtifact(
	params: UploadArtifactParams,
): Promise<string> {
	const octokit = getOctokit();
	if (!octokit) {
		throw new GitHubAuthError(
			"GitHub token not configured.\n\n" +
				"To enable GitHub artifact uploads, set GITHUB_TOKEN in your environment.\n" +
				"Or run: gh auth login",
		);
	}

	const { repo, taskId, filename, content } = params;
	const { owner, repoName } = parseRepoString(repo);
	const path = `tasks/${taskId}/${filename}`;

	try {
		/** Ensure branch exists */
		await ensureArtifactsBranch(repo);

		/** Check if file already exists (need SHA for update) */
		let existingSha: string | undefined;
		try {
			const { data } = await octokit.repos.getContent({
				owner,
				repo: repoName,
				path,
				ref: ARTIFACTS_BRANCH,
			});
			if (!Array.isArray(data) && data.type === "file") {
				existingSha = data.sha;
			}
		} catch (error: unknown) {
			if (getErrorStatus(error) !== 404) {
				throw error;
			}
			/** File doesn't exist, that's fine */
		}

		/** Upload/update file */
		await octokit.repos.createOrUpdateFileContents({
			owner,
			repo: repoName,
			path,
			message: `Add artifact: ${filename}`,
			content,
			branch: ARTIFACTS_BRANCH,
			sha: existingSha,
		});

		const url = `https://raw.githubusercontent.com/${repo}/${ARTIFACTS_BRANCH}/${path}`;
		logger.info({ repo, path, url }, "Artifact uploaded to GitHub");

		return url;
	} catch (error) {
		if (isAuthError(error)) {
			throw new GitHubAuthError(
				"GitHub authentication failed.\n\n" +
					"Your token may not have the required permissions.\n" +
					"Run: gh auth login --scopes repo\n\n" +
					"Or check your GITHUB_TOKEN has repo access.",
			);
		}
		throw error;
	}
}

/**
 * Get the current git branch name.
 * Returns null if not on a branch or git is unavailable.
 */
export function getCurrentBranch(): string | null {
	try {
		const branch = execSync("git branch --show-current", {
			encoding: "utf-8",
			timeout: 5000,
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();

		if (!branch) {
			logger.debug("Not on a branch (possibly detached HEAD)");
			return null;
		}

		return branch;
	} catch (error) {
		logger.debug({ error }, "Could not detect current git branch");
		return null;
	}
}

/**
 * Try to auto-link a PR from the current git branch.
 * Returns PR info if found, null otherwise.
 */
export async function tryAutoLinkPR(repo: string): Promise<{
	prNumber: number;
	url: string;
	status: "draft" | "open" | "merged" | "closed";
	branch: string;
	title: string;
} | null> {
	const branch = getCurrentBranch();
	if (!branch) return null;

	const octokit = getOctokit();
	if (!octokit) {
		logger.debug("No GitHub token available for PR lookup");
		return null;
	}

	const { owner, repoName } = parseRepoString(repo);

	try {
		/** Look for open PRs from this branch */
		const { data: prs } = await octokit.pulls.list({
			owner,
			repo: repoName,
			head: `${owner}:${branch}`,
			state: "open",
		});

		if (prs.length === 0) {
			logger.debug({ branch, repo }, "No open PR found on branch");
			return null;
		}

		/** Use the first (most recent) PR */
		const pr = prs[0];
		if (!pr) return null;

		/** Determine PR status */
		let status: "draft" | "open" | "merged" | "closed";
		if (pr.merged_at) {
			status = "merged";
		} else if (pr.state === "closed") {
			status = "closed";
		} else if (pr.draft) {
			status = "draft";
		} else {
			status = "open";
		}

		return {
			prNumber: pr.number,
			url: pr.html_url,
			status,
			branch,
			title: pr.title,
		};
	} catch (error) {
		logger.warn({ error, repo, branch }, "Failed to lookup PR from GitHub");
		return null;
	}
}
