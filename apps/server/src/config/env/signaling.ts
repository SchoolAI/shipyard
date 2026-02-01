import { z } from "zod";
import { loadEnv } from "../config.js";

/**
 * WebRTC signaling server URL configuration.
 *
 * Uses NODE_ENV-based defaults:
 * - development (default): ws://localhost:4444
 * - production: wss://shipyard-signaling.jacob-191.workers.dev
 *
 * Can be overridden with SIGNALING_URL environment variable.
 */
const schema = z.object({
	SIGNALING_URL: z
		.string()
		.url()
		.default(() => {
			const nodeEnv = process.env.NODE_ENV || "development";
			return nodeEnv === "production"
				? "wss://shipyard-signaling.jacob-191.workers.dev"
				: `ws://localhost:${process.env.PORT || "4444"}`;
		}),
});

export const signalingConfig = loadEnv(schema);
export type SignalingConfig = z.infer<typeof schema>;
