import { Button, Tooltip } from '@heroui/react';

/**
 * Placeholder notification bell button.
 *
 * For now, just shows "Coming soon" tooltip on hover.
 * Will be implemented fully in a future milestone.
 */
export function NotificationsButton() {
  return (
    <Tooltip>
      <Tooltip.Trigger>
        <Button
          isIconOnly
          variant="ghost"
          onPress={() => {
            // TODO: Implement notifications in future milestone
          }}
          aria-label="Notifications"
          className="relative"
        >
          {/* Bell icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <title>Notifications bell icon</title>
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>

          {/* Badge (always 0 for now) */}
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-muted text-foreground text-xs rounded-full flex items-center justify-center">
            0
          </span>
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>Notifications coming soon</Tooltip.Content>
    </Tooltip>
  );
}
