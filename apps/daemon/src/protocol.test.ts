import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import type { ServerMessage } from './types.js';

/**
 * Creates a mock WebSocket with OPEN state for testing.
 */
function createMockWebSocket(): {
  ws: WebSocket;
  messages: ServerMessage[];
} {
  const messages: ServerMessage[] = [];
  const ws = {
    readyState: WebSocket.OPEN,
    OPEN: WebSocket.OPEN,
    send: vi.fn((data: string) => {
      messages.push(JSON.parse(data));
    }),
  } as unknown as WebSocket;

  return { ws, messages };
}

/**
 * Creates a mock child process with basic event emitter functionality.
 */
function createMockChildProcess(): ChildProcess {
  const mockProcess = new EventEmitter() as ChildProcess;
  mockProcess.pid = 12345;
  mockProcess.stdout = new EventEmitter() as NonNullable<ChildProcess['stdout']>;
  mockProcess.stderr = new EventEmitter() as NonNullable<ChildProcess['stderr']>;
  mockProcess.kill = vi.fn();
  return mockProcess;
}

describe('Protocol Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleClientMessage', () => {
    it('handles start-agent message', async () => {
      const mockChild = createMockChildProcess();

      vi.doMock('./agent-spawner.js', () => ({
        spawnClaudeCode: vi.fn(() => mockChild),
        stopAgent: vi.fn(),
        listAgents: vi.fn(() => []),
      }));

      const { handleClientMessage } = await import('./protocol.js');
      const { ws, messages } = createMockWebSocket();

      const message = JSON.stringify({
        type: 'start-agent',
        taskId: 'task-123',
        prompt: 'Test prompt',
        cwd: '/tmp',
      });

      handleClientMessage(ws, message);

      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        type: 'started',
        taskId: 'task-123',
        pid: 12345,
      });
    });

    it('streams stdout from spawned process', async () => {
      const mockChild = createMockChildProcess();

      vi.doMock('./agent-spawner.js', () => ({
        spawnClaudeCode: vi.fn(() => mockChild),
        stopAgent: vi.fn(),
        listAgents: vi.fn(() => []),
      }));

      const { handleClientMessage } = await import('./protocol.js');
      const { ws, messages } = createMockWebSocket();

      const message = JSON.stringify({
        type: 'start-agent',
        taskId: 'task-123',
        prompt: 'Test prompt',
      });

      handleClientMessage(ws, message);

      mockChild.stdout?.emit('data', Buffer.from('Hello stdout\n'));

      expect(messages).toContainEqual({
        type: 'output',
        taskId: 'task-123',
        data: 'Hello stdout\n',
        stream: 'stdout',
      });
    });

    it('streams stderr from spawned process', async () => {
      const mockChild = createMockChildProcess();

      vi.doMock('./agent-spawner.js', () => ({
        spawnClaudeCode: vi.fn(() => mockChild),
        stopAgent: vi.fn(),
        listAgents: vi.fn(() => []),
      }));

      const { handleClientMessage } = await import('./protocol.js');
      const { ws, messages } = createMockWebSocket();

      const message = JSON.stringify({
        type: 'start-agent',
        taskId: 'task-123',
        prompt: 'Test prompt',
      });

      handleClientMessage(ws, message);

      mockChild.stderr?.emit('data', Buffer.from('Error output\n'));

      expect(messages).toContainEqual({
        type: 'output',
        taskId: 'task-123',
        data: 'Error output\n',
        stream: 'stderr',
      });
    });

    it('sends completion event on process exit', async () => {
      const mockChild = createMockChildProcess();

      vi.doMock('./agent-spawner.js', () => ({
        spawnClaudeCode: vi.fn(() => mockChild),
        stopAgent: vi.fn(),
        listAgents: vi.fn(() => []),
      }));

      const { handleClientMessage } = await import('./protocol.js');
      const { ws, messages } = createMockWebSocket();

      const message = JSON.stringify({
        type: 'start-agent',
        taskId: 'task-123',
        prompt: 'Test prompt',
      });

      handleClientMessage(ws, message);

      mockChild.emit('exit', 0);

      expect(messages).toContainEqual({
        type: 'completed',
        taskId: 'task-123',
        exitCode: 0,
      });
    });

    it('handles stop-agent message', async () => {
      const stopAgent = vi.fn(() => true);

      vi.doMock('./agent-spawner.js', () => ({
        spawnClaudeCode: vi.fn(),
        stopAgent,
        listAgents: vi.fn(() => []),
      }));

      const { handleClientMessage } = await import('./protocol.js');
      const { ws, messages } = createMockWebSocket();

      const message = JSON.stringify({
        type: 'stop-agent',
        taskId: 'task-123',
      });

      handleClientMessage(ws, message);

      expect(stopAgent).toHaveBeenCalledWith('task-123');
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        type: 'stopped',
        taskId: 'task-123',
      });
    });

    it('sends error when stopping non-existent agent', async () => {
      const stopAgent = vi.fn(() => false);

      vi.doMock('./agent-spawner.js', () => ({
        spawnClaudeCode: vi.fn(),
        stopAgent,
        listAgents: vi.fn(() => []),
      }));

      const { handleClientMessage } = await import('./protocol.js');
      const { ws, messages } = createMockWebSocket();

      const message = JSON.stringify({
        type: 'stop-agent',
        taskId: 'task-999',
      });

      handleClientMessage(ws, message);

      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        type: 'error',
        taskId: 'task-999',
        message: 'No agent found for task',
      });
    });

    it('handles list-agents message', async () => {
      const activeAgents = [
        { taskId: 'task-1', pid: 100 },
        { taskId: 'task-2', pid: 200 },
      ];

      vi.doMock('./agent-spawner.js', () => ({
        spawnClaudeCode: vi.fn(),
        stopAgent: vi.fn(),
        listAgents: vi.fn(() => activeAgents),
      }));

      const { handleClientMessage } = await import('./protocol.js');
      const { ws, messages } = createMockWebSocket();

      const message = JSON.stringify({
        type: 'list-agents',
      });

      handleClientMessage(ws, message);

      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        type: 'agents',
        list: activeAgents,
      });
    });

    it('sends error for invalid JSON', async () => {
      vi.doMock('./agent-spawner.js', () => ({
        spawnClaudeCode: vi.fn(),
        stopAgent: vi.fn(),
        listAgents: vi.fn(() => []),
      }));

      const { handleClientMessage } = await import('./protocol.js');
      const { ws, messages } = createMockWebSocket();

      handleClientMessage(ws, '{invalid json');

      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        type: 'error',
        message: expect.stringContaining('Failed to parse message'),
      });
    });

    it('sends error for unknown message type', async () => {
      vi.doMock('./agent-spawner.js', () => ({
        spawnClaudeCode: vi.fn(),
        stopAgent: vi.fn(),
        listAgents: vi.fn(() => []),
      }));

      const { handleClientMessage } = await import('./protocol.js');
      const { ws, messages } = createMockWebSocket();

      const message = JSON.stringify({
        type: 'unknown-type',
      });

      handleClientMessage(ws, message);

      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        type: 'error',
        message: expect.stringContaining('Unknown message type'),
      });
    });

    it('handles spawn failure gracefully', async () => {
      const mockChild = createMockChildProcess();
      mockChild.pid = undefined;

      vi.doMock('./agent-spawner.js', () => ({
        spawnClaudeCode: vi.fn(() => mockChild),
        stopAgent: vi.fn(),
        listAgents: vi.fn(() => []),
      }));

      const { handleClientMessage } = await import('./protocol.js');
      const { ws, messages } = createMockWebSocket();

      const message = JSON.stringify({
        type: 'start-agent',
        taskId: 'task-123',
        prompt: 'Test prompt',
      });

      handleClientMessage(ws, message);

      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        type: 'error',
        taskId: 'task-123',
        message: 'Failed to spawn Claude Code process',
      });
    });
  });
});
