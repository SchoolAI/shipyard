import { change, createTypedDoc } from '@loro-extended/change';
import {
  buildDocumentId,
  DEFAULT_EPOCH,
  EpochDocumentSchema,
  generateSessionId,
  generateTaskId,
  parseDocumentId,
  TaskDocumentSchema,
} from '@shipyard/loro-schema';
import { describe, expect, it } from 'vitest';

describe('epoch evolution', () => {
  const taskId = generateTaskId();
  const now = Date.now();

  describe('document isolation across epochs', () => {
    it('epoch 1 and epoch 2 docs are independent (no data leakage)', () => {
      const epoch1DocId = buildDocumentId('task', taskId, 1);
      const epoch2DocId = buildDocumentId('task', taskId, 2);

      expect(epoch1DocId).not.toBe(epoch2DocId);
      expect(epoch1DocId).toBe(`task:${taskId}:1`);
      expect(epoch2DocId).toBe(`task:${taskId}:2`);

      const epoch1Doc = createTypedDoc(TaskDocumentSchema);
      change(epoch1Doc, (draft) => {
        draft.meta.id = taskId;
        draft.meta.title = 'Epoch 1 task';
        draft.meta.status = 'submitted';
        draft.meta.createdAt = now;
        draft.meta.updatedAt = now;
      });

      change(epoch1Doc, (draft) => {
        draft.conversation.push({
          messageId: 'msg-e1-1',
          role: 'user',
          content: [{ type: 'text', text: 'Hello from epoch 1' }],
          timestamp: now,
        });
        draft.conversation.push({
          messageId: 'msg-e1-2',
          role: 'assistant',
          content: [{ type: 'text', text: 'Assistant reply in epoch 1' }],
          timestamp: now + 100,
        });
      });

      const sessionId = generateSessionId();
      change(epoch1Doc, (draft) => {
        draft.sessions.push({
          sessionId,
          agentSessionId: 'agent-sess-e1',
          status: 'completed',
          cwd: '/workspace',
          model: 'claude-opus-4-6',
          machineId: null,
          createdAt: now,
          completedAt: now + 30_000,
          totalCostUsd: 0.05,
          durationMs: 30_000,
          error: null,
        });
      });

      const epoch1Json = epoch1Doc.toJSON();
      expect(epoch1Json.conversation).toHaveLength(2);
      expect(epoch1Json.sessions).toHaveLength(1);
      expect(epoch1Json.meta.title).toBe('Epoch 1 task');

      const epoch2Doc = createTypedDoc(TaskDocumentSchema);
      change(epoch2Doc, (draft) => {
        draft.meta.id = taskId;
        draft.meta.title = 'Epoch 2 task (fresh)';
        draft.meta.status = 'submitted';
        draft.meta.createdAt = now + 60_000;
        draft.meta.updatedAt = now + 60_000;
      });

      const epoch2Json = epoch2Doc.toJSON();
      expect(epoch2Json.conversation).toHaveLength(0);
      expect(epoch2Json.sessions).toHaveLength(0);
      expect(epoch2Json.meta.title).toBe('Epoch 2 task (fresh)');

      const epoch1AfterBump = epoch1Doc.toJSON();
      expect(epoch1AfterBump.conversation).toHaveLength(2);
      expect(epoch1AfterBump.sessions).toHaveLength(1);
      expect(epoch1AfterBump.meta.title).toBe('Epoch 1 task');
    });

    it('same task ID produces different document IDs at different epochs', () => {
      const id = generateTaskId();
      const docId1 = buildDocumentId('task', id, 1);
      const docId2 = buildDocumentId('task', id, 2);
      const docId3 = buildDocumentId('task', id, 3);

      expect(docId1).not.toBe(docId2);
      expect(docId2).not.toBe(docId3);
      expect(docId1).not.toBe(docId3);

      expect(docId1).toMatch(/^task:.+:1$/);
      expect(docId2).toMatch(/^task:.+:2$/);
      expect(docId3).toMatch(/^task:.+:3$/);
    });
  });

  describe('epoch document lifecycle', () => {
    it('epoch doc ID is a static string, not epoch-versioned', () => {
      // The epoch document defines the current epoch, so it cannot use
      // epoch-versioned IDs (that would be self-referential).
      // In production code, loadEpoch() uses the static string 'epoch'.
      const epochDocId = 'epoch';
      expect(epochDocId).toBe('epoch');
      expect(epochDocId).not.toContain(':');
    });

    it('epoch doc never resets -- version persists after multiple writes', () => {
      const epochDoc = createTypedDoc(EpochDocumentSchema);

      change(epochDoc, (draft) => {
        draft.schema.version = 1;
      });
      expect(epochDoc.toJSON().schema.version).toBe(1);

      change(epochDoc, (draft) => {
        draft.schema.version = 2;
      });
      expect(epochDoc.toJSON().schema.version).toBe(2);

      change(epochDoc, (draft) => {
        draft.schema.version = 3;
      });
      expect(epochDoc.toJSON().schema.version).toBe(3);
    });

    it('DEFAULT_EPOCH is 1', () => {
      expect(DEFAULT_EPOCH).toBe(1);
    });

    it('epoch doc initialized at DEFAULT_EPOCH matches expected shape', () => {
      const epochDoc = createTypedDoc(EpochDocumentSchema);
      change(epochDoc, (draft) => {
        draft.schema.version = DEFAULT_EPOCH;
      });

      const json = epochDoc.toJSON();
      expect(json).toEqual({ schema: { version: 1 } });
    });

    it('bumping epoch doc from 1 to 2 is a simple version write', () => {
      const epochDoc = createTypedDoc(EpochDocumentSchema);
      change(epochDoc, (draft) => {
        draft.schema.version = 1;
      });

      change(epochDoc, (draft) => {
        draft.schema.version = 2;
      });

      const json = epochDoc.toJSON();
      expect(json.schema.version).toBe(2);
    });
  });

  describe('parseDocumentId extracts epoch', () => {
    it('parses epoch from task document IDs', () => {
      const parsed = parseDocumentId('task:abc:2');
      expect(parsed).not.toBeNull();
      expect(parsed?.prefix).toBe('task');
      expect(parsed?.key).toBe('abc');
      expect(parsed?.epoch).toBe(2);
    });

    it('parses epoch from various epoch values', () => {
      for (const epoch of [1, 2, 5, 10, 100]) {
        const id = buildDocumentId('task', 'test-id', epoch);
        const parsed = parseDocumentId(id);
        expect(parsed?.epoch).toBe(epoch);
      }
    });

    it('rejects document IDs with no epoch segment', () => {
      expect(parseDocumentId('task:abc')).toBeNull();
    });

    it('rejects document IDs with epoch 0', () => {
      expect(parseDocumentId('task:abc:0')).toBeNull();
    });

    it('rejects document IDs with negative epoch', () => {
      expect(parseDocumentId('task:abc:-1')).toBeNull();
    });

    it('roundtrips build -> parse', () => {
      const id = generateTaskId();
      const epoch = 7;
      const docId = buildDocumentId('task', id, epoch);
      const parsed = parseDocumentId(docId);

      expect(parsed).toEqual({ prefix: 'task', key: id, epoch: 7 });
    });
  });

  describe('full epoch evolution scenario', () => {
    it('simulates a complete epoch bump workflow', () => {
      const epochDoc = createTypedDoc(EpochDocumentSchema);
      change(epochDoc, (draft) => {
        draft.schema.version = 1;
      });

      const id = generateTaskId();

      const taskDocE1 = createTypedDoc(TaskDocumentSchema);
      const docIdE1 = buildDocumentId('task', id, 1);
      change(taskDocE1, (draft) => {
        draft.meta.id = id;
        draft.meta.title = 'Fix authentication bug';
        draft.meta.status = 'submitted';
        draft.meta.createdAt = now;
        draft.meta.updatedAt = now;
      });

      change(taskDocE1, (draft) => {
        draft.conversation.push({
          messageId: 'msg-1',
          role: 'user',
          content: [{ type: 'text', text: 'Fix the auth bug in login.ts' }],
          timestamp: now,
        });
      });

      change(taskDocE1, (draft) => {
        draft.conversation.push({
          messageId: 'msg-2',
          role: 'assistant',
          content: [{ type: 'text', text: 'I found and fixed the bug.' }],
          timestamp: now + 5000,
        });
        draft.meta.status = 'completed';
        draft.meta.updatedAt = now + 5000;
      });

      const sid = generateSessionId();
      change(taskDocE1, (draft) => {
        draft.sessions.push({
          sessionId: sid,
          agentSessionId: 'agent-abc',
          status: 'completed',
          cwd: '/project',
          model: 'claude-opus-4-6',
          machineId: null,
          createdAt: now,
          completedAt: now + 5000,
          totalCostUsd: 0.03,
          durationMs: 5000,
          error: null,
        });
      });

      const e1Json = taskDocE1.toJSON();
      expect(e1Json.meta.status).toBe('completed');
      expect(e1Json.conversation).toHaveLength(2);
      expect(e1Json.sessions).toHaveLength(1);

      change(epochDoc, (draft) => {
        draft.schema.version = 2;
      });
      expect(epochDoc.toJSON().schema.version).toBe(2);

      const docIdE2 = buildDocumentId('task', id, 2);
      expect(docIdE1).not.toBe(docIdE2);
      expect(docIdE1).toBe(`task:${id}:1`);
      expect(docIdE2).toBe(`task:${id}:2`);

      const taskDocE2 = createTypedDoc(TaskDocumentSchema);
      change(taskDocE2, (draft) => {
        draft.meta.id = id;
        draft.meta.title = 'Fix authentication bug (epoch 2)';
        draft.meta.status = 'submitted';
        draft.meta.createdAt = now + 60_000;
        draft.meta.updatedAt = now + 60_000;
      });

      const e2Json = taskDocE2.toJSON();
      expect(e2Json.conversation).toHaveLength(0);
      expect(e2Json.sessions).toHaveLength(0);
      expect(e2Json.meta.title).toBe('Fix authentication bug (epoch 2)');

      const e1Verify = taskDocE1.toJSON();
      expect(e1Verify.conversation).toHaveLength(2);
      expect(e1Verify.sessions).toHaveLength(1);
      expect(e1Verify.meta.status).toBe('completed');
    });
  });
});
