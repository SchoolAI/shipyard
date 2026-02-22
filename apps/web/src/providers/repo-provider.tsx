import { IndexedDBStorageAdapter } from '@loro-extended/adapter-indexeddb';
import { WebRtcDataChannelAdapter } from '@loro-extended/adapter-webrtc';
import { RepoContext, useRepo } from '@loro-extended/react';
import type { AnyAdapter, RepoParams } from '@loro-extended/repo';
import { Repo } from '@loro-extended/repo';
import { buildShipyardPermissions } from '@shipyard/loro-schema';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';

const WebRtcAdapterContext = createContext<WebRtcDataChannelAdapter | null>(null);

export function useWebRtcAdapter(): WebRtcDataChannelAdapter | null {
  return useContext(WebRtcAdapterContext);
}

export { useRepo };

/**
 * Manages the Loro Repo lifecycle directly instead of delegating to
 * LoroRepoProvider. The upstream provider uses useMemo([config]) to
 * create the Repo and repo.reset() in effect cleanup. In React
 * StrictMode the cleanup runs and then the effect re-runs, but
 * useMemo returns the SAME (now reset) Repo because the config
 * reference is unchanged. The reset Repo has no adapters, so the
 * WebRTC adapter stays in "stopped" state and addChannel() throws.
 *
 * Fix: create the Repo inside useEffect so each mount gets a fresh
 * instance with properly initialised and started adapters. The
 * cleanup calls repo.reset() on the old instance. StrictMode's
 * cleanup + re-mount cycle therefore always produces a working Repo.
 */
export function ShipyardRepoProvider({
  children,
  config,
}: {
  children: ReactNode;
  config?: RepoParams;
}) {
  const [state, setState] = useState<{
    repo: Repo;
    adapter: WebRtcDataChannelAdapter | null;
  } | null>(null);

  useEffect(() => {
    let repoParams: RepoParams;
    let adapter: WebRtcDataChannelAdapter | null;

    if (config) {
      repoParams = config;
      adapter =
        config.adapters?.find(
          (a): a is WebRtcDataChannelAdapter => a instanceof WebRtcDataChannelAdapter
        ) ?? null;
    } else {
      const webrtc = new WebRtcDataChannelAdapter();
      adapter = webrtc;
      const adapters: AnyAdapter[] = [webrtc];
      if (typeof indexedDB !== 'undefined') {
        adapters.unshift(new IndexedDBStorageAdapter());
      }
      repoParams = {
        identity: { name: 'browser', type: 'user' },
        adapters,
        permissions: buildShipyardPermissions('owner'),
      };
    }

    const repo = new Repo(repoParams);
    setState({ repo, adapter });

    return () => {
      repo.reset();
    };
  }, [config]);

  if (!state) return null;

  return (
    <RepoContext.Provider value={state.repo}>
      <WebRtcAdapterContext.Provider value={state.adapter}>
        {children}
      </WebRtcAdapterContext.Provider>
    </RepoContext.Provider>
  );
}
