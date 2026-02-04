import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRoomDocument } from './use-room-document';

const mockUseRoomHandle = vi.fn();

vi.mock('./selectors/room-selectors', () => ({
  useRoomHandle: () => mockUseRoomHandle(),
}));

const constructorCalls: Array<{ roomDoc: unknown }> = [];

vi.mock('@shipyard/loro-schema', () => {
  return {
    RoomDocument: class {
      roomDoc: unknown;

      constructor(roomDoc: unknown) {
        this.roomDoc = roomDoc;
        constructorCalls.push({ roomDoc });
      }
    },
  };
});

describe('useRoomDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    constructorCalls.length = 0;
  });

  describe('room handle access', () => {
    it('creates RoomDocument with correct handle', () => {
      const mockRoomDoc = { id: 'room-doc' };
      const mockRoomHandle = { doc: mockRoomDoc };

      mockUseRoomHandle.mockReturnValue(mockRoomHandle);

      const { result } = renderHook(() => useRoomDocument());

      expect(mockUseRoomHandle).toHaveBeenCalled();
      expect(constructorCalls).toHaveLength(1);
      expect(constructorCalls[0]).toEqual({ roomDoc: mockRoomDoc });
      expect(result.current.roomDoc).toBe(mockRoomDoc);
    });

    it('returns memoized RoomDocument when handle unchanged', () => {
      const mockRoomHandle = { doc: { id: 'room-doc' } };

      mockUseRoomHandle.mockReturnValue(mockRoomHandle);

      const { result, rerender } = renderHook(() => useRoomDocument());

      const firstResult = result.current;
      rerender();
      const secondResult = result.current;

      expect(firstResult).toBe(secondResult);
      expect(constructorCalls).toHaveLength(1);
    });

    it('creates new RoomDocument when handle.doc changes', () => {
      const mockRoomDoc1 = { id: 'room-doc-1' };
      const mockRoomDoc2 = { id: 'room-doc-2' };
      const mockRoomHandle1 = { doc: mockRoomDoc1 };
      const mockRoomHandle2 = { doc: mockRoomDoc2 };

      mockUseRoomHandle.mockReturnValue(mockRoomHandle1);

      const { result, rerender } = renderHook(() => useRoomDocument());

      const firstResult = result.current;
      expect(firstResult.roomDoc).toBe(mockRoomDoc1);

      mockUseRoomHandle.mockReturnValue(mockRoomHandle2);
      rerender();

      const secondResult = result.current;
      expect(secondResult.roomDoc).toBe(mockRoomDoc2);
      expect(firstResult).not.toBe(secondResult);
      expect(constructorCalls).toHaveLength(2);
    });
  });

  describe('task index updates', () => {
    it('exposes room document for task index access', () => {
      const mockRoomDoc = {
        id: 'room-doc',
        taskIndex: { task_1: { title: 'Test Task' } },
      };
      const mockRoomHandle = { doc: mockRoomDoc };

      mockUseRoomHandle.mockReturnValue(mockRoomHandle);

      const { result } = renderHook(() => useRoomDocument());

      expect(result.current.roomDoc).toBe(mockRoomDoc);
    });
  });

  describe('error handling', () => {
    it('handles undefined room handle doc', () => {
      const mockRoomHandle = { doc: undefined };

      mockUseRoomHandle.mockReturnValue(mockRoomHandle);

      const { result } = renderHook(() => useRoomDocument());

      expect(result.current).toBeDefined();
      expect(result.current.roomDoc).toBeUndefined();
    });

    it('handles null room handle doc', () => {
      const mockRoomHandle = { doc: null };

      mockUseRoomHandle.mockReturnValue(mockRoomHandle);

      const { result } = renderHook(() => useRoomDocument());

      expect(result.current).toBeDefined();
      expect(result.current.roomDoc).toBeNull();
    });
  });
});
