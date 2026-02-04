/**
 * Integration tests for active agent registry.
 *
 * In-memory tracking of running Claude Code processes.
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agentCount, getAgent, hasAgent, listAgents, trackAgent, untrackAgent } from './tracker.js';

/**
 * Create a mock ChildProcess for testing.
 */
function createMockProcess(pid = 12345): ChildProcess {
  const emitter = new EventEmitter();
  const mockProcess = Object.assign(emitter, {
    pid,
    stdin: null,
    stdout: null,
    stderr: null,
    stdio: [null, null, null, null, null] as [null, null, null, null, null],
    killed: false,
    exitCode: null,
    signalCode: null,
    spawnargs: [],
    spawnfile: '',
    connected: false,
    kill: vi.fn(() => true),
    send: vi.fn(() => true),
    disconnect: vi.fn(),
    unref: vi.fn(),
    ref: vi.fn(),
    [Symbol.dispose]: vi.fn(),
  }) as unknown as ChildProcess;
  return mockProcess;
}

describe('Agent Tracker', () => {
  beforeEach(() => {
    // Clear all tracked agents before each test
    vi.useFakeTimers();
    // Untrack any lingering agents
    for (const agent of listAgents()) {
      untrackAgent(agent.taskId);
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    // Clean up any agents
    for (const agent of listAgents()) {
      untrackAgent(agent.taskId);
    }
  });

  describe('trackAgent', () => {
    it('adds agent to registry', () => {
      const mockProcess = createMockProcess();
      trackAgent('task-123', mockProcess);

      expect(hasAgent('task-123')).toBe(true);
    });

    it('stores process, pid, and startedAt', () => {
      const mockProcess = createMockProcess(54321);
      const now = Date.now();
      vi.setSystemTime(now);

      trackAgent('task-456', mockProcess);

      const agent = getAgent('task-456');
      expect(agent).toBeDefined();
      expect(agent?.process).toBe(mockProcess);
      expect(agent?.pid).toBe(54321);
      expect(agent?.startedAt).toBe(now);
    });

    it('removes agent on process exit', () => {
      const mockProcess = createMockProcess();
      trackAgent('task-789', mockProcess);

      expect(hasAgent('task-789')).toBe(true);

      // Simulate process exit
      (mockProcess as unknown as EventEmitter).emit('exit', 0);

      expect(hasAgent('task-789')).toBe(false);
    });
  });

  describe('getAgent', () => {
    it('returns agent by taskId', () => {
      const mockProcess = createMockProcess();
      trackAgent('task-get-1', mockProcess);

      const agent = getAgent('task-get-1');
      expect(agent).toBeDefined();
      expect(agent?.taskId).toBe('task-get-1');
    });

    it('returns undefined for unknown taskId', () => {
      const agent = getAgent('non-existent-task');
      expect(agent).toBeUndefined();
    });
  });

  describe('hasAgent', () => {
    it('returns true for tracked agent', () => {
      const mockProcess = createMockProcess();
      trackAgent('task-has-1', mockProcess);

      expect(hasAgent('task-has-1')).toBe(true);
    });

    it('returns false for untracked agent', () => {
      expect(hasAgent('untracked-task')).toBe(false);
    });
  });

  describe('untrackAgent', () => {
    it('removes agent from registry', () => {
      const mockProcess = createMockProcess();
      trackAgent('task-untrack-1', mockProcess);

      expect(hasAgent('task-untrack-1')).toBe(true);

      untrackAgent('task-untrack-1');

      expect(hasAgent('task-untrack-1')).toBe(false);
    });

    it('handles non-existent agent gracefully', () => {
      // Should not throw
      expect(() => untrackAgent('non-existent')).not.toThrow();
    });
  });

  describe('listAgents', () => {
    it('returns all active agents', () => {
      const mockProcess1 = createMockProcess(111);
      const mockProcess2 = createMockProcess(222);

      trackAgent('task-list-1', mockProcess1);
      trackAgent('task-list-2', mockProcess2);

      const agents = listAgents();
      expect(agents).toHaveLength(2);

      const taskIds = agents.map((a) => a.taskId);
      expect(taskIds).toContain('task-list-1');
      expect(taskIds).toContain('task-list-2');
    });

    it('includes calculated uptime', () => {
      const mockProcess = createMockProcess();
      const startTime = Date.now();
      vi.setSystemTime(startTime);

      trackAgent('task-uptime-1', mockProcess);

      // Advance time by 5 seconds
      vi.setSystemTime(startTime + 5000);

      const agents = listAgents();
      const agent = agents.find((a) => a.taskId === 'task-uptime-1');
      expect(agent?.uptime).toBe(5000);
    });

    it('returns empty array when no agents', () => {
      const agents = listAgents();
      expect(agents).toEqual([]);
    });
  });

  describe('agentCount', () => {
    it('returns count of active agents', () => {
      const mockProcess1 = createMockProcess(333);
      const mockProcess2 = createMockProcess(444);
      const mockProcess3 = createMockProcess(555);

      trackAgent('task-count-1', mockProcess1);
      trackAgent('task-count-2', mockProcess2);
      trackAgent('task-count-3', mockProcess3);

      expect(agentCount()).toBe(3);
    });

    it('returns 0 when no agents', () => {
      expect(agentCount()).toBe(0);
    });
  });
});
