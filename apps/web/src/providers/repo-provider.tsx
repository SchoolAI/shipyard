import { WebRtcDataChannelAdapter } from '@loro-extended/adapter-webrtc';
import type { RepoProviderConfig } from '@loro-extended/react';
import { RepoProvider as LoroRepoProvider, useRepo } from '@loro-extended/react';
import { createContext, type ReactNode, useContext, useMemo } from 'react';

const webrtcAdapter = new WebRtcDataChannelAdapter();

const defaultRepoConfig: RepoProviderConfig = {
  identity: { name: 'browser' },
  adapters: [webrtcAdapter],
};

const WebRtcAdapterContext = createContext<WebRtcDataChannelAdapter | null>(null);

export function useWebRtcAdapter(): WebRtcDataChannelAdapter | null {
  return useContext(WebRtcAdapterContext);
}

export { useRepo };

export function ShipyardRepoProvider({
  children,
  config,
}: {
  children: ReactNode;
  config?: RepoProviderConfig;
}) {
  const repoConfig = useMemo(() => config ?? defaultRepoConfig, [config]);

  return (
    <LoroRepoProvider config={repoConfig}>
      <WebRtcAdapterContext.Provider value={webrtcAdapter}>
        {children}
      </WebRtcAdapterContext.Provider>
    </LoroRepoProvider>
  );
}
