import type { Query } from '@anthropic-ai/claude-agent-sdk';
import type { TypedDoc } from '@loro-extended/change';
import { createTypedDoc } from '@loro-extended/change';
import type { TaskDocumentShape } from '@shipyard/loro-schema';
import { generateTaskId, TaskDocumentSchema } from '@shipyard/loro-schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionManager } from './session-manager.js';

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

vi.mock('./logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

/**
 * Helper: create an async generator from an array of message objects
 * and return it typed as a Query (which extends AsyncGenerator<SDKMessage>).
 *
 * We add stub methods (interrupt, close, etc.) so the object satisfies
 * the Query interface shape at runtime.
 */
function mockQueryResponse(messages: Array<Record<string, unknown>>): Query {
  async function* gen() {
    for (const msg of messages) {
      yield msg;
    }
  }
  const generator = gen();
  // eslint-disable-next-line no-restricted-syntax -- Satisfying Query interface for mock
  return Object.assign(generator, {
    interrupt: vi.fn(),
    close: vi.fn(),
    setPermissionMode: vi.fn(),
    setModel: vi.fn(),
    setMaxThinkingTokens: vi.fn(),
    initializationResult: vi.fn(),
    supportedCommands: vi.fn(),
    supportedModels: vi.fn(),
    mcpServerStatus: vi.fn(),
    accountInfo: vi.fn(),
    rewindFiles: vi.fn(),
    reconnectMcpServer: vi.fn(),
    toggleMcpServer: vi.fn(),
    setMcpServers: vi.fn(),
    streamInput: vi.fn(),
  }) as unknown as Query;
}

/**
 * Helper: create a throwing async generator that yields some messages
 * then throws an error.
 */
function mockQueryThrows(messagesBeforeError: Array<Record<string, unknown>>, error: Error): Query {
  async function* gen() {
    for (const msg of messagesBeforeError) {
      yield msg;
    }
    throw error;
  }
  const generator = gen();
  // eslint-disable-next-line no-restricted-syntax -- Satisfying Query interface for mock
  return Object.assign(generator, {
    interrupt: vi.fn(),
    close: vi.fn(),
    setPermissionMode: vi.fn(),
    setModel: vi.fn(),
    setMaxThinkingTokens: vi.fn(),
    initializationResult: vi.fn(),
    supportedCommands: vi.fn(),
    supportedModels: vi.fn(),
    mcpServerStatus: vi.fn(),
    accountInfo: vi.fn(),
    rewindFiles: vi.fn(),
    reconnectMcpServer: vi.fn(),
    toggleMcpServer: vi.fn(),
    setMcpServers: vi.fn(),
    streamInput: vi.fn(),
  }) as unknown as Query;
}

function initMsg(sessionId: string) {
  return {
    type: 'system',
    subtype: 'init',
    session_id: sessionId,
    tools: [],
    model: 'claude-opus-4-6',
    mcp_servers: [],
    permissionMode: 'default',
    slash_commands: [],
    output_style: 'text',
    skills: [],
    plugins: [],
    apiKeySource: 'user',
    cwd: '/tmp',
    uuid: '00000000-0000-0000-0000-000000000000',
  };
}

function assistantMsg(text: string) {
  return {
    type: 'assistant',
    message: {
      content: [{ type: 'text', text }],
    },
    parent_tool_use_id: null,
    uuid: '00000000-0000-0000-0000-000000000001',
    session_id: 'sess-1',
  };
}

function assistantMsgWithError(text: string, error: string) {
  return {
    type: 'assistant',
    message: {
      content: [{ type: 'text', text }],
    },
    error,
    parent_tool_use_id: null,
    uuid: '00000000-0000-0000-0000-000000000004',
    session_id: 'sess-1',
  };
}

function assistantMsgWithToolUse(text: string) {
  return {
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text },
        { type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: '/tmp/test.ts' } },
      ],
    },
    parent_tool_use_id: null,
    uuid: '00000000-0000-0000-0000-000000000002',
    session_id: 'sess-1',
  };
}

function assistantMsgToolUseOnly() {
  return {
    type: 'assistant',
    message: {
      content: [{ type: 'tool_use', id: 'tool-2', name: 'Bash', input: { command: 'ls' } }],
    },
    parent_tool_use_id: null,
    uuid: '00000000-0000-0000-0000-000000000003',
    session_id: 'sess-1',
  };
}

function successResult(opts: { result?: string; costUsd?: number; durationMs?: number } = {}) {
  return {
    type: 'result',
    subtype: 'success',
    result: opts.result ?? 'Done',
    total_cost_usd: opts.costUsd ?? 0.01,
    duration_ms: opts.durationMs ?? 5000,
    duration_api_ms: 3000,
    is_error: false,
    num_turns: 1,
    stop_reason: 'end_turn',
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      webSearchRequests: 0,
    },
    modelUsage: {},
    permission_denials: [],
    uuid: '00000000-0000-0000-0000-000000000010',
    session_id: 'sess-1',
  };
}

function errorResult(subtype: string, errors: string[] = []) {
  return {
    type: 'result',
    subtype,
    total_cost_usd: 0.005,
    duration_ms: 2000,
    duration_api_ms: 1500,
    is_error: true,
    num_turns: 1,
    stop_reason: null,
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      webSearchRequests: 0,
    },
    modelUsage: {},
    permission_denials: [],
    errors,
    uuid: '00000000-0000-0000-0000-000000000011',
    session_id: 'sess-1',
  };
}

describe('SessionManager', () => {
  let taskDoc: TypedDoc<TaskDocumentShape>;
  let manager: SessionManager;
  let mockQuery: ReturnType<typeof vi.fn>;
  const taskId = generateTaskId();
  const now = Date.now();

  beforeEach(async () => {
    vi.clearAllMocks();

    taskDoc = createTypedDoc(TaskDocumentSchema);
    taskDoc.meta.id = taskId;
    taskDoc.meta.title = 'Test task';
    taskDoc.meta.status = 'submitted';
    taskDoc.meta.createdAt = now;
    taskDoc.meta.updatedAt = now;

    manager = new SessionManager(taskDoc);

    const mod = await import('@anthropic-ai/claude-agent-sdk');
    mockQuery = vi.mocked(mod.query);
  });

  describe('createSession', () => {
    describe('happy path', () => {
      it('captures agentSessionId from init message and returns completed status', async () => {
        mockQuery.mockReturnValue(
          mockQueryResponse([
            initMsg('agent-sess-123'),
            successResult({ costUsd: 0.02, durationMs: 8000 }),
          ])
        );

        const result = await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

        expect(result.agentSessionId).toBe('agent-sess-123');
        expect(result.status).toBe('completed');
        expect(result.totalCostUsd).toBe(0.02);
        expect(result.durationMs).toBe(8000);
        expect(result.resultText).toBe('Done');
        expect(result.error).toBeUndefined();
      });

      it('writes assistant text to conversation as A2A messages', async () => {
        mockQuery.mockReturnValue(
          mockQueryResponse([
            initMsg('sess-1'),
            assistantMsg('First response'),
            assistantMsg('Second response'),
            successResult(),
          ])
        );

        await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

        const json = taskDoc.toJSON();
        expect(json.conversation).toHaveLength(2);
        expect(json.conversation[0]?.role).toBe('agent');
        expect(json.conversation[0]?.taskId).toBe(taskId);
        if (json.conversation[0]?.parts[0]?.kind === 'text') {
          expect(json.conversation[0].parts[0].text).toBe('First response');
        }
        if (json.conversation[1]?.parts[0]?.kind === 'text') {
          expect(json.conversation[1].parts[0].text).toBe('Second response');
        }
      });

      it('extracts only text blocks from assistant messages (ignores tool_use)', async () => {
        mockQuery.mockReturnValue(
          mockQueryResponse([
            initMsg('sess-1'),
            assistantMsgWithToolUse('Analyzing the file...'),
            successResult(),
          ])
        );

        await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

        const json = taskDoc.toJSON();
        expect(json.conversation).toHaveLength(1);
        expect(json.conversation[0]?.parts).toHaveLength(1);
        if (json.conversation[0]?.parts[0]?.kind === 'text') {
          expect(json.conversation[0].parts[0].text).toBe('Analyzing the file...');
        }
      });

      it('logs warning when assistant message carries an error but still processes text', async () => {
        const { logger: mockLogger } = await import('./logger.js');

        mockQuery.mockReturnValue(
          mockQueryResponse([
            initMsg('sess-1'),
            assistantMsgWithError('Partial response', 'rate_limit'),
            successResult(),
          ])
        );

        await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({ error: 'rate_limit' }),
          'Assistant message carried an error'
        );

        const json = taskDoc.toJSON();
        expect(json.conversation).toHaveLength(1);
        if (json.conversation[0]?.parts[0]?.kind === 'text') {
          expect(json.conversation[0].parts[0].text).toBe('Partial response');
        }
      });

      it('skips assistant messages with only tool_use blocks (no text)', async () => {
        mockQuery.mockReturnValue(
          mockQueryResponse([initMsg('sess-1'), assistantMsgToolUseOnly(), successResult()])
        );

        await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

        const json = taskDoc.toJSON();
        expect(json.conversation).toHaveLength(0);
      });
    });

    describe('session status transitions', () => {
      it('transitions session: pending -> active -> completed', async () => {
        const statusSnapshots: string[] = [];

        mockQuery.mockImplementation(() => {
          // Capture status after the push (pending was set by createSession before query() is called)
          const json = taskDoc.toJSON();
          const lastSession = json.sessions[json.sessions.length - 1];
          if (lastSession) {
            statusSnapshots.push(lastSession.status);
          }

          return mockQueryResponse([initMsg('sess-status'), successResult()]);
        });

        await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

        // After query() was called, the session was in 'pending' state
        expect(statusSnapshots[0]).toBe('pending');

        // After everything completes, the session should be 'completed'
        const json = taskDoc.toJSON();
        const session = json.sessions[0];
        expect(session?.status).toBe('completed');
      });

      it('sets task meta status to working then completed', async () => {
        mockQuery.mockReturnValue(mockQueryResponse([initMsg('sess-1'), successResult()]));

        await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

        const json = taskDoc.toJSON();
        expect(json.meta.status).toBe('completed');
      });
    });

    describe('session entry metadata', () => {
      it('records cwd, model, and timestamps in the session entry', async () => {
        mockQuery.mockReturnValue(
          mockQueryResponse([
            initMsg('sess-meta'),
            successResult({ costUsd: 0.05, durationMs: 30000 }),
          ])
        );

        const result = await manager.createSession({
          prompt: 'Build feature X',
          cwd: '/home/user/project',
          model: 'claude-opus-4-6',
        });

        const json = taskDoc.toJSON();
        const session = json.sessions[0];
        expect(session).toBeDefined();
        expect(session?.sessionId).toBe(result.sessionId);
        expect(session?.agentSessionId).toBe('sess-meta');
        expect(session?.cwd).toBe('/home/user/project');
        expect(session?.model).toBe('claude-opus-4-6');
        expect(session?.status).toBe('completed');
        expect(session?.totalCostUsd).toBe(0.05);
        expect(session?.durationMs).toBe(30000);
        expect(session?.completedAt).toBeGreaterThan(0);
        expect(session?.error).toBeNull();
      });

      it('sets model to null when not provided', async () => {
        mockQuery.mockReturnValue(mockQueryResponse([initMsg('sess-no-model'), successResult()]));

        await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

        const json = taskDoc.toJSON();
        expect(json.sessions[0]?.model).toBeNull();
      });
    });

    describe('query() options forwarding', () => {
      it('passes all options to query()', async () => {
        mockQuery.mockReturnValue(mockQueryResponse([initMsg('sess-opts'), successResult()]));

        await manager.createSession({
          prompt: 'Do the work',
          cwd: '/workspace',
          model: 'claude-opus-4-6',
          allowedTools: ['Read', 'Glob', 'Bash'],
          permissionMode: 'bypassPermissions',
          maxTurns: 10,
          allowDangerouslySkipPermissions: true,
        });

        expect(mockQuery).toHaveBeenCalledWith({
          prompt: 'Do the work',
          options: expect.objectContaining({
            cwd: '/workspace',
            model: 'claude-opus-4-6',
            allowedTools: ['Read', 'Glob', 'Bash'],
            permissionMode: 'bypassPermissions',
            maxTurns: 10,
            allowDangerouslySkipPermissions: true,
          }),
        });
      });

      it('passes abortController to query()', async () => {
        const controller = new AbortController();
        mockQuery.mockReturnValue(mockQueryResponse([initMsg('sess-abort'), successResult()]));

        await manager.createSession({
          prompt: 'Hello',
          cwd: '/tmp',
          abortController: controller,
        });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.objectContaining({
            options: expect.objectContaining({
              abortController: controller,
            }),
          })
        );
      });
    });

    describe('error handling', () => {
      it('marks session failed on error_max_turns', async () => {
        mockQuery.mockReturnValue(
          mockQueryResponse([
            initMsg('sess-err'),
            errorResult('error_max_turns', ['exceeded maximum turns']),
          ])
        );

        const result = await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

        expect(result.status).toBe('failed');
        expect(result.error).toBe('exceeded maximum turns');

        const json = taskDoc.toJSON();
        expect(json.meta.status).toBe('failed');
        expect(json.sessions[0]?.status).toBe('failed');
        expect(json.sessions[0]?.error).toBe('exceeded maximum turns');
      });

      it('marks session failed on error_during_execution', async () => {
        mockQuery.mockReturnValue(
          mockQueryResponse([
            initMsg('sess-exec-err'),
            errorResult('error_during_execution', ['Permission denied for Bash']),
          ])
        );

        const result = await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

        expect(result.status).toBe('failed');
        expect(result.error).toBe('Permission denied for Bash');
        expect(result.totalCostUsd).toBe(0.005);
        expect(result.durationMs).toBe(2000);
      });

      it('uses subtype as fallback error when errors array is empty', async () => {
        mockQuery.mockReturnValue(
          mockQueryResponse([initMsg('sess-no-errors'), errorResult('error_max_budget_usd')])
        );

        const result = await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

        expect(result.error).toBe('error_max_budget_usd');
        expect(taskDoc.toJSON().sessions[0]?.error).toBe('Agent SDK error: error_max_budget_usd');
      });

      it('handles thrown errors from the generator', async () => {
        mockQuery.mockReturnValue(
          mockQueryThrows([initMsg('sess-throw')], new Error('Process exited unexpectedly'))
        );

        const result = await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

        expect(result.status).toBe('failed');
        expect(result.error).toBe('Process exited unexpectedly');
        expect(result.agentSessionId).toBe('sess-throw');

        const json = taskDoc.toJSON();
        expect(json.meta.status).toBe('failed');
        expect(json.sessions[0]?.status).toBe('failed');
        expect(json.sessions[0]?.error).toBe('Process exited unexpectedly');
      });

      it('handles thrown errors before init message', async () => {
        mockQuery.mockReturnValue(mockQueryThrows([], new Error('Failed to spawn')));

        const result = await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

        expect(result.status).toBe('failed');
        expect(result.agentSessionId).toBe('');
        expect(result.error).toBe('Failed to spawn');
      });

      it('handles generator ending without result message', async () => {
        mockQuery.mockReturnValue(
          mockQueryResponse([initMsg('sess-no-result'), assistantMsg('Started working...')])
        );

        const result = await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

        expect(result.status).toBe('failed');
        expect(result.error).toBe('Session ended without result message');
      });
    });
  });

  describe('resumeSession', () => {
    beforeEach(() => {
      taskDoc.sessions.push({
        sessionId: 'orig-session',
        agentSessionId: 'agent-sess-orig',
        status: 'completed',
        cwd: '/workspace',
        model: 'claude-opus-4-6',
        machineId: null,
        createdAt: now,
        completedAt: now + 10000,
        totalCostUsd: 0.03,
        durationMs: 10000,
        error: null,
      });
    });

    it('passes resume option with agentSessionId to query()', async () => {
      mockQuery.mockReturnValue(mockQueryResponse([initMsg('agent-sess-orig'), successResult()]));

      await manager.resumeSession('orig-session', 'Continue the work');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Continue the work',
          options: expect.objectContaining({
            resume: 'agent-sess-orig',
            cwd: '/workspace',
          }),
        })
      );
    });

    it('creates a new session entry for the resumed session', async () => {
      mockQuery.mockReturnValue(
        mockQueryResponse([
          initMsg('agent-sess-orig'),
          assistantMsg('Resumed and continuing'),
          successResult({ costUsd: 0.005, durationMs: 500 }),
        ])
      );

      const result = await manager.resumeSession('orig-session', 'Continue');

      expect(result.status).toBe('completed');

      const json = taskDoc.toJSON();
      // Original session + new resumed session
      expect(json.sessions).toHaveLength(2);
      expect(json.sessions[1]?.sessionId).toBe(result.sessionId);
      expect(json.sessions[1]?.agentSessionId).toBe('agent-sess-orig');
      expect(json.sessions[1]?.status).toBe('completed');
    });

    it('appends conversation messages during resume', async () => {
      mockQuery.mockReturnValue(
        mockQueryResponse([
          initMsg('agent-sess-orig'),
          assistantMsg('Resumed work output'),
          successResult(),
        ])
      );

      await manager.resumeSession('orig-session', 'Continue');

      const json = taskDoc.toJSON();
      expect(json.conversation).toHaveLength(1);
      if (json.conversation[0]?.parts[0]?.kind === 'text') {
        expect(json.conversation[0].parts[0].text).toBe('Resumed work output');
      }
    });

    it('throws for unknown sessionId', async () => {
      await expect(manager.resumeSession('nonexistent', 'Hello')).rejects.toThrow(
        'Session nonexistent not found in task doc'
      );
    });

    it('throws for session without agentSessionId', async () => {
      taskDoc.sessions.push({
        sessionId: 'no-agent-id',
        agentSessionId: '',
        status: 'pending',
        cwd: '/tmp',
        model: null,
        machineId: null,
        createdAt: now,
        completedAt: null,
        totalCostUsd: null,
        durationMs: null,
        error: null,
      });

      await expect(manager.resumeSession('no-agent-id', 'Hello')).rejects.toThrow(
        'Session no-agent-id has no agentSessionId'
      );
    });

    it('passes abortController to resumed query()', async () => {
      const controller = new AbortController();
      mockQuery.mockReturnValue(mockQueryResponse([initMsg('agent-sess-orig'), successResult()]));

      await manager.resumeSession('orig-session', 'Continue', {
        abortController: controller,
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            abortController: controller,
          }),
        })
      );
    });

    it('forwards model, allowedTools, permissionMode, and maxTurns to query()', async () => {
      mockQuery.mockReturnValue(mockQueryResponse([initMsg('agent-sess-orig'), successResult()]));

      await manager.resumeSession('orig-session', 'Continue with overrides', {
        model: 'claude-sonnet-4-20250514',
        allowedTools: ['Read', 'Grep'],
        permissionMode: 'acceptEdits',
        maxTurns: 5,
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Continue with overrides',
          options: expect.objectContaining({
            resume: 'agent-sess-orig',
            cwd: '/workspace',
            model: 'claude-sonnet-4-20250514',
            allowedTools: ['Read', 'Grep'],
            permissionMode: 'acceptEdits',
            maxTurns: 5,
          }),
        })
      );
    });

    it('records overridden model in the new session entry', async () => {
      mockQuery.mockReturnValue(mockQueryResponse([initMsg('agent-sess-orig'), successResult()]));

      const result = await manager.resumeSession('orig-session', 'Continue', {
        model: 'claude-sonnet-4-20250514',
      });

      const json = taskDoc.toJSON();
      const newSession = json.sessions.find((s) => s.sessionId === result.sessionId);
      expect(newSession?.model).toBe('claude-sonnet-4-20250514');
    });

    it('falls back to original session model when no model override provided', async () => {
      mockQuery.mockReturnValue(mockQueryResponse([initMsg('agent-sess-orig'), successResult()]));

      const result = await manager.resumeSession('orig-session', 'Continue');

      const json = taskDoc.toJSON();
      const newSession = json.sessions.find((s) => s.sessionId === result.sessionId);
      expect(newSession?.model).toBe('claude-opus-4-6');
    });
  });

  describe('edge cases', () => {
    it('handles multiple sessions on the same task doc', async () => {
      mockQuery.mockReturnValueOnce(
        mockQueryResponse([
          initMsg('sess-first'),
          assistantMsg('First session output'),
          successResult({ costUsd: 0.01 }),
        ])
      );

      await manager.createSession({ prompt: 'First', cwd: '/tmp' });

      // Reset task status for second session
      taskDoc.meta.status = 'submitted';

      mockQuery.mockReturnValueOnce(
        mockQueryResponse([
          initMsg('sess-second'),
          assistantMsg('Second session output'),
          successResult({ costUsd: 0.02 }),
        ])
      );

      await manager.createSession({ prompt: 'Second', cwd: '/tmp' });

      const json = taskDoc.toJSON();
      expect(json.sessions).toHaveLength(2);
      expect(json.sessions[0]?.agentSessionId).toBe('sess-first');
      expect(json.sessions[1]?.agentSessionId).toBe('sess-second');
      expect(json.conversation).toHaveLength(2);
    });

    it('ignores non-text, non-assistant, non-result messages', async () => {
      mockQuery.mockReturnValue(
        mockQueryResponse([
          initMsg('sess-ignore'),
          { type: 'tool_progress', tool_use_id: 'x', tool_name: 'Read', elapsed_time_seconds: 1 },
          { type: 'system', subtype: 'status', status: null },
          assistantMsg('Real output'),
          successResult(),
        ])
      );

      await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

      const json = taskDoc.toJSON();
      expect(json.conversation).toHaveLength(1);
    });
  });

  describe('session index race condition (Issue 2)', () => {
    it('updates the correct session even when a concurrent write inserts before it', async () => {
      /**
       * Simulates a race condition:
       * 1. createSession pushes session A at index 0
       * 2. A concurrent CRDT sync inserts session B at index 0, pushing A to index 1
       * 3. The init message for session A should still update session A (now at index 1)
       *
       * With the old index-based approach, the init message would incorrectly
       * update session B (still at index 0 from the captured index).
       * With sessionId-based lookup, it correctly finds and updates session A.
       */
      const { change: changeDoc } = await import('@loro-extended/change');

      mockQuery.mockImplementation(() => {
        // Before the first message is processed, simulate a concurrent CRDT sync
        // inserting another session entry at the beginning of the list
        changeDoc(taskDoc, (draft) => {
          draft.sessions.insert(0, {
            sessionId: 'concurrent-session',
            agentSessionId: 'concurrent-agent-sess',
            status: 'active',
            cwd: '/other',
            model: null,
            machineId: null,
            createdAt: Date.now(),
            completedAt: null,
            totalCostUsd: null,
            durationMs: null,
            error: null,
          });
        });

        return mockQueryResponse([
          initMsg('agent-sess-race'),
          successResult({ costUsd: 0.01, durationMs: 1000 }),
        ]);
      });

      const result = await manager.createSession({ prompt: 'Race test', cwd: '/tmp' });

      expect(result.status).toBe('completed');
      expect(result.agentSessionId).toBe('agent-sess-race');

      const json = taskDoc.toJSON();
      // There should be 2 sessions: the concurrent one and the one we created
      expect(json.sessions).toHaveLength(2);

      // The concurrent session (inserted at index 0) should be untouched
      const concurrentSession = json.sessions.find((s) => s.sessionId === 'concurrent-session');
      expect(concurrentSession).toBeDefined();
      expect(concurrentSession?.agentSessionId).toBe('concurrent-agent-sess');

      // Our session should have been updated correctly despite the index shift
      const ourSession = json.sessions.find((s) => s.sessionId === result.sessionId);
      expect(ourSession).toBeDefined();
      expect(ourSession?.agentSessionId).toBe('agent-sess-race');
      expect(ourSession?.status).toBe('completed');
    });

    it('marks the correct session as failed even after concurrent inserts', async () => {
      const { change: changeDoc } = await import('@loro-extended/change');

      mockQuery.mockImplementation(() => {
        // Insert a concurrent session before ours
        changeDoc(taskDoc, (draft) => {
          draft.sessions.insert(0, {
            sessionId: 'concurrent-session-2',
            agentSessionId: 'concurrent-agent-2',
            status: 'active',
            cwd: '/other',
            model: null,
            machineId: null,
            createdAt: Date.now(),
            completedAt: null,
            totalCostUsd: null,
            durationMs: null,
            error: null,
          });
        });

        return mockQueryThrows([initMsg('agent-sess-fail')], new Error('Unexpected crash'));
      });

      const result = await manager.createSession({ prompt: 'Fail test', cwd: '/tmp' });

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Unexpected crash');

      const json = taskDoc.toJSON();
      // Concurrent session should be untouched
      const concurrentSession = json.sessions.find((s) => s.sessionId === 'concurrent-session-2');
      expect(concurrentSession?.status).toBe('active');
      expect(concurrentSession?.error).toBeNull();

      // Our session should be the one marked as failed
      const ourSession = json.sessions.find((s) => s.sessionId === result.sessionId);
      expect(ourSession?.status).toBe('failed');
      expect(ourSession?.error).toBe('Unexpected crash');
    });
  });

  describe('settingSources and systemPrompt defaults (Issue 3)', () => {
    it('passes default settingSources and systemPrompt to query()', async () => {
      mockQuery.mockReturnValue(mockQueryResponse([initMsg('sess-defaults'), successResult()]));

      await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            settingSources: ['project'],
            systemPrompt: expect.objectContaining({ type: 'preset', preset: 'claude_code' }),
          }),
        })
      );
    });

    it('allows overriding settingSources', async () => {
      mockQuery.mockReturnValue(mockQueryResponse([initMsg('sess-custom-ss'), successResult()]));

      await manager.createSession({
        prompt: 'Hello',
        cwd: '/tmp',
        settingSources: ['user', 'project'],
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            settingSources: ['user', 'project'],
          }),
        })
      );
    });

    it('allows overriding systemPrompt with a string', async () => {
      mockQuery.mockReturnValue(mockQueryResponse([initMsg('sess-custom-sp'), successResult()]));

      await manager.createSession({
        prompt: 'Hello',
        cwd: '/tmp',
        systemPrompt: 'You are a code reviewer.',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            systemPrompt: 'You are a code reviewer.',
          }),
        })
      );
    });

    it('allows overriding systemPrompt with preset + append', async () => {
      mockQuery.mockReturnValue(mockQueryResponse([initMsg('sess-preset-sp'), successResult()]));

      await manager.createSession({
        prompt: 'Hello',
        cwd: '/tmp',
        systemPrompt: { type: 'preset', preset: 'claude_code', append: 'Always explain.' },
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            systemPrompt: { type: 'preset', preset: 'claude_code', append: 'Always explain.' },
          }),
        })
      );
    });

    it('passes default settingSources and systemPrompt for resumeSession', async () => {
      const { change: changeDoc } = await import('@loro-extended/change');
      // Set up a completed session to resume from (mirrors resumeSession describe's beforeEach)
      changeDoc(taskDoc, (draft) => {
        draft.sessions.push({
          sessionId: 'orig-session-for-defaults',
          agentSessionId: 'agent-sess-orig-defaults',
          status: 'completed',
          cwd: '/workspace',
          model: 'claude-opus-4-6',
          machineId: null,
          createdAt: now,
          completedAt: now + 10000,
          totalCostUsd: 0.03,
          durationMs: 10000,
          error: null,
        });
      });

      mockQuery.mockReturnValue(
        mockQueryResponse([initMsg('agent-sess-orig-defaults'), successResult()])
      );

      await manager.resumeSession('orig-session-for-defaults', 'Continue');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            settingSources: ['project'],
            systemPrompt: expect.objectContaining({ type: 'preset', preset: 'claude_code' }),
          }),
        })
      );
    });
  });

  describe('getLatestUserPrompt', () => {
    it('returns null when conversation is empty', () => {
      expect(manager.getLatestUserPrompt()).toBeNull();
    });

    it('returns the text from the last user message', () => {
      taskDoc.conversation.push({
        messageId: 'msg-1',
        role: 'user',
        contextId: null,
        taskId,
        parts: [{ kind: 'text', text: 'Hello world' }],
        referenceTaskIds: [],
        timestamp: Date.now(),
      });

      expect(manager.getLatestUserPrompt()).toBe('Hello world');
    });

    it('concatenates multiple text parts with newlines', () => {
      taskDoc.conversation.push({
        messageId: 'msg-multi',
        role: 'user',
        contextId: null,
        taskId,
        parts: [
          { kind: 'text', text: 'First part' },
          { kind: 'text', text: 'Second part' },
        ],
        referenceTaskIds: [],
        timestamp: Date.now(),
      });

      expect(manager.getLatestUserPrompt()).toBe('First part\nSecond part');
    });

    it('skips agent messages and returns the last user message', () => {
      taskDoc.conversation.push({
        messageId: 'msg-user-1',
        role: 'user',
        contextId: null,
        taskId,
        parts: [{ kind: 'text', text: 'First user msg' }],
        referenceTaskIds: [],
        timestamp: Date.now(),
      });
      taskDoc.conversation.push({
        messageId: 'msg-agent-1',
        role: 'agent',
        contextId: null,
        taskId,
        parts: [{ kind: 'text', text: 'Agent response' }],
        referenceTaskIds: [],
        timestamp: Date.now(),
      });
      taskDoc.conversation.push({
        messageId: 'msg-user-2',
        role: 'user',
        contextId: null,
        taskId,
        parts: [{ kind: 'text', text: 'Follow-up question' }],
        referenceTaskIds: [],
        timestamp: Date.now(),
      });

      expect(manager.getLatestUserPrompt()).toBe('Follow-up question');
    });

    it('returns null when only agent messages exist', () => {
      taskDoc.conversation.push({
        messageId: 'msg-agent',
        role: 'agent',
        contextId: null,
        taskId,
        parts: [{ kind: 'text', text: 'Agent only' }],
        referenceTaskIds: [],
        timestamp: Date.now(),
      });

      expect(manager.getLatestUserPrompt()).toBeNull();
    });

    it('ignores non-text parts (file, data)', () => {
      taskDoc.conversation.push({
        messageId: 'msg-mixed',
        role: 'user',
        contextId: null,
        taskId,
        parts: [
          { kind: 'file', name: 'test.txt', mimeType: 'text/plain', uri: null, bytes: null },
          { kind: 'text', text: 'With a file' },
        ],
        referenceTaskIds: [],
        timestamp: Date.now(),
      });

      expect(manager.getLatestUserPrompt()).toBe('With a file');
    });
  });

  describe('shouldResume', () => {
    it('returns { resume: false } when sessions is empty', () => {
      expect(manager.shouldResume()).toEqual({ resume: false });
    });

    it('returns { resume: true, sessionId } for a completed session with agentSessionId', () => {
      taskDoc.sessions.push({
        sessionId: 'sess-1',
        agentSessionId: 'agent-sess-1',
        status: 'completed',
        cwd: '/tmp',
        model: null,
        machineId: null,
        createdAt: now,
        completedAt: now + 5000,
        totalCostUsd: 0.01,
        durationMs: 5000,
        error: null,
      });

      expect(manager.shouldResume()).toEqual({
        resume: true,
        sessionId: 'sess-1',
      });
    });

    it('returns { resume: false } when all sessions have failed', () => {
      taskDoc.sessions.push({
        sessionId: 'sess-failed',
        agentSessionId: 'agent-sess-failed',
        status: 'failed',
        cwd: '/tmp',
        model: null,
        machineId: null,
        createdAt: now,
        completedAt: now + 5000,
        totalCostUsd: null,
        durationMs: null,
        error: 'Something went wrong',
      });

      expect(manager.shouldResume()).toEqual({ resume: false });
    });

    it('returns { resume: false } when sessions have no agentSessionId', () => {
      taskDoc.sessions.push({
        sessionId: 'sess-no-agent',
        agentSessionId: '',
        status: 'pending',
        cwd: '/tmp',
        model: null,
        machineId: null,
        createdAt: now,
        completedAt: null,
        totalCostUsd: null,
        durationMs: null,
        error: null,
      });

      expect(manager.shouldResume()).toEqual({ resume: false });
    });

    it('picks the most recent non-failed session', () => {
      taskDoc.sessions.push({
        sessionId: 'sess-old',
        agentSessionId: 'agent-old',
        status: 'completed',
        cwd: '/tmp',
        model: null,
        machineId: null,
        createdAt: now,
        completedAt: now + 1000,
        totalCostUsd: 0.01,
        durationMs: 1000,
        error: null,
      });
      taskDoc.sessions.push({
        sessionId: 'sess-failed',
        agentSessionId: 'agent-failed',
        status: 'failed',
        cwd: '/tmp',
        model: null,
        machineId: null,
        createdAt: now + 2000,
        completedAt: now + 3000,
        totalCostUsd: null,
        durationMs: null,
        error: 'crash',
      });
      taskDoc.sessions.push({
        sessionId: 'sess-latest',
        agentSessionId: 'agent-latest',
        status: 'active',
        cwd: '/tmp',
        model: null,
        machineId: null,
        createdAt: now + 4000,
        completedAt: null,
        totalCostUsd: null,
        durationMs: null,
        error: null,
      });

      expect(manager.shouldResume()).toEqual({
        resume: true,
        sessionId: 'sess-latest',
      });
    });
  });

  describe('machineId support', () => {
    it('stores machineId in session entry when creating a session', async () => {
      mockQuery.mockReturnValue(mockQueryResponse([initMsg('sess-machine'), successResult()]));

      const result = await manager.createSession({
        prompt: 'Hello',
        cwd: '/tmp',
        machineId: 'my-machine-1',
      });

      const json = taskDoc.toJSON();
      const session = json.sessions.find((s) => s.sessionId === result.sessionId);
      expect(session?.machineId).toBe('my-machine-1');
    });

    it('defaults machineId to null when not provided', async () => {
      mockQuery.mockReturnValue(mockQueryResponse([initMsg('sess-no-machine'), successResult()]));

      const result = await manager.createSession({
        prompt: 'Hello',
        cwd: '/tmp',
      });

      const json = taskDoc.toJSON();
      const session = json.sessions.find((s) => s.sessionId === result.sessionId);
      expect(session?.machineId).toBeNull();
    });

    it('stores machineId in resumed session entry', async () => {
      taskDoc.sessions.push({
        sessionId: 'orig-for-machine',
        agentSessionId: 'agent-orig-machine',
        status: 'completed',
        cwd: '/workspace',
        model: null,
        machineId: 'original-machine',
        createdAt: now,
        completedAt: now + 5000,
        totalCostUsd: 0.01,
        durationMs: 5000,
        error: null,
      });

      mockQuery.mockReturnValue(
        mockQueryResponse([initMsg('agent-orig-machine'), successResult()])
      );

      const result = await manager.resumeSession('orig-for-machine', 'Continue', {
        machineId: 'new-machine',
      });

      const json = taskDoc.toJSON();
      const newSession = json.sessions.find((s) => s.sessionId === result.sessionId);
      expect(newSession?.machineId).toBe('new-machine');
    });

    it('falls back to original machineId when resuming without override', async () => {
      taskDoc.sessions.push({
        sessionId: 'orig-machine-fallback',
        agentSessionId: 'agent-fallback',
        status: 'completed',
        cwd: '/workspace',
        model: null,
        machineId: 'inherited-machine',
        createdAt: now,
        completedAt: now + 5000,
        totalCostUsd: 0.01,
        durationMs: 5000,
        error: null,
      });

      mockQuery.mockReturnValue(mockQueryResponse([initMsg('agent-fallback'), successResult()]));

      const result = await manager.resumeSession('orig-machine-fallback', 'Continue');

      const json = taskDoc.toJSON();
      const newSession = json.sessions.find((s) => s.sessionId === result.sessionId);
      expect(newSession?.machineId).toBe('inherited-machine');
    });
  });
});
