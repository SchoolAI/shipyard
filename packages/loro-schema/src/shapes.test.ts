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
    expect(json.schema.version).toBe(1);
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

  describe('conversation (A2A messages)', () => {
    it('adds a text message', () => {
      doc.conversation.push({
        messageId: 'msg-1',
        role: 'user',
        contextId: null,
        taskId: taskId,
        parts: [{ kind: 'text', text: 'Hello agent' }],
        referenceTaskIds: [],
        timestamp: now,
      });

      const json = doc.toJSON();
      expect(json.conversation).toHaveLength(1);
      expect(json.conversation[0]?.role).toBe('user');
      expect(json.conversation[0]?.parts[0]?.kind).toBe('text');
      if (json.conversation[0]?.parts[0]?.kind === 'text') {
        expect(json.conversation[0].parts[0].text).toBe('Hello agent');
      }
    });

    it('adds an agent response', () => {
      doc.conversation.push({
        messageId: 'msg-2',
        role: 'agent',
        contextId: 'ctx-1',
        taskId: taskId,
        parts: [{ kind: 'text', text: 'Hello human' }],
        referenceTaskIds: [],
        timestamp: now + 1000,
      });

      const json = doc.toJSON();
      expect(json.conversation[0]?.role).toBe('agent');
      expect(json.conversation[0]?.contextId).toBe('ctx-1');
    });

    it('supports data parts', () => {
      doc.conversation.push({
        messageId: 'msg-3',
        role: 'agent',
        contextId: null,
        taskId: null,
        parts: [{ kind: 'data', data: JSON.stringify({ key: 'value' }) }],
        referenceTaskIds: [],
        timestamp: now,
      });

      const json = doc.toJSON();
      const part = json.conversation[0]?.parts[0];
      expect(part?.kind).toBe('data');
      if (part?.kind === 'data') {
        expect(JSON.parse(part.data)).toEqual({ key: 'value' });
      }
    });

    it('supports file parts', () => {
      doc.conversation.push({
        messageId: 'msg-4',
        role: 'agent',
        contextId: null,
        taskId: null,
        parts: [
          {
            kind: 'file',
            name: 'output.txt',
            mimeType: 'text/plain',
            uri: null,
            bytes: 'SGVsbG8=',
          },
        ],
        referenceTaskIds: [],
        timestamp: now,
      });

      const json = doc.toJSON();
      const part = json.conversation[0]?.parts[0];
      expect(part?.kind).toBe('file');
      if (part?.kind === 'file') {
        expect(part.name).toBe('output.txt');
        expect(part.bytes).toBe('SGVsbG8=');
      }
    });

    it('supports reference task IDs', () => {
      doc.conversation.push({
        messageId: 'msg-5',
        role: 'agent',
        contextId: null,
        taskId: null,
        parts: [{ kind: 'text', text: 'See related tasks' }],
        referenceTaskIds: ['task-a', 'task-b'],
        timestamp: now,
      });

      const json = doc.toJSON();
      expect(json.conversation[0]?.referenceTaskIds).toEqual(['task-a', 'task-b']);
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
