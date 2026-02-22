import { IndexedDBStorageAdapter } from '@loro-extended/adapter-indexeddb';
import { WebRtcDataChannelAdapter } from '@loro-extended/adapter-webrtc';
import { RepoContext, useRepo } from '@loro-extended/react';
import type { AnyAdapter, ChannelKind, RepoParams } from '@loro-extended/repo';
import { Repo } from '@loro-extended/repo';
import { buildCollaboratorPermissions, buildDualPermissions } from '@shipyard/loro-schema';
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';

class CollabWebRtcAdapter extends WebRtcDataChannelAdapter {
  override readonly kind: ChannelKind = 'other';
}

const WebRtcAdapterContext = createContext<WebRtcDataChannelAdapter | null>(null);
const CollabWebRtcAdapterContext = createContext<WebRtcDataChannelAdapter | null>(null);
const SharedTaskIdsContext = createContext<Set<string>>(new Set());

/**
 * Returns the personal room WebRTC adapter (for daemon sync).
 */
export function useWebRtcAdapter(): WebRtcDataChannelAdapter | null {
  return useContext(WebRtcAdapterContext);
}

/**
 * Returns the collab room WebRTC adapter (for collaborator sync).
 */
export function useCollabWebRtcAdapter(): WebRtcDataChannelAdapter | null {
  return useContext(CollabWebRtcAdapterContext);
}

/**
 * Returns the mutable Set of task IDs that are shared with collab peers.
 * The owner's Repo visibility predicate closes over this Set: only documents
 * whose parsed key is in this Set are visible to collab adapter peers.
 * Mutate the Set directly (add/delete) -- no re-render needed because the
 * permission predicate reads it on every sync message.
 */
export function useSharedTaskIds(): Set<string> {
  return useContext(SharedTaskIdsContext);
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
 *
 * Dual-adapter setup: the Repo uses two separate WebRTC adapters --
 * one for the personal room (daemon sync, full owner trust) and one
 * for the collab room (collaborator sync, restricted permissions).
 * `buildDualPermissions` uses the personal adapter as the trust anchor:
 * peers attached to it get owner access, all other network peers are
 * treated as collaborators.
 */
export function ShipyardRepoProvider({
  children,
  config,
  collabOnly = false,
}: {
  children: ReactNode;
  config?: RepoParams;
  collabOnly?: boolean;
}) {
  const sharedTaskIdsRef = useRef(new Set<string>());

  const [state, setState] = useState<{
    repo: Repo;
    personalAdapter: WebRtcDataChannelAdapter | null;
    collabAdapter: WebRtcDataChannelAdapter | null;
  } | null>(null);

  useEffect(() => {
    let repoParams: RepoParams;
    let personalAdapter: WebRtcDataChannelAdapter | null;
    let collabAdapter: WebRtcDataChannelAdapter | null;

    if (config) {
      repoParams = config;
      const webrtcAdapters =
        config.adapters?.filter(
          (a): a is WebRtcDataChannelAdapter => a instanceof WebRtcDataChannelAdapter
        ) ?? [];
      personalAdapter = webrtcAdapters[0] ?? null;
      collabAdapter = webrtcAdapters[1] ?? null;
    } else {
      personalAdapter = new WebRtcDataChannelAdapter();
      collabAdapter = new CollabWebRtcAdapter();
      const adapters: AnyAdapter[] = [personalAdapter, collabAdapter];
      if (typeof indexedDB !== 'undefined') {
        adapters.unshift(new IndexedDBStorageAdapter());
      }
      repoParams = {
        identity: { name: 'browser', type: 'user' },
        adapters,
        permissions: collabOnly
          ? buildCollaboratorPermissions()
          : buildDualPermissions('collaborator-full', sharedTaskIdsRef.current),
      };
    }

    const repo = new Repo(repoParams);
    setState({ repo, personalAdapter, collabAdapter });

    return () => {
      repo.reset();
    };
  }, [config, collabOnly]);

  if (!state) return null;

  return (
    <RepoContext.Provider value={state.repo}>
      <SharedTaskIdsContext.Provider value={sharedTaskIdsRef.current}>
        <WebRtcAdapterContext.Provider value={state.personalAdapter}>
          <CollabWebRtcAdapterContext.Provider value={state.collabAdapter}>
            {children}
          </CollabWebRtcAdapterContext.Provider>
        </WebRtcAdapterContext.Provider>
      </SharedTaskIdsContext.Provider>
    </RepoContext.Provider>
  );
}
