import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

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
			throw new Error(`Environment variable validation failed: \n${errorMessages}`);
		}
		throw error;
	}
}

const schema = z.object({
	/**
	 * Directory where Claude Code session files are stored.
	 * Defaults to ~/.claude/projects
	 */
	CLAUDE_PROJECTS_DIR: z
		.string()
		.default(join(homedir(), '.claude', 'projects')),
});

export const daemonConfig = loadEnv(schema);
export type DaemonConfig = z.infer<typeof schema>;
