import { config as loadDotenv } from 'dotenv';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** Load .env file from daemon directory (supports both dev and MCP-spawned scenarios) */
const currentFile = fileURLToPath(import.meta.url);
const daemonDir = dirname(currentFile);
const envPath = join(daemonDir, '../.env');
loadDotenv({ path: envPath });

/**
 * Load and validate environment variables using a Zod schema.
 */
function loadEnv<T extends z.ZodSchema>(schema: T): z.infer<T> {
	try {
		return schema.parse(process.env);
	} catch (error) {
		if (error instanceof z.ZodError) {
			const errorMessages = error.issues
				.map((err) => ` - ${err.path.join('.')}: ${err.message}`)
				.join('\n');
			throw new Error(
				`Environment variable validation failed:\n${errorMessages}\n\nSet these in .env file or environment.`,
			);
		}
		throw error;
	}
}

const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
export type LogLevel = z.infer<typeof logLevelSchema>;

const schema = z.object({
	/**
	 * Directory where Claude Code session files are stored.
	 * Defaults to ~/.claude/projects
	 */
	CLAUDE_PROJECTS_DIR: z
		.string()
		.default(join(homedir(), '.claude', 'projects')),
	/**
	 * Log level for spawned agents.
	 * When set to "debug", passes --debug "api,hooks" to Claude Code processes.
	 * Valid values: "debug", "info", "warn", "error"
	 * Defaults to "info"
	 */
	LOG_LEVEL: logLevelSchema.default('info'),
	/**
	 * Primary port for daemon WebSocket server.
	 * Each worktree gets a unique port via DAEMON_PORT env var.
	 * Defaults to 56609 (main worktree).
	 */
	DAEMON_PORT: z
		.string()
		.optional()
		.transform((val) => {
			if (!val) return 56609;
			const port = Number.parseInt(val, 10);
			if (Number.isNaN(port)) throw new Error('DAEMON_PORT must be a number');
			if (port < 1 || port > 65535)
				throw new Error('DAEMON_PORT must be between 1 and 65535');
			return port;
		}),
	/**
	 * State directory for lock files and logs.
	 * Each worktree gets an isolated directory.
	 * Defaults to ~/.shipyard (main worktree).
	 */
	SHIPYARD_STATE_DIR: z.string().default(join(homedir(), '.shipyard')),
	/**
	 * Web app URL for task links in agent prompts.
	 * Set per-worktree to point to the correct Vite dev server.
	 * Defaults to http://localhost:5173
	 */
	SHIPYARD_WEB_URL: z.string().default('http://localhost:5173'),
	/**
	 * When true, shim Claude execution instead of spawning.
	 * Used in Docker mode where Claude Code isn't available.
	 */
	DOCKER_MODE: z
		.string()
		.optional()
		.transform((val) => val === 'true' || val === '1'),
	/**
	 * Directory for Claude shim logs in Docker mode.
	 * Only used when DOCKER_MODE is enabled.
	 */
	CLAUDE_SHIM_LOG_DIR: z.string().default('/var/log/shipyard'),
});

export const daemonConfig = loadEnv(schema);
export type DaemonConfig = z.infer<typeof schema>;
