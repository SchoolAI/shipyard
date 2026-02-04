import { createTypedDoc } from '@loro-extended/change';
import { LoroDoc } from 'loro-crdt';
import { beforeEach, describe, expect, it } from 'vitest';
import { generateTaskId, type TaskId } from '../ids.js';
import { RoomSchema, TaskDocumentSchema } from '../shapes.js';
import { TaskDocument } from './document.js';

describe('TaskDocument', () => {
  let taskDoc: ReturnType<typeof createTypedDoc<typeof TaskDocumentSchema>>;
  let roomDoc: ReturnType<typeof createTypedDoc<typeof RoomSchema>>;
  let taskId: TaskId;
  let task: TaskDocument;

  beforeEach(() => {
    taskId = generateTaskId();
    taskDoc = createTypedDoc(TaskDocumentSchema, new LoroDoc());
    roomDoc = createTypedDoc(RoomSchema, new LoroDoc());

    // Initialize task metadata
    taskDoc.meta.id = taskId;
    taskDoc.meta.title = 'Test Task';
    taskDoc.meta.status = 'draft';
    taskDoc.meta.createdAt = Date.now();
    taskDoc.meta.updatedAt = Date.now();
    taskDoc.meta.completedAt = null;
    taskDoc.meta.completedBy = null;
    taskDoc.meta.ownerId = 'test-user';
    taskDoc.meta.epoch = null;
    taskDoc.meta.repo = null;
    taskDoc.meta.archivedAt = null;
    taskDoc.meta.archivedBy = null;

    // Initialize task index entry
    roomDoc.taskIndex.set(taskId, {
      taskId,
      title: 'Test Task',
      status: 'draft',
      ownerId: 'test-user',
      hasPendingRequests: false,
      lastUpdated: Date.now(),
      createdAt: Date.now(),
      viewedBy: {},
      eventViewedBy: {},
      inboxEvents: [],
    });

    task = new TaskDocument(taskDoc, roomDoc, taskId);
  });

  describe('Container Accessors', () => {
    it('should expose taskId', () => {
      expect(task.taskId).toBe(taskId);
    });

    it('should expose taskDoc', () => {
      expect(task.taskDoc).toBe(taskDoc);
    });

    it('should expose roomDoc', () => {
      expect(task.roomDoc).toBe(roomDoc);
    });
  });

  describe('updateStatus', () => {
    it('should update task status in task doc', () => {
      task.updateStatus('in_progress', 'test-user');
      expect(taskDoc.meta.status).toBe('in_progress');
    });

    it('should update status in room index', () => {
      task.updateStatus('in_progress', 'test-user');
      const entry = roomDoc.taskIndex.get(taskId);
      expect(entry?.status).toBe('in_progress');
    });

    it('should update lastUpdated timestamps in both docs', () => {
      const before = Date.now();
      task.updateStatus('in_progress', 'test-user');
      const after = Date.now();

      expect(taskDoc.meta.updatedAt).toBeGreaterThanOrEqual(before);
      expect(taskDoc.meta.updatedAt).toBeLessThanOrEqual(after);

      const entry = roomDoc.taskIndex.get(taskId);
      expect(entry?.lastUpdated).toBeGreaterThanOrEqual(before);
      expect(entry?.lastUpdated).toBeLessThanOrEqual(after);
    });

    it('should set completedAt and completedBy when status is completed', () => {
      task.updateStatus('completed', 'test-user');
      expect(taskDoc.meta.completedAt).toBeGreaterThan(0);
      expect(taskDoc.meta.completedBy).toBe('test-user');
    });

    it('should log status_changed event', () => {
      task.updateStatus('in_progress', 'test-user');
      const events = taskDoc.events.toJSON();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('status_changed');
      expect(events[0]?.actor).toBe('test-user');
    });
  });

  describe('syncTitleToRoom', () => {
    it('should sync title from task doc to room index', () => {
      taskDoc.meta.title = 'Updated Title';
      task.syncTitleToRoom();
      const entry = roomDoc.taskIndex.get(taskId);
      expect(entry?.title).toBe('Updated Title');
    });

    it('should update lastUpdated in room index', () => {
      const before = Date.now();
      taskDoc.meta.title = 'New Title';
      task.syncTitleToRoom();
      const after = Date.now();

      const entry = roomDoc.taskIndex.get(taskId);
      expect(entry?.lastUpdated).toBeGreaterThanOrEqual(before);
      expect(entry?.lastUpdated).toBeLessThanOrEqual(after);
    });
  });

  describe('syncPendingRequestsToRoom', () => {
    it('should set hasPendingRequests to true when pending requests exist', () => {
      taskDoc.inputRequests.push({
        type: 'text',
        id: 'req-1',
        message: 'Test?',
        status: 'pending',
        createdAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        response: null,
        answeredAt: null,
        answeredBy: null,
        isBlocker: null,
        defaultValue: null,
        placeholder: null,
      });

      task.syncPendingRequestsToRoom();
      const entry = roomDoc.taskIndex.get(taskId);
      expect(entry?.hasPendingRequests).toBe(true);
    });

    it('should set hasPendingRequests to false when no pending requests', () => {
      task.syncPendingRequestsToRoom();
      const entry = roomDoc.taskIndex.get(taskId);
      expect(entry?.hasPendingRequests).toBe(false);
    });

    it('should set hasPendingRequests to false when all requests answered', () => {
      taskDoc.inputRequests.push({
        type: 'text',
        id: 'req-1',
        message: 'Test?',
        status: 'answered',
        createdAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        response: 'answer',
        answeredAt: Date.now(),
        answeredBy: 'user',
        isBlocker: null,
        defaultValue: null,
        placeholder: null,
      });

      task.syncPendingRequestsToRoom();
      const entry = roomDoc.taskIndex.get(taskId);
      expect(entry?.hasPendingRequests).toBe(false);
    });
  });

  describe('logEvent', () => {
    it('should add event to task doc events', () => {
      task.logEvent('task_created', 'test-user');
      const events = taskDoc.events.toJSON();
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe('task_created');
    });

    it('should auto-generate event ID', () => {
      const eventId = task.logEvent('task_created', 'test-user');
      expect(eventId).toBeTruthy();
      const events = taskDoc.events.toJSON();
      expect(events[0]?.id).toBe(eventId);
    });

    it('should add inbox-worthy event to room index', () => {
      task.logEvent(
        'input_request_created',
        'test-user',
        { requestId: 'req-1', message: 'Test?' },
        {
          inboxWorthy: true,
        }
      );

      const entry = roomDoc.taskIndex.get(taskId);
      const inboxEvents = entry?.inboxEvents.toJSON();
      expect(inboxEvents).toHaveLength(1);
      expect(inboxEvents?.[0]?.type).toBe('input_request_created');
    });

    it('should not add non-inbox-worthy event to room index', () => {
      task.logEvent('task_created', 'test-user', undefined, {
        inboxWorthy: false,
      });

      const entry = roomDoc.taskIndex.get(taskId);
      const inboxEvents = entry?.inboxEvents.toJSON();
      expect(inboxEvents).toHaveLength(0);
    });

    it('should support inboxFor field', () => {
      task.logEvent(
        'comment_added',
        'test-user',
        { commentId: 'c1', threadId: null, preview: null },
        {
          inboxWorthy: true,
          inboxFor: 'owner',
        }
      );

      const events = taskDoc.events.toJSON();
      expect(events[0]?.inboxFor).toBe('owner');
    });
  });

  describe('Edge Cases & Failure Modes', () => {
    it('should handle missing task in room index gracefully', () => {
      roomDoc.taskIndex.delete(taskId);
      expect(() => task.updateStatus('in_progress', 'user')).not.toThrow();
    });

    it('should handle concurrent status updates from different peers', () => {
      task.updateStatus('in_progress', 'peer-a');
      task.updateStatus('completed', 'peer-b');
      expect(taskDoc.meta.status).toBe('completed');
      const events = taskDoc.events.toJSON();
      expect(events.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle syncPendingRequestsToRoom when task not in index', () => {
      roomDoc.taskIndex.delete(taskId);
      expect(() => task.syncPendingRequestsToRoom()).not.toThrow();
    });

    it('should handle syncTitleToRoom when task not in index', () => {
      roomDoc.taskIndex.delete(taskId);
      expect(() => task.syncTitleToRoom()).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('should not throw when disposed', () => {
      expect(() => task.dispose()).not.toThrow();
    });
  });
});
