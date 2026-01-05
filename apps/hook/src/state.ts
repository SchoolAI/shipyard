/**
 * State management for hook sessions.
 * Persists session → plan mapping to a JSON file.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { STALE_SESSION_MAX_AGE_MS, STATE_DIR_NAME, STATE_FILE_NAME } from './constants.js';
import { logger } from './logger.js';

// --- State File Location ---

const STATE_DIR = process.env.PEER_PLAN_STATE_DIR ?? join(homedir(), STATE_DIR_NAME);
const STATE_FILE = join(STATE_DIR, STATE_FILE_NAME);

// --- State Schema ---

const SessionStateSchema = z.object({
  planId: z.string(),
  planFilePath: z.string().optional(),
  createdAt: z.number(),
  lastSyncedAt: z.number(),
  contentHash: z.string().optional(),
});

export type SessionState = z.infer<typeof SessionStateSchema>;

const HookStateFileSchema = z.object({
  version: z.literal(1),
  sessions: z.record(z.string(), SessionStateSchema),
});

type HookStateFile = z.infer<typeof HookStateFileSchema>;

// --- State Operations ---

/**
 * Read the state file. Returns empty state if file doesn't exist or is invalid.
 */
export function readState(): HookStateFile {
  try {
    if (!existsSync(STATE_FILE)) {
      return { version: 1, sessions: {} };
    }

    const content = readFileSync(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    return HookStateFileSchema.parse(parsed);
  } catch (err) {
    logger.warn({ err, file: STATE_FILE }, 'Failed to read state file, starting fresh');
    return { version: 1, sessions: {} };
  }
}

/**
 * Write the state file atomically (write to temp, then rename).
 */
export function writeState(state: HookStateFile): void {
  try {
    // Ensure directory exists
    if (!existsSync(STATE_DIR)) {
      mkdirSync(STATE_DIR, { recursive: true });
    }

    // Write to temp file first
    const tempFile = `${STATE_FILE}.tmp.${process.pid}`;
    writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf-8');

    // Atomic rename
    renameSync(tempFile, STATE_FILE);
  } catch (err) {
    logger.error({ err, file: STATE_FILE }, 'Failed to write state file');
    throw err;
  }
}

/**
 * Get state for a specific session.
 */
export function getSessionState(sessionId: string): SessionState | null {
  const state = readState();
  const session = state.sessions[sessionId];
  if (!session) return null;
  return session;
}

/**
 * Set state for a specific session.
 */
export function setSessionState(sessionId: string, sessionState: SessionState): void {
  const state = readState();
  state.sessions[sessionId] = sessionState;
  writeState(state);
}

/**
 * Delete state for a specific session.
 */
export function deleteSessionState(sessionId: string): void {
  const state = readState();
  delete state.sessions[sessionId];
  writeState(state);
}

/**
 * Clean up stale sessions (older than maxAgeMs).
 * Called on each hook invocation to prevent unbounded growth.
 */
export function cleanStaleSessions(maxAgeMs: number = STALE_SESSION_MAX_AGE_MS): number {
  const state = readState();
  const now = Date.now();
  let cleaned = 0;

  for (const sessionId of Object.keys(state.sessions)) {
    const session = state.sessions[sessionId];
    if (session && now - session.lastSyncedAt > maxAgeMs) {
      delete state.sessions[sessionId];
      cleaned++;
    }
  }

  if (cleaned > 0) {
    writeState(state);
    logger.info({ cleaned }, 'Cleaned stale sessions');
  }

  return cleaned;
}

/**
 * Get the state directory path (for logging/debugging).
 */
export function getStateDir(): string {
  return STATE_DIR;
}
