import type { TaskId } from '@shipyard/loro-schema';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useIsTaskArchived,
  useTaskArchivedAt,
  useTaskArtifacts,
  useTaskChangeSnapshots,
  useTaskComments,
  useTaskContent,
  useTaskDeliverables,
  useTaskEvents,
  useTaskHandle,
  useTaskInlineThreads,
  useTaskInputRequests,
  useTaskLinkedPRs,
  useTaskMeta,
  useTaskStatus,
  useTaskTitle,
} from './task-selectors';

const mockUseHandle = vi.fn();
const mockUseDoc = vi.fn();

vi.mock('@loro-extended/react', () => ({
  useHandle: (...args: unknown[]) => mockUseHandle(...args),
  useDoc: (...args: unknown[]) => mockUseDoc(...args),
}));

describe('task-selectors', () => {
  const testTaskId = 'task_test123' as TaskId;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useTaskHandle', () => {
    it('calls useHandle with correct parameters', () => {
      const mockHandle = { doc: {} };
      mockUseHandle.mockReturnValue(mockHandle);

      const { result } = renderHook(() => useTaskHandle(testTaskId));

      expect(mockUseHandle).toHaveBeenCalledWith(testTaskId, expect.anything());
      expect(result.current).toBe(mockHandle);
    });
  });

  describe('useTaskMeta', () => {
    it('returns task metadata via useDoc selector', () => {
      const mockHandle = { doc: {} };
      const mockMeta = {
        id: testTaskId,
        title: 'Test Task',
        status: 'draft',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { meta: mockMeta };
        return selector(doc);
      });

      const { result } = renderHook(() => useTaskMeta(testTaskId));

      expect(result.current).toEqual(mockMeta);
    });
  });

  describe('useTaskTitle', () => {
    it('returns task title from metadata', () => {
      const mockHandle = { doc: {} };
      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { meta: { title: 'My Task Title' } };
        return selector(doc);
      });

      const { result } = renderHook(() => useTaskTitle(testTaskId));

      expect(result.current).toBe('My Task Title');
    });
  });

  describe('useTaskStatus', () => {
    it('returns task status from metadata', () => {
      const mockHandle = { doc: {} };
      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { meta: { status: 'in_progress' } };
        return selector(doc);
      });

      const { result } = renderHook(() => useTaskStatus(testTaskId));

      expect(result.current).toBe('in_progress');
    });

    it('returns completed status correctly', () => {
      const mockHandle = { doc: {} };
      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { meta: { status: 'completed' } };
        return selector(doc);
      });

      const { result } = renderHook(() => useTaskStatus(testTaskId));

      expect(result.current).toBe('completed');
    });
  });

  describe('useTaskComments', () => {
    it('returns task comments', () => {
      const mockHandle = { doc: {} };
      const mockComments = {
        'comment-1': { id: 'comment-1', body: 'First comment', kind: 'inline' },
        'comment-2': {
          id: 'comment-2',
          body: 'Second comment',
          kind: 'overall',
        },
      };

      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { comments: mockComments };
        return selector(doc);
      });

      const { result } = renderHook(() => useTaskComments(testTaskId));

      expect(result.current).toEqual(mockComments);
    });
  });

  describe('useTaskArtifacts', () => {
    it('returns task artifacts array', () => {
      const mockHandle = { doc: {} };
      const mockArtifacts = [
        { id: 'artifact-1', type: 'image', filename: 'screenshot.png' },
        { id: 'artifact-2', type: 'html', filename: 'report.html' },
      ];

      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { artifacts: mockArtifacts };
        return selector(doc);
      });

      const { result } = renderHook(() => useTaskArtifacts(testTaskId));

      expect(result.current).toEqual(mockArtifacts);
    });
  });

  describe('useTaskDeliverables', () => {
    it('returns task deliverables array', () => {
      const mockHandle = { doc: {} };
      const mockDeliverables = [
        { id: 'del-1', text: 'Complete feature X', linkedArtifactId: null },
        { id: 'del-2', text: 'Write tests', linkedArtifactId: 'artifact-1' },
      ];

      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { deliverables: mockDeliverables };
        return selector(doc);
      });

      const { result } = renderHook(() => useTaskDeliverables(testTaskId));

      expect(result.current).toEqual(mockDeliverables);
    });
  });

  describe('useTaskEvents', () => {
    it('returns task events array', () => {
      const mockHandle = { doc: {} };
      const mockEvents = [
        { id: 'evt-1', type: 'task_created', timestamp: 1000 },
        { id: 'evt-2', type: 'status_changed', timestamp: 2000 },
      ];

      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { events: mockEvents };
        return selector(doc);
      });

      const { result } = renderHook(() => useTaskEvents(testTaskId));

      expect(result.current).toEqual(mockEvents);
    });
  });

  describe('useTaskLinkedPRs', () => {
    it('returns linked pull requests', () => {
      const mockHandle = { doc: {} };
      const mockLinkedPRs = [
        { prNumber: 123, status: 'open', branch: 'feature-x' },
        { prNumber: 456, status: 'merged', branch: 'fix-bug' },
      ];

      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { linkedPRs: mockLinkedPRs };
        return selector(doc);
      });

      const { result } = renderHook(() => useTaskLinkedPRs(testTaskId));

      expect(result.current).toEqual(mockLinkedPRs);
    });
  });

  describe('useTaskInputRequests', () => {
    it('returns input requests array', () => {
      const mockHandle = { doc: {} };
      const mockRequests = [
        { id: 'req-1', type: 'text', status: 'pending', message: 'Enter name' },
        {
          id: 'req-2',
          type: 'confirm',
          status: 'answered',
          message: 'Proceed?',
        },
      ];

      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { inputRequests: mockRequests };
        return selector(doc);
      });

      const { result } = renderHook(() => useTaskInputRequests(testTaskId));

      expect(result.current).toEqual(mockRequests);
    });
  });

  describe('useTaskChangeSnapshots', () => {
    it('returns change snapshots keyed by machine id', () => {
      const mockHandle = { doc: {} };
      const mockSnapshots = {
        'machine-1': { machineId: 'machine-1', branch: 'main', isLive: true },
        'machine-2': {
          machineId: 'machine-2',
          branch: 'feature',
          isLive: false,
        },
      };

      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { changeSnapshots: mockSnapshots };
        return selector(doc);
      });

      const { result } = renderHook(() => useTaskChangeSnapshots(testTaskId));

      expect(result.current).toEqual(mockSnapshots);
    });
  });

  describe('useTaskContent', () => {
    it('returns editor content', () => {
      const mockHandle = { doc: {} };
      const mockContent = { type: 'doc', content: [] };

      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { content: mockContent };
        return selector(doc);
      });

      const { result } = renderHook(() => useTaskContent(testTaskId));

      expect(result.current).toEqual(mockContent);
    });
  });

  describe('useTaskInlineThreads', () => {
    it('aggregates inline comments into threads', () => {
      const mockHandle = { doc: {} };
      const mockComments = {
        c1: {
          id: 'c1',
          kind: 'inline',
          threadId: 'thread-1',
          blockId: 'block-1',
          selectedText: 'selected text',
          body: 'First comment',
          author: 'user1',
          createdAt: 1000,
          resolved: false,
          inReplyTo: null,
        },
        c2: {
          id: 'c2',
          kind: 'inline',
          threadId: 'thread-1',
          blockId: 'block-1',
          selectedText: 'selected text',
          body: 'Reply to first',
          author: 'user2',
          createdAt: 2000,
          resolved: false,
          inReplyTo: 'c1',
        },
        c3: {
          id: 'c3',
          kind: 'overall',
          threadId: 'thread-2',
          body: 'Overall comment',
          author: 'user3',
          createdAt: 1500,
          resolved: true,
          inReplyTo: null,
        },
      };

      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { comments: mockComments };
        return selector(doc);
      });

      const { result } = renderHook(() => useTaskInlineThreads(testTaskId));

      expect(result.current).toHaveLength(1);
      expect(result.current[0]?.threadId).toBe('thread-1');
      expect(result.current[0]?.blockId).toBe('block-1');
      expect(result.current[0]?.comments).toHaveLength(2);
      expect(result.current[0]?.comments[0]?.id).toBe('c1');
      expect(result.current[0]?.comments[1]?.id).toBe('c2');
    });

    it('returns empty array when no inline comments exist', () => {
      const mockHandle = { doc: {} };
      const mockComments = {
        c1: {
          id: 'c1',
          kind: 'overall',
          threadId: 'thread-1',
          body: 'Overall comment',
          author: 'user1',
          createdAt: 1000,
          resolved: false,
          inReplyTo: null,
        },
      };

      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { comments: mockComments };
        return selector(doc);
      });

      const { result } = renderHook(() => useTaskInlineThreads(testTaskId));

      expect(result.current).toHaveLength(0);
    });

    it('sorts threads by creation time of first comment', () => {
      const mockHandle = { doc: {} };
      const mockComments = {
        c1: {
          id: 'c1',
          kind: 'inline',
          threadId: 'thread-old',
          blockId: 'block-1',
          selectedText: null,
          body: 'Old thread',
          author: 'user1',
          createdAt: 1000,
          resolved: false,
          inReplyTo: null,
        },
        c2: {
          id: 'c2',
          kind: 'inline',
          threadId: 'thread-new',
          blockId: 'block-2',
          selectedText: null,
          body: 'New thread',
          author: 'user2',
          createdAt: 3000,
          resolved: false,
          inReplyTo: null,
        },
      };

      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { comments: mockComments };
        return selector(doc);
      });

      const { result } = renderHook(() => useTaskInlineThreads(testTaskId));

      expect(result.current).toHaveLength(2);
      expect(result.current[0]?.threadId).toBe('thread-old');
      expect(result.current[1]?.threadId).toBe('thread-new');
    });

    it('marks thread as resolved only when all comments resolved', () => {
      const mockHandle = { doc: {} };
      const mockComments = {
        c1: {
          id: 'c1',
          kind: 'inline',
          threadId: 'thread-1',
          blockId: 'block-1',
          selectedText: null,
          body: 'First',
          author: 'user1',
          createdAt: 1000,
          resolved: true,
          inReplyTo: null,
        },
        c2: {
          id: 'c2',
          kind: 'inline',
          threadId: 'thread-1',
          blockId: 'block-1',
          selectedText: null,
          body: 'Second',
          author: 'user2',
          createdAt: 2000,
          resolved: false,
          inReplyTo: 'c1',
        },
      };

      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { comments: mockComments };
        return selector(doc);
      });

      const { result } = renderHook(() => useTaskInlineThreads(testTaskId));

      expect(result.current[0]?.resolved).toBe(false);
    });
  });

  describe('useIsTaskArchived', () => {
    it('returns true when archivedAt is set', () => {
      const mockHandle = { doc: {} };
      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { meta: { archivedAt: 1234567890 } };
        return selector(doc);
      });

      const { result } = renderHook(() => useIsTaskArchived(testTaskId));

      expect(result.current).toBe(true);
    });

    it('returns false when archivedAt is null', () => {
      const mockHandle = { doc: {} };
      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { meta: { archivedAt: null } };
        return selector(doc);
      });

      const { result } = renderHook(() => useIsTaskArchived(testTaskId));

      expect(result.current).toBe(false);
    });
  });

  describe('useTaskArchivedAt', () => {
    it('returns archivedAt timestamp when set', () => {
      const mockHandle = { doc: {} };
      const timestamp = 1234567890;
      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { meta: { archivedAt: timestamp } };
        return selector(doc);
      });

      const { result } = renderHook(() => useTaskArchivedAt(testTaskId));

      expect(result.current).toBe(timestamp);
    });

    it('returns null when not archived', () => {
      const mockHandle = { doc: {} };
      mockUseHandle.mockReturnValue(mockHandle);
      mockUseDoc.mockImplementation((_handle, selector) => {
        const doc = { meta: { archivedAt: null } };
        return selector(doc);
      });

      const { result } = renderHook(() => useTaskArchivedAt(testTaskId));

      expect(result.current).toBeNull();
    });
  });
});
