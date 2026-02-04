import { useSyncExternalStore } from 'react';
import { wsAdapter } from '@/loro/adapters';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface ConnectionStatus {
  state: ConnectionState;
  isConnected: boolean;
  isReconnecting: boolean;
}

export function useServerConnection(): boolean {
  const connectionState = useSyncExternalStore(
    (callback) => wsAdapter.subscribe(callback),
    () => wsAdapter.connectionState,
    () => 'disconnected'
  );

  return connectionState === 'connected';
}

export function useConnectionStatus(): ConnectionStatus {
  const state = useSyncExternalStore(
    (callback) => wsAdapter.subscribe(callback),
    () => wsAdapter.connectionState,
    () => 'disconnected' as ConnectionState
  );

  return {
    state,
    isConnected: state === 'connected',
    isReconnecting: state === 'reconnecting' || state === 'connecting',
  };
}
