import { change, createTypedDoc } from '@loro-extended/change';
import { LoroDoc } from 'loro-crdt';
import { beforeEach, describe, expect, it } from 'vitest';
import { addTaskToIndex, removeTaskFromIndex, updateTaskInIndex } from './room-helpers.js';
import { TaskIndexDocumentSchema } from './room-schema.js';

describe('TaskIndexDocumentSchema', () => {
  let doc: ReturnType<typeof createTypedDoc<typeof TaskIndexDocumentSchema>>;
  const now = Date.now();

  beforeEach(() => {
    doc = createTypedDoc(TaskIndexDocumentSchema, { doc: new LoroDoc() });
  });

  it('creates a typed doc successfully', () => {
    const json = doc.toJSON();
    expect(json.taskIndex).toEqual({});
  });

  it('can set a task index entry via record .set()', () => {
    change(doc, (draft) => {
      draft.taskIndex.set('task-1', {
        taskId: 'task-1',
        title: 'First task',
        status: 'submitted',
        createdAt: now,
        updatedAt: now,
      });
    });

    const json = doc.toJSON();
    expect(json.taskIndex['task-1']).toEqual({
      taskId: 'task-1',
      title: 'First task',
      status: 'submitted',
      createdAt: now,
      updatedAt: now,
    });
  });

  it('can read back entry via .toJSON()', () => {
    change(doc, (draft) => {
      draft.taskIndex.set('task-abc', {
        taskId: 'task-abc',
        title: 'Read test',
        status: 'working',
        createdAt: now,
        updatedAt: now,
      });
    });

    const entry = doc.toJSON().taskIndex['task-abc'];
    expect(entry).toBeDefined();
    expect(entry?.taskId).toBe('task-abc');
    expect(entry?.title).toBe('Read test');
    expect(entry?.status).toBe('working');
    expect(entry?.createdAt).toBe(now);
    expect(entry?.updatedAt).toBe(now);
  });

  it('can update an existing entry fields', () => {
    change(doc, (draft) => {
      draft.taskIndex.set('task-1', {
        taskId: 'task-1',
        title: 'Original',
        status: 'submitted',
        createdAt: now,
        updatedAt: now,
      });
    });

    const later = now + 5000;
    change(doc, (draft) => {
      const entry = draft.taskIndex.get('task-1');
      if (entry) {
        entry.title = 'Updated title';
        entry.status = 'working';
        entry.updatedAt = later;
      }
    });

    const json = doc.toJSON();
    expect(json.taskIndex['task-1']?.title).toBe('Updated title');
    expect(json.taskIndex['task-1']?.status).toBe('working');
    expect(json.taskIndex['task-1']?.updatedAt).toBe(later);
    expect(json.taskIndex['task-1']?.createdAt).toBe(now);
  });

  it('can delete an entry', () => {
    change(doc, (draft) => {
      draft.taskIndex.set('task-del', {
        taskId: 'task-del',
        title: 'To delete',
        status: 'submitted',
        createdAt: now,
        updatedAt: now,
      });
    });

    expect(doc.taskIndex.has('task-del')).toBe(true);

    change(doc, (draft) => {
      draft.taskIndex.delete('task-del');
    });

    expect(doc.taskIndex.has('task-del')).toBe(false);
    expect(doc.toJSON().taskIndex['task-del']).toBeUndefined();
  });

  it('supports multiple entries', () => {
    change(doc, (draft) => {
      draft.taskIndex.set('task-a', {
        taskId: 'task-a',
        title: 'Task A',
        status: 'submitted',
        createdAt: now,
        updatedAt: now,
      });
      draft.taskIndex.set('task-b', {
        taskId: 'task-b',
        title: 'Task B',
        status: 'working',
        createdAt: now + 1000,
        updatedAt: now + 1000,
      });
      draft.taskIndex.set('task-c', {
        taskId: 'task-c',
        title: 'Task C',
        status: 'completed',
        createdAt: now + 2000,
        updatedAt: now + 2000,
      });
    });

    const json = doc.toJSON();
    expect(Object.keys(json.taskIndex)).toHaveLength(3);
    expect(json.taskIndex['task-a']?.title).toBe('Task A');
    expect(json.taskIndex['task-b']?.title).toBe('Task B');
    expect(json.taskIndex['task-c']?.title).toBe('Task C');
  });

  it('accepts all valid A2A_TASK_STATES values', () => {
    const states = [
      'submitted',
      'starting',
      'working',
      'input-required',
      'completed',
      'canceled',
      'failed',
    ] as const;

    for (const status of states) {
      change(doc, (draft) => {
        draft.taskIndex.set(`task-${status}`, {
          taskId: `task-${status}`,
          title: `Task ${status}`,
          status,
          createdAt: now,
          updatedAt: now,
        });
      });

      expect(doc.toJSON().taskIndex[`task-${status}`]?.status).toBe(status);
    }
  });

  it('provides O(1) lookup via record keys', () => {
    change(doc, (draft) => {
      for (let i = 0; i < 10; i++) {
        draft.taskIndex.set(`task-${i}`, {
          taskId: `task-${i}`,
          title: `Task ${i}`,
          status: 'submitted',
          createdAt: now + i,
          updatedAt: now + i,
        });
      }
    });

    expect(doc.taskIndex.has('task-5')).toBe(true);
    expect(doc.taskIndex.has('task-999')).toBe(false);
    expect(doc.taskIndex.keys()).toHaveLength(10);
  });
});

describe('room helpers', () => {
  let doc: ReturnType<typeof createTypedDoc<typeof TaskIndexDocumentSchema>>;
  let loroDoc: LoroDoc;
  const now = Date.now();

  beforeEach(() => {
    loroDoc = new LoroDoc();
    doc = createTypedDoc(TaskIndexDocumentSchema, { doc: loroDoc });
  });

  describe('addTaskToIndex', () => {
    it('adds a new task entry', () => {
      addTaskToIndex(doc, {
        taskId: 'task-1',
        title: 'New task',
        status: 'submitted',
        createdAt: now,
        updatedAt: now,
      });

      const json = doc.toJSON();
      expect(json.taskIndex['task-1']).toEqual({
        taskId: 'task-1',
        title: 'New task',
        status: 'submitted',
        createdAt: now,
        updatedAt: now,
      });
    });

    it('adds multiple tasks', () => {
      addTaskToIndex(doc, {
        taskId: 'task-1',
        title: 'First',
        status: 'submitted',
        createdAt: now,
        updatedAt: now,
      });
      addTaskToIndex(doc, {
        taskId: 'task-2',
        title: 'Second',
        status: 'working',
        createdAt: now + 1000,
        updatedAt: now + 1000,
      });

      expect(Object.keys(doc.toJSON().taskIndex)).toHaveLength(2);
    });
  });

  describe('updateTaskInIndex', () => {
    beforeEach(() => {
      addTaskToIndex(doc, {
        taskId: 'task-1',
        title: 'Original',
        status: 'submitted',
        createdAt: now,
        updatedAt: now,
      });
    });

    it('updates status', () => {
      const later = now + 5000;
      updateTaskInIndex(doc, 'task-1', { status: 'working', updatedAt: later });

      const entry = doc.toJSON().taskIndex['task-1'];
      expect(entry?.status).toBe('working');
      expect(entry?.updatedAt).toBe(later);
      expect(entry?.title).toBe('Original');
    });

    it('updates title', () => {
      updateTaskInIndex(doc, 'task-1', { title: 'Renamed' });

      expect(doc.toJSON().taskIndex['task-1']?.title).toBe('Renamed');
    });

    it('updates multiple fields at once', () => {
      const later = now + 10_000;
      updateTaskInIndex(doc, 'task-1', {
        title: 'Done task',
        status: 'completed',
        updatedAt: later,
      });

      const entry = doc.toJSON().taskIndex['task-1'];
      expect(entry?.title).toBe('Done task');
      expect(entry?.status).toBe('completed');
      expect(entry?.updatedAt).toBe(later);
    });

    it('is a no-op for non-existent task', () => {
      updateTaskInIndex(doc, 'nonexistent', { status: 'working' });

      expect(doc.toJSON().taskIndex.nonexistent).toBeUndefined();
    });

    it('skips change when updates object is empty', () => {
      const opsBefore = loroDoc.opCount();

      updateTaskInIndex(doc, 'task-1', {});

      const opsAfter = loroDoc.opCount();
      expect(opsAfter).toBe(opsBefore);
    });
  });

  describe('removeTaskFromIndex', () => {
    it('removes an existing task', () => {
      addTaskToIndex(doc, {
        taskId: 'task-1',
        title: 'To remove',
        status: 'submitted',
        createdAt: now,
        updatedAt: now,
      });

      expect(doc.taskIndex.has('task-1')).toBe(true);

      removeTaskFromIndex(doc, 'task-1');

      expect(doc.taskIndex.has('task-1')).toBe(false);
      expect(doc.toJSON().taskIndex['task-1']).toBeUndefined();
    });

    it('is safe to call for non-existent task', () => {
      removeTaskFromIndex(doc, 'nonexistent');

      expect(doc.toJSON().taskIndex).toEqual({});
    });

    it('does not create operations when removing non-existent task', () => {
      const opsBefore = loroDoc.opCount();

      removeTaskFromIndex(doc, 'nonexistent');

      const opsAfter = loroDoc.opCount();
      expect(opsAfter).toBe(opsBefore);
    });
  });
});

describe('concurrent CRDT merge', () => {
  const now = Date.now();

  it('merges concurrent updates to different fields on the same entry', () => {
    const loroDoc1 = new LoroDoc();
    loroDoc1.setPeerId(BigInt(1));
    const doc1 = createTypedDoc(TaskIndexDocumentSchema, { doc: loroDoc1 });

    const loroDoc2 = new LoroDoc();
    loroDoc2.setPeerId(BigInt(2));
    const doc2 = createTypedDoc(TaskIndexDocumentSchema, { doc: loroDoc2 });

    change(doc1, (draft) => {
      draft.taskIndex.set('task-1', {
        taskId: 'task-1',
        title: 'Original',
        status: 'submitted',
        createdAt: now,
        updatedAt: now,
      });
    });

    loroDoc2.import(loroDoc1.export({ mode: 'snapshot' }));

    change(doc1, (draft) => {
      const entry = draft.taskIndex.get('task-1');
      if (entry) {
        entry.title = 'Updated by peer 1';
      }
    });

    change(doc2, (draft) => {
      const entry = draft.taskIndex.get('task-1');
      if (entry) {
        entry.status = 'working';
      }
    });

    loroDoc2.import(loroDoc1.export({ mode: 'update', from: loroDoc2.version() }));

    const merged = doc2.toJSON();
    expect(merged.taskIndex['task-1']?.title).toBe('Updated by peer 1');
    expect(merged.taskIndex['task-1']?.status).toBe('working');
    expect(merged.taskIndex['task-1']?.createdAt).toBe(now);
  });

  it('last-writer-wins for concurrent updates to the same field', () => {
    const loroDoc1 = new LoroDoc();
    loroDoc1.setPeerId(BigInt(10));
    const doc1 = createTypedDoc(TaskIndexDocumentSchema, { doc: loroDoc1 });

    const loroDoc2 = new LoroDoc();
    loroDoc2.setPeerId(BigInt(20));
    const doc2 = createTypedDoc(TaskIndexDocumentSchema, { doc: loroDoc2 });

    change(doc1, (draft) => {
      draft.taskIndex.set('task-1', {
        taskId: 'task-1',
        title: 'Original',
        status: 'submitted',
        createdAt: now,
        updatedAt: now,
      });
    });

    loroDoc2.import(loroDoc1.export({ mode: 'snapshot' }));

    change(doc1, (draft) => {
      const entry = draft.taskIndex.get('task-1');
      if (entry) {
        entry.title = 'Title from peer 1';
      }
    });

    change(doc2, (draft) => {
      const entry = draft.taskIndex.get('task-1');
      if (entry) {
        entry.title = 'Title from peer 2';
      }
    });

    loroDoc2.import(loroDoc1.export({ mode: 'update', from: loroDoc2.version() }));
    loroDoc1.import(loroDoc2.export({ mode: 'update', from: loroDoc1.version() }));

    const json1 = doc1.toJSON();
    const json2 = doc2.toJSON();
    expect(json1.taskIndex['task-1']?.title).toBe(json2.taskIndex['task-1']?.title);
  });

  it('preserves independent entries from concurrent adds', () => {
    const loroDoc1 = new LoroDoc();
    loroDoc1.setPeerId(BigInt(100));
    const doc1 = createTypedDoc(TaskIndexDocumentSchema, { doc: loroDoc1 });

    const loroDoc2 = new LoroDoc();
    loroDoc2.setPeerId(BigInt(200));
    const doc2 = createTypedDoc(TaskIndexDocumentSchema, { doc: loroDoc2 });

    loroDoc2.import(loroDoc1.export({ mode: 'snapshot' }));

    change(doc1, (draft) => {
      draft.taskIndex.set('task-a', {
        taskId: 'task-a',
        title: 'Task A from peer 1',
        status: 'submitted',
        createdAt: now,
        updatedAt: now,
      });
    });

    change(doc2, (draft) => {
      draft.taskIndex.set('task-b', {
        taskId: 'task-b',
        title: 'Task B from peer 2',
        status: 'working',
        createdAt: now + 1000,
        updatedAt: now + 1000,
      });
    });

    loroDoc2.import(loroDoc1.export({ mode: 'update', from: loroDoc2.version() }));

    const merged = doc2.toJSON();
    expect(Object.keys(merged.taskIndex)).toHaveLength(2);
    expect(merged.taskIndex['task-a']?.title).toBe('Task A from peer 1');
    expect(merged.taskIndex['task-b']?.title).toBe('Task B from peer 2');
  });
});
