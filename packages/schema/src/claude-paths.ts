/**
 * Shared utilities for Claude Code session file paths.
 * Used by both registry server and daemon for consistent session file management.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Base directory for Claude Code projects.
 */
export const DEFAULT_CLAUDE_PROJECTS_DIR = join(homedir(), '.claude', 'projects');

/**
 * Gets the project path for a Shipyard plan.
 *
 * @param planId - Optional plan ID (uses cwd if not provided)
 * @param baseDir - Base directory for Claude projects (defaults to ~/.claude/projects, can be overridden for testing)
 * @returns Project directory path
 */
export function getProjectPath(planId?: string, baseDir?: string): string {
  // Sanitize planId to prevent path traversal attacks (e.g., ../../../etc/passwd)
  const safePlanId = planId?.replace(/[^a-zA-Z0-9_-]/g, '') || '';
  const projectName = safePlanId ? `shipyard-${safePlanId.slice(0, 8)}` : 'shipyard';
  const projectsDir = baseDir || DEFAULT_CLAUDE_PROJECTS_DIR;
  return join(projectsDir, projectName);
}

/**
 * Gets the full path for a session transcript file.
 *
 * @param projectPath - Project directory path from getProjectPath()
 * @param sessionId - Claude Code session ID
 * @returns Full path to the .jsonl session file
 */
export function getSessionTranscriptPath(projectPath: string, sessionId: string): string {
  return join(projectPath, `${sessionId}.jsonl`);
}
