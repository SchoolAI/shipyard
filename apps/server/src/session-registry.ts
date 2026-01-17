/**
 * Centralized in-memory session registry on the server.
 * Eliminates the hook's local JSON state file by storing session state server-side.
 *
 * Session State Lifecycle:
 * 1. createSession: Hook creates plan, server stores session → planId mapping
 * 2. approval: Server stores sessionToken and deliverables
 * 3. post_exit: Hook fetches session context, server returns and deletes it
 *
 * TTL: Sessions expire after 1 hour of inactivity to prevent unbounded growth.
 */

import { logger } from './logger.js';

// --- Session State Types ---

export interface SessionState {
  planId: string;
  planFilePath?: string;
  createdAt: number;
  lastSyncedAt: number;
  contentHash?: string;
  sessionToken?: string;
  url?: string;
  approvedAt?: number;
  deliverables?: Array<{ id: string; text: string }>;
  reviewComment?: string;
  reviewedBy?: string;
  reviewStatus?: string;
}

// --- Registry State ---

/**
 * In-memory session registry.
 * Key: sessionId (from Claude Code)
 * Value: SessionState
 */
const sessions = new Map<string, SessionState>();

/**
 * Reverse index: planId → sessionId for lookups when we only have planId.
 */
const planToSession = new Map<string, string>();

/**
 * Default TTL: 1 hour (in milliseconds)
 */
const DEFAULT_TTL_MS = 60 * 60 * 1000;

// --- Public API ---

/**
 * Get session state by sessionId (pure read, no side effects).
 */
export function getSessionState(sessionId: string): SessionState | null {
  return sessions.get(sessionId) ?? null;
}

/**
 * Touch session to update lastSyncedAt timestamp (keeps session alive).
 */
export function touchSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.lastSyncedAt = Date.now();
  }
}

/**
 * Set or update session state.
 */
export function setSessionState(sessionId: string, state: SessionState): void {
  const updatedState = {
    ...state,
    lastSyncedAt: Date.now(),
  };

  sessions.set(sessionId, updatedState);

  // Maintain reverse index
  planToSession.set(updatedState.planId, sessionId);
}

/**
 * Delete session state.
 */
export function deleteSessionState(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    // Clean up reverse index
    planToSession.delete(session.planId);
  }
  sessions.delete(sessionId);
}

/**
 * Get session state by planId (reverse lookup).
 */
export function getSessionStateByPlanId(planId: string): SessionState | null {
  const sessionId = planToSession.get(planId);
  if (!sessionId) return null;
  return getSessionState(sessionId);
}

/**
 * Get sessionId by planId (reverse lookup).
 */
export function getSessionIdByPlanId(planId: string): string | null {
  return planToSession.get(planId) || null;
}

/**
 * Clean up stale sessions (older than TTL).
 * Returns number of sessions cleaned.
 */
export function cleanStaleSessions(ttlMs: number = DEFAULT_TTL_MS): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastSyncedAt > ttlMs) {
      // Clean up reverse index
      planToSession.delete(session.planId);
      sessions.delete(sessionId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.info({ cleaned, ttlMs }, 'Cleaned stale sessions from registry');
  }

  return cleaned;
}

/**
 * Get all active session IDs (for debugging/monitoring).
 */
export function getActiveSessions(): string[] {
  return Array.from(sessions.keys());
}

/**
 * Get session count (for monitoring).
 */
export function getSessionCount(): number {
  return sessions.size;
}

// --- Background Cleanup ---

/**
 * Start periodic cleanup of stale sessions.
 * Runs every 15 minutes by default.
 */
let cleanupInterval: NodeJS.Timeout | null = null;

export function startPeriodicCleanup(intervalMs: number = 15 * 60 * 1000): void {
  if (cleanupInterval) {
    logger.warn('Periodic cleanup already started');
    return;
  }

  cleanupInterval = setInterval(() => {
    cleanStaleSessions();
  }, intervalMs);

  logger.info({ intervalMs }, 'Started periodic session cleanup');
}

/**
 * Stop periodic cleanup.
 */
export function stopPeriodicCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info('Stopped periodic session cleanup');
  }
}
