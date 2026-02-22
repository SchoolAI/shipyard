import { createTypedDoc } from '@loro-extended/change';
import { LoroDoc } from 'loro-crdt';
import { describe, expect, it } from 'vitest';
import { buildDocumentId, DEFAULT_EPOCH, parseDocumentId } from './epoch.js';
import { generateSessionId, generateTaskId } from './ids.js';
import {
  EpochDocumentSchema,
  TaskConversationDocumentSchema,
  TaskMetaDocumentSchema,
  TaskReviewDocumentSchema,
} from './shapes.js';

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

describe('document ID helpers', () => {
  it('builds epoch-versioned document IDs', () => {
    expect(buildDocumentId('task-meta', 'abc123', 1)).toBe('task-meta:abc123:1');
    expect(buildDocumentId('task-meta', 'abc123', 2)).toBe('task-meta:abc123:2');
    expect(buildDocumentId('room', 'xyz', 5)).toBe('room:xyz:5');
  });

  it('parses epoch-versioned document IDs', () => {
    const result = parseDocumentId('task-meta:abc123:2');
    expect(result).toEqual({ prefix: 'task-meta', key: 'abc123', epoch: 2 });
  });

  it('returns null for invalid IDs', () => {
    expect(parseDocumentId('task-meta:abc123')).toBe(null);
    expect(parseDocumentId('task-meta')).toBe(null);
    expect(parseDocumentId('')).toBe(null);
    expect(parseDocumentId('task-meta:abc:0')).toBe(null);
    expect(parseDocumentId('task-meta:abc:-1')).toBe(null);
    expect(parseDocumentId('task-meta:abc:xyz')).toBe(null);
  });

  it('roundtrips build/parse', () => {
    const id = buildDocumentId('task-review', 'my-task', 3);
    const parsed = parseDocumentId(id);
    expect(parsed).toEqual({ prefix: 'task-review', key: 'my-task', epoch: 3 });
  });
});

describe('TaskMetaDocumentSchema', () => {
  it('creates a valid typed document', () => {
    const doc = createTypedDoc(TaskMetaDocumentSchema, { doc: new LoroDoc() });
    const json = doc.toJSON();

    expect(json).toHaveProperty('meta');
    expect(json.meta).toHaveProperty('id');
    expect(json.meta).toHaveProperty('title');
    expect(json.meta).toHaveProperty('status');
    expect(json.meta).toHaveProperty('createdAt');
    expect(json.meta).toHaveProperty('updatedAt');
  });

  it('supports field-level updates via change()', () => {
    const taskId = generateTaskId();
    const now = Date.now();
    const doc = createTypedDoc(TaskMetaDocumentSchema, { doc: new LoroDoc() });

    doc.meta.id = taskId;
    doc.meta.title = 'Meta task';
    doc.meta.status = 'submitted';
    doc.meta.createdAt = now;
    doc.meta.updatedAt = now;

    const json = doc.toJSON();
    expect(json.meta.id).toBe(taskId);
    expect(json.meta.title).toBe('Meta task');
    expect(json.meta.status).toBe('submitted');
    expect(json.meta.createdAt).toBe(now);
    expect(json.meta.updatedAt).toBe(now);

    doc.meta.title = 'Updated meta task';
    doc.meta.status = 'working';
    doc.meta.updatedAt = now + 1000;

    const updated = doc.toJSON();
    expect(updated.meta.title).toBe('Updated meta task');
    expect(updated.meta.status).toBe('working');
    expect(updated.meta.updatedAt).toBe(now + 1000);
  });

  it('merges concurrent meta changes across peers', () => {
    const taskId = generateTaskId();
    const now = Date.now();

    const loroDoc1 = new LoroDoc();
    loroDoc1.setPeerId(BigInt(1));
    const doc1 = createTypedDoc(TaskMetaDocumentSchema, { doc: loroDoc1 });

    doc1.meta.id = taskId;
    doc1.meta.title = 'Initial title';
    doc1.meta.status = 'submitted';
    doc1.meta.createdAt = now;
    doc1.meta.updatedAt = now;

    const loroDoc2 = new LoroDoc();
    loroDoc2.setPeerId(BigInt(2));
    loroDoc2.import(loroDoc1.export({ mode: 'snapshot' }));
    const doc2 = createTypedDoc(TaskMetaDocumentSchema, { doc: loroDoc2 });

    doc1.meta.title = 'Title from peer 1';
    doc2.meta.status = 'working';

    loroDoc1.import(loroDoc2.export({ mode: 'snapshot' }));
    loroDoc2.import(loroDoc1.export({ mode: 'snapshot' }));

    const json1 = doc1.toJSON();
    const json2 = doc2.toJSON();

    expect(json1.meta.title).toBe('Title from peer 1');
    expect(json1.meta.status).toBe('working');
    expect(json1).toEqual(json2);
  });
});

describe('TaskConversationDocumentSchema', () => {
  it('creates a valid typed document', () => {
    const doc = createTypedDoc(TaskConversationDocumentSchema, { doc: new LoroDoc() });
    const json = doc.toJSON();

    expect(json).toHaveProperty('conversation');
    expect(json).toHaveProperty('pendingFollowUps');
    expect(json).toHaveProperty('sessions');
    expect(json).toHaveProperty('diffState');
    expect(Array.isArray(json.conversation)).toBe(true);
    expect(Array.isArray(json.pendingFollowUps)).toBe(true);
    expect(Array.isArray(json.sessions)).toBe(true);
  });

  it('appends messages to conversation', () => {
    const now = Date.now();
    const doc = createTypedDoc(TaskConversationDocumentSchema, { doc: new LoroDoc() });

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

    doc.conversation.push({
      messageId: 'msg-2',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello human' }],
      timestamp: now + 1000,
      model: 'claude-opus-4-6',
      machineId: null,
      reasoningEffort: null,
      permissionMode: null,
      cwd: null,
    });

    const json = doc.toJSON();
    expect(json.conversation).toHaveLength(2);
    expect(json.conversation[0]?.role).toBe('user');
    expect(json.conversation[1]?.role).toBe('assistant');
    if (json.conversation[1]?.content[0]?.type === 'text') {
      expect(json.conversation[1].content[0].text).toBe('Hello human');
    }
  });

  it('tracks sessions', () => {
    const now = Date.now();
    const sessionId = generateSessionId();
    const doc = createTypedDoc(TaskConversationDocumentSchema, { doc: new LoroDoc() });

    doc.sessions.push({
      sessionId,
      agentSessionId: 'sdk-session-conv-1',
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

    doc.sessions.push({
      sessionId: generateSessionId(),
      agentSessionId: 'sdk-session-conv-2',
      status: 'completed',
      cwd: '/home/user/project',
      model: null,
      machineId: null,
      createdAt: now + 1000,
      completedAt: now + 60_000,
      totalCostUsd: 0.12,
      durationMs: 59_000,
      error: null,
    });

    const json = doc.toJSON();
    expect(json.sessions).toHaveLength(2);
    expect(json.sessions[0]?.sessionId).toBe(sessionId);
    expect(json.sessions[0]?.status).toBe('active');
    expect(json.sessions[1]?.status).toBe('completed');
    expect(json.sessions[1]?.totalCostUsd).toBe(0.12);
  });

  it('manages pending follow-ups', () => {
    const now = Date.now();
    const doc = createTypedDoc(TaskConversationDocumentSchema, { doc: new LoroDoc() });

    doc.pendingFollowUps.push({
      messageId: 'followup-1',
      role: 'user',
      content: [{ type: 'text', text: 'Also fix the tests' }],
      timestamp: now,
      model: null,
      machineId: null,
      reasoningEffort: null,
      permissionMode: null,
      cwd: null,
    });

    doc.pendingFollowUps.push({
      messageId: 'followup-2',
      role: 'user',
      content: [{ type: 'text', text: 'And update the docs' }],
      timestamp: now + 500,
      model: null,
      machineId: null,
      reasoningEffort: null,
      permissionMode: null,
      cwd: null,
    });

    const json = doc.toJSON();
    expect(json.pendingFollowUps).toHaveLength(2);
    expect(json.pendingFollowUps[0]?.messageId).toBe('followup-1');
    if (json.pendingFollowUps[0]?.content[0]?.type === 'text') {
      expect(json.pendingFollowUps[0].content[0].text).toBe('Also fix the tests');
    }
    expect(json.pendingFollowUps[1]?.messageId).toBe('followup-2');
  });
});

describe('TaskReviewDocumentSchema', () => {
  it('creates a valid typed document', () => {
    const doc = createTypedDoc(TaskReviewDocumentSchema, { doc: new LoroDoc() });
    const json = doc.toJSON();

    expect(json).toHaveProperty('plans');
    expect(json).toHaveProperty('planEditorDocs');
    expect(json).toHaveProperty('diffComments');
    expect(json).toHaveProperty('planComments');
    expect(json).toHaveProperty('deliveredCommentIds');
    expect(Array.isArray(json.plans)).toBe(true);
    expect(Array.isArray(json.deliveredCommentIds)).toBe(true);
  });

  it('stores plan versions', () => {
    const now = Date.now();
    const doc = createTypedDoc(TaskReviewDocumentSchema, { doc: new LoroDoc() });

    doc.plans.push({
      planId: 'plan-1',
      toolUseId: 'tu-exit-1',
      markdown: '# Plan v1\n\n- Step 1: Read the code\n- Step 2: Fix the bug',
      reviewStatus: 'pending',
      reviewFeedback: null,
      createdAt: now,
    });

    doc.plans.push({
      planId: 'plan-2',
      toolUseId: 'tu-exit-2',
      markdown:
        '# Plan v2\n\n- Step 1: Read the code\n- Step 2: Write tests\n- Step 3: Fix the bug',
      reviewStatus: 'approved',
      reviewFeedback: 'Looks good with the added tests',
      createdAt: now + 30_000,
    });

    const json = doc.toJSON();
    expect(json.plans).toHaveLength(2);
    expect(json.plans[0]?.planId).toBe('plan-1');
    expect(json.plans[0]?.reviewStatus).toBe('pending');
    expect(json.plans[1]?.planId).toBe('plan-2');
    expect(json.plans[1]?.reviewStatus).toBe('approved');
    expect(json.plans[1]?.reviewFeedback).toBe('Looks good with the added tests');
  });

  it('manages diff comments via record', () => {
    const now = Date.now();
    const doc = createTypedDoc(TaskReviewDocumentSchema, { doc: new LoroDoc() });

    doc.diffComments.set('cmt-r1', {
      commentId: 'cmt-r1',
      filePath: 'src/handler.ts',
      lineNumber: 15,
      side: 'new',
      diffScope: 'working-tree',
      lineContentHash: 'hash-r1',
      body: 'This function should validate input',
      authorType: 'human',
      authorId: 'user-1',
      createdAt: now,
      resolvedAt: null,
    });

    doc.diffComments.set('cmt-r2', {
      commentId: 'cmt-r2',
      filePath: 'src/handler.ts',
      lineNumber: 30,
      side: 'old',
      diffScope: 'last-turn',
      lineContentHash: 'hash-r2',
      body: 'Why was this removed?',
      authorType: 'human',
      authorId: 'user-1',
      createdAt: now + 1000,
      resolvedAt: null,
    });

    const json = doc.toJSON();
    expect(Object.keys(json.diffComments)).toHaveLength(2);
    expect(json.diffComments['cmt-r1']?.body).toBe('This function should validate input');
    expect(json.diffComments['cmt-r2']?.side).toBe('old');

    const entry = doc.diffComments.get('cmt-r1');
    if (entry) {
      doc.diffComments.set('cmt-r1', { ...entry, resolvedAt: now + 5000 });
    }
    expect(doc.toJSON().diffComments['cmt-r1']?.resolvedAt).toBe(now + 5000);
  });

  it('manages plan comments via record', () => {
    const now = Date.now();
    const doc = createTypedDoc(TaskReviewDocumentSchema, { doc: new LoroDoc() });

    doc.planComments.set('pcmt-1', {
      commentId: 'pcmt-1',
      planId: 'plan-1',
      from: 10,
      to: 45,
      body: 'Step 2 needs more detail',
      authorType: 'human',
      authorId: 'user-1',
      createdAt: now,
      resolvedAt: null,
    });

    doc.planComments.set('pcmt-2', {
      commentId: 'pcmt-2',
      planId: 'plan-1',
      from: 50,
      to: 80,
      body: 'Consider edge cases here',
      authorType: 'agent',
      authorId: 'claude-1',
      createdAt: now + 2000,
      resolvedAt: null,
    });

    const json = doc.toJSON();
    expect(Object.keys(json.planComments)).toHaveLength(2);
    expect(json.planComments['pcmt-1']?.body).toBe('Step 2 needs more detail');
    expect(json.planComments['pcmt-1']?.planId).toBe('plan-1');
    expect(json.planComments['pcmt-2']?.authorType).toBe('agent');

    const entry = doc.planComments.get('pcmt-2');
    if (entry) {
      doc.planComments.set('pcmt-2', { ...entry, resolvedAt: now + 10_000 });
    }
    expect(doc.toJSON().planComments['pcmt-2']?.resolvedAt).toBe(now + 10_000);
  });

  it('tracks delivered comment IDs', () => {
    const doc = createTypedDoc(TaskReviewDocumentSchema, { doc: new LoroDoc() });

    doc.deliveredCommentIds.push('cmt-r1');
    doc.deliveredCommentIds.push('cmt-r2');
    doc.deliveredCommentIds.push('pcmt-1');

    const json = doc.toJSON();
    expect(json.deliveredCommentIds).toHaveLength(3);
    expect(json.deliveredCommentIds[0]).toBe('cmt-r1');
    expect(json.deliveredCommentIds[1]).toBe('cmt-r2');
    expect(json.deliveredCommentIds[2]).toBe('pcmt-1');
  });
});
