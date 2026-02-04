import { Alert, Spinner } from '@heroui/react';
import { WifiOff } from 'lucide-react';
import { useConnectionStatus } from '@/hooks/use-server-connection';

/**
 * Displays a banner when the WebSocket connection to the server is lost.
 * Automatically shows reconnection status when the adapter is attempting to reconnect.
 * The banner auto-hides when connection is restored.
 */
export function OfflineBanner() {
  const { isConnected, isReconnecting, state } = useConnectionStatus();

  // Don't show banner when connected
  if (isConnected) {
    return null;
  }

  const getMessage = () => {
    if (isReconnecting) {
      return 'Attempting to reconnect to server...';
    }
    return 'Disconnected from server. Viewing cached data.';
  };

  return (
    <Alert status="warning" className="mx-4 mt-4 shrink-0">
      <Alert.Indicator>
        {isReconnecting ? <Spinner size="sm" /> : <WifiOff className="w-4 h-4" />}
      </Alert.Indicator>
      <Alert.Content>
        <Alert.Title>{state === 'disconnected' ? 'Offline' : 'Reconnecting'}</Alert.Title>
        <Alert.Description>{getMessage()}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
