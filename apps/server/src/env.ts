/**
 * Environment configuration with Zod validation.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error']).default('info');

/**
 * Environment schema for the MCP server.
 */
export const EnvSchema = z.object({
  /** Port for HTTP server (health, GitHub proxy) */
  PORT: z.coerce.number().default(4445),

  /** LevelDB storage path */
  DATA_DIR: z.string().default('./data'),

  /** Log level */
  LOG_LEVEL: LogLevelSchema,

  /** GitHub token for API proxy */
  GITHUB_TOKEN: z.string().optional(),

  /** Signaling server URL for WebRTC */
  SIGNALING_URL: z.string().default('wss://shipyard-signaling.jacob-191.workers.dev'),

  /** Web app URL for browser links */
  WEB_URL: z.string().default('http://localhost:5173'),

  /** Whether running in Docker mode (shim Claude spawning) */
  DOCKER_MODE: z.coerce.boolean().default(false),

  /** Directory for Claude shim logs in Docker mode */
  CLAUDE_SHIM_LOG_DIR: z.string().default('/tmp/shipyard-shim-logs'),

  /** Directory where Claude Code session files are stored */
  CLAUDE_PROJECTS_DIR: z.string().default(join(homedir(), '.claude', 'projects')),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Parse and validate environment variables.
 */
export function parseEnv(): Env {
  try {
    return EnvSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map((e) => ` - ${e.path.join('.')}: ${e.message}`).join('\n');
      throw new Error(`Environment validation failed:\n${messages}`);
    }
    throw error;
  }
}
