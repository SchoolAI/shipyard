import { z } from "zod";

/**
 * Shared env schemas - these should eventually move to @shipyard/shared/env
 */
const LogLevelSchema = z
	.enum(["debug", "info", "warn", "error"])
	.default("info");
const EnvironmentSchema = z
	.enum(["development", "production"])
	.default("development");

/**
 * Environment schema for the signaling worker.
 * Validates env bindings at runtime.
 */
export const EnvSchema = z.object({
	PERSONAL_ROOM: z.custom<DurableObjectNamespace>((val) => val !== undefined),
	COLLAB_ROOM: z.custom<DurableObjectNamespace>((val) => val !== undefined),

	GITHUB_CLIENT_ID: z.string().min(1, "GITHUB_CLIENT_ID required"),
	GITHUB_CLIENT_SECRET: z.string().min(1, "GITHUB_CLIENT_SECRET required"),
	JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 chars"),

	ENVIRONMENT: EnvironmentSchema,
	LOG_LEVEL: LogLevelSchema.optional(),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Validate env at worker startup.
 * Throws with helpful error messages if validation fails.
 */
export function parseEnv(env: unknown): Env {
	try {
		return EnvSchema.parse(env);
	} catch (error) {
		if (error instanceof z.ZodError) {
			const messages = error.issues
				.map((e) => ` - ${e.path.join(".")}: ${e.message}`)
				.join("\n");
			throw new Error(`Worker env validation failed:\n${messages}`);
		}
		throw error;
	}
}
