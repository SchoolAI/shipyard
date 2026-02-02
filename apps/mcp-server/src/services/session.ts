/**
 * Session registry - minimal sessionId to planId mapping.
 *
 * Necessary because Claude Code's session_id != our planId.
 * Hook receives session_id from Claude Code protocol.
 *
 * @see docs/whips/daemon-mcp-server-merge.md#3-session-registry
 */

/**
 * Session entry in registry.
 */
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

	/**
	 * Register a session -> plan mapping.
	 */
	register(sessionId: string, planId: string, ttlMs = DEFAULT_TTL_MS): void {
		this.sessions.set(sessionId, {
			planId,
			expiresAt: Date.now() + ttlMs,
		});
	}

	/**
	 * Look up a planId by sessionId.
	 */
	lookup(sessionId: string): { planId: string } | null {
		const entry = this.sessions.get(sessionId);
		if (!entry) return null;
		if (Date.now() > entry.expiresAt) {
			this.sessions.delete(sessionId);
			return null;
		}
		return { planId: entry.planId };
	}

	/**
	 * Remove expired sessions.
	 */
	cleanup(): number {
		const now = Date.now();
		let removed = 0;
		for (const [sessionId, entry] of this.sessions) {
			if (now > entry.expiresAt) {
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
}

/** Singleton registry instance */
export const sessionRegistry = new SessionRegistry();
