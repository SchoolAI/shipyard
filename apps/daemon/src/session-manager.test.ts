import type { Query } from '@anthropic-ai/claude-agent-sdk';
import { createTypedDoc, getLoroDoc } from '@loro-extended/change';
import type { TaskDocHandles } from '@shipyard/loro-schema';
import {
  generateTaskId,
  TaskConversationDocumentSchema,
  TaskMetaDocumentSchema,
  TaskReviewDocumentSchema,
} from '@shipyard/loro-schema';
import { isContainer } from 'loro-crdt';
import { nanoid } from 'nanoid';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE_TIMEOUT_MS, SessionManager } from './session-manager.js';

function createTaskDocHandles(): TaskDocHandles {
  return {
    meta: createTypedDoc(TaskMetaDocumentSchema),
    conv: createTypedDoc(TaskConversationDocumentSchema),
    review: createTypedDoc(TaskReviewDocumentSchema),
  };
}

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
function mockQueryResponse(
  messages: Array<Record<string, unknown>>,
  skills: Array<{ name: string; description: string; argumentHint: string }> = []
): Query {
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
    supportedCommands: vi.fn().mockResolvedValue(skills),
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
    supportedCommands: vi.fn().mockResolvedValue([]),
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

function userToolResultMsg(toolUseId: string, content: string, isError = false) {
  return {
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content, is_error: isError }],
    },
    parent_tool_use_id: null,
    uuid: '00000000-0000-0000-0000-000000000005',
    session_id: 'sess-1',
  };
}

function userToolResultMsgReplay(toolUseId: string, content: string) {
  return {
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content, is_error: false }],
    },
    parent_tool_use_id: null,
    isReplay: true,
    uuid: '00000000-0000-0000-0000-000000000006',
    session_id: 'sess-1',
  };
}

function taskNotificationMsg(
  taskId: string,
  status: 'completed' | 'failed' | 'stopped' = 'completed'
) {
  return {
    type: 'system',
    subtype: 'task_notification',
    task_id: taskId,
    status,
    output_file: '/tmp/output.txt',
    summary: `Task ${taskId} ${status}`,
    uuid: '00000000-0000-0000-0000-000000000020',
    session_id: 'sess-1',
  };
}

function toolProgressMsg(toolUseId: string, toolName: string, elapsed: number) {
  return {
    type: 'tool_progress',
    tool_use_id: toolUseId,
    tool_name: toolName,
    parent_tool_use_id: null,
    elapsed_time_seconds: elapsed,
    uuid: '00000000-0000-0000-0000-000000000021',
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

function mockQueryControllable() {
  let resolve: ((msg: Record<string, unknown>) => void) | null = null;
  const messages: Array<Record<string, unknown>> = [];
  let done = false;

  async function* gen() {
    while (!done) {
      if (messages.length > 0) {
        yield messages.shift()!;
      } else {
        const msg = await new Promise<Record<string, unknown>>((r) => {
          resolve = r;
        });
        if (done) return;
        yield msg;
      }
    }
  }

  const generator = gen();

  const closeFn = vi.fn(() => {
    done = true;
    if (resolve) {
      const r = resolve;
      resolve = null;
      r({} as Record<string, unknown>);
    }
  });

  // eslint-disable-next-line no-restricted-syntax -- Satisfying Query interface for mock
  const queryObj = Object.assign(generator, {
    interrupt: vi.fn(),
    close: closeFn,
    setPermissionMode: vi.fn(),
    setModel: vi.fn(),
    setMaxThinkingTokens: vi.fn(),
    initializationResult: vi.fn(),
    supportedCommands: vi.fn().mockResolvedValue([]),
    supportedModels: vi.fn(),
    mcpServerStatus: vi.fn(),
    accountInfo: vi.fn(),
    rewindFiles: vi.fn(),
    reconnectMcpServer: vi.fn(),
    toggleMcpServer: vi.fn(),
    setMcpServers: vi.fn(),
    streamInput: vi.fn(),
  }) as unknown as Query;

  return {
    query: queryObj,
    emit(msg: Record<string, unknown>) {
      if (resolve) {
        const r = resolve;
        resolve = null;
        r(msg);
      } else {
        messages.push(msg);
      }
    },
    end() {
      done = true;
      if (resolve) {
        const r = resolve;
        resolve = null;
        r({} as Record<string, unknown>);
      }
    },
    get done() {
      return done;
    },
  };
}

describe('SessionManager', () => {
  let taskDocs: TaskDocHandles;
  let manager: SessionManager;
  let mockQuery: ReturnType<typeof vi.fn>;
  const taskId = generateTaskId();
  const now = Date.now();

  beforeEach(async () => {
    vi.clearAllMocks();

    taskDocs = createTaskDocHandles();
    taskDocs.meta.meta.id = taskId;
    taskDocs.meta.meta.title = 'Test task';
    taskDocs.meta.meta.status = 'submitted';
    taskDocs.meta.meta.createdAt = now;
    taskDocs.meta.meta.updatedAt = now;

    manager = new SessionManager(taskDocs);

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

      it('writes assistant text to conversation as messages', async () => {
        mockQuery.mockReturnValue(
          mockQueryResponse([
            initMsg('sess-1'),
            assistantMsg('First response'),
            assistantMsg('Second response'),
            successResult(),
          ])
        );

        await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

        const json = taskDocs.conv.toJSON();
        expect(json.conversation).toHaveLength(2);
        expect(json.conversation[0]?.role).toBe('assistant');
        expect(json.conversation[0]?.content).toHaveLength(1);
        expect(json.conversation[0]?.content[0]).toEqual({ type: 'text', text: 'First response' });
        expect(json.conversation[0]?.model).toBe('claude-opus-4-6');
        expect(json.conversation[1]?.content[0]).toEqual({ type: 'text', text: 'Second response' });
        expect(json.conversation[1]?.model).toBe('claude-opus-4-6');
      });

      it('captures both text and tool_use blocks from assistant messages', async () => {
        mockQuery.mockReturnValue(
          mockQueryResponse([
            initMsg('sess-1'),
            assistantMsgWithToolUse('Analyzing the file...'),
            successResult(),
          ])
        );

        await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

        const json = taskDocs.conv.toJSON();
        expect(json.conversation).toHaveLength(1);
        expect(json.conversation[0]?.content).toHaveLength(2);
        expect(json.conversation[0]?.content[0]).toEqual({
          type: 'text',
          text: 'Analyzing the file...',
        });
        expect(json.conversation[0]?.content[1]).toEqual({
          type: 'tool_use',
          toolUseId: 'tool-1',
          toolName: 'Read',
          input: JSON.stringify({ file_path: '/tmp/test.ts' }),
          parentToolUseId: null,
        });
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

        const json = taskDocs.conv.toJSON();
        expect(json.conversation).toHaveLength(1);
        expect(json.conversation[0]?.content[0]).toEqual({
          type: 'text',
          text: 'Partial response',
        });
      });

      it('captures tool_use-only assistant messages', async () => {
        mockQuery.mockReturnValue(
          mockQueryResponse([initMsg('sess-1'), assistantMsgToolUseOnly(), successResult()])
        );

        await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

        const json = taskDocs.conv.toJSON();
        expect(json.conversation).toHaveLength(1);
        expect(json.conversation[0]?.content).toHaveLength(1);
        expect(json.conversation[0]?.content[0]).toEqual({
          type: 'tool_use',
          toolUseId: 'tool-2',
          toolName: 'Bash',
          input: JSON.stringify({ command: 'ls' }),
          parentToolUseId: null,
        });
      });
    });

    describe('session status transitions', () => {
      it('transitions session: pending -> active -> completed', async () => {
        const statusSnapshots: string[] = [];

        mockQuery.mockImplementation(() => {
          // Capture status after the push (pending was set by createSession before query() is called)
          const json = taskDocs.conv.toJSON();
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
        const json = taskDocs.conv.toJSON();
        const session = json.sessions[0];
        expect(session?.status).toBe('completed');
      });

      it('sets task meta status to working then completed', async () => {
        mockQuery.mockReturnValue(mockQueryResponse([initMsg('sess-1'), successResult()]));

        await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

        expect(taskDocs.meta.toJSON().meta.status).toBe('completed');
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

        const json = taskDocs.conv.toJSON();
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

        const json = taskDocs.conv.toJSON();
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
          prompt: expect.anything(),
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

      it('resolves claude-opus-4-6-fast to real model with extraArgs', async () => {
        mockQuery.mockReturnValue(mockQueryResponse([initMsg('sess-fast'), successResult()]));

        await manager.createSession({
          prompt: 'Hello',
          cwd: '/tmp',
          model: 'claude-opus-4-6-fast',
        });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.objectContaining({
            options: expect.objectContaining({
              model: 'claude-opus-4-6',
              extraArgs: { settings: '{"fastMode":true}' },
            }),
          })
        );
      });

      it('preserves synthetic fast model ID in conversation despite init reporting real model', async () => {
        mockQuery.mockReturnValue(
          mockQueryResponse([
            initMsg('sess-fast-conv'),
            assistantMsg('Fast response'),
            successResult(),
          ])
        );

        await manager.createSession({
          prompt: 'Hello',
          cwd: '/tmp',
          model: 'claude-opus-4-6-fast',
        });

        const json = taskDocs.conv.toJSON();
        expect(json.conversation).toHaveLength(1);
        expect(json.conversation[0]?.model).toBe('claude-opus-4-6-fast');
      });

      it('does not add extraArgs for non-fast models', async () => {
        mockQuery.mockReturnValue(mockQueryResponse([initMsg('sess-normal'), successResult()]));

        await manager.createSession({
          prompt: 'Hello',
          cwd: '/tmp',
          model: 'claude-opus-4-6',
        });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.objectContaining({
            options: expect.objectContaining({
              model: 'claude-opus-4-6',
            }),
          })
        );
        const calledOptions = mockQuery.mock.calls[0]?.[0]?.options;
        expect(calledOptions?.extraArgs).toBeUndefined();
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

    describe('image content block prompt formatting', () => {
      let capturedPromptContent: unknown;

      function mockQueryCapturingPrompt(messages: Array<Record<string, unknown>>): void {
        mockQuery.mockImplementation((args: Record<string, unknown>) => {
          const promptIterable = args.prompt as AsyncIterable<Record<string, unknown>>;
          (async () => {
            for await (const msg of promptIterable) {
              capturedPromptContent = (msg as Record<string, unknown>).message;
              break;
            }
          })();
          return mockQueryResponse(messages);
        });
      }

      it('reorders images before text with labels', async () => {
        mockQueryCapturingPrompt([initMsg('sess-img'), successResult()]);

        await manager.createSession({
          prompt: [
            { type: 'text', text: 'Fix the header in the screenshot' },
            {
              type: 'image',
              id: 'img-prompt-1',
              source: { type: 'base64', mediaType: 'image/png', data: 'iVBORw0KGgo=' },
            },
          ],
          cwd: '/tmp',
        });

        expect(capturedPromptContent).toEqual({
          role: 'user',
          content: [
            { type: 'text', text: 'Attachment 1:' },
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' },
            },
            { type: 'text', text: 'Fix the header in the screenshot' },
          ],
        });
      });

      it('labels multiple images sequentially', async () => {
        mockQueryCapturingPrompt([initMsg('sess-multi-img'), successResult()]);

        await manager.createSession({
          prompt: [
            { type: 'text', text: 'Fix Image 1 to match Image 2' },
            {
              type: 'image',
              id: 'img-a',
              source: { type: 'base64', mediaType: 'image/png', data: 'png-data' },
            },
            {
              type: 'image',
              id: 'img-b',
              source: { type: 'base64', mediaType: 'image/jpeg', data: 'jpeg-data' },
            },
          ],
          cwd: '/tmp',
        });

        expect(capturedPromptContent).toEqual({
          role: 'user',
          content: [
            { type: 'text', text: 'Attachment 1:' },
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: 'png-data' },
            },
            { type: 'text', text: 'Attachment 2:' },
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: 'jpeg-data' },
            },
            { type: 'text', text: 'Fix Image 1 to match Image 2' },
          ],
        });
      });

      it('handles image-only prompt with label', async () => {
        mockQueryCapturingPrompt([initMsg('sess-img-only'), successResult()]);

        await manager.createSession({
          prompt: [
            {
              type: 'image',
              id: 'img-solo',
              source: { type: 'base64', mediaType: 'image/jpeg', data: '/9j/4AAQ' },
            },
          ],
          cwd: '/tmp',
        });

        expect(capturedPromptContent).toEqual({
          role: 'user',
          content: [
            { type: 'text', text: 'Attachment 1:' },
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: '/9j/4AAQ' },
            },
          ],
        });
      });

      it('passes text-only prompt without image labels', async () => {
        mockQueryCapturingPrompt([initMsg('sess-text-only'), successResult()]);

        await manager.createSession({
          prompt: [{ type: 'text', text: 'Just a text message' }],
          cwd: '/tmp',
        });

        expect(capturedPromptContent).toEqual({
          role: 'user',
          content: [{ type: 'text', text: 'Just a text message' }],
        });
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

        expect(taskDocs.meta.toJSON().meta.status).toBe('failed');
        const json = taskDocs.conv.toJSON();
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
        expect(taskDocs.conv.toJSON().sessions[0]?.error).toBe(
          'Agent SDK error: error_max_budget_usd'
        );
      });

      it('handles thrown errors from the generator', async () => {
        mockQuery.mockReturnValue(
          mockQueryThrows([initMsg('sess-throw')], new Error('Process exited unexpectedly'))
        );

        const result = await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

        expect(result.status).toBe('failed');
        expect(result.error).toBe('Process exited unexpectedly');
        expect(result.agentSessionId).toBe('sess-throw');

        expect(taskDocs.meta.toJSON().meta.status).toBe('failed');
        const json = taskDocs.conv.toJSON();
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
      taskDocs.conv.sessions.push({
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
          prompt: expect.anything(),
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

      const json = taskDocs.conv.toJSON();
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

      const json = taskDocs.conv.toJSON();
      expect(json.conversation).toHaveLength(1);
      expect(json.conversation[0]?.content[0]).toEqual({
        type: 'text',
        text: 'Resumed work output',
      });
    });

    it('throws for unknown sessionId', async () => {
      await expect(manager.resumeSession('nonexistent', 'Hello')).rejects.toThrow(
        'Session nonexistent not found in task doc'
      );
    });

    it('throws for session without agentSessionId', async () => {
      taskDocs.conv.sessions.push({
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
          prompt: expect.anything(),
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

      const json = taskDocs.conv.toJSON();
      const newSession = json.sessions.find((s) => s.sessionId === result.sessionId);
      expect(newSession?.model).toBe('claude-sonnet-4-20250514');
    });

    it('resolves fast model when resuming session', async () => {
      mockQuery.mockReturnValue(mockQueryResponse([initMsg('agent-sess-orig'), successResult()]));

      await manager.resumeSession('orig-session', 'Continue', {
        model: 'claude-opus-4-6-fast',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            model: 'claude-opus-4-6',
            extraArgs: { settings: '{"fastMode":true}' },
          }),
        })
      );
    });

    it('falls back to original session model when no model override provided', async () => {
      mockQuery.mockReturnValue(mockQueryResponse([initMsg('agent-sess-orig'), successResult()]));

      const result = await manager.resumeSession('orig-session', 'Continue');

      const json = taskDocs.conv.toJSON();
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
      taskDocs.meta.meta.status = 'submitted';

      mockQuery.mockReturnValueOnce(
        mockQueryResponse([
          initMsg('sess-second'),
          assistantMsg('Second session output'),
          successResult({ costUsd: 0.02 }),
        ])
      );

      await manager.createSession({ prompt: 'Second', cwd: '/tmp' });

      const json = taskDocs.conv.toJSON();
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

      const json = taskDocs.conv.toJSON();
      expect(json.conversation).toHaveLength(1);
    });
  });

  describe('task_notification handling', () => {
    it('processes task_notification without breaking session flow', async () => {
      mockQuery.mockReturnValue(
        mockQueryResponse([
          initMsg('sess-1'),
          taskNotificationMsg('sub-task-1', 'completed'),
          assistantMsg('The sub-task finished'),
          successResult(),
        ])
      );

      const result = await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

      expect(result.status).toBe('completed');
    });

    it('logs task_notification with taskId and status', async () => {
      const { logger: mockLogger } = await import('./logger.js');

      mockQuery.mockReturnValue(
        mockQueryResponse([
          initMsg('sess-1'),
          taskNotificationMsg('sub-task-2', 'failed'),
          successResult(),
        ])
      );

      await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: 'sub-task-2',
          status: 'failed',
        }),
        expect.stringContaining('task_notification')
      );
    });
  });

  describe('tool_progress handling', () => {
    it('processes tool_progress without adding to conversation', async () => {
      mockQuery.mockReturnValue(
        mockQueryResponse([
          initMsg('sess-1'),
          toolProgressMsg('tool-x', 'Bash', 5),
          toolProgressMsg('tool-x', 'Bash', 10),
          assistantMsg('Done with bash'),
          successResult(),
        ])
      );

      const result = await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

      expect(result.status).toBe('completed');
      const json = taskDocs.conv.toJSON();
      expect(json.conversation).toHaveLength(1);
    });

    it('logs tool_progress at debug level', async () => {
      const { logger: mockLogger } = await import('./logger.js');

      mockQuery.mockReturnValue(
        mockQueryResponse([
          initMsg('sess-1'),
          toolProgressMsg('tool-y', 'Read', 3),
          successResult(),
        ])
      );

      await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'Read',
          toolUseId: 'tool-y',
          elapsedSeconds: 3,
        }),
        expect.stringContaining('tool_progress')
      );
    });
  });

  describe('idle timeout', () => {
    it('marks session as interrupted (not failed) after IDLE_TIMEOUT_MS of no messages', async () => {
      vi.useFakeTimers();
      try {
        const ctrl = mockQueryControllable();
        mockQuery.mockReturnValue(ctrl.query);

        const sessionPromise = manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

        ctrl.emit(initMsg('sess-idle'));
        await vi.advanceTimersByTimeAsync(100);

        // Advance past the 5-minute idle timeout
        await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS + 1000);

        ctrl.end();
        const result = await sessionPromise;

        expect(result.status).toBe('interrupted');
        expect(result.error).toMatch(/idle timeout/i);
      } finally {
        vi.useRealTimers();
      }
    });

    it('sets meta.status to canceled when idle timeout occurs', async () => {
      vi.useFakeTimers();
      try {
        const ctrl = mockQueryControllable();
        mockQuery.mockReturnValue(ctrl.query);

        const sessionPromise = manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

        ctrl.emit(initMsg('sess-idle-meta'));
        await vi.advanceTimersByTimeAsync(100);

        await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS + 1000);

        ctrl.end();
        await sessionPromise;

        expect(taskDocs.meta.toJSON().meta.status).toBe('canceled');
      } finally {
        vi.useRealTimers();
      }
    });

    it('sets session entry status to interrupted on idle timeout', async () => {
      vi.useFakeTimers();
      try {
        const ctrl = mockQueryControllable();
        mockQuery.mockReturnValue(ctrl.query);

        const sessionPromise = manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

        ctrl.emit(initMsg('sess-idle-entry'));
        await vi.advanceTimersByTimeAsync(100);

        await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS + 1000);

        ctrl.end();
        const result = await sessionPromise;

        const json = taskDocs.conv.toJSON();
        const session = json.sessions.find((s) => s.sessionId === result.sessionId);
        expect(session?.status).toBe('interrupted');
      } finally {
        vi.useRealTimers();
      }
    });

    it('shouldResume returns resume: true for an idle-timed-out session', async () => {
      vi.useFakeTimers();
      try {
        const ctrl = mockQueryControllable();
        mockQuery.mockReturnValue(ctrl.query);

        const sessionPromise = manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

        ctrl.emit(initMsg('sess-idle-resume'));
        await vi.advanceTimersByTimeAsync(100);

        await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS + 1000);

        ctrl.end();
        await sessionPromise;

        const resumeResult = manager.shouldResume();
        expect(resumeResult.resume).toBe(true);
        expect(resumeResult.sessionId).toBeDefined();
      } finally {
        vi.useRealTimers();
      }
    });

    it('marks session as failed when not idle timeout and not aborted', async () => {
      mockQuery.mockReturnValue(
        mockQueryThrows([initMsg('sess-throw-fail')], new Error('Process exited unexpectedly'))
      );

      const result = await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Process exited unexpectedly');
      expect(taskDocs.meta.toJSON().meta.status).toBe('failed');

      const json = taskDocs.conv.toJSON();
      const session = json.sessions.find((s) => s.sessionId === result.sessionId);
      expect(session?.status).toBe('failed');
    });

    it('resets timer when messages arrive', async () => {
      vi.useFakeTimers();
      try {
        const ctrl = mockQueryControllable();
        mockQuery.mockReturnValue(ctrl.query);

        const sessionPromise = manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

        ctrl.emit(initMsg('sess-heartbeat'));
        await vi.advanceTimersByTimeAsync(100);

        // Advance 4 minutes (under threshold)
        await vi.advanceTimersByTimeAsync(4 * 60 * 1000);

        // Send a heartbeat -- each advanceTimersByTimeAsync(1) flushes microtasks,
        // giving the for-await loop time to process the message and update lastMessageAt
        ctrl.emit(toolProgressMsg('tool-hb', 'Bash', 240));
        for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(1);

        // Advance another 4 minutes (only 4 since last message, still under 5 min)
        await vi.advanceTimersByTimeAsync(4 * 60 * 1000);

        ctrl.emit(successResult());
        // Flush microtasks so the for-await loop processes successResult
        for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(1);
        const result = await sessionPromise;

        expect(result.status).toBe('completed');
      } finally {
        vi.useRealTimers();
      }
    });

    it('clears timer on normal completion', async () => {
      vi.useFakeTimers();
      try {
        mockQuery.mockReturnValue(mockQueryResponse([initMsg('sess-clean'), successResult()]));

        await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

        // Advance far past timeout -- no leaked timer should cause issues
        await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('tool result capture from user messages', () => {
    it('appends tool_result blocks to the last assistant message', async () => {
      mockQuery.mockReturnValue(
        mockQueryResponse([
          initMsg('sess-1'),
          assistantMsgWithToolUse('Reading the file...'),
          userToolResultMsg('tool-1', 'file contents here'),
          assistantMsg('Based on the file...'),
          successResult(),
        ])
      );

      await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

      const json = taskDocs.conv.toJSON();
      // First assistant msg gets the tool_result appended, second assistant msg is separate
      expect(json.conversation).toHaveLength(2);
      const firstMsg = json.conversation[0];
      // text + tool_use + tool_result
      expect(firstMsg?.content).toHaveLength(3);
      expect(firstMsg?.content[2]).toEqual({
        type: 'tool_result',
        toolUseId: 'tool-1',
        content: 'file contents here',
        isError: false,
        parentToolUseId: null,
      });
    });

    it('captures error tool results', async () => {
      mockQuery.mockReturnValue(
        mockQueryResponse([
          initMsg('sess-1'),
          assistantMsgToolUseOnly(),
          userToolResultMsg('tool-2', 'command failed', true),
          successResult(),
        ])
      );

      await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

      const json = taskDocs.conv.toJSON();
      expect(json.conversation).toHaveLength(1);
      const firstMsg = json.conversation[0];
      expect(firstMsg?.content).toHaveLength(2);
      expect(firstMsg?.content[1]).toEqual({
        type: 'tool_result',
        toolUseId: 'tool-2',
        content: 'command failed',
        isError: true,
        parentToolUseId: null,
      });
    });

    it('ignores replay user messages', async () => {
      mockQuery.mockReturnValue(
        mockQueryResponse([
          initMsg('sess-1'),
          userToolResultMsgReplay('tool-old', 'replayed result'),
          assistantMsg('Fresh response'),
          successResult(),
        ])
      );

      await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

      const json = taskDocs.conv.toJSON();
      expect(json.conversation).toHaveLength(1);
      expect(json.conversation[0]?.content).toHaveLength(1);
      expect(json.conversation[0]?.content[0]?.type).toBe('text');
    });

    it('creates standalone entry when no preceding assistant message exists', async () => {
      mockQuery.mockReturnValue(
        mockQueryResponse([
          initMsg('sess-1'),
          userToolResultMsg('tool-orphan', 'orphaned result'),
          successResult(),
        ])
      );

      await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

      const json = taskDocs.conv.toJSON();
      expect(json.conversation).toHaveLength(1);
      expect(json.conversation[0]?.role).toBe('assistant');
      expect(json.conversation[0]?.content[0]).toEqual({
        type: 'tool_result',
        toolUseId: 'tool-orphan',
        content: 'orphaned result',
        isError: false,
        parentToolUseId: null,
      });
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
        changeDoc(taskDocs.conv, (draft) => {
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

      const json = taskDocs.conv.toJSON();
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
        changeDoc(taskDocs.conv, (draft) => {
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

      const json = taskDocs.conv.toJSON();
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
            settingSources: ['user', 'project'],
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
        settingSources: ['project'],
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            settingSources: ['project'],
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
      changeDoc(taskDocs.conv, (draft) => {
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
            settingSources: ['user', 'project'],
            systemPrompt: expect.objectContaining({ type: 'preset', preset: 'claude_code' }),
          }),
        })
      );
    });
  });

  describe('slash command escaping', () => {
    const ZWSP = '\u200B';

    function mockSkills(...names: string[]) {
      return names.map((name) => ({ name, description: '', argumentHint: '' }));
    }

    it('escapes unknown /command in string prompt', async () => {
      let capturedContent: unknown;
      mockQuery.mockImplementation((args: Record<string, unknown>) => {
        const promptIterable = args.prompt as AsyncIterable<Record<string, unknown>>;
        (async () => {
          for await (const msg of promptIterable) {
            capturedContent = (msg as Record<string, unknown>).message;
            break;
          }
        })();
        return mockQueryResponse([initMsg('sess-slash'), successResult()]);
      });

      await manager.createSession({ prompt: '/test fix the bug', cwd: '/tmp' });

      expect(capturedContent).toEqual({
        role: 'user',
        content: `${ZWSP}/test fix the bug`,
      });
    });

    it('passes through known skill /command without escaping', async () => {
      let capturedContent: unknown;
      const skills = mockSkills('frontend-design', 'commit');
      mockQuery.mockImplementation((args: Record<string, unknown>) => {
        const promptIterable = args.prompt as AsyncIterable<Record<string, unknown>>;
        (async () => {
          for await (const msg of promptIterable) {
            capturedContent = (msg as Record<string, unknown>).message;
            break;
          }
        })();
        return mockQueryResponse([initMsg('sess-known'), successResult()], skills);
      });

      await manager.createSession({ prompt: '/frontend-design build a landing page', cwd: '/tmp' });

      expect(capturedContent).toEqual({
        role: 'user',
        content: '/frontend-design build a landing page',
      });
    });

    it('does not escape prompts that do not start with /', async () => {
      let capturedContent: unknown;
      mockQuery.mockImplementation((args: Record<string, unknown>) => {
        const promptIterable = args.prompt as AsyncIterable<Record<string, unknown>>;
        (async () => {
          for await (const msg of promptIterable) {
            capturedContent = (msg as Record<string, unknown>).message;
            break;
          }
        })();
        return mockQueryResponse([initMsg('sess-normal'), successResult()]);
      });

      await manager.createSession({ prompt: 'Hello world', cwd: '/tmp' });

      expect(capturedContent).toEqual({
        role: 'user',
        content: 'Hello world',
      });
    });

    it('escapes unknown /command in ContentBlock[] prompt', async () => {
      let capturedContent: unknown;
      mockQuery.mockImplementation((args: Record<string, unknown>) => {
        const promptIterable = args.prompt as AsyncIterable<Record<string, unknown>>;
        (async () => {
          for await (const msg of promptIterable) {
            capturedContent = (msg as Record<string, unknown>).message;
            break;
          }
        })();
        return mockQueryResponse([initMsg('sess-blocks'), successResult()]);
      });

      await manager.createSession({
        prompt: [{ type: 'text', text: '/test fix this' }],
        cwd: '/tmp',
      });

      expect(capturedContent).toEqual({
        role: 'user',
        content: [{ type: 'text', text: `${ZWSP}/test fix this` }],
      });
    });

    it('escapes follow-up slash commands using known skills from session init', async () => {
      const pushedMessages: unknown[] = [];
      const ctrl = mockQueryControllable();
      ctrl.query.supportedCommands = vi.fn().mockResolvedValue(mockSkills('commit'));
      mockQuery.mockImplementation((args: Record<string, unknown>) => {
        const promptIterable = args.prompt as AsyncIterable<Record<string, unknown>>;
        (async () => {
          for await (const msg of promptIterable) {
            pushedMessages.push((msg as Record<string, unknown>).message);
          }
        })();
        return ctrl.query;
      });

      const sessionPromise = manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

      ctrl.emit(initMsg('sess-followup-slash'));
      await new Promise((r) => setTimeout(r, 10));

      manager.sendFollowUp('/unknown do something');
      manager.sendFollowUp('/commit');

      ctrl.emit(successResult());
      ctrl.end();
      await sessionPromise;

      expect(pushedMessages).toHaveLength(3);
      expect(pushedMessages[0]).toEqual({ role: 'user', content: 'Hello' });
      expect(pushedMessages[1]).toEqual({ role: 'user', content: `${ZWSP}/unknown do something` });
      expect(pushedMessages[2]).toEqual({ role: 'user', content: '/commit' });
    });

    it('gracefully handles supportedCommands failure and still escapes', async () => {
      let capturedContent: unknown;
      mockQuery.mockImplementation((args: Record<string, unknown>) => {
        const promptIterable = args.prompt as AsyncIterable<Record<string, unknown>>;
        (async () => {
          for await (const msg of promptIterable) {
            capturedContent = (msg as Record<string, unknown>).message;
            break;
          }
        })();
        const resp = mockQueryResponse([initMsg('sess-fail-cmd'), successResult()]);
        resp.supportedCommands = vi.fn().mockRejectedValue(new Error('not available'));
        return resp;
      });

      const result = await manager.createSession({ prompt: '/test hello', cwd: '/tmp' });

      expect(result.status).toBe('completed');
      expect(capturedContent).toEqual({
        role: 'user',
        content: `${ZWSP}/test hello`,
      });
    });
  });

  describe('getLatestUserPrompt', () => {
    it('returns null when conversation is empty', () => {
      expect(manager.getLatestUserPrompt()).toBeNull();
    });

    it('returns the text from the last user message', () => {
      taskDocs.conv.conversation.push({
        messageId: 'msg-1',
        role: 'user',
        content: [{ type: 'text', text: 'Hello world' }],
        timestamp: Date.now(),
        model: null,
        machineId: null,
        reasoningEffort: null,
        permissionMode: null,
        cwd: null,
        authorId: null,
        authorName: null,
      });

      expect(manager.getLatestUserPrompt()).toBe('Hello world');
    });

    it('concatenates multiple text content blocks with newlines', () => {
      taskDocs.conv.conversation.push({
        messageId: 'msg-multi',
        role: 'user',
        content: [
          { type: 'text', text: 'First part' },
          { type: 'text', text: 'Second part' },
        ],
        timestamp: Date.now(),
        model: null,
        machineId: null,
        reasoningEffort: null,
        permissionMode: null,
        cwd: null,
        authorId: null,
        authorName: null,
      });

      expect(manager.getLatestUserPrompt()).toBe('First part\nSecond part');
    });

    it('skips assistant messages and returns the last user message', () => {
      taskDocs.conv.conversation.push({
        messageId: 'msg-user-1',
        role: 'user',
        content: [{ type: 'text', text: 'First user msg' }],
        timestamp: Date.now(),
        model: null,
        machineId: null,
        reasoningEffort: null,
        permissionMode: null,
        cwd: null,
        authorId: null,
        authorName: null,
      });
      taskDocs.conv.conversation.push({
        messageId: 'msg-agent-1',
        role: 'assistant',
        content: [{ type: 'text', text: 'Assistant response' }],
        timestamp: Date.now(),
        model: null,
        machineId: null,
        reasoningEffort: null,
        permissionMode: null,
        cwd: null,
        authorId: null,
        authorName: null,
      });
      taskDocs.conv.conversation.push({
        messageId: 'msg-user-2',
        role: 'user',
        content: [{ type: 'text', text: 'Follow-up question' }],
        timestamp: Date.now(),
        model: null,
        machineId: null,
        reasoningEffort: null,
        permissionMode: null,
        cwd: null,
        authorId: null,
        authorName: null,
      });

      expect(manager.getLatestUserPrompt()).toBe('Follow-up question');
    });

    it('returns null when only assistant messages exist', () => {
      taskDocs.conv.conversation.push({
        messageId: 'msg-agent',
        role: 'assistant',
        content: [{ type: 'text', text: 'Assistant only' }],
        timestamp: Date.now(),
        model: null,
        machineId: null,
        reasoningEffort: null,
        permissionMode: null,
        cwd: null,
        authorId: null,
        authorName: null,
      });

      expect(manager.getLatestUserPrompt()).toBeNull();
    });

    it('ignores non-text content blocks (tool_use, tool_result)', () => {
      taskDocs.conv.conversation.push({
        messageId: 'msg-mixed',
        role: 'user',
        content: [
          {
            type: 'tool_result',
            toolUseId: 'tu-1',
            content: 'some result',
            isError: false,
            parentToolUseId: null,
          },
          { type: 'text', text: 'With a tool result' },
        ],
        timestamp: Date.now(),
        model: null,
        machineId: null,
        reasoningEffort: null,
        permissionMode: null,
        cwd: null,
        authorId: null,
        authorName: null,
      });

      expect(manager.getLatestUserPrompt()).toBe('With a tool result');
    });
  });

  describe('getLatestUserContentBlocks', () => {
    it('returns null when conversation is empty', () => {
      expect(manager.getLatestUserContentBlocks()).toBeNull();
    });

    it('returns text blocks from the last user message', () => {
      taskDocs.conv.conversation.push({
        messageId: 'msg-1',
        role: 'user',
        content: [{ type: 'text', text: 'Hello world' }],
        timestamp: Date.now(),
        model: null,
        machineId: null,
        reasoningEffort: null,
        permissionMode: null,
        cwd: null,
        authorId: null,
        authorName: null,
      });

      expect(manager.getLatestUserContentBlocks()).toEqual([{ type: 'text', text: 'Hello world' }]);
    });

    it('returns image blocks alongside text blocks', () => {
      taskDocs.conv.conversation.push({
        messageId: 'msg-img',
        role: 'user',
        content: [
          { type: 'text', text: 'Check this screenshot' },
          {
            type: 'image',
            id: 'img-1',
            source: { type: 'base64', mediaType: 'image/png', data: 'iVBORw0KGgo=' },
          },
        ],
        timestamp: Date.now(),
        model: null,
        machineId: null,
        reasoningEffort: null,
        permissionMode: null,
        cwd: null,
        authorId: null,
        authorName: null,
      });

      const blocks = manager.getLatestUserContentBlocks();
      expect(blocks).toHaveLength(2);
      expect(blocks![0]).toEqual({ type: 'text', text: 'Check this screenshot' });
      expect(blocks![1]).toEqual({
        type: 'image',
        id: 'img-1',
        source: { type: 'base64', mediaType: 'image/png', data: 'iVBORw0KGgo=' },
      });
    });

    it('returns image-only messages (no text)', () => {
      taskDocs.conv.conversation.push({
        messageId: 'msg-img-only',
        role: 'user',
        content: [
          {
            type: 'image',
            id: 'img-only-1',
            source: { type: 'base64', mediaType: 'image/jpeg', data: '/9j/4AAQ' },
          },
        ],
        timestamp: Date.now(),
        model: null,
        machineId: null,
        reasoningEffort: null,
        permissionMode: null,
        cwd: null,
        authorId: null,
        authorName: null,
      });

      const blocks = manager.getLatestUserContentBlocks();
      expect(blocks).toHaveLength(1);
      expect(blocks![0]).toEqual({
        type: 'image',
        id: 'img-only-1',
        source: { type: 'base64', mediaType: 'image/jpeg', data: '/9j/4AAQ' },
      });
    });

    it('filters out non-user-facing block types (tool_use, tool_result, thinking)', () => {
      taskDocs.conv.conversation.push({
        messageId: 'msg-mixed-all',
        role: 'user',
        content: [
          {
            type: 'tool_result',
            toolUseId: 'tu-1',
            content: 'result',
            isError: false,
            parentToolUseId: null,
          },
          { type: 'text', text: 'With context' },
          {
            type: 'image',
            id: 'img-mixed-1',
            source: { type: 'base64', mediaType: 'image/png', data: 'abc123' },
          },
        ],
        timestamp: Date.now(),
        model: null,
        machineId: null,
        reasoningEffort: null,
        permissionMode: null,
        cwd: null,
        authorId: null,
        authorName: null,
      });

      const blocks = manager.getLatestUserContentBlocks();
      expect(blocks).toHaveLength(2);
      expect(blocks![0]).toEqual({ type: 'text', text: 'With context' });
      expect(blocks![1]).toEqual({
        type: 'image',
        id: 'img-mixed-1',
        source: { type: 'base64', mediaType: 'image/png', data: 'abc123' },
      });
    });

    it('returns null when only assistant messages exist', () => {
      taskDocs.conv.conversation.push({
        messageId: 'msg-agent',
        role: 'assistant',
        content: [{ type: 'text', text: 'Assistant only' }],
        timestamp: Date.now(),
        model: null,
        machineId: null,
        reasoningEffort: null,
        permissionMode: null,
        cwd: null,
        authorId: null,
        authorName: null,
      });

      expect(manager.getLatestUserContentBlocks()).toBeNull();
    });
  });

  describe('shouldResume', () => {
    it('returns { resume: false } when sessions is empty', () => {
      expect(manager.shouldResume()).toEqual({ resume: false });
    });

    it('returns { resume: true, sessionId } for a completed session with agentSessionId', () => {
      taskDocs.conv.sessions.push({
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
      taskDocs.conv.sessions.push({
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
      taskDocs.conv.sessions.push({
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
      taskDocs.conv.sessions.push({
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
      taskDocs.conv.sessions.push({
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
      taskDocs.conv.sessions.push({
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

  describe('streaming input mode', () => {
    it('isStreaming returns false before any session', () => {
      expect(manager.isStreaming).toBe(false);
    });

    it('isStreaming returns true during active session', async () => {
      const ctrl = mockQueryControllable();
      mockQuery.mockReturnValue(ctrl.query);

      const sessionPromise = manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

      // Emit init to start the session
      ctrl.emit(initMsg('sess-streaming'));

      // Session is still running, so isStreaming should be true
      expect(manager.isStreaming).toBe(true);

      // End the session
      ctrl.emit(successResult());
      ctrl.end();
      await sessionPromise;
    });

    it('isStreaming returns false after session completes', async () => {
      mockQuery.mockReturnValue(mockQueryResponse([initMsg('sess-done'), successResult()]));

      await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

      expect(manager.isStreaming).toBe(false);
    });

    it('sendFollowUp throws when no active session', () => {
      expect(() => manager.sendFollowUp('hello')).toThrow(
        'No active streaming session to send follow-up to'
      );
    });

    it('sendFollowUp sets status to working', async () => {
      const ctrl = mockQueryControllable();
      mockQuery.mockReturnValue(ctrl.query);

      const sessionPromise = manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

      // Emit init, then wait for input-required-like pause
      ctrl.emit(initMsg('sess-followup'));

      // Send a follow-up
      manager.sendFollowUp('continue please');

      expect(taskDocs.meta.toJSON().meta.status).toBe('working');

      // Clean up
      ctrl.emit(successResult());
      ctrl.end();
      await sessionPromise;
    });

    it('closeSession ends the session', async () => {
      const ctrl = mockQueryControllable();
      mockQuery.mockReturnValue(ctrl.query);

      const sessionPromise = manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

      ctrl.emit(initMsg('sess-close'));

      expect(manager.isStreaming).toBe(true);

      manager.closeSession();

      expect(manager.isStreaming).toBe(false);

      // The generator ends, so processMessages will fall through
      ctrl.end();
      await sessionPromise;
    });

    it('setModel delegates to query.setModel()', async () => {
      const ctrl = mockQueryControllable();
      mockQuery.mockReturnValue(ctrl.query);

      const sessionPromise = manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

      ctrl.emit(initMsg('sess-model'));

      await manager.setModel('claude-sonnet-4-20250514');

      expect(ctrl.query.setModel).toHaveBeenCalledWith('claude-sonnet-4-20250514');

      ctrl.emit(successResult());
      ctrl.end();
      await sessionPromise;
    });

    it('setModel resolves fast model to real model and logs warning', async () => {
      const { logger: mockLogger } = await import('./logger.js');

      const ctrl = mockQueryControllable();
      mockQuery.mockReturnValue(ctrl.query);

      const sessionPromise = manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

      ctrl.emit(initMsg('sess-fast-switch'));

      await manager.setModel('claude-opus-4-6-fast');

      expect(ctrl.query.setModel).toHaveBeenCalledWith('claude-opus-4-6');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-opus-4-6-fast' }),
        expect.stringContaining('extraArgs ignored')
      );

      ctrl.emit(successResult());
      ctrl.end();
      await sessionPromise;
    });

    it('setPermissionMode delegates to query.setPermissionMode()', async () => {
      const ctrl = mockQueryControllable();
      mockQuery.mockReturnValue(ctrl.query);

      const sessionPromise = manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

      ctrl.emit(initMsg('sess-perm'));

      await manager.setPermissionMode('bypassPermissions');

      expect(ctrl.query.setPermissionMode).toHaveBeenCalledWith('bypassPermissions');

      ctrl.emit(successResult());
      ctrl.end();
      await sessionPromise;
    });

    it('createSession sets status to starting initially', async () => {
      const ctrl = mockQueryControllable();
      mockQuery.mockReturnValue(ctrl.query);

      const sessionPromise = manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

      // Before init message, status should be 'starting'
      expect(taskDocs.meta.toJSON().meta.status).toBe('starting');

      ctrl.emit(initMsg('sess-starting'));
      ctrl.emit(successResult());
      ctrl.end();
      await sessionPromise;
    });

    it('init message transitions status to working', async () => {
      const ctrl = mockQueryControllable();
      mockQuery.mockReturnValue(ctrl.query);

      const sessionPromise = manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

      // Before init
      expect(taskDocs.meta.toJSON().meta.status).toBe('starting');

      // Emit init
      ctrl.emit(initMsg('sess-working'));

      // Give microtask queue a tick for the for-await to process the message
      await new Promise((r) => setTimeout(r, 10));

      expect(taskDocs.meta.toJSON().meta.status).toBe('working');

      ctrl.emit(successResult());
      ctrl.end();
      await sessionPromise;
    });
  });

  describe('plan extraction', () => {
    function assistantMsgWithExitPlanMode(planMarkdown: string) {
      return {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'exit-plan-1',
              name: 'ExitPlanMode',
              input: { plan: planMarkdown },
            },
          ],
        },
        parent_tool_use_id: null,
        uuid: '00000000-0000-0000-0000-000000000030',
        session_id: 'sess-1',
      };
    }

    it('ExitPlanMode creates plan AND planEditorDocs entry', async () => {
      const planMd = '# My Plan\n\n- Step 1\n- Step 2';

      mockQuery.mockReturnValue(
        mockQueryResponse([
          initMsg('sess-plan'),
          assistantMsgWithExitPlanMode(planMd),
          successResult(),
        ])
      );

      await manager.createSession({ prompt: 'Make a plan', cwd: '/tmp' });

      const reviewJson = taskDocs.review.toJSON();
      expect(reviewJson.plans).toHaveLength(1);
      expect(reviewJson.plans[0]?.markdown).toBe(planMd);
      expect(reviewJson.plans[0]?.reviewStatus).toBe('pending');

      const planId = reviewJson.plans[0]!.planId;

      const loroDoc = getLoroDoc(taskDocs.review);
      const planEditorDocsMap = loroDoc.getMap('planEditorDocs');
      const container = planEditorDocsMap.get(planId);
      expect(isContainer(container)).toBe(true);
    });

    it('does not duplicate plans on replay', async () => {
      mockQuery.mockReturnValueOnce(
        mockQueryResponse([
          initMsg('sess-plan-1'),
          assistantMsgWithExitPlanMode('# Plan A'),
          successResult(),
        ])
      );

      await manager.createSession({ prompt: 'Plan', cwd: '/tmp' });

      taskDocs.meta.meta.status = 'submitted';

      mockQuery.mockReturnValueOnce(
        mockQueryResponse([
          initMsg('sess-plan-2'),
          assistantMsgWithExitPlanMode('# Plan A'),
          successResult(),
        ])
      );

      await manager.createSession({ prompt: 'Plan again', cwd: '/tmp' });

      const reviewJson = taskDocs.review.toJSON();
      expect(reviewJson.plans).toHaveLength(1);
    });
  });

  describe('TodoWrite extraction', () => {
    function assistantMsgWithTodoWrite(todos: Array<Record<string, unknown>>) {
      return {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: `todo-${nanoid()}`,
              name: 'TodoWrite',
              input: { todos },
            },
          ],
        },
        parent_tool_use_id: null,
        uuid: '00000000-0000-0000-0000-000000000040',
        session_id: 'sess-1',
      };
    }

    it('extracts todos from TodoWrite tool call', async () => {
      const todos = [
        { content: 'Set up project', status: 'completed', activeForm: 'Setting up project' },
        { content: 'Write tests', status: 'in_progress', activeForm: 'Writing tests' },
        { content: 'Deploy', status: 'pending', activeForm: 'Deploying' },
      ];

      mockQuery.mockReturnValue(
        mockQueryResponse([initMsg('sess-todo'), assistantMsgWithTodoWrite(todos), successResult()])
      );

      await manager.createSession({ prompt: 'Do the work', cwd: '/tmp' });

      const reviewJson = taskDocs.review.toJSON();
      expect(reviewJson.todoItems).toHaveLength(3);
      expect(reviewJson.todoItems[0]?.content).toBe('Set up project');
      expect(reviewJson.todoItems[0]?.status).toBe('completed');
      expect(reviewJson.todoItems[0]?.activeForm).toBe('Setting up project');
      expect(reviewJson.todoItems[1]?.content).toBe('Write tests');
      expect(reviewJson.todoItems[1]?.status).toBe('in_progress');
      expect(reviewJson.todoItems[2]?.content).toBe('Deploy');
      expect(reviewJson.todoItems[2]?.status).toBe('pending');
    });

    it('stamps startedAt when status transitions to in_progress', async () => {
      // First call: all pending
      mockQuery.mockReturnValueOnce(
        mockQueryResponse([
          initMsg('sess-todo-1'),
          assistantMsgWithTodoWrite([
            { content: 'Task A', status: 'pending', activeForm: 'Task A' },
          ]),
          successResult(),
        ])
      );

      await manager.createSession({ prompt: 'Start', cwd: '/tmp' });

      let reviewJson = taskDocs.review.toJSON();
      expect(reviewJson.todoItems[0]?.startedAt).toBeNull();

      // Second call: now in_progress
      taskDocs.meta.meta.status = 'submitted';

      mockQuery.mockReturnValueOnce(
        mockQueryResponse([
          initMsg('sess-todo-2'),
          assistantMsgWithTodoWrite([
            { content: 'Task A', status: 'in_progress', activeForm: 'Working on Task A' },
          ]),
          successResult(),
        ])
      );

      await manager.createSession({ prompt: 'Continue', cwd: '/tmp' });

      reviewJson = taskDocs.review.toJSON();
      expect(reviewJson.todoItems[0]?.startedAt).toBeGreaterThan(0);
    });

    it('stamps completedAt when status transitions to completed', async () => {
      // First call: in_progress
      mockQuery.mockReturnValueOnce(
        mockQueryResponse([
          initMsg('sess-todo-c1'),
          assistantMsgWithTodoWrite([
            { content: 'Task B', status: 'in_progress', activeForm: 'Working on Task B' },
          ]),
          successResult(),
        ])
      );

      await manager.createSession({ prompt: 'Start', cwd: '/tmp' });

      let reviewJson = taskDocs.review.toJSON();
      expect(reviewJson.todoItems[0]?.completedAt).toBeNull();

      // Second call: now completed
      taskDocs.meta.meta.status = 'submitted';

      mockQuery.mockReturnValueOnce(
        mockQueryResponse([
          initMsg('sess-todo-c2'),
          assistantMsgWithTodoWrite([
            { content: 'Task B', status: 'completed', activeForm: 'Completed Task B' },
          ]),
          successResult(),
        ])
      );

      await manager.createSession({ prompt: 'Continue', cwd: '/tmp' });

      reviewJson = taskDocs.review.toJSON();
      expect(reviewJson.todoItems[0]?.completedAt).toBeGreaterThan(0);
    });

    it('carries forward timestamps on subsequent calls', async () => {
      // First call: in_progress (stamps startedAt)
      mockQuery.mockReturnValueOnce(
        mockQueryResponse([
          initMsg('sess-todo-carry-1'),
          assistantMsgWithTodoWrite([
            { content: 'Task C', status: 'in_progress', activeForm: 'Working on Task C' },
          ]),
          successResult(),
        ])
      );

      await manager.createSession({ prompt: 'Start', cwd: '/tmp' });

      const reviewJson1 = taskDocs.review.toJSON();
      const firstStartedAt = reviewJson1.todoItems[0]?.startedAt;
      expect(firstStartedAt).toBeGreaterThan(0);

      // Second call: still in_progress (should preserve the original startedAt)
      taskDocs.meta.meta.status = 'submitted';

      mockQuery.mockReturnValueOnce(
        mockQueryResponse([
          initMsg('sess-todo-carry-2'),
          assistantMsgWithTodoWrite([
            { content: 'Task C', status: 'in_progress', activeForm: 'Still working on Task C' },
          ]),
          successResult(),
        ])
      );

      await manager.createSession({ prompt: 'Continue', cwd: '/tmp' });

      const reviewJson2 = taskDocs.review.toJSON();
      expect(reviewJson2.todoItems[0]?.startedAt).toBe(firstStartedAt);
    });

    it('performs full list replacement', async () => {
      // First call: 3 items
      mockQuery.mockReturnValueOnce(
        mockQueryResponse([
          initMsg('sess-todo-replace-1'),
          assistantMsgWithTodoWrite([
            { content: 'Item 1', status: 'pending', activeForm: 'Item 1' },
            { content: 'Item 2', status: 'pending', activeForm: 'Item 2' },
            { content: 'Item 3', status: 'pending', activeForm: 'Item 3' },
          ]),
          successResult(),
        ])
      );

      await manager.createSession({ prompt: 'Start', cwd: '/tmp' });
      expect(taskDocs.review.toJSON().todoItems).toHaveLength(3);

      // Second call: only 2 items
      taskDocs.meta.meta.status = 'submitted';

      mockQuery.mockReturnValueOnce(
        mockQueryResponse([
          initMsg('sess-todo-replace-2'),
          assistantMsgWithTodoWrite([
            { content: 'Item A', status: 'in_progress', activeForm: 'Item A' },
            { content: 'Item B', status: 'pending', activeForm: 'Item B' },
          ]),
          successResult(),
        ])
      );

      await manager.createSession({ prompt: 'Continue', cwd: '/tmp' });

      const reviewJson = taskDocs.review.toJSON();
      expect(reviewJson.todoItems).toHaveLength(2);
      expect(reviewJson.todoItems[0]?.content).toBe('Item A');
      expect(reviewJson.todoItems[1]?.content).toBe('Item B');
    });

    it('handles malformed input gracefully', async () => {
      // Pre-populate with a valid todo item
      const { change: changeDoc } = await import('@loro-extended/change');
      changeDoc(taskDocs.review, (draft) => {
        draft.todoItems.push({
          content: 'Existing item',
          status: 'pending',
          activeForm: 'Existing item',
          startedAt: null,
          completedAt: null,
        });
      });

      // Send an assistant message where TodoWrite input is not valid JSON
      mockQuery.mockReturnValue(
        mockQueryResponse([
          initMsg('sess-todo-malformed'),
          {
            type: 'assistant',
            message: {
              content: [
                {
                  type: 'tool_use',
                  id: 'todo-bad-json',
                  name: 'TodoWrite',
                  input: 'not valid json at all',
                },
              ],
            },
            parent_tool_use_id: null,
            uuid: '00000000-0000-0000-0000-000000000041',
            session_id: 'sess-1',
          },
          successResult(),
        ])
      );

      await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

      // The existing items should be unchanged since extractTodoItems returns []
      const reviewJson = taskDocs.review.toJSON();
      expect(reviewJson.todoItems).toHaveLength(1);
      expect(reviewJson.todoItems[0]?.content).toBe('Existing item');
    });

    it('handles empty todos array without clearing existing items', async () => {
      const { change: changeDoc } = await import('@loro-extended/change');
      changeDoc(taskDocs.review, (draft) => {
        draft.todoItems.push({
          content: 'Pre-existing',
          status: 'in_progress',
          activeForm: 'Pre-existing',
          startedAt: Date.now(),
          completedAt: null,
        });
      });

      // Send TodoWrite with an empty todos array (extractTodoItems returns [])
      mockQuery.mockReturnValue(
        mockQueryResponse([
          initMsg('sess-todo-empty'),
          {
            type: 'assistant',
            message: {
              content: [
                {
                  type: 'tool_use',
                  id: 'todo-empty',
                  name: 'TodoWrite',
                  input: { todos: [] },
                },
              ],
            },
            parent_tool_use_id: null,
            uuid: '00000000-0000-0000-0000-000000000042',
            session_id: 'sess-1',
          },
          successResult(),
        ])
      );

      await manager.createSession({ prompt: 'Hello', cwd: '/tmp' });

      // Empty array from extractTodoItems triggers the early continue, so items unchanged
      const reviewJson = taskDocs.review.toJSON();
      expect(reviewJson.todoItems).toHaveLength(1);
      expect(reviewJson.todoItems[0]?.content).toBe('Pre-existing');
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

      const json = taskDocs.conv.toJSON();
      const session = json.sessions.find((s) => s.sessionId === result.sessionId);
      expect(session?.machineId).toBe('my-machine-1');
    });

    it('defaults machineId to null when not provided', async () => {
      mockQuery.mockReturnValue(mockQueryResponse([initMsg('sess-no-machine'), successResult()]));

      const result = await manager.createSession({
        prompt: 'Hello',
        cwd: '/tmp',
      });

      const json = taskDocs.conv.toJSON();
      const session = json.sessions.find((s) => s.sessionId === result.sessionId);
      expect(session?.machineId).toBeNull();
    });

    it('stores machineId in resumed session entry', async () => {
      taskDocs.conv.sessions.push({
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

      const json = taskDocs.conv.toJSON();
      const newSession = json.sessions.find((s) => s.sessionId === result.sessionId);
      expect(newSession?.machineId).toBe('new-machine');
    });

    it('falls back to original machineId when resuming without override', async () => {
      taskDocs.conv.sessions.push({
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

      const json = taskDocs.conv.toJSON();
      const newSession = json.sessions.find((s) => s.sessionId === result.sessionId);
      expect(newSession?.machineId).toBe('inherited-machine');
    });
  });
});
