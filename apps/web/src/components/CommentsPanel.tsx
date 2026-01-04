import { extractTextFromCommentBody, parseThreads, type Thread } from '@peer-plan/schema';
import { useCallback, useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { CollapsiblePanel, CollapsiblePanelHeader } from '@/components/ui/collapsible-panel';

interface CommentsPanelProps {
  /** Y.Doc containing threads map */
  ydoc: Y.Doc;
  /** Whether the panel is visible */
  isOpen: boolean;
  /** Close the panel */
  onClose: () => void;
}

/** Cache of user display names from the ydoc */
type UserMap = Map<string, string>;

/**
 * Right sidebar panel showing all comment threads.
 * Uses shared CollapsiblePanel for consistent animation.
 */
export function CommentsPanel({ ydoc, isOpen, onClose }: CommentsPanelProps) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [userNames, setUserNames] = useState<UserMap>(new Map());

  // Subscribe to users map to get display names
  useEffect(() => {
    const usersMap = ydoc.getMap<{ displayName: string; color: string }>('users');

    const updateUsers = () => {
      const newMap = new Map<string, string>();
      usersMap.forEach((userData, id) => {
        if (userData && typeof userData.displayName === 'string') {
          newMap.set(id, userData.displayName);
        }
      });
      setUserNames(newMap);
    };

    updateUsers();
    usersMap.observe(updateUsers);
    return () => usersMap.unobserve(updateUsers);
  }, [ydoc]);

  useEffect(() => {
    const threadsMap = ydoc.getMap('threads');

    const updateThreads = () => {
      const threadData = threadsMap.toJSON() as Record<string, unknown>;
      setThreads(parseThreads(threadData));
    };

    updateThreads();
    threadsMap.observe(updateThreads);
    return () => threadsMap.unobserve(updateThreads);
  }, [ydoc]);

  /** Get display name for a user ID, falling back to truncated ID */
  const getDisplayName = useCallback(
    (userId: string): string => {
      return userNames.get(userId) ?? userId.slice(0, 8);
    },
    [userNames]
  );

  const title = threads.length > 0 ? `Comments (${threads.length})` : 'Comments';

  return (
    <CollapsiblePanel side="right" isOpen={isOpen} onToggle={onClose} className="bg-gray-50">
      <CollapsiblePanelHeader side="right" onToggle={onClose} title={title} />

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-w-72">
        {threads.length === 0 ? (
          <div className="p-4 text-sm text-gray-500 text-center">
            No comments yet.
            <br />
            <span className="text-xs">Select text in the editor to add a comment.</span>
          </div>
        ) : (
          threads.map((thread) => (
            <div
              key={thread.id}
              className={`bg-white rounded-lg border p-3 ${
                thread.resolved ? 'opacity-60 border-gray-200' : 'border-gray-300'
              }`}
            >
              {thread.comments.map((comment, idx) => (
                <div
                  key={comment.id}
                  className={idx > 0 ? 'mt-2 pt-2 border-t border-gray-100' : ''}
                >
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="font-medium text-gray-700">
                      {getDisplayName(comment.userId)}
                    </span>
                    <span>{new Date(comment.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-gray-800 mt-1">
                    {extractTextFromCommentBody(comment.body)}
                  </p>
                </div>
              ))}
              {thread.resolved && (
                <div className="mt-2 text-xs text-green-600 font-medium">Resolved</div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer hint */}
      <div className="p-4 border-t border-gray-200 bg-white min-w-72">
        <p className="text-xs text-gray-500 whitespace-nowrap">
          Comments sync in real-time across all peers
        </p>
      </div>
    </CollapsiblePanel>
  );
}

/** Hook to get thread count from ydoc for use in toggle button */
export function useThreadCount(ydoc: Y.Doc): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const threadsMap = ydoc.getMap('threads');

    const updateCount = () => {
      const threadData = threadsMap.toJSON() as Record<string, unknown>;
      const validThreads = parseThreads(threadData);
      setCount(validThreads.length);
    };

    updateCount();
    threadsMap.observe(updateCount);
    return () => threadsMap.unobserve(updateCount);
  }, [ydoc]);

  return count;
}
