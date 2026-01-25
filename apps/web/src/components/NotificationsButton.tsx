import { Button, Description, Dropdown, Label, Tooltip } from '@heroui/react';
import { type AnyInputRequest, DEFAULT_INPUT_REQUEST_TIMEOUT_SECONDS } from '@shipyard/schema';
import { Bell, Clock } from 'lucide-react';
import { useMemo } from 'react';
import type * as Y from 'yjs';
import { MarkdownContent } from '@/components/ui/MarkdownContent';
import { useInputRequests } from '@/hooks/useInputRequests';

interface NotificationsButtonProps {
  /** Y.Doc to monitor for input requests */
  ydoc: Y.Doc | null;
  /** Optional plan ID to filter requests (only show requests for this specific plan) */
  planId?: string;
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
  const timeout = request.timeout || DEFAULT_INPUT_REQUEST_TIMEOUT_SECONDS;
  const elapsed = Math.floor((Date.now() - request.createdAt) / 1000);
  const remaining = Math.max(0, timeout - elapsed);

  if (remaining <= 0) return 'Expiring...';
  if (remaining < 60) return `${remaining}s left`;
  if (remaining < 3600) return `${Math.floor(remaining / 60)}m left`;
  return `${Math.floor(remaining / 3600)}h left`;
}

/**
 * Notification bell button that shows pending input request count.
 * Clicking shows a dropdown with all pending requests to select from.
 */
export function NotificationsButton({ ydoc, planId }: NotificationsButtonProps) {
  const { pendingRequests } = useInputRequests({
    ydoc,
    onRequestReceived: () => {
      /** Toast notification is handled by the hook */
    },
  });

  /** Filter requests by planId if provided */
  const filteredRequests = useMemo(() => {
    if (!planId) {
      /** No filter - show all (used in inbox or sidebar) */
      return pendingRequests;
    }

    /** On a plan page - show ONLY this plan's requests (exclude global) */
    return pendingRequests.filter((request) => request.planId === planId);
  }, [pendingRequests, planId]);

  /** Handle selecting a specific request from dropdown */
  const handleSelectRequest = (request: AnyInputRequest) => {
    document.dispatchEvent(
      new CustomEvent('open-input-request', {
        detail: request,
      })
    );
  };

  const tooltipContent =
    filteredRequests.length > 0
      ? `${filteredRequests.length} pending ${filteredRequests.length === 1 ? 'request' : 'requests'}`
      : 'No pending notifications';

  /** If no requests, show disabled button with tooltip */
  if (filteredRequests.length === 0) {
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
  if (filteredRequests.length === 1) {
    const singleRequest = filteredRequests[0];
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
            aria-label={`1 pending notification`}
            className="relative touch-target"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-danger text-white text-[10px] rounded-full flex items-center justify-center font-semibold">
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
        aria-label={`Notifications (${filteredRequests.length} pending)`}
        className="relative touch-target"
      >
        <Bell className="w-4 h-4" />
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-danger text-white text-[10px] rounded-full flex items-center justify-center font-semibold">
          {filteredRequests.length > 9 ? '9+' : filteredRequests.length}
        </span>
      </Button>
      <Dropdown.Popover className="min-w-[280px] max-w-[350px]">
        <Dropdown.Menu
          onAction={(key) => {
            const request = filteredRequests.find((r) => r.id === key);
            if (request) {
              handleSelectRequest(request);
            }
          }}
        >
          {filteredRequests.map((request) => (
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
