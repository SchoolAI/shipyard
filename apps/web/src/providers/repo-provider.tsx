import { WebRtcDataChannelAdapter } from '@loro-extended/adapter-webrtc';
import type { RepoProviderConfig } from '@loro-extended/react';
import { RepoProvider as LoroRepoProvider, useRepo } from '@loro-extended/react';
import { createContext, type ReactNode, useContext, useRef } from 'react';

const WebRtcAdapterContext = createContext<WebRtcDataChannelAdapter | null>(null);

export function useWebRtcAdapter(): WebRtcDataChannelAdapter | null {
  return useContext(WebRtcAdapterContext);
}

export { useRepo };

/**
 * LoroRepoProvider creates a Repo via useMemo([config]) and calls
 * repo.reset() in its effect cleanup. In React StrictMode, the cleanup
 * runs then the effect re-runs — but useMemo returns the SAME Repo
 * (same config reference), so the Repo is already reset/stopped.
 *
 * Fix: useRef guarantees a stable config+adapter pair that is created
 * once per component instance. Because LoroRepoProvider keys on the
 * config reference, a fresh ref means a fresh Repo on each mount.
 * StrictMode's cleanup resets the old Repo, but the remount creates
 * a new component instance with a new ref → new config → new Repo.
 */
export function ShipyardRepoProvider({
  children,
  config,
}: {
  children: ReactNode;
  config?: RepoProviderConfig;
}) {
  const stableRef = useRef<{
    repoConfig: RepoProviderConfig;
    adapter: WebRtcDataChannelAdapter | null;
  } | null>(null);

  if (!stableRef.current) {
    if (config) {
      const webrtc =
        config.adapters?.find(
          (a): a is WebRtcDataChannelAdapter => a instanceof WebRtcDataChannelAdapter
        ) ?? null;
      stableRef.current = { repoConfig: config, adapter: webrtc };
    } else {
      const webrtc = new WebRtcDataChannelAdapter();
      stableRef.current = {
        repoConfig: {
          identity: { name: 'browser' },
          adapters: [webrtc],
        } satisfies RepoProviderConfig,
        adapter: webrtc,
      };
    }
  }

  const { repoConfig, adapter } = stableRef.current;

  return (
    <LoroRepoProvider config={repoConfig}>
      <WebRtcAdapterContext.Provider value={adapter}>{children}</WebRtcAdapterContext.Provider>
    </LoroRepoProvider>
  );
}
