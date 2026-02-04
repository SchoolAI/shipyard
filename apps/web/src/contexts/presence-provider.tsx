import type { ReactNode } from 'react';
import { useDaemon } from '@/hooks/use-daemon';
import { usePresence } from '@/hooks/use-presence';
import { useUserIdentity } from './user-identity-context';

interface PresenceProviderProps {
  children: ReactNode;
}

function PresenceSetup({ children }: PresenceProviderProps) {
  const { actor } = useUserIdentity();
  const { isAvailable: isDaemonAvailable } = useDaemon();

  usePresence({
    name: actor,
    isOwner: false, // TODO: Determine from task context when on a task page
    hasDaemon: isDaemonAvailable,
  });

  return <>{children}</>;
}

export function PresenceProvider({ children }: PresenceProviderProps) {
  return <PresenceSetup>{children}</PresenceSetup>;
}
