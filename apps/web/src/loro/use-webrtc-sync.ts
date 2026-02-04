import { useCallback, useEffect, useState } from 'react';
import { getWebRtcManager, type WebRtcSyncManager } from './webrtc';

export interface WebRtcSyncState {
  isSignalingConnected: boolean;
  connectedPeers: string[];
  machineId: string;
}

export interface UseWebRtcSyncResult extends WebRtcSyncState {
  connect: (userId: string, token: string) => void;
  disconnect: () => void;
  connectToPeer: (machineId: string) => Promise<void>;
  isConnectedTo: (machineId: string) => boolean;
}

export function useWebRtcSync(): UseWebRtcSyncResult {
  const [manager] = useState<WebRtcSyncManager>(() => getWebRtcManager());
  const [state, setState] = useState<WebRtcSyncState>({
    isSignalingConnected: false,
    connectedPeers: [],
    machineId: manager.getMachineId(),
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setState((prev) => {
        const connectedPeers = manager.getConnectedPeers();
        if (
          prev.connectedPeers.length !== connectedPeers.length ||
          !prev.connectedPeers.every((p, i) => p === connectedPeers[i])
        ) {
          return { ...prev, connectedPeers };
        }
        return prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [manager]);

  const connect = useCallback(
    (userId: string, token: string) => {
      manager.connect(userId, token);
      setState((prev) => ({ ...prev, isSignalingConnected: true }));
    },
    [manager]
  );

  const disconnect = useCallback(() => {
    manager.disconnect();
    setState((prev) => ({
      ...prev,
      isSignalingConnected: false,
      connectedPeers: [],
    }));
  }, [manager]);

  const connectToPeer = useCallback(
    (machineId: string) => manager.connectToPeer(machineId),
    [manager]
  );

  const isConnectedTo = useCallback(
    (machineId: string) => manager.isConnectedTo(machineId),
    [manager]
  );

  return {
    ...state,
    connect,
    disconnect,
    connectToPeer,
    isConnectedTo,
  };
}
