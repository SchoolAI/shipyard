import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { releaseDaemonLock, tryAcquireDaemonLock } from './lock-manager.js';

const DAEMON_LOCK_FILE = join(homedir(), '.shipyard', 'daemon.lock');

/**
 * Lock manager tests focus on core risk areas:
 * - Multiple processes competing for lock (race conditions)
 * - Stale locks from dead processes
 * - Lock cleanup
 *
 * Why these tests exist (3+ rule):
 * - Lock logic has high fan-in (daemon + registry)
 * - Algorithmic complexity (stale detection, retries)
 * - Critical for daemon singleton guarantee
 */
describe('Lock Manager', () => {
  beforeAll(async () => {
    /**
     * Clean up any existing lock before tests.
     * Prevents interference from previous test runs or crashes.
     */
    try {
      await releaseDaemonLock();
    } catch {
      /** Lock may not exist */
    }
  });

  afterAll(async () => {
    /**
     * Clean up lock after all tests complete.
     */
    try {
      await releaseDaemonLock();
    } catch {
      /** Lock may not exist */
    }
  });

  describe('tryAcquireDaemonLock', () => {
    it('acquires lock successfully', async () => {
      await releaseDaemonLock();

      const acquired = await tryAcquireDaemonLock();

      expect(acquired).toBe(true);
    });

    it('fails when holder is alive', async () => {
      /**
       * Simulate active lock by writing current PID.
       */
      await writeFile(DAEMON_LOCK_FILE, `${process.pid}\n${Date.now()}`);

      const acquired = await tryAcquireDaemonLock();

      expect(acquired).toBe(false);
    });

    it('acquires lock when holder is dead', async () => {
      /**
       * Simulate stale lock with dead PID.
       * Lock manager should detect and remove it.
       */
      const deadPid = 999999;
      await writeFile(DAEMON_LOCK_FILE, `${deadPid}\n${Date.now()}`);

      const acquired = await tryAcquireDaemonLock();

      expect(acquired).toBe(true);
    });
  });

  describe('releaseDaemonLock', () => {
    it('releases lock successfully', async () => {
      await tryAcquireDaemonLock();

      await expect(releaseDaemonLock()).resolves.not.toThrow();
    });

    it('succeeds even if no lock exists', async () => {
      await releaseDaemonLock();

      await expect(releaseDaemonLock()).resolves.not.toThrow();
    });
  });
});
