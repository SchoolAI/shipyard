import { z } from "zod";
import { loadEnv } from "../config.js";

/**
 * Web app URL configuration.
 *
 * Uses NODE_ENV-based defaults:
 * - development (default): http://localhost:{VITE_PORT || 5173}
 * - production: https://schoolai.github.io/shipyard
 *
 * Can be overridden with SHIPYARD_WEB_URL environment variable.
 * In worktrees, VITE_PORT is set by worktree-env.sh to avoid port conflicts.
 */
const schema = z.object({
	SHIPYARD_WEB_URL: z
		.string()
		.url()
		.default(() => {
			const nodeEnv = process.env.NODE_ENV || "development";
			if (nodeEnv === "production") {
				return "https://schoolai.github.io/shipyard";
			}
			const vitePort = process.env.VITE_PORT || "5173";
			return `http://localhost:${vitePort}`;
		}),
});

export const webConfig = loadEnv(schema);
export type WebConfig = z.infer<typeof schema>;
