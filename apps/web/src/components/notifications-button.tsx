/**
 * NotificationsButton - Bell icon that shows pending input request count.
 * Clicking shows a dropdown with all pending requests to select from.
 *
 * Migrated from legacy NotificationsButton.tsx to use Loro.
 */

import { Button, Description, Dropdown, Label, Tooltip } from '@heroui/react';
import type { TaskId } from '@shipyard/loro-schema';
import { Bell, Clock } from 'lucide-react';
import { useMemo } from 'react';
import type { AnyInputRequest } from '@/components/input-request-types';
import { MarkdownContent } from '@/components/ui/markdown-content';
import { useInputRequests } from '@/hooks/use-input-requests';

interface NotificationsButtonProps {
  /** Task ID to monitor for input requests */
  taskId: TaskId;
}

/**
 * Get a short display message for a request.
 */
function getRequestPreview(request: AnyInputRequest): string {
  if (request.type === 'multi') {
    return `${request.questions.length} question${request.questions.length > 1 ? 's' : ''} from agent`;
  }
  const maxLength = 50;
  if (request.message.length > maxLength) {
    return `${request.message.slice(0, maxLength)}...`;
  }
  return request.message;
}

/**
 * Get remaining time for a request as a human-readable string.
 */
function getRemainingTimeLabel(request: AnyInputRequest): string {
  const remaining = Math.max(0, Math.floor((request.expiresAt - Date.now()) / 1000));

  if (remaining <= 0) return 'Expiring...';
  if (remaining < 60) return `${remaining}s left`;
  if (remaining < 3600) return `${Math.floor(remaining / 60)}m left`;
  return `${Math.floor(remaining / 3600)}h left`;
}

/**
 * Notification bell button that shows pending input request count.
 * Clicking shows a dropdown with all pending requests to select from.
 */
export function NotificationsButton({ taskId }: NotificationsButtonProps) {
  const { pendingRequests } = useInputRequests({
    taskId,
    onRequestReceived: () => {
      /** Toast notification is handled by the hook */
    },
  });

  /** Handle selecting a specific request from dropdown */
  const handleSelectRequest = (request: AnyInputRequest) => {
    document.dispatchEvent(
      new CustomEvent('open-input-request', {
        detail: { request, taskId },
      })
    );
  };

  const tooltipContent = useMemo(() => {
    return pendingRequests.length > 0
      ? `${pendingRequests.length} pending ${pendingRequests.length === 1 ? 'request' : 'requests'}`
      : 'No pending notifications';
  }, [pendingRequests.length]);

  /** If no requests, show disabled button with tooltip */
  if (pendingRequests.length === 0) {
    return (
      <Tooltip delay={0}>
        <Tooltip.Trigger>
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            isDisabled
            aria-label="No pending notifications"
            className="relative touch-target"
          >
            <Bell className="w-4 h-4" />
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content>{tooltipContent}</Tooltip.Content>
      </Tooltip>
    );
  }

  /** If only one request, open it directly without dropdown */
  if (pendingRequests.length === 1) {
    const singleRequest = pendingRequests[0];
    if (!singleRequest) {
      /** TypeScript safety - should never happen if length === 1 */
      return null;
    }
    return (
      <Tooltip delay={0}>
        <Tooltip.Trigger>
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            onPress={() => handleSelectRequest(singleRequest)}
            aria-label="1 pending notification"
            className="relative touch-target"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-danger text-danger-foreground text-[10px] rounded-full flex items-center justify-center font-semibold">
              1
            </span>
          </Button>
        </Tooltip.Trigger>
        <Tooltip.Content>{tooltipContent}</Tooltip.Content>
      </Tooltip>
    );
  }

  /** Multiple requests - show dropdown to select */
  return (
    <Dropdown>
      <Button
        isIconOnly
        variant="ghost"
        size="sm"
        aria-label={`Notifications (${pendingRequests.length} pending)`}
        className="relative touch-target"
      >
        <Bell className="w-4 h-4" />
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-danger text-danger-foreground text-[10px] rounded-full flex items-center justify-center font-semibold">
          {pendingRequests.length > 9 ? '9+' : pendingRequests.length}
        </span>
      </Button>
      <Dropdown.Popover className="min-w-[280px] max-w-[350px]">
        <Dropdown.Menu
          onAction={(key) => {
            const request = pendingRequests.find((r) => r.id === key);
            if (request) {
              handleSelectRequest(request);
            }
          }}
        >
          {pendingRequests.map((request) => (
            <Dropdown.Item key={request.id} id={request.id} textValue={getRequestPreview(request)}>
              <div className="flex flex-col gap-1 py-1">
                <Label className="line-clamp-2">
                  <MarkdownContent
                    content={getRequestPreview(request)}
                    variant="compact"
                    className="inline"
                  />
                </Label>
                <Description className="flex items-center gap-1 text-xs">
                  <Clock className="w-3 h-3" />
                  {getRemainingTimeLabel(request)}
                </Description>
              </div>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
