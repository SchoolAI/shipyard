import type { TaskId } from '@shipyard/loro-schema';
import { useCallback, useState } from 'react';
import { TaskEditor } from '@/editor/task-editor';
import { useBlockPositions } from '@/hooks/use-block-positions';
import { useIsMobile } from '@/hooks/use-is-mobile';
import type { OpenComposerData } from './comment-gutter';
import { CommentGutter } from './comment-gutter';

interface UserIdentity {
  id: string;
  name: string;
  color: string;
}

interface PlanViewerWithCommentsProps {
  taskId: TaskId;
  identity: UserIdentity | null;
  onRequestIdentity?: () => void;
  showCommentGutter?: boolean;
  readOnly?: boolean;
}

export function PlanViewerWithComments({
  taskId,
  identity,
  onRequestIdentity: _onRequestIdentity,
  showCommentGutter = true,
  readOnly = false,
}: PlanViewerWithCommentsProps) {
  const isMobile = useIsMobile();

  const { positions, containerRef, isReady } = useBlockPositions();

  const [openComposerRequest, setOpenComposerRequest] = useState<OpenComposerData | null>(null);

  const handleScrollToBlock = useCallback(
    (blockId: string) => {
      const position = positions.get(blockId);
      if (position?.element) {
        position.element.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });

        position.element.classList.add('ring-2', 'ring-primary', 'ring-opacity-50');
        setTimeout(() => {
          position.element?.classList.remove('ring-2', 'ring-primary', 'ring-opacity-50');
        }, 2000);
      }
    },
    [positions]
  );

  const handleComposerStateChange = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      setOpenComposerRequest(null);
    }
  }, []);

  const handleAddComment = useCallback(
    (blockId: string, selectedText: string) => {
      if (!identity) return;
      setOpenComposerRequest({
        blockId,
        selectedText: selectedText || undefined,
      });
    },
    [identity]
  );

  const shouldShowGutter = showCommentGutter && !isMobile && identity !== null;

  const userId = identity?.id ?? null;

  if (isMobile) {
    return (
      <div ref={containerRef}>
        <TaskEditor
          taskId={taskId}
          readOnly={readOnly}
          onAddComment={identity ? handleAddComment : undefined}
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative flex">
      <div className="flex-1 min-w-0">
        <TaskEditor
          taskId={taskId}
          readOnly={readOnly}
          onAddComment={identity ? handleAddComment : undefined}
        />
      </div>

      {shouldShowGutter && isReady && (
        <CommentGutter
          taskId={taskId}
          blockPositions={positions}
          userId={userId}
          onScrollToBlock={handleScrollToBlock}
          isVisible={true}
          width={320}
          openComposerRequest={openComposerRequest}
          onComposerStateChange={handleComposerStateChange}
        />
      )}
    </div>
  );
}
