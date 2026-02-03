/**
 * GitHub artifacts upload functionality.
 *
 * Uploads artifacts to the plan-artifacts branch on GitHub.
 * Ported from apps/server-legacy/src/github-artifacts.ts
 */

import { Octokit } from "@octokit/rest";
import { logger } from "./logger.js";

const ARTIFACTS_BRANCH = "plan-artifacts";

/**
 * Parse a "owner/repo" string into owner and repo components.
 * Throws if the format is invalid.
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
 * Resolve GitHub token from environment.
 */
export function resolveGitHubToken(): string | null {
	return process.env.GITHUB_TOKEN ?? null;
}

/**
 * Checks if GitHub is configured (has valid token).
 */
export function isGitHubConfigured(): boolean {
	return !!resolveGitHubToken();
}

/**
 * Get Octokit instance with token from environment.
 * Returns null if no token is available.
 */
export function getOctokit(): Octokit | null {
	const token = resolveGitHubToken();
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
	if ("status" in error && typeof error.status === "number") {
		return error.status;
	}
	return undefined;
}

/**
 * Check if an error is an authentication error (401/403).
 */
export function isAuthError(error: unknown): boolean {
	const status = getErrorStatus(error);
	return status === 401 || status === 403;
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

		logger.info(
			{ repo, branch: ARTIFACTS_BRANCH },
			"Created artifacts branch",
		);
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
	planId: string;
	filename: string;
	content: string;
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
		throw new Error("GITHUB_TOKEN not set");
	}

	const { repo, planId, filename, content } = params;
	const { owner, repoName } = parseRepoString(repo);
	const path = `plans/${planId}/${filename}`;

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
	logger.info({ repo, path, url }, "Artifact uploaded");

	return url;
}

/**
 * Resolve artifact content from various sources.
 */
export type ContentSource =
	| { source: "file"; filePath: string }
	| { source: "url"; contentUrl: string }
	| { source: "base64"; content: string };

export type ContentResult =
	| { success: true; content: string }
	| { success: false; error: string };

/**
 * Resolves artifact content from file, URL, or base64.
 * Returns base64-encoded content.
 */
export async function resolveArtifactContent(
	input: ContentSource,
): Promise<ContentResult> {
	const { readFile } = await import("node:fs/promises");

	switch (input.source) {
		case "file": {
			logger.info({ filePath: input.filePath }, "Reading file from path");
			try {
				const fileBuffer = await readFile(input.filePath);
				return { success: true, content: fileBuffer.toString("base64") };
			} catch (error) {
				logger.error(
					{ error, filePath: input.filePath },
					"Failed to read file",
				);
				const message =
					error instanceof Error ? error.message : "Unknown error";
				return { success: false, error: `Failed to read file: ${message}` };
			}
		}

		case "url": {
			logger.info({ contentUrl: input.contentUrl }, "Fetching content from URL");
			try {
				const response = await fetch(input.contentUrl);
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}: ${response.statusText}`);
				}
				const arrayBuffer = await response.arrayBuffer();
				return {
					success: true,
					content: Buffer.from(arrayBuffer).toString("base64"),
				};
			} catch (error) {
				logger.error(
					{ error, contentUrl: input.contentUrl },
					"Failed to fetch URL",
				);
				const message =
					error instanceof Error ? error.message : "Unknown error";
				return { success: false, error: `Failed to fetch URL: ${message}` };
			}
		}

		case "base64": {
			return { success: true, content: input.content };
		}
	}
}
