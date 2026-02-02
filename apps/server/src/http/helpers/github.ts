/**
 * GitHub API helpers.
 *
 * Provides Octokit client for PR data fetching.
 * Used by github-proxy routes.
 */

// TODO: Import Octokit
// import { Octokit } from '@octokit/rest'

import type { Env } from "../env.js";

/**
 * GitHub PR file info.
 */
export interface PRFile {
	path: string;
	additions: number;
	deletions: number;
	status: "added" | "modified" | "deleted" | "renamed";
}

/**
 * GitHub client interface.
 */
export interface GitHubClient {
	getPRDiff(owner: string, repo: string, prNumber: number): Promise<string>;
	getPRFiles(owner: string, repo: string, prNumber: number): Promise<PRFile[]>;
}

/** Singleton client instance */
let client: GitHubClient | null = null;

/**
 * Initialize the GitHub client with env config.
 */
export function initGitHubClient(_env: Env): void {
	// TODO: Create Octokit instance with token
	// client = new Octokit({ auth: env.GITHUB_TOKEN })
	client = null;
}

/**
 * Get the GitHub client.
 * Throws if not initialized.
 */
export function getGitHubClient(): GitHubClient {
	if (!client) {
		throw new Error(
			"GitHub client not initialized. Call initGitHubClient first.",
		);
	}
	return client;
}

/**
 * Parse owner/repo from a repo string.
 */
export function parseRepo(repo: string): { owner: string; repo: string } {
	const parts = repo.split("/");
	if (parts.length !== 2) {
		throw new Error(`Invalid repo format: ${repo}. Expected owner/repo.`);
	}
	const [owner, repoName] = parts;
	if (!owner || !repoName) {
		throw new Error(`Invalid repo format: ${repo}. Expected owner/repo.`);
	}
	return { owner, repo: repoName };
}
