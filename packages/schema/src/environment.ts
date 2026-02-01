import { z } from "zod";

/**
 * Zod schema for environment context.
 * Used to validate awareness data from P2P peers (untrusted source).
 */
export const EnvironmentContextSchema = z.object({
	/** Project directory name (e.g., "shipyard") */
	projectName: z.string().optional(),
	/** Git branch name (e.g., "feature/auth") */
	branch: z.string().optional(),
	/** Machine hostname (e.g., "jacobs-macbook") */
	hostname: z.string().optional(),
	/** GitHub repo (e.g., "SchoolAI/shipyard") */
	repo: z.string().optional(),
});

/**
 * Environment context for agent identification.
 * Helps users distinguish agents working from different machines/branches/projects.
 *
 * Used in:
 * - WebRTC awareness protocol for real-time presence display
 * - Broadcast by MCP servers to show where they're running from
 * - Displayed in browser UI tooltips
 *
 * Schema is source of truth - type derived via z.infer.
 */
export type EnvironmentContext = z.infer<typeof EnvironmentContextSchema>;

/**
 * Zod schema for browser context.
 * Used to validate awareness data from browser peers (untrusted source).
 */
export const BrowserContextSchema = z.object({
	/** Browser name (e.g., "Chrome", "Safari", "Firefox") */
	browser: z.string().optional(),
	/** Operating system (e.g., "macOS", "Windows", "Linux") */
	os: z.string().optional(),
	/** Last activity timestamp (when user last interacted with the page) */
	lastActive: z.number().optional(),
});

/**
 * Browser context for peer identification.
 * Helps users distinguish between multiple browser connections.
 *
 * Used in:
 * - WebRTC awareness protocol for real-time presence display
 * - Broadcast by browsers to show who's viewing
 * - Displayed in browser UI tooltips
 *
 * Schema is source of truth - type derived via z.infer.
 */
export type BrowserContext = z.infer<typeof BrowserContextSchema>;
