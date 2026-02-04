/**
 * Session registry - minimal sessionId to planId mapping.
 *
 * Necessary because Claude Code's session_id != our planId.
 * Hook receives session_id from Claude Code protocol.
 *
 * Simplified from server-legacy: no lifecycle tracking (we derive from Loro doc now).
 *
 * @see docs/whips/daemon-mcp-server-merge.md#3-session-registry
 */

/** Session entry in registry */
interface SessionEntry {
  planId: string;
  expiresAt: number;
}

/** Default TTL for sessions (24 hours) */
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * In-memory session registry.
 * Maps sessionId -> planId for hook lookups.
 */
class SessionRegistry {
  private sessions = new Map<string, SessionEntry>();
  private planToSession = new Map<string, string>();

  /**
   * Register a session -> plan mapping.
   */
  register(sessionId: string, planId: string, ttlMs = DEFAULT_TTL_MS): void {
    this.sessions.set(sessionId, {
      planId,
      expiresAt: Date.now() + ttlMs,
    });
    this.planToSession.set(planId, sessionId);
  }

  /**
   * Look up a planId by sessionId.
   */
  lookup(sessionId: string): { planId: string } | null {
    const entry = this.sessions.get(sessionId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.delete(sessionId);
      return null;
    }
    return { planId: entry.planId };
  }

  /**
   * Look up a sessionId by planId (reverse lookup).
   */
  lookupByPlanId(planId: string): string | null {
    const sessionId = this.planToSession.get(planId);
    if (!sessionId) return null;

    const entry = this.sessions.get(sessionId);
    if (!entry || Date.now() > entry.expiresAt) {
      this.planToSession.delete(planId);
      return null;
    }
    return sessionId;
  }

  /**
   * Delete a session.
   */
  delete(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (entry) {
      this.planToSession.delete(entry.planId);
    }
    this.sessions.delete(sessionId);
  }

  /**
   * Touch session to keep it alive (reset TTL).
   */
  touch(sessionId: string, ttlMs = DEFAULT_TTL_MS): void {
    const entry = this.sessions.get(sessionId);
    if (entry) {
      entry.expiresAt = Date.now() + ttlMs;
    }
  }

  /**
   * Remove expired sessions.
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    for (const [sessionId, entry] of this.sessions) {
      if (now > entry.expiresAt) {
        const currentSessionId = this.planToSession.get(entry.planId);
        if (currentSessionId === sessionId) {
          this.planToSession.delete(entry.planId);
        }
        this.sessions.delete(sessionId);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Get count of active sessions.
   */
  size(): number {
    return this.sessions.size;
  }

  /**
   * Get all active session IDs (for debugging/monitoring).
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }
}

/** Singleton registry instance */
export const sessionRegistry = new SessionRegistry();
