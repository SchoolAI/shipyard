import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the registry config to use test directory
// Note: Must be defined inline to avoid hoisting issues
vi.mock('./config/env/registry.js', () => ({
  registryConfig: {
    PEER_PLAN_STATE_DIR: join(process.cwd(), '.test-state'),
  },
}));

// Mock the constants to use test file name
vi.mock('./constants.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./constants.js')>();
  return {
    ...original,
    STATE_FILE_NAME: 'hook-state.json',
    STALE_SESSION_MAX_AGE_MS: 24 * 60 * 60 * 1000, // 24 hours
  };
});

import {
  cleanStaleSessions,
  deleteSessionState,
  getSessionState,
  readState,
  setSessionState,
  writeState,
  type SessionState,
} from './state.js';

// Test directory for temporary state files
const TEST_STATE_DIR = join(process.cwd(), '.test-state');
const TEST_STATE_FILE = join(TEST_STATE_DIR, 'hook-state.json');

describe('State Management', () => {
  beforeEach(() => {
    // Clean up test directory before each test
    if (existsSync(TEST_STATE_DIR)) {
      rmSync(TEST_STATE_DIR, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up test directory after each test
    if (existsSync(TEST_STATE_DIR)) {
      rmSync(TEST_STATE_DIR, { recursive: true, force: true });
    }
  });

  describe('readState', () => {
    it('returns empty state for non-existent file', () => {
      const state = readState();
      expect(state).toEqual({ version: 1, sessions: {} });
    });

    it('reads existing state file', () => {
      // Create test state file
      mkdirSync(TEST_STATE_DIR, { recursive: true });
      const testState = {
        version: 1,
        sessions: {
          'session-1': {
            planId: 'plan-abc',
            createdAt: Date.now(),
            lastSyncedAt: Date.now(),
          },
        },
      };
      writeFileSync(TEST_STATE_FILE, JSON.stringify(testState), 'utf-8');

      const state = readState();
      expect(state).toEqual(testState);
      expect(state.sessions['session-1']?.planId).toBe('plan-abc');
    });

    it('returns empty state for invalid JSON', () => {
      mkdirSync(TEST_STATE_DIR, { recursive: true });
      writeFileSync(TEST_STATE_FILE, 'invalid json{', 'utf-8');

      const state = readState();
      expect(state).toEqual({ version: 1, sessions: {} });
    });

    it('returns empty state for invalid schema', () => {
      mkdirSync(TEST_STATE_DIR, { recursive: true });
      writeFileSync(TEST_STATE_FILE, JSON.stringify({ invalid: 'schema' }), 'utf-8');

      const state = readState();
      expect(state).toEqual({ version: 1, sessions: {} });
    });

    it('returns empty state for corrupted data', () => {
      mkdirSync(TEST_STATE_DIR, { recursive: true });
      // Missing required fields
      const corruptedState = {
        version: 1,
        sessions: {
          'session-1': {
            planId: 'plan-abc',
            // Missing createdAt and lastSyncedAt
          },
        },
      };
      writeFileSync(TEST_STATE_FILE, JSON.stringify(corruptedState), 'utf-8');

      const state = readState();
      expect(state).toEqual({ version: 1, sessions: {} });
    });

    it('handles unicode content', () => {
      mkdirSync(TEST_STATE_DIR, { recursive: true });
      const testState = {
        version: 1,
        sessions: {
          'session-1': {
            planId: 'plan-日本語',
            planFilePath: '/path/to/计划.md',
            createdAt: Date.now(),
            lastSyncedAt: Date.now(),
          },
        },
      };
      writeFileSync(TEST_STATE_FILE, JSON.stringify(testState), 'utf-8');

      const state = readState();
      expect(state.sessions['session-1']?.planId).toBe('plan-日本語');
      expect(state.sessions['session-1']?.planFilePath).toBe('/path/to/计划.md');
    });
  });

  describe('writeState', () => {
    it('creates directory if it does not exist', () => {
      expect(existsSync(TEST_STATE_DIR)).toBe(false);

      const state = { version: 1 as const, sessions: {} };
      writeState(state);

      expect(existsSync(TEST_STATE_DIR)).toBe(true);
      expect(existsSync(TEST_STATE_FILE)).toBe(true);
    });

    it('writes state to file', () => {
      const state = {
        version: 1 as const,
        sessions: {
          'session-1': {
            planId: 'plan-abc',
            createdAt: Date.now(),
            lastSyncedAt: Date.now(),
          },
        },
      };

      writeState(state);

      const content = readFileSync(TEST_STATE_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed).toEqual(state);
    });

    it('overwrites existing state', () => {
      const state1 = {
        version: 1 as const,
        sessions: {
          'session-1': {
            planId: 'plan-1',
            createdAt: Date.now(),
            lastSyncedAt: Date.now(),
          },
        },
      };

      writeState(state1);

      const state2 = {
        version: 1 as const,
        sessions: {
          'session-2': {
            planId: 'plan-2',
            createdAt: Date.now(),
            lastSyncedAt: Date.now(),
          },
        },
      };

      writeState(state2);

      const state = readState();
      expect(Object.keys(state.sessions)).toEqual(['session-2']);
      expect(state.sessions['session-1']).toBeUndefined();
    });

    it('uses atomic write (temp file + rename)', () => {
      const state = { version: 1 as const, sessions: {} };
      writeState(state);

      // After write, temp file should not exist
      const tempFiles = existsSync(TEST_STATE_DIR)
        ? require('node:fs').readdirSync(TEST_STATE_DIR).filter((f: string) => f.includes('.tmp'))
        : [];
      expect(tempFiles).toHaveLength(0);
    });

    it('formats JSON with indentation', () => {
      const state = { version: 1 as const, sessions: {} };
      writeState(state);

      const content = readFileSync(TEST_STATE_FILE, 'utf-8');
      // Should be formatted with 2 spaces
      expect(content).toContain('\n');
      expect(content).toMatch(/"version": 1/);
    });
  });

  describe('getSessionState', () => {
    it('returns null for non-existent session', () => {
      const session = getSessionState('nonexistent');
      expect(session).toBe(null);
    });

    it('returns session state when it exists', () => {
      const sessionState: SessionState = {
        planId: 'plan-123',
        createdAt: Date.now(),
        lastSyncedAt: Date.now(),
      };

      setSessionState('session-1', sessionState);

      const retrieved = getSessionState('session-1');
      expect(retrieved).toEqual(sessionState);
    });

    it('returns null for session in empty state', () => {
      writeState({ version: 1, sessions: {} });
      expect(getSessionState('any-session')).toBe(null);
    });

    it('retrieves correct session among multiple', () => {
      const now = Date.now();
      const sessions = {
        'session-1': { planId: 'plan-1', createdAt: now, lastSyncedAt: now },
        'session-2': { planId: 'plan-2', createdAt: now, lastSyncedAt: now },
        'session-3': { planId: 'plan-3', createdAt: now, lastSyncedAt: now },
      };

      writeState({ version: 1, sessions });

      expect(getSessionState('session-2')?.planId).toBe('plan-2');
    });

    it('includes all optional fields when present', () => {
      const sessionState: SessionState = {
        planId: 'plan-123',
        planFilePath: '/path/to/plan.md',
        createdAt: Date.now(),
        lastSyncedAt: Date.now(),
        contentHash: 'hash-abc',
        sessionToken: 'token-xyz',
        url: 'https://example.com/plan',
        approvedAt: Date.now(),
        deliverables: [
          { id: 'del-1', text: 'Screenshot' },
          { id: 'del-2', text: 'Video' },
        ],
      };

      setSessionState('session-1', sessionState);

      const retrieved = getSessionState('session-1');
      expect(retrieved).toEqual(sessionState);
      expect(retrieved?.deliverables).toHaveLength(2);
    });
  });

  describe('setSessionState', () => {
    it('creates new session', () => {
      const sessionState: SessionState = {
        planId: 'plan-new',
        createdAt: Date.now(),
        lastSyncedAt: Date.now(),
      };

      setSessionState('new-session', sessionState);

      const retrieved = getSessionState('new-session');
      expect(retrieved).toEqual(sessionState);
    });

    it('updates existing session', () => {
      const initial: SessionState = {
        planId: 'plan-1',
        createdAt: Date.now(),
        lastSyncedAt: Date.now(),
      };

      setSessionState('session-1', initial);

      const updated: SessionState = {
        ...initial,
        lastSyncedAt: Date.now() + 1000,
        sessionToken: 'new-token',
      };

      setSessionState('session-1', updated);

      const retrieved = getSessionState('session-1');
      expect(retrieved?.sessionToken).toBe('new-token');
      expect(retrieved?.lastSyncedAt).toBe(updated.lastSyncedAt);
    });

    it('preserves other sessions when updating one', () => {
      const now = Date.now();
      setSessionState('session-1', { planId: 'plan-1', createdAt: now, lastSyncedAt: now });
      setSessionState('session-2', { planId: 'plan-2', createdAt: now, lastSyncedAt: now });

      setSessionState('session-1', {
        planId: 'plan-1-updated',
        createdAt: now,
        lastSyncedAt: now,
      });

      const state = readState();
      expect(Object.keys(state.sessions)).toHaveLength(2);
      expect(state.sessions['session-1']?.planId).toBe('plan-1-updated');
      expect(state.sessions['session-2']?.planId).toBe('plan-2');
    });

    it('persists to disk', () => {
      const sessionState: SessionState = {
        planId: 'plan-persist',
        createdAt: Date.now(),
        lastSyncedAt: Date.now(),
      };

      setSessionState('session-1', sessionState);

      // Read directly from file
      const content = readFileSync(TEST_STATE_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.sessions['session-1']).toBeDefined();
      expect(parsed.sessions['session-1'].planId).toBe('plan-persist');
    });
  });

  describe('deleteSessionState', () => {
    it('removes session from state', () => {
      const now = Date.now();
      setSessionState('session-1', { planId: 'plan-1', createdAt: now, lastSyncedAt: now });

      deleteSessionState('session-1');

      expect(getSessionState('session-1')).toBe(null);
    });

    it('does nothing for non-existent session', () => {
      const now = Date.now();
      setSessionState('session-1', { planId: 'plan-1', createdAt: now, lastSyncedAt: now });

      deleteSessionState('nonexistent');

      const state = readState();
      expect(Object.keys(state.sessions)).toHaveLength(1);
      expect(state.sessions['session-1']).toBeDefined();
    });

    it('preserves other sessions when deleting one', () => {
      const now = Date.now();
      setSessionState('session-1', { planId: 'plan-1', createdAt: now, lastSyncedAt: now });
      setSessionState('session-2', { planId: 'plan-2', createdAt: now, lastSyncedAt: now });
      setSessionState('session-3', { planId: 'plan-3', createdAt: now, lastSyncedAt: now });

      deleteSessionState('session-2');

      const state = readState();
      expect(Object.keys(state.sessions)).toHaveLength(2);
      expect(state.sessions['session-1']).toBeDefined();
      expect(state.sessions['session-2']).toBeUndefined();
      expect(state.sessions['session-3']).toBeDefined();
    });

    it('persists deletion to disk', () => {
      const now = Date.now();
      setSessionState('session-1', { planId: 'plan-1', createdAt: now, lastSyncedAt: now });

      deleteSessionState('session-1');

      // Read directly from file
      const content = readFileSync(TEST_STATE_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.sessions['session-1']).toBeUndefined();
    });

    it('can delete from empty state without error', () => {
      expect(() => deleteSessionState('any-session')).not.toThrow();
    });
  });

  describe('cleanStaleSessions', () => {
    it('removes sessions older than maxAge', () => {
      const now = Date.now();
      const oldTimestamp = now - 25 * 60 * 60 * 1000; // 25 hours ago

      setSessionState('old-session', {
        planId: 'plan-old',
        createdAt: oldTimestamp,
        lastSyncedAt: oldTimestamp,
      });

      setSessionState('recent-session', {
        planId: 'plan-recent',
        createdAt: now,
        lastSyncedAt: now,
      });

      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      const cleaned = cleanStaleSessions(maxAge);

      expect(cleaned).toBe(1);
      expect(getSessionState('old-session')).toBe(null);
      expect(getSessionState('recent-session')).not.toBe(null);
    });

    it('returns count of cleaned sessions', () => {
      const now = Date.now();
      const oldTimestamp = now - 30 * 60 * 60 * 1000; // 30 hours ago

      setSessionState('old-1', {
        planId: 'plan-1',
        createdAt: oldTimestamp,
        lastSyncedAt: oldTimestamp,
      });
      setSessionState('old-2', {
        planId: 'plan-2',
        createdAt: oldTimestamp,
        lastSyncedAt: oldTimestamp,
      });
      setSessionState('recent', { planId: 'plan-3', createdAt: now, lastSyncedAt: now });

      const maxAge = 24 * 60 * 60 * 1000;
      const cleaned = cleanStaleSessions(maxAge);

      expect(cleaned).toBe(2);
    });

    it('uses lastSyncedAt for staleness check', () => {
      const now = Date.now();
      const oldCreated = now - 30 * 60 * 60 * 1000; // 30 hours ago
      const recentSynced = now - 1 * 60 * 60 * 1000; // 1 hour ago

      setSessionState('session-1', {
        planId: 'plan-1',
        createdAt: oldCreated,
        lastSyncedAt: recentSynced, // Recently synced
      });

      const maxAge = 24 * 60 * 60 * 1000;
      const cleaned = cleanStaleSessions(maxAge);

      expect(cleaned).toBe(0);
      expect(getSessionState('session-1')).not.toBe(null);
    });

    it('returns 0 when no sessions are stale', () => {
      const now = Date.now();
      setSessionState('session-1', { planId: 'plan-1', createdAt: now, lastSyncedAt: now });
      setSessionState('session-2', { planId: 'plan-2', createdAt: now, lastSyncedAt: now });

      const maxAge = 24 * 60 * 60 * 1000;
      const cleaned = cleanStaleSessions(maxAge);

      expect(cleaned).toBe(0);
      const state = readState();
      expect(Object.keys(state.sessions)).toHaveLength(2);
    });

    it('returns 0 for empty state', () => {
      const cleaned = cleanStaleSessions();
      expect(cleaned).toBe(0);
    });

    it('uses default maxAge when not provided', () => {
      const now = Date.now();
      const veryOld = now - 25 * 60 * 60 * 1000; // 25 hours ago

      setSessionState('old-session', {
        planId: 'plan-old',
        createdAt: veryOld,
        lastSyncedAt: veryOld,
      });

      // Should use STALE_SESSION_MAX_AGE_MS (24 hours)
      const cleaned = cleanStaleSessions();
      expect(cleaned).toBe(1);
    });

    it('handles edge case at exact maxAge boundary', () => {
      const maxAge = 24 * 60 * 60 * 1000;
      // Use a fixed timestamp to avoid timing issues
      const now = 1000000000000; // Fixed point in time
      const exactlyAtBoundary = now - maxAge;

      setSessionState('boundary-session', {
        planId: 'plan-boundary',
        createdAt: exactlyAtBoundary,
        lastSyncedAt: exactlyAtBoundary,
      });

      // Mock Date.now to return our fixed timestamp
      const originalDateNow = Date.now;
      Date.now = () => now;

      try {
        const cleaned = cleanStaleSessions(maxAge);

        // Should NOT be cleaned (only > maxAge, not >= maxAge)
        expect(cleaned).toBe(0);
        expect(getSessionState('boundary-session')).not.toBe(null);
      } finally {
        // Restore original Date.now
        Date.now = originalDateNow;
      }
    });

    it('persists changes to disk', () => {
      const now = Date.now();
      const old = now - 30 * 60 * 60 * 1000;

      setSessionState('old', { planId: 'plan-old', createdAt: old, lastSyncedAt: old });
      setSessionState('recent', { planId: 'plan-recent', createdAt: now, lastSyncedAt: now });

      cleanStaleSessions(24 * 60 * 60 * 1000);

      // Read directly from file
      const content = readFileSync(TEST_STATE_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.sessions.old).toBeUndefined();
      expect(parsed.sessions.recent).toBeDefined();
    });

    it('cleans multiple stale sessions', () => {
      const now = Date.now();
      const old = now - 30 * 60 * 60 * 1000;

      for (let i = 0; i < 10; i++) {
        setSessionState(`stale-${i}`, {
          planId: `plan-${i}`,
          createdAt: old,
          lastSyncedAt: old,
        });
      }

      setSessionState('recent', { planId: 'plan-recent', createdAt: now, lastSyncedAt: now });

      const cleaned = cleanStaleSessions(24 * 60 * 60 * 1000);

      expect(cleaned).toBe(10);
      const state = readState();
      expect(Object.keys(state.sessions)).toHaveLength(1);
      expect(state.sessions.recent).toBeDefined();
    });
  });

  describe('concurrent operations', () => {
    it('handles rapid successive writes', () => {
      const now = Date.now();

      for (let i = 0; i < 10; i++) {
        setSessionState(`session-${i}`, {
          planId: `plan-${i}`,
          createdAt: now,
          lastSyncedAt: now,
        });
      }

      const state = readState();
      expect(Object.keys(state.sessions)).toHaveLength(10);

      for (let i = 0; i < 10; i++) {
        expect(state.sessions[`session-${i}`]?.planId).toBe(`plan-${i}`);
      }
    });

    it('maintains consistency with interleaved read/write', () => {
      const now = Date.now();
      setSessionState('session-1', { planId: 'plan-1', createdAt: now, lastSyncedAt: now });

      const read1 = getSessionState('session-1');

      setSessionState('session-2', { planId: 'plan-2', createdAt: now, lastSyncedAt: now });

      const read2 = getSessionState('session-1');
      const read3 = getSessionState('session-2');

      expect(read1).toEqual(read2);
      expect(read3?.planId).toBe('plan-2');
    });
  });

  describe('edge cases', () => {
    it('handles empty session ID', () => {
      const now = Date.now();
      setSessionState('', { planId: 'plan-empty', createdAt: now, lastSyncedAt: now });

      const retrieved = getSessionState('');
      expect(retrieved?.planId).toBe('plan-empty');
    });

    it('handles very long session IDs', () => {
      const longId = 'x'.repeat(1000);
      const now = Date.now();
      setSessionState(longId, { planId: 'plan-long', createdAt: now, lastSyncedAt: now });

      const retrieved = getSessionState(longId);
      expect(retrieved?.planId).toBe('plan-long');
    });

    it('handles special characters in session IDs', () => {
      const specialId = 'session-@#$%^&*()_+-={}[]|:;<>?,./';
      const now = Date.now();
      setSessionState(specialId, { planId: 'plan-special', createdAt: now, lastSyncedAt: now });

      const retrieved = getSessionState(specialId);
      expect(retrieved?.planId).toBe('plan-special');
    });

    it('handles very large state files', () => {
      const now = Date.now();

      // Create 1000 sessions
      for (let i = 0; i < 1000; i++) {
        setSessionState(`session-${i}`, {
          planId: `plan-${i}`,
          planFilePath: `/very/long/path/to/plan/number/${i}/file.md`,
          createdAt: now,
          lastSyncedAt: now,
          sessionToken: `token-${'x'.repeat(100)}-${i}`,
          url: `https://example.com/plan/${i}`,
        });
      }

      const state = readState();
      expect(Object.keys(state.sessions)).toHaveLength(1000);
    });
  });
});
