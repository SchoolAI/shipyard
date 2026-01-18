import { Button, Tooltip } from '@heroui/react';
import { Bell } from 'lucide-react';
import { useMemo } from 'react';
import type * as Y from 'yjs';
import { useInputRequests } from '@/hooks/useInputRequests';

interface NotificationsButtonProps {
  /** Y.Doc to monitor for input requests */
  ydoc: Y.Doc | null;
  /** Optional plan ID to filter requests (only show requests for this specific plan) */
  planId?: string;
}

/**
 * Notification bell button that shows pending input request count.
 * Clicking opens the first pending input request modal via custom event.
 */
export function NotificationsButton({ ydoc, planId }: NotificationsButtonProps) {
  const { pendingRequests } = useInputRequests({
    ydoc,
    onRequestReceived: () => {
      // Toast notification is handled by the hook
    },
  });

  // Filter requests by planId if provided
  const filteredRequests = useMemo(() => {
    if (!planId) {
      // No filter - show all (used in inbox or sidebar)
      return pendingRequests;
    }

    // On a plan page - show ONLY this plan's requests (exclude global)
    return pendingRequests.filter((request) => request.planId === planId);
  }, [pendingRequests, planId]);

  const handlePress = () => {
    if (filteredRequests.length > 0) {
      // Dispatch custom event to open modal with first request
      document.dispatchEvent(
        new CustomEvent('open-input-request', {
          detail: filteredRequests[0],
        })
      );
    }
  };

  const tooltipContent =
    filteredRequests.length > 0
      ? `${filteredRequests.length} pending ${filteredRequests.length === 1 ? 'request' : 'requests'}`
      : 'No pending notifications';

  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          onPress={handlePress}
          aria-label={`Notifications (${filteredRequests.length} pending)`}
          className="relative touch-target"
        >
          <Bell className="w-4 h-4" />

          {/* Badge - only shown when count > 0 */}
          {filteredRequests.length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-danger text-white text-[10px] rounded-full flex items-center justify-center font-semibold">
              {filteredRequests.length}
            </span>
          )}
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>{tooltipContent}</Tooltip.Content>
    </Tooltip>
  );
}
