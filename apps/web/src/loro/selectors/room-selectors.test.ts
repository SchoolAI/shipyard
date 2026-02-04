import type { TaskId } from '@shipyard/loro-schema';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useInboxEvents,
  useRoomHandle,
  useTaskIds,
  useTaskIndex,
  useTaskIndexEntry,
  useTasksWithPendingRequests,
} from './room-selectors';

const mockUseHandle = vi.fn();
const mockUseDoc = vi.fn();

vi.mock('@loro-extended/react', () => ({
  useHandle: (...args: unknown[]) => mockUseHandle(...args),
  useDoc: (...args: unknown[]) => mockUseDoc(...args),
}));

describe('room-selectors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useRoomHandle', () => {
    it('calls useHandle with room doc id and schema', () => {
      const mockHandle = { doc: {}, presence: {} };
      mockUseHandle.mockReturnValue(mockHandle);

      const { result } = renderHook(() => useRoomHandle());

      expect(mockUseHandle).toHaveBeenCalledWith('room', expect.anything(), expect.anything());
      expect(result.current).toBe(mockHandle);
    });
  });

  describe('useTaskIndex', () => {
    it('returns entire task index', () => {
      const mockHandle = { doc: {} };
      const mockTaskIndex = {
        task_1: {
          taskId: 'task_1',
          title: 'Task One',
          status: 'draft',
          hasPendingRequests: false,
          lastUpdated: 1000,
        },
        task_2: {
          taskId: 'task_2',
          title: 'Task Two',
          status: 'in_progress',
          hasPendingRequests: true,
          lastUpdated: 2000,
        },
      };

      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { taskIndex: mockTaskIndex };
        return selector(doc);
      });

      const { result } = renderHook(() => useTaskIndex());

      expect(result.current).toEqual(mockTaskIndex);
    });

    it('returns empty object when no tasks exist', () => {
      const mockHandle = { doc: {} };
      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { taskIndex: {} };
        return selector(doc);
      });

      const { result } = renderHook(() => useTaskIndex());

      expect(result.current).toEqual({});
    });
  });

  describe('useTaskIndexEntry', () => {
    it('returns specific task entry by id', () => {
      const testTaskId = 'task_123' as TaskId;
      const mockHandle = { doc: {} };
      const mockEntry = {
        taskId: testTaskId,
        title: 'Specific Task',
        status: 'completed',
        hasPendingRequests: false,
        lastUpdated: 3000,
      };

      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { taskIndex: { [testTaskId]: mockEntry } };
        return selector(doc);
      });

      const { result } = renderHook(() => useTaskIndexEntry(testTaskId));

      expect(result.current).toEqual(mockEntry);
    });

    it('returns undefined for non-existent task', () => {
      const testTaskId = 'task_nonexistent' as TaskId;
      const mockHandle = { doc: {} };

      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { taskIndex: {} };
        return selector(doc);
      });

      const { result } = renderHook(() => useTaskIndexEntry(testTaskId));

      expect(result.current).toBeUndefined();
    });
  });

  describe('useInboxEvents', () => {
    it('aggregates inbox events from all tasks', () => {
      const mockHandle = { doc: {} };
      const mockTaskIndex = {
        task_1: {
          taskId: 'task_1',
          inboxEvents: [
            {
              id: 'evt-1',
              type: 'task_created',
              timestamp: 1000,
              inboxWorthy: true,
            },
          ],
        },
        task_2: {
          taskId: 'task_2',
          inboxEvents: [
            {
              id: 'evt-2',
              type: 'comment_added',
              timestamp: 3000,
              inboxWorthy: true,
            },
            {
              id: 'evt-3',
              type: 'status_changed',
              timestamp: 2000,
              inboxWorthy: true,
            },
          ],
        },
      };

      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { taskIndex: mockTaskIndex };
        return selector(doc);
      });

      const { result } = renderHook(() => useInboxEvents());

      expect(result.current).toHaveLength(3);
      expect(result.current[0]?.event.id).toBe('evt-2');
      expect(result.current[0]?.taskId).toBe('task_2');
      expect(result.current[1]?.event.id).toBe('evt-3');
      expect(result.current[2]?.event.id).toBe('evt-1');
    });

    it('returns events sorted by timestamp descending', () => {
      const mockHandle = { doc: {} };
      const mockTaskIndex = {
        task_1: {
          taskId: 'task_1',
          inboxEvents: [
            { id: 'evt-old', type: 'task_created', timestamp: 1000 },
            { id: 'evt-new', type: 'completed', timestamp: 5000 },
          ],
        },
      };

      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { taskIndex: mockTaskIndex };
        return selector(doc);
      });

      const { result } = renderHook(() => useInboxEvents());

      expect(result.current[0]?.event.id).toBe('evt-new');
      expect(result.current[1]?.event.id).toBe('evt-old');
    });

    it('returns empty array when no inbox events', () => {
      const mockHandle = { doc: {} };
      const mockTaskIndex = {
        task_1: { taskId: 'task_1', inboxEvents: [] },
        task_2: { taskId: 'task_2', inboxEvents: [] },
      };

      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { taskIndex: mockTaskIndex };
        return selector(doc);
      });

      const { result } = renderHook(() => useInboxEvents());

      expect(result.current).toEqual([]);
    });
  });

  describe('useTasksWithPendingRequests', () => {
    it('returns only tasks with hasPendingRequests true', () => {
      const mockHandle = { doc: {} };
      const mockTaskIndex = {
        task_1: {
          taskId: 'task_1',
          title: 'Task One',
          hasPendingRequests: false,
        },
        task_2: {
          taskId: 'task_2',
          title: 'Task Two',
          hasPendingRequests: true,
        },
        task_3: {
          taskId: 'task_3',
          title: 'Task Three',
          hasPendingRequests: true,
        },
      };

      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { taskIndex: mockTaskIndex };
        return selector(doc);
      });

      const { result } = renderHook(() => useTasksWithPendingRequests());

      expect(result.current).toHaveLength(2);
      expect(result.current.map((t) => t.taskId)).toContain('task_2');
      expect(result.current.map((t) => t.taskId)).toContain('task_3');
    });

    it('returns empty array when no pending requests', () => {
      const mockHandle = { doc: {} };
      const mockTaskIndex = {
        task_1: { taskId: 'task_1', hasPendingRequests: false },
        task_2: { taskId: 'task_2', hasPendingRequests: false },
      };

      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { taskIndex: mockTaskIndex };
        return selector(doc);
      });

      const { result } = renderHook(() => useTasksWithPendingRequests());

      expect(result.current).toEqual([]);
    });
  });

  describe('useTaskIds', () => {
    it('returns array of all task ids', () => {
      const mockHandle = { doc: {} };
      const mockTaskIndex = {
        task_abc: { taskId: 'task_abc' },
        task_def: { taskId: 'task_def' },
        task_ghi: { taskId: 'task_ghi' },
      };

      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { taskIndex: mockTaskIndex };
        return selector(doc);
      });

      const { result } = renderHook(() => useTaskIds());

      expect(result.current).toHaveLength(3);
      expect(result.current).toContain('task_abc' as TaskId);
      expect(result.current).toContain('task_def' as TaskId);
      expect(result.current).toContain('task_ghi' as TaskId);
    });

    it('returns empty array when no tasks', () => {
      const mockHandle = { doc: {} };
      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { taskIndex: {} };
        return selector(doc);
      });

      const { result } = renderHook(() => useTaskIds());

      expect(result.current).toEqual([]);
    });
  });
});
