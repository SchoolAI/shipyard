import {
	MCP_CLIENT_INFO_MAP,
	type OriginPlatform,
	PLATFORM_DISPLAY_NAMES,
} from "@shipyard/schema";

/**
 * Platform detection result with platform name and display name for UI.
 */
export interface PlatformDetection {
	platform: OriginPlatform;
	displayName: string;
}

/**
 * Detect platform from MCP clientInfo.name.
 * This is the most reliable method as it comes from the MCP protocol handshake.
 *
 * @param clientInfoName - The name field from MCP clientInfo (e.g., "claude-code")
 * @returns Platform identifier or null if not recognized
 */
export function detectPlatformFromClientInfo(
	clientInfoName: string | undefined,
): OriginPlatform | null {
	if (!clientInfoName) return null;

	const normalized = clientInfoName.trim().toLowerCase();
	return MCP_CLIENT_INFO_MAP[normalized] || null;
}

function pathIncludes(path: string | undefined, search: string): boolean {
	return path?.toLowerCase().includes(search.toLowerCase()) ?? false;
}

function detectVSCodePlatform(env: NodeJS.ProcessEnv): OriginPlatform | null {
	if (!env.VSCODE_GIT_ASKPASS_MAIN && !env.VSCODE_NONCE) {
		return null;
	}

	const isCursor =
		pathIncludes(env.VSCODE_GIT_ASKPASS_MAIN, "cursor") ||
		pathIncludes(env.PATH, "cursor") ||
		pathIncludes(env.VSCODE_CWD, "Cursor");

	return isCursor ? "cursor" : "vscode";
}

function detectFromExplicitEnvVars(
	env: NodeJS.ProcessEnv,
): OriginPlatform | null {
	if (env.CLAUDECODE === "1" || env.CLAUDE_CODE_ENTRYPOINT)
		return "claude-code";
	if (env.CURSOR_AGENT === "1") return "cursor";
	if (env.CODEX_HOME) return "codex";
	if (env.AIDER_MODEL) return "aider";
	if (env.DEVIN_SESSION_ID) return "devin";
	return null;
}

/**
 * Detect platform from PATH environment variable.
 * NOTE: PATH-based detection is a last resort fallback and can be spoofed.
 * Only used when explicit env vars and clientInfo are unavailable.
 */
function detectFromPath(env: NodeJS.ProcessEnv): OriginPlatform | null {
	if (pathIncludes(env.PATH, "windsurf")) return "windsurf";
	if (pathIncludes(env.PATH, "aider")) return "aider";
	if (pathIncludes(env.PATH, "continue")) return "continue";
	if (pathIncludes(env.PATH, "zed")) return "zed";
	if (pathIncludes(env.PATH, "cline")) return "cline";
	return null;
}

/**
 * Detect platform from environment variables.
 * Fallback method when MCP clientInfo is not available.
 *
 * @returns Platform identifier or null if not detected
 */
export function detectPlatformFromEnvironment(): OriginPlatform | null {
	const env = process.env;

	const explicitResult = detectFromExplicitEnvVars(env);
	if (explicitResult) return explicitResult;

	const vscodeResult = detectVSCodePlatform(env);
	if (vscodeResult) return vscodeResult;

	return detectFromPath(env);
}

/**
 * Detect the platform running this MCP server.
 * Uses a simple fallback strategy:
 * 1. Check MCP clientInfo (most reliable)
 * 2. Check environment variables
 * 3. Default to 'unknown'
 *
 * @param clientInfoName - Optional MCP clientInfo.name from server initialization
 * @returns Platform detection result with platform and display name
 */
export function detectPlatform(clientInfoName?: string): PlatformDetection {
	let platform = detectPlatformFromClientInfo(clientInfoName);

	if (!platform) {
		platform = detectPlatformFromEnvironment();
	}

	if (!platform) {
		platform = "unknown";
	}

	return {
		platform,
		displayName: PLATFORM_DISPLAY_NAMES[platform],
	};
}

/**
 * Get display name for a user based on platform and username.
 * Formats as "Platform (username)" for authenticated users,
 * or just "Platform" for anonymous users.
 *
 * @param platform - The detected platform
 * @param username - Optional GitHub username
 * @returns Formatted display name for awareness state
 */
export function getDisplayName(
	platform: OriginPlatform,
	username?: string,
): string {
	const platformName = PLATFORM_DISPLAY_NAMES[platform];
	return username ? `${platformName} (${username})` : platformName;
}
