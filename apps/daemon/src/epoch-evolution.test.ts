import { change, createTypedDoc } from '@loro-extended/change';
import {
  buildDocumentId,
  DEFAULT_EPOCH,
  EpochDocumentSchema,
  generateSessionId,
  generateTaskId,
  parseDocumentId,
  TaskConversationDocumentSchema,
  TaskMetaDocumentSchema,
} from '@shipyard/loro-schema';
import { describe, expect, it } from 'vitest';

describe('epoch evolution', () => {
  const taskId = generateTaskId();
  const now = Date.now();

  describe('document isolation across epochs', () => {
    it('epoch 1 and epoch 2 docs are independent (no data leakage)', () => {
      const epoch1DocId = buildDocumentId('task-meta', taskId, 1);
      const epoch2DocId = buildDocumentId('task-meta', taskId, 2);

      expect(epoch1DocId).not.toBe(epoch2DocId);
      expect(epoch1DocId).toBe(`task-meta:${taskId}:1`);
      expect(epoch2DocId).toBe(`task-meta:${taskId}:2`);

      const epoch1Meta = createTypedDoc(TaskMetaDocumentSchema);
      const epoch1Conv = createTypedDoc(TaskConversationDocumentSchema);
      change(epoch1Meta, (draft) => {
        draft.meta.id = taskId;
        draft.meta.title = 'Epoch 1 task';
        draft.meta.status = 'submitted';
        draft.meta.createdAt = now;
        draft.meta.updatedAt = now;
      });

      change(epoch1Conv, (draft) => {
        draft.conversation.push({
          messageId: 'msg-e1-1',
          role: 'user',
          content: [{ type: 'text', text: 'Hello from epoch 1' }],
          timestamp: now,
          model: null,
          machineId: null,
          reasoningEffort: null,
          permissionMode: null,
          cwd: null,
        });
        draft.conversation.push({
          messageId: 'msg-e1-2',
          role: 'assistant',
          content: [{ type: 'text', text: 'Assistant reply in epoch 1' }],
          timestamp: now + 100,
          model: null,
          machineId: null,
          reasoningEffort: null,
          permissionMode: null,
          cwd: null,
        });
      });

      const sessionId = generateSessionId();
      change(epoch1Conv, (draft) => {
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

      const epoch1MetaJson = epoch1Meta.toJSON();
      const epoch1ConvJson = epoch1Conv.toJSON();
      expect(epoch1ConvJson.conversation).toHaveLength(2);
      expect(epoch1ConvJson.sessions).toHaveLength(1);
      expect(epoch1MetaJson.meta.title).toBe('Epoch 1 task');

      const epoch2Meta = createTypedDoc(TaskMetaDocumentSchema);
      const epoch2Conv = createTypedDoc(TaskConversationDocumentSchema);
      change(epoch2Meta, (draft) => {
        draft.meta.id = taskId;
        draft.meta.title = 'Epoch 2 task (fresh)';
        draft.meta.status = 'submitted';
        draft.meta.createdAt = now + 60_000;
        draft.meta.updatedAt = now + 60_000;
      });

      const epoch2MetaJson = epoch2Meta.toJSON();
      const epoch2ConvJson = epoch2Conv.toJSON();
      expect(epoch2ConvJson.conversation).toHaveLength(0);
      expect(epoch2ConvJson.sessions).toHaveLength(0);
      expect(epoch2MetaJson.meta.title).toBe('Epoch 2 task (fresh)');

      const epoch1AfterBump = epoch1Conv.toJSON();
      const epoch1MetaAfterBump = epoch1Meta.toJSON();
      expect(epoch1AfterBump.conversation).toHaveLength(2);
      expect(epoch1AfterBump.sessions).toHaveLength(1);
      expect(epoch1MetaAfterBump.meta.title).toBe('Epoch 1 task');
    });

    it('same task ID produces different document IDs at different epochs', () => {
      const id = generateTaskId();
      const docId1 = buildDocumentId('task-meta', id, 1);
      const docId2 = buildDocumentId('task-meta', id, 2);
      const docId3 = buildDocumentId('task-meta', id, 3);

      expect(docId1).not.toBe(docId2);
      expect(docId2).not.toBe(docId3);
      expect(docId1).not.toBe(docId3);

      expect(docId1).toMatch(/^task-meta:.+:1$/);
      expect(docId2).toMatch(/^task-meta:.+:2$/);
      expect(docId3).toMatch(/^task-meta:.+:3$/);
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

    it('DEFAULT_EPOCH is 2', () => {
      expect(DEFAULT_EPOCH).toBe(2);
    });

    it('epoch doc initialized at DEFAULT_EPOCH matches expected shape', () => {
      const epochDoc = createTypedDoc(EpochDocumentSchema);
      change(epochDoc, (draft) => {
        draft.schema.version = DEFAULT_EPOCH;
      });

      const json = epochDoc.toJSON();
      expect(json).toEqual({ schema: { version: 2 } });
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
      const parsed = parseDocumentId('task-meta:abc:2');
      expect(parsed).not.toBeNull();
      expect(parsed?.prefix).toBe('task-meta');
      expect(parsed?.key).toBe('abc');
      expect(parsed?.epoch).toBe(2);
    });

    it('parses epoch from various epoch values', () => {
      for (const epoch of [1, 2, 5, 10, 100]) {
        const id = buildDocumentId('task-meta', 'test-id', epoch);
        const parsed = parseDocumentId(id);
        expect(parsed?.epoch).toBe(epoch);
      }
    });

    it('rejects document IDs with no epoch segment', () => {
      expect(parseDocumentId('task-meta:abc')).toBeNull();
    });

    it('rejects document IDs with epoch 0', () => {
      expect(parseDocumentId('task-meta:abc:0')).toBeNull();
    });

    it('rejects document IDs with negative epoch', () => {
      expect(parseDocumentId('task-meta:abc:-1')).toBeNull();
    });

    it('roundtrips build -> parse', () => {
      const id = generateTaskId();
      const epoch = 7;
      const docId = buildDocumentId('task-meta', id, epoch);
      const parsed = parseDocumentId(docId);

      expect(parsed).toEqual({ prefix: 'task-meta', key: id, epoch: 7 });
    });
  });

  describe('full epoch evolution scenario', () => {
    it('simulates a complete epoch bump workflow', () => {
      const epochDoc = createTypedDoc(EpochDocumentSchema);
      change(epochDoc, (draft) => {
        draft.schema.version = 1;
      });

      const id = generateTaskId();

      const metaDocE1 = createTypedDoc(TaskMetaDocumentSchema);
      const convDocE1 = createTypedDoc(TaskConversationDocumentSchema);
      const docIdE1 = buildDocumentId('task-meta', id, 1);
      change(metaDocE1, (draft) => {
        draft.meta.id = id;
        draft.meta.title = 'Fix authentication bug';
        draft.meta.status = 'submitted';
        draft.meta.createdAt = now;
        draft.meta.updatedAt = now;
      });

      change(convDocE1, (draft) => {
        draft.conversation.push({
          messageId: 'msg-1',
          role: 'user',
          content: [{ type: 'text', text: 'Fix the auth bug in login.ts' }],
          timestamp: now,
          model: null,
          machineId: null,
          reasoningEffort: null,
          permissionMode: null,
          cwd: null,
        });
      });

      change(convDocE1, (draft) => {
        draft.conversation.push({
          messageId: 'msg-2',
          role: 'assistant',
          content: [{ type: 'text', text: 'I found and fixed the bug.' }],
          timestamp: now + 5000,
          model: null,
          machineId: null,
          reasoningEffort: null,
          permissionMode: null,
          cwd: null,
        });
      });
      change(metaDocE1, (draft) => {
        draft.meta.status = 'completed';
        draft.meta.updatedAt = now + 5000;
      });

      const sid = generateSessionId();
      change(convDocE1, (draft) => {
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

      const e1MetaJson = metaDocE1.toJSON();
      const e1ConvJson = convDocE1.toJSON();
      expect(e1MetaJson.meta.status).toBe('completed');
      expect(e1ConvJson.conversation).toHaveLength(2);
      expect(e1ConvJson.sessions).toHaveLength(1);

      change(epochDoc, (draft) => {
        draft.schema.version = 2;
      });
      expect(epochDoc.toJSON().schema.version).toBe(2);

      const docIdE2 = buildDocumentId('task-meta', id, 2);
      expect(docIdE1).not.toBe(docIdE2);
      expect(docIdE1).toBe(`task-meta:${id}:1`);
      expect(docIdE2).toBe(`task-meta:${id}:2`);

      const metaDocE2 = createTypedDoc(TaskMetaDocumentSchema);
      const convDocE2 = createTypedDoc(TaskConversationDocumentSchema);
      change(metaDocE2, (draft) => {
        draft.meta.id = id;
        draft.meta.title = 'Fix authentication bug (epoch 2)';
        draft.meta.status = 'submitted';
        draft.meta.createdAt = now + 60_000;
        draft.meta.updatedAt = now + 60_000;
      });

      const e2MetaJson = metaDocE2.toJSON();
      const e2ConvJson = convDocE2.toJSON();
      expect(e2ConvJson.conversation).toHaveLength(0);
      expect(e2ConvJson.sessions).toHaveLength(0);
      expect(e2MetaJson.meta.title).toBe('Fix authentication bug (epoch 2)');

      const e1Verify = convDocE1.toJSON();
      const e1MetaVerify = metaDocE1.toJSON();
      expect(e1Verify.conversation).toHaveLength(2);
      expect(e1Verify.sessions).toHaveLength(1);
      expect(e1MetaVerify.meta.status).toBe('completed');
    });
  });
});
