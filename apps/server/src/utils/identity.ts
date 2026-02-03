/**
 * Machine identity helpers.
 *
 * Functions for generating and managing machine identity.
 * Used for changeSnapshots keys and spawn event targeting.
 *
 * Ported from apps/server-legacy/src/server-identity.ts
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { hostname, userInfo } from "node:os";
import { basename, dirname } from "node:path";

/** Cache for GitHub username */
let cachedUsername: string | null = null;
let usernameResolved = false;

/** Cache for repository name */
let cachedRepoName: string | null = null;

/** Cache for machine ID */
let cachedMachineId: string | null = null;

/**
 * Gets the current repository name (owner/repo) from the current directory.
 * Uses `gh repo view` to detect the repo from git remotes.
 * Returns null if not in a git repo or gh CLI is not available.
 */
export function getRepositoryFullName(): string | null {
	if (cachedRepoName !== null) {
		return cachedRepoName || null;
	}

	try {
		const repoName = execSync(
			"gh repo view --json nameWithOwner --jq .nameWithOwner",
			{
				encoding: "utf-8",
				timeout: 5000,
				stdio: ["pipe", "pipe", "pipe"],
			},
		).trim();

		if (!repoName) {
			cachedRepoName = "";
			return null;
		}

		cachedRepoName = repoName;
		return cachedRepoName;
	} catch {
		cachedRepoName = "";
		return null;
	}
}

/**
 * Get GitHub username with resolution priority:
 * 1. GITHUB_USERNAME env var (explicit)
 * 2. GITHUB_TOKEN + API (verified)
 * 3. gh CLI (verified)
 * 4. git config user.name (unverified)
 * 5. OS username (unverified)
 */
export async function getGitHubUsername(): Promise<string> {
	if (usernameResolved && cachedUsername) {
		return cachedUsername;
	}

	if (process.env.GITHUB_USERNAME) {
		cachedUsername = process.env.GITHUB_USERNAME;
		usernameResolved = true;
		return cachedUsername;
	}

	if (process.env.GITHUB_TOKEN) {
		const username = await getUsernameFromToken(process.env.GITHUB_TOKEN);
		if (username) {
			cachedUsername = username;
			usernameResolved = true;
			return cachedUsername;
		}
	}

	const cliUsername = getUsernameFromCLI();
	if (cliUsername) {
		cachedUsername = cliUsername;
		usernameResolved = true;
		return cachedUsername;
	}

	const gitUsername = getUsernameFromGitConfig();
	if (gitUsername) {
		cachedUsername = gitUsername;
		usernameResolved = true;
		return cachedUsername;
	}

	const osUsername = process.env.USER || process.env.USERNAME;
	if (osUsername) {
		cachedUsername = osUsername.replace(/[^a-zA-Z0-9_-]/g, "_");
		usernameResolved = true;
		return cachedUsername;
	}

	usernameResolved = true;
	throw new Error(
		"GitHub username required but could not be determined.\n\n" +
			"Configure ONE of:\n" +
			"1. GITHUB_USERNAME=your-username (explicit)\n" +
			"2. GITHUB_TOKEN=ghp_xxx (will fetch from API)\n" +
			"3. gh auth login (uses CLI)\n" +
			'4. git config --global user.name "your-username"\n' +
			"5. Set USER or USERNAME environment variable\n\n" +
			"For remote agents: Use option 1 or 2",
	);
}

/**
 * Get username from GitHub API using token.
 */
async function getUsernameFromToken(token: string): Promise<string | null> {
	try {
		const response = await fetch("https://api.github.com/user", {
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: "application/vnd.github.v3+json",
				"User-Agent": "shipyard-mcp-server",
			},
			signal: AbortSignal.timeout(5000),
		});

		if (!response.ok) return null;

		const user: { login?: string } = await response.json();
		return user.login ?? null;
	} catch {
		return null;
	}
}

/**
 * Get username from gh CLI.
 */
function getUsernameFromCLI(): string | null {
	try {
		const username = execSync("gh api user --jq .login", {
			encoding: "utf-8",
			timeout: 5000,
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();
		return username || null;
	} catch {
		return null;
	}
}

/**
 * Get username from git config.
 */
function getUsernameFromGitConfig(): string | null {
	try {
		const username = execSync("git config user.name", {
			encoding: "utf-8",
			timeout: 5000,
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();
		return username || null;
	} catch {
		return null;
	}
}

/**
 * Get verified GitHub username (authenticated sources only).
 * Use this for security-critical operations like token regeneration.
 *
 * Returns null if no verified auth is available.
 */
export async function getVerifiedGitHubUsername(): Promise<string | null> {
	if (process.env.GITHUB_USERNAME) {
		return process.env.GITHUB_USERNAME;
	}

	if (process.env.GITHUB_TOKEN) {
		const username = await getUsernameFromToken(process.env.GITHUB_TOKEN);
		if (username) {
			return username;
		}
	}

	const username = getUsernameFromCLI();
	if (username) {
		return username;
	}

	return null;
}

/**
 * Gets the current git branch name.
 * Returns undefined if not in a git repo or git is not available.
 */
function getGitBranch(): string | undefined {
	try {
		return (
			execSync("git branch --show-current", {
				encoding: "utf-8",
				timeout: 2000,
				stdio: ["pipe", "pipe", "pipe"],
			}).trim() || undefined
		);
	} catch {
		return undefined;
	}
}

/**
 * Environment context for agent identification.
 */
export interface EnvironmentContext {
	projectName?: string;
	branch?: string;
	hostname: string;
	repo?: string;
}

/**
 * Gets environment context for agent identification.
 * Provides metadata about where the agent is running (project, branch, hostname, repo).
 */
export function getEnvironmentContext(): EnvironmentContext {
	const cwd = process.cwd();
	const currentDir = basename(cwd);
	const parentDir = basename(dirname(cwd));

	const projectName =
		parentDir && currentDir
			? `${parentDir}/${currentDir}`
			: currentDir || undefined;

	return {
		projectName,
		branch: getGitBranch(),
		hostname: hostname(),
		repo: getRepositoryFullName() || undefined,
	};
}

/**
 * Generate a stable machine ID from hostname, username, and cwd.
 * Used as key in changeSnapshots record.
 */
export function generateMachineId(params?: {
	hostname?: string;
	username?: string;
	cwd?: string;
}): string {
	if (cachedMachineId && !params) {
		return cachedMachineId;
	}

	const h = params?.hostname ?? hostname();
	const u = params?.username ?? userInfo().username;
	const c = params?.cwd ?? process.cwd();

	if (!h) {
		throw new Error("Could not determine hostname for machine ID");
	}
	if (!u) {
		throw new Error(
			"Could not determine username for machine ID (set USER or USERNAME env var)",
		);
	}

	const input = `${h}:${u}:${c}`;
	const id = createHash("sha256").update(input).digest("hex").slice(0, 16);

	if (!params) {
		cachedMachineId = id;
	}

	return id;
}

/**
 * Get machine ID (alias for generateMachineId with no params).
 */
export function getMachineId(): string {
	return generateMachineId();
}

/**
 * Get a human-readable machine name.
 */
export function getMachineName(): string {
	const h = hostname();

	if (h.endsWith(".local")) {
		return h.slice(0, -6);
	}

	if (h.includes("-")) {
		const parts = h.split("-");
		if (parts.length >= 2) {
			const possessivePart = parts[0];
			const typePart = parts.slice(1).join(" ");
			return `${possessivePart}'s ${typePart}`;
		}
	}

	return h;
}

/**
 * Normalize a username for comparison.
 */
export function normalizeUsername(username: string): string {
	return username.toLowerCase().trim();
}
