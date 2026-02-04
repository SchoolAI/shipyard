import type { TaskId } from '@shipyard/loro-schema';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskDocument } from './use-task-document';

const mockUseTaskHandle = vi.fn();
const mockUseRoomHandle = vi.fn();

vi.mock('./selectors/task-selectors', () => ({
  useTaskHandle: (...args: unknown[]) => mockUseTaskHandle(...args),
}));

vi.mock('./selectors/room-selectors', () => ({
  useRoomHandle: () => mockUseRoomHandle(),
}));

const mockDispose = vi.fn();
const constructorCalls: Array<{
  taskDoc: unknown;
  roomDoc: unknown;
  taskId: string;
}> = [];

vi.mock('@shipyard/loro-schema', () => {
  return {
    TaskDocument: class {
      taskDoc: unknown;
      roomDoc: unknown;
      taskId: string;
      dispose = mockDispose;

      constructor(taskDoc: unknown, roomDoc: unknown, taskId: string) {
        this.taskDoc = taskDoc;
        this.roomDoc = roomDoc;
        this.taskId = taskId;
        constructorCalls.push({ taskDoc, roomDoc, taskId });
      }
    },
  };
});

describe('useTaskDocument', () => {
  const testTaskId = 'task_test123' as TaskId;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDispose.mockClear();
    constructorCalls.length = 0;
  });

  describe('document retrieval', () => {
    it('creates TaskDocument with correct handles and taskId', () => {
      const mockTaskDoc = { id: 'task-doc' };
      const mockRoomDoc = { id: 'room-doc' };
      const mockTaskHandle = { doc: mockTaskDoc };
      const mockRoomHandle = { doc: mockRoomDoc };

      mockUseTaskHandle.mockReturnValue(mockTaskHandle);
      mockUseRoomHandle.mockReturnValue(mockRoomHandle);

      const { result } = renderHook(() => useTaskDocument(testTaskId));

      expect(mockUseTaskHandle).toHaveBeenCalledWith(testTaskId);
      expect(mockUseRoomHandle).toHaveBeenCalled();
      expect(constructorCalls).toHaveLength(1);
      expect(constructorCalls[0]).toEqual({
        taskDoc: mockTaskDoc,
        roomDoc: mockRoomDoc,
        taskId: testTaskId,
      });
      expect(result.current.taskDoc).toBe(mockTaskDoc);
      expect(result.current.roomDoc).toBe(mockRoomDoc);
      expect(result.current.taskId).toBe(testTaskId);
    });

    it('returns memoized TaskDocument when dependencies unchanged', () => {
      const mockTaskHandle = { doc: { id: 'task-doc' } };
      const mockRoomHandle = { doc: { id: 'room-doc' } };

      mockUseTaskHandle.mockReturnValue(mockTaskHandle);
      mockUseRoomHandle.mockReturnValue(mockRoomHandle);

      const { result, rerender } = renderHook(() => useTaskDocument(testTaskId));

      const firstResult = result.current;
      rerender();
      const secondResult = result.current;

      expect(firstResult).toBe(secondResult);
      expect(constructorCalls).toHaveLength(1);
    });

    it('creates new TaskDocument when taskId changes', () => {
      const mockTaskHandle = { doc: { id: 'task-doc' } };
      const mockRoomHandle = { doc: { id: 'room-doc' } };

      mockUseTaskHandle.mockReturnValue(mockTaskHandle);
      mockUseRoomHandle.mockReturnValue(mockRoomHandle);

      const { result, rerender } = renderHook(({ taskId }) => useTaskDocument(taskId), {
        initialProps: { taskId: testTaskId },
      });

      const firstResult = result.current;
      const newTaskId = 'task_new456' as TaskId;
      rerender({ taskId: newTaskId });
      const secondResult = result.current;

      expect(secondResult.taskId).toBe(newTaskId);
      expect(firstResult).not.toBe(secondResult);
      expect(constructorCalls).toHaveLength(2);
    });
  });

  describe('disposal cleanup', () => {
    it('disposes TaskDocument on unmount', () => {
      const mockTaskHandle = { doc: { id: 'task-doc' } };
      const mockRoomHandle = { doc: { id: 'room-doc' } };

      mockUseTaskHandle.mockReturnValue(mockTaskHandle);
      mockUseRoomHandle.mockReturnValue(mockRoomHandle);

      const { unmount } = renderHook(() => useTaskDocument(testTaskId));

      expect(mockDispose).not.toHaveBeenCalled();

      unmount();

      expect(mockDispose).toHaveBeenCalledTimes(1);
    });

    it('disposes old TaskDocument when taskId changes', () => {
      const mockTaskHandle = { doc: { id: 'task-doc' } };
      const mockRoomHandle = { doc: { id: 'room-doc' } };

      mockUseTaskHandle.mockReturnValue(mockTaskHandle);
      mockUseRoomHandle.mockReturnValue(mockRoomHandle);

      const { rerender } = renderHook(({ taskId }) => useTaskDocument(taskId), {
        initialProps: { taskId: testTaskId },
      });

      const newTaskId = 'task_new456' as TaskId;

      act(() => {
        rerender({ taskId: newTaskId });
      });

      expect(mockDispose).toHaveBeenCalled();
    });
  });

  describe('error cases', () => {
    it('handles undefined task handle doc gracefully', () => {
      const mockTaskHandle = { doc: undefined };
      const mockRoomHandle = { doc: { id: 'room-doc' } };

      mockUseTaskHandle.mockReturnValue(mockTaskHandle);
      mockUseRoomHandle.mockReturnValue(mockRoomHandle);

      const { result } = renderHook(() => useTaskDocument(testTaskId));

      expect(result.current).toBeDefined();
      expect(result.current.taskDoc).toBeUndefined();
    });

    it('handles undefined room handle doc gracefully', () => {
      const mockTaskHandle = { doc: { id: 'task-doc' } };
      const mockRoomHandle = { doc: undefined };

      mockUseTaskHandle.mockReturnValue(mockTaskHandle);
      mockUseRoomHandle.mockReturnValue(mockRoomHandle);

      const { result } = renderHook(() => useTaskDocument(testTaskId));

      expect(result.current).toBeDefined();
      expect(result.current.roomDoc).toBeUndefined();
    });
  });
});
