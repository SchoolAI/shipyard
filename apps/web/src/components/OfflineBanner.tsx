import { Alert } from '@heroui/react';
import { WifiOff } from 'lucide-react';

interface OfflineBannerProps {
  message?: string;
}

export function OfflineBanner({ message }: OfflineBannerProps) {
  return (
    <Alert color="warning" className="mx-4 mt-4">
      <WifiOff className="w-4 h-4" />
      {message || 'Viewing cached data. Connection timeout - check network or start MCP server.'}
    </Alert>
  );
}
