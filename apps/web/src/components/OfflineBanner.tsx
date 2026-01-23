import { Alert, Button, Spinner } from '@heroui/react';
import { RefreshCw, WifiOff } from 'lucide-react';

interface OfflineBannerProps {
  message?: string;
  /** Callback to trigger reconnection attempt */
  onRetry?: () => void;
  /** Whether reconnection is in progress (disables button to prevent spam) */
  isReconnecting?: boolean;
}

export function OfflineBanner({ message, onRetry, isReconnecting }: OfflineBannerProps) {
  return (
    <Alert color="warning" className="mx-4 mt-4">
      <div className="flex items-center justify-between w-full gap-4">
        <div className="flex items-center gap-2">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>
            {message ||
              'Viewing cached data. Connection timeout - check network or start MCP server.'}
          </span>
        </div>
        {onRetry && (
          <Button size="sm" variant="secondary" onPress={onRetry} isDisabled={isReconnecting}>
            {isReconnecting ? <Spinner size="sm" /> : <RefreshCw className="w-3 h-3" />}
            {isReconnecting ? 'Retrying...' : 'Retry'}
          </Button>
        )}
      </div>
    </Alert>
  );
}
