import { Card, Chip } from '@heroui/react';
import { AlertOctagon, Clock, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MarkdownContent } from '@/components/ui/markdown-content';
import { INTERVALS } from '@/constants/timings';
import type { AnyInputRequest } from './input-request-types';

interface InputRequestInboxItemProps {
  request: AnyInputRequest;
  onClick: () => void;
  taskTitle?: string;
  onSelectTask?: (taskId: string) => void;
  taskId?: string;
}

function getDisplayMessage(request: AnyInputRequest): string {
  if (request.type === 'multi') {
    const count = request.questions.length;
    const firstQuestion = request.questions[0]?.message || 'Multiple questions';
    return count > 1 ? `${firstQuestion} (+${count - 1} more)` : firstQuestion;
  }
  return request.message;
}

function getDisplayType(request: AnyInputRequest): string {
  if (request.type === 'multi') {
    return `multi (${request.questions.length})`;
  }
  return request.type;
}

export function InputRequestInboxItem({
  request,
  onClick,
  taskTitle,
  onSelectTask,
  taskId,
}: InputRequestInboxItemProps) {
  const [remainingTime, setRemainingTime] = useState(0);

  useEffect(() => {
    const updateRemainingTime = () => {
      const now = Date.now();
      const remaining = Math.max(0, request.expiresAt - now);
      setRemainingTime(remaining);
    };

    updateRemainingTime();
    const interval = setInterval(updateRemainingTime, INTERVALS.COUNTDOWN_UPDATE);

    return () => clearInterval(interval);
  }, [request.expiresAt]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const isBlocker = request.isBlocker;

  return (
    <button onClick={onClick} className="cursor-pointer w-full text-left" type="button">
      <Card
        variant="secondary"
        className={`p-4 hover:bg-muted/50 transition-colors ${isBlocker ? 'border-2 border-danger ring-1 ring-danger/20' : ''}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {isBlocker && (
                <Chip variant="primary" color="danger" size="sm">
                  <AlertOctagon className="w-3 h-3" />
                  BLOCKER
                </Chip>
              )}
              <Chip variant="soft" color={isBlocker ? 'danger' : 'accent'} size="sm">
                Agent Input
              </Chip>
              <Chip variant="soft" color="default" size="sm">
                {getDisplayType(request)}
              </Chip>
              {taskId && onSelectTask && (
                <button
                  type="button"
                  className="text-xs text-accent hover:underline flex items-center gap-0.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectTask(taskId);
                  }}
                >
                  <ExternalLink className="w-3 h-3" />
                  {taskTitle || 'View Task'}
                </button>
              )}
            </div>

            <div className="text-sm font-medium text-foreground mb-1 line-clamp-2">
              <MarkdownContent content={getDisplayMessage(request)} variant="toast" />
            </div>
          </div>

          <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <Clock className="w-3 h-3" />
            <span>{formatTime(remainingTime)}</span>
          </div>
        </div>
      </Card>
    </button>
  );
}
