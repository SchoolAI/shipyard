import { execSync } from 'node:child_process';
import { z } from 'zod';
import { loadEnv } from '../config.js';

/**
 * Try to get GitHub token from gh CLI.
 * Returns null if gh is not installed or not authenticated.
 */
function getTokenFromGhCli(): string | null {
  try {
    const token = execSync('gh auth token', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'], // Suppress stderr
    }).trim();
    if (token) {
      return token;
    }
  } catch {
    // gh CLI not available or not authenticated
  }
  return null;
}

const schema = z.object({
  GITHUB_USERNAME: z.string().optional(),
  GITHUB_TOKEN: z
    .string()
    .optional()
    .transform((val) => val || getTokenFromGhCli() || null),
  SHIPYARD_ARTIFACTS: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return true; // Default enabled
      const setting = val.toLowerCase();
      return setting !== 'disabled' && setting !== 'false' && setting !== '0';
    }),
});

export const githubConfig = loadEnv(schema);
export type GithubConfig = z.infer<typeof schema>;
