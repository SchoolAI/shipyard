import { Button, Tooltip } from '@heroui/react';
import { Bell } from 'lucide-react';
import type * as Y from 'yjs';
import { useInputRequests } from '@/hooks/useInputRequests';

interface NotificationsButtonProps {
  /** Y.Doc to monitor for input requests */
  ydoc: Y.Doc | null;
}

/**
 * Notification bell button that shows pending input request count.
 * Clicking opens the first pending input request modal via custom event.
 */
export function NotificationsButton({ ydoc }: NotificationsButtonProps) {
  const { pendingRequests } = useInputRequests({
    ydoc,
    onRequestReceived: () => {
      // Toast notification is handled by the hook
    },
  });

  const handlePress = () => {
    if (pendingRequests.length > 0) {
      // Dispatch custom event to open modal with first request
      document.dispatchEvent(
        new CustomEvent('open-input-request', {
          detail: pendingRequests[0],
        })
      );
    }
  };

  const tooltipContent =
    pendingRequests.length > 0
      ? `${pendingRequests.length} pending ${pendingRequests.length === 1 ? 'request' : 'requests'}`
      : 'No pending notifications';

  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          onPress={handlePress}
          aria-label={`Notifications (${pendingRequests.length} pending)`}
          className="relative touch-target"
        >
          <Bell className="w-4 h-4" />

          {/* Badge - only shown when count > 0 */}
          {pendingRequests.length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-danger text-white text-[10px] rounded-full flex items-center justify-center font-semibold">
              {pendingRequests.length}
            </span>
          )}
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>{tooltipContent}</Tooltip.Content>
    </Tooltip>
  );
}
