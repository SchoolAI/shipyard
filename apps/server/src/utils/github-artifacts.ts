/**
 * GitHub artifacts upload functionality.
 *
 * Uploads artifacts to the plan-artifacts branch on GitHub.
 * Ported from apps/server-legacy/src/github-artifacts.ts
 *
 * Uses consolidated helpers from:
 * - ./artifact-helpers.ts (parseRepoString, resolveArtifactContent)
 * - ./github-helpers.ts (getOctokit, isGitHubConfigured, etc.)
 */

import { logger } from "./logger.js";
import {
	type ContentResult,
	type ContentSource,
	parseRepoString,
	resolveArtifactContent,
} from "./artifact-helpers.js";
import {
	GitHubAuthError,
	getErrorStatus,
	getOctokit,
	isAuthError,
	isGitHubConfigured,
	resolveGitHubToken,
} from "./github-helpers.js";

const ARTIFACTS_BRANCH = "plan-artifacts";

/** Re-export for backwards compatibility */
export {
	GitHubAuthError,
	getOctokit,
	isAuthError,
	isGitHubConfigured,
	parseRepoString,
	resolveArtifactContent,
	resolveGitHubToken,
};
export type { ContentResult, ContentSource };

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
