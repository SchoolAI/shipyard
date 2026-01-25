/**
 * Inbox item component for displaying input requests in the inbox list.
 * Shows request type, message, and countdown timer.
 */

import { Card, Chip } from '@heroui/react';
import { type AnyInputRequest, DEFAULT_INPUT_REQUEST_TIMEOUT_SECONDS } from '@shipyard/schema';
import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MarkdownContent } from '@/components/ui/MarkdownContent';

interface InputRequestInboxItemProps {
  request: AnyInputRequest;
  onClick: () => void;
}

/** Get display message for any input request type */
function getDisplayMessage(request: AnyInputRequest): string {
  if (request.type === 'multi') {
    const count = request.questions.length;
    const firstQuestion = request.questions[0]?.message || 'Multiple questions';
    return count > 1 ? `${firstQuestion} (+${count - 1} more)` : firstQuestion;
  }
  return request.message;
}

/** Get display type label for any input request */
function getDisplayType(request: AnyInputRequest): string {
  if (request.type === 'multi') {
    return `multi (${request.questions.length})`;
  }
  return request.type;
}

export function InputRequestInboxItem({ request, onClick }: InputRequestInboxItemProps) {
  const [remainingTime, setRemainingTime] = useState(0);

  /** Calculate remaining time from createdAt */
  useEffect(() => {
    const updateRemainingTime = () => {
      const now = Date.now();
      const timeoutMs = (request.timeout || DEFAULT_INPUT_REQUEST_TIMEOUT_SECONDS) * 1000;
      const elapsed = now - request.createdAt;
      const remaining = Math.max(0, timeoutMs - elapsed);
      setRemainingTime(remaining);
    };

    updateRemainingTime();
    const interval = setInterval(updateRemainingTime, 1000);

    return () => clearInterval(interval);
  }, [request.createdAt, request.timeout]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <button onClick={onClick} className="cursor-pointer w-full text-left" type="button">
      <Card variant="secondary" className="p-4 hover:bg-muted/50 transition-colors">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Chip variant="soft" color="accent" size="sm">
                Agent Input
              </Chip>
              <Chip variant="soft" color="default" size="sm">
                {getDisplayType(request)}
              </Chip>
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
