/**
 * Machine identity helpers.
 *
 * Functions for generating and managing machine identity.
 * Used for changeSnapshots keys and spawn event targeting.
 */

import { createHash } from "node:crypto";
import { hostname, userInfo } from "node:os";

/**
 * Generate a stable machine ID from hostname, username, and optional salt.
 * Used as key in changeSnapshots record.
 */
export function generateMachineId(params?: {
	hostname?: string;
	username?: string;
	cwd?: string;
}): string {
	const h = params?.hostname ?? hostname();
	const u = params?.username ?? userInfo().username;
	const c = params?.cwd ?? process.cwd();

	const input = `${h}:${u}:${c}`;
	return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

/**
 * Get a human-readable machine name.
 */
export function getMachineName(): string {
	const h = hostname();
	const u = userInfo().username;
	return `${u}@${h}`;
}

/**
 * Get current GitHub username from gh CLI.
 * Returns null if not authenticated.
 */
export async function getGitHubUsername(): Promise<string | null> {
	// TODO: Implement using child_process
	// execSync('gh auth status --show-token 2>&1')
	// Parse username from output
	throw new Error("Not implemented");
}

/**
 * Normalize a username for comparison.
 */
export function normalizeUsername(username: string): string {
	return username.toLowerCase().trim();
}
