import { createTypedDoc } from '@loro-extended/change';
import { LoroDoc } from 'loro-crdt';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildDocumentId, DEFAULT_EPOCH, parseDocumentId } from './epoch.js';
import { generateSessionId, generateTaskId } from './ids.js';
import { EpochDocumentSchema, TaskDocumentSchema } from './shapes.js';

describe('EpochDocumentSchema', () => {
  it('creates a typed doc with schema version', () => {
    const doc = createTypedDoc(EpochDocumentSchema, { doc: new LoroDoc() });
    doc.schema.version = DEFAULT_EPOCH;

    const json = doc.toJSON();
    expect(json.schema.version).toBe(DEFAULT_EPOCH);
  });

  it('increments epoch version', () => {
    const doc = createTypedDoc(EpochDocumentSchema, { doc: new LoroDoc() });
    doc.schema.version = 1;
    doc.schema.version = 2;

    expect(doc.toJSON().schema.version).toBe(2);
  });
});

describe('TaskDocumentSchema', () => {
  let doc: ReturnType<typeof createTypedDoc<typeof TaskDocumentSchema>>;
  const taskId = generateTaskId();
  const now = Date.now();

  beforeEach(() => {
    doc = createTypedDoc(TaskDocumentSchema, { doc: new LoroDoc() });
    doc.meta.id = taskId;
    doc.meta.title = 'Test task';
    doc.meta.status = 'submitted';
    doc.meta.createdAt = now;
    doc.meta.updatedAt = now;
  });

  describe('meta', () => {
    it('stores task metadata', () => {
      const json = doc.toJSON();
      expect(json.meta.id).toBe(taskId);
      expect(json.meta.title).toBe('Test task');
      expect(json.meta.status).toBe('submitted');
      expect(json.meta.createdAt).toBe(now);
    });

    it('updates status', () => {
      doc.meta.status = 'working';
      doc.meta.updatedAt = Date.now();

      expect(doc.toJSON().meta.status).toBe('working');
    });
  });

  describe('conversation (MCP-aligned messages)', () => {
    it('adds a text message', () => {
      doc.conversation.push({
        messageId: 'msg-1',
        role: 'user',
        content: [{ type: 'text', text: 'Hello agent' }],
        timestamp: now,
        model: null,
        machineId: null,
        reasoningEffort: null,
        permissionMode: null,
        cwd: null,
      });

      const json = doc.toJSON();
      expect(json.conversation).toHaveLength(1);
      expect(json.conversation[0]?.role).toBe('user');
      expect(json.conversation[0]?.content[0]?.type).toBe('text');
      if (json.conversation[0]?.content[0]?.type === 'text') {
        expect(json.conversation[0].content[0].text).toBe('Hello agent');
      }
    });

    it('adds an assistant response with text', () => {
      doc.conversation.push({
        messageId: 'msg-2',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello human' }],
        timestamp: now + 1000,
        model: null,
        machineId: null,
        reasoningEffort: null,
        permissionMode: null,
        cwd: null,
      });

      const json = doc.toJSON();
      expect(json.conversation[0]?.role).toBe('assistant');
      expect(json.conversation[0]?.content[0]?.type).toBe('text');
    });

    it('supports tool_use blocks', () => {
      doc.conversation.push({
        messageId: 'msg-3',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            toolUseId: 'tu-1',
            toolName: 'Read',
            input: JSON.stringify({ file_path: '/tmp/test.ts' }),
            parentToolUseId: null,
          },
        ],
        timestamp: now,
        model: null,
        machineId: null,
        reasoningEffort: null,
        permissionMode: null,
        cwd: null,
      });

      const json = doc.toJSON();
      const block = json.conversation[0]?.content[0];
      expect(block?.type).toBe('tool_use');
      if (block?.type === 'tool_use') {
        expect(block.toolUseId).toBe('tu-1');
        expect(block.toolName).toBe('Read');
        expect(JSON.parse(block.input)).toEqual({ file_path: '/tmp/test.ts' });
      }
    });

    it('supports tool_result blocks', () => {
      doc.conversation.push({
        messageId: 'msg-4',
        role: 'user',
        content: [
          {
            type: 'tool_result',
            toolUseId: 'tu-1',
            content: 'File contents here',
            isError: false,
            parentToolUseId: null,
          },
        ],
        timestamp: now,
        model: null,
        machineId: null,
        reasoningEffort: null,
        permissionMode: null,
        cwd: null,
      });

      const json = doc.toJSON();
      const block = json.conversation[0]?.content[0];
      expect(block?.type).toBe('tool_result');
      if (block?.type === 'tool_result') {
        expect(block.toolUseId).toBe('tu-1');
        expect(block.content).toBe('File contents here');
        expect(block.isError).toBe(false);
      }
    });

    it('supports thinking blocks', () => {
      doc.conversation.push({
        messageId: 'msg-5',
        role: 'assistant',
        content: [
          {
            type: 'thinking',
            text: 'Let me analyze this problem...',
          },
        ],
        timestamp: now,
        model: null,
        machineId: null,
        reasoningEffort: null,
        permissionMode: null,
        cwd: null,
      });

      const json = doc.toJSON();
      const block = json.conversation[0]?.content[0];
      expect(block?.type).toBe('thinking');
      if (block?.type === 'thinking') {
        expect(block.text).toBe('Let me analyze this problem...');
      }
    });

    it('supports image blocks with base64 source', () => {
      doc.conversation.push({
        messageId: 'msg-img',
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', mediaType: 'image/png', data: 'iVBOR...' },
          },
        ],
        timestamp: now,
        model: null,
        machineId: null,
        reasoningEffort: null,
        permissionMode: null,
        cwd: null,
      });

      const json = doc.toJSON();
      expect(json.conversation).toHaveLength(1);
      const block = json.conversation[0]?.content[0];
      expect(block?.type).toBe('image');
      if (block?.type === 'image') {
        expect(block.source.type).toBe('base64');
        if (block.source.type === 'base64') {
          expect(block.source.mediaType).toBe('image/png');
          expect(block.source.data).toBe('iVBOR...');
        }
      }
    });

    it('supports mixed text and image content', () => {
      doc.conversation.push({
        messageId: 'msg-mixed-img',
        role: 'user',
        content: [
          { type: 'text', text: 'Check this screenshot' },
          {
            type: 'image',
            source: { type: 'base64', mediaType: 'image/jpeg', data: '/9j/4AAQ...' },
          },
        ],
        timestamp: now,
        model: null,
        machineId: null,
        reasoningEffort: null,
        permissionMode: null,
        cwd: null,
      });

      const json = doc.toJSON();
      expect(json.conversation[0]?.content).toHaveLength(2);
      expect(json.conversation[0]?.content[0]?.type).toBe('text');
      expect(json.conversation[0]?.content[1]?.type).toBe('image');
    });

    it('supports messages with mixed content blocks', () => {
      doc.conversation.push({
        messageId: 'msg-6',
        role: 'assistant',
        content: [
          { type: 'thinking', text: 'I should read the file first.' },
          { type: 'text', text: 'Let me check that file for you.' },
          {
            type: 'tool_use',
            toolUseId: 'tu-2',
            toolName: 'Read',
            input: JSON.stringify({ file_path: '/src/main.ts' }),
            parentToolUseId: null,
          },
        ],
        timestamp: now,
        model: null,
        machineId: null,
        reasoningEffort: null,
        permissionMode: null,
        cwd: null,
      });

      const json = doc.toJSON();
      expect(json.conversation[0]?.content).toHaveLength(3);
      expect(json.conversation[0]?.content[0]?.type).toBe('thinking');
      expect(json.conversation[0]?.content[1]?.type).toBe('text');
      expect(json.conversation[0]?.content[2]?.type).toBe('tool_use');
    });

    it('supports tool_result with error', () => {
      doc.conversation.push({
        messageId: 'msg-7',
        role: 'user',
        content: [
          {
            type: 'tool_result',
            toolUseId: 'tu-3',
            content: 'Permission denied: /etc/shadow',
            isError: true,
            parentToolUseId: null,
          },
        ],
        timestamp: now,
        model: null,
        machineId: null,
        reasoningEffort: null,
        permissionMode: null,
        cwd: null,
      });

      const json = doc.toJSON();
      const block = json.conversation[0]?.content[0];
      expect(block?.type).toBe('tool_result');
      if (block?.type === 'tool_result') {
        expect(block.isError).toBe(true);
        expect(block.content).toContain('Permission denied');
      }
    });
  });

  describe('sessions', () => {
    it('adds a session entry', () => {
      const sessionId = generateSessionId();

      doc.sessions.push({
        sessionId,
        agentSessionId: 'sdk-session-abc',
        status: 'active',
        cwd: '/home/user/project',
        model: 'claude-opus-4-6',
        machineId: null,
        createdAt: now,
        completedAt: null,
        totalCostUsd: null,
        durationMs: null,
        error: null,
      });

      const json = doc.toJSON();
      expect(json.sessions).toHaveLength(1);
      expect(json.sessions[0]?.sessionId).toBe(sessionId);
      expect(json.sessions[0]?.agentSessionId).toBe('sdk-session-abc');
      expect(json.sessions[0]?.status).toBe('active');
      expect(json.sessions[0]?.model).toBe('claude-opus-4-6');
    });

    it('tracks session completion', () => {
      const sessionId = generateSessionId();
      const completedAt = now + 60_000;

      doc.sessions.push({
        sessionId,
        agentSessionId: 'sdk-session-def',
        status: 'completed',
        cwd: '/home/user/project',
        model: null,
        machineId: null,
        createdAt: now,
        completedAt,
        totalCostUsd: 0.05,
        durationMs: 60_000,
        error: null,
      });

      const json = doc.toJSON();
      expect(json.sessions[0]?.status).toBe('completed');
      expect(json.sessions[0]?.totalCostUsd).toBe(0.05);
      expect(json.sessions[0]?.durationMs).toBe(60_000);
    });

    it('tracks session failure', () => {
      doc.sessions.push({
        sessionId: generateSessionId(),
        agentSessionId: 'sdk-session-fail',
        status: 'failed',
        cwd: '/tmp',
        model: null,
        machineId: null,
        createdAt: now,
        completedAt: now + 1000,
        totalCostUsd: null,
        durationMs: 1000,
        error: 'error_max_turns: exceeded maximum turns',
      });

      const json = doc.toJSON();
      expect(json.sessions[0]?.status).toBe('failed');
      expect(json.sessions[0]?.error).toContain('error_max_turns');
    });
  });

  describe('diffComments', () => {
    it('adds a comment to the record', () => {
      const commentId = 'cmt-1';
      doc.diffComments.set(commentId, {
        commentId,
        filePath: 'src/index.ts',
        lineNumber: 42,
        side: 'new',
        diffScope: 'working-tree',
        lineContentHash: 'abc123',
        body: 'This null check looks wrong',
        authorType: 'human',
        authorId: 'user-1',
        createdAt: now,
        resolvedAt: null,
      });

      const json = doc.toJSON();
      expect(Object.keys(json.diffComments)).toHaveLength(1);
      expect(json.diffComments[commentId]?.body).toBe('This null check looks wrong');
      expect(json.diffComments[commentId]?.lineNumber).toBe(42);
      expect(json.diffComments[commentId]?.resolvedAt).toBe(null);
    });

    it('resolves a comment', () => {
      const commentId = 'cmt-2';
      doc.diffComments.set(commentId, {
        commentId,
        filePath: 'src/app.tsx',
        lineNumber: 10,
        side: 'new',
        diffScope: 'last-turn',
        lineContentHash: 'def456',
        body: 'Why did the agent remove this?',
        authorType: 'human',
        authorId: 'user-1',
        createdAt: now,
        resolvedAt: null,
      });

      const entry = doc.diffComments.get(commentId);
      if (entry) {
        doc.diffComments.set(commentId, { ...entry, resolvedAt: now + 5000 });
      }

      const json = doc.toJSON();
      expect(json.diffComments[commentId]?.resolvedAt).toBe(now + 5000);
    });

    it('deletes a comment', () => {
      const commentId = 'cmt-3';
      doc.diffComments.set(commentId, {
        commentId,
        filePath: 'src/utils.ts',
        lineNumber: 1,
        side: 'old',
        diffScope: 'working-tree',
        lineContentHash: 'ghi789',
        body: 'Temporary comment',
        authorType: 'agent',
        authorId: 'claude-1',
        createdAt: now,
        resolvedAt: null,
      });

      expect(Object.keys(doc.toJSON().diffComments)).toHaveLength(1);
      doc.diffComments.delete(commentId);
      expect(Object.keys(doc.toJSON().diffComments)).toHaveLength(0);
    });

    it('supports multiple comments on different files', () => {
      doc.diffComments.set('cmt-a', {
        commentId: 'cmt-a',
        filePath: 'src/a.ts',
        lineNumber: 1,
        side: 'new',
        diffScope: 'working-tree',
        lineContentHash: 'hash-a',
        body: 'Comment A',
        authorType: 'human',
        authorId: 'user-1',
        createdAt: now,
        resolvedAt: null,
      });
      doc.diffComments.set('cmt-b', {
        commentId: 'cmt-b',
        filePath: 'src/b.ts',
        lineNumber: 5,
        side: 'old',
        diffScope: 'last-turn',
        lineContentHash: 'hash-b',
        body: 'Comment B',
        authorType: 'agent',
        authorId: 'claude-1',
        createdAt: now + 1000,
        resolvedAt: null,
      });

      const json = doc.toJSON();
      expect(Object.keys(json.diffComments)).toHaveLength(2);
      expect(json.diffComments['cmt-a']?.filePath).toBe('src/a.ts');
      expect(json.diffComments['cmt-b']?.authorType).toBe('agent');
    });
  });
});

describe('document ID helpers', () => {
  it('builds epoch-versioned document IDs', () => {
    expect(buildDocumentId('task', 'abc123', 1)).toBe('task:abc123:1');
    expect(buildDocumentId('task', 'abc123', 2)).toBe('task:abc123:2');
    expect(buildDocumentId('session', 'xyz', 5)).toBe('session:xyz:5');
  });

  it('parses epoch-versioned document IDs', () => {
    const result = parseDocumentId('task:abc123:2');
    expect(result).toEqual({ prefix: 'task', key: 'abc123', epoch: 2 });
  });

  it('returns null for invalid IDs', () => {
    expect(parseDocumentId('task:abc123')).toBe(null);
    expect(parseDocumentId('task')).toBe(null);
    expect(parseDocumentId('')).toBe(null);
    expect(parseDocumentId('task:abc:0')).toBe(null);
    expect(parseDocumentId('task:abc:-1')).toBe(null);
    expect(parseDocumentId('task:abc:xyz')).toBe(null);
  });

  it('roundtrips build/parse', () => {
    const id = buildDocumentId('task', 'my-task', 3);
    const parsed = parseDocumentId(id);
    expect(parsed).toEqual({ prefix: 'task', key: 'my-task', epoch: 3 });
  });
});
