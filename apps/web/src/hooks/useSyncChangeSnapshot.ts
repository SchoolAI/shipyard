import {
  type ChangeSnapshot,
  type LocalChangesResult,
  markMachineDisconnected,
  type SyncedFileChange,
  setChangeSnapshot,
} from '@shipyard/schema';
import { useEffect, useRef } from 'react';
import type * as Y from 'yjs';
import { trpc } from '@/utils/trpc';

interface UseSyncChangeSnapshotOptions {
  enabled: boolean;
}

/**
 * Debounce local changes to prevent CRDT churn.
 * 5 seconds chosen to balance responsiveness for remote viewers
 * with avoiding excessive Y.Doc updates during active development.
 */
const DEBOUNCE_MS = 5000;

function convertToSyncedFiles(localChanges: LocalChangesResult): SyncedFileChange[] {
  if (!localChanges.available) {
    return [];
  }

  return localChanges.files.map((file) => ({
    path: file.path,
    status: file.status === 'copied' || file.status === 'untracked' ? 'added' : file.status,
    patch: file.patch ?? '',
    staged: localChanges.staged.some((s) => s.path === file.path),
  }));
}

export function useSyncChangeSnapshot(
  ydoc: Y.Doc,
  localChanges: LocalChangesResult | undefined,
  planId: string,
  options: UseSyncChangeSnapshotOptions
): void {
  const { enabled } = options;

  const machineInfoQuery = trpc.plan.getMachineInfo.useQuery(
    { planId },
    {
      enabled,
      staleTime: Number.POSITIVE_INFINITY,
      retry: false,
    }
  );

  const machineIdRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (machineInfoQuery.data) {
      machineIdRef.current = machineInfoQuery.data.machineId;
    }
  }, [machineInfoQuery.data]);

  useEffect(() => {
    if (!enabled || !localChanges || !machineInfoQuery.data) {
      return;
    }

    if (!localChanges.available) {
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      const { machineId, machineName, ownerId } = machineInfoQuery.data;

      const files = convertToSyncedFiles(localChanges);
      let totalAdditions = 0;
      let totalDeletions = 0;
      for (const file of localChanges.files) {
        totalAdditions += file.additions;
        totalDeletions += file.deletions;
      }

      const snapshot: ChangeSnapshot = {
        machineId,
        machineName,
        ownerId,
        headSha: localChanges.headSha ?? '',
        branch: localChanges.branch,
        isLive: true,
        updatedAt: Date.now(),
        files,
        totalAdditions,
        totalDeletions,
      };

      setChangeSnapshot(ydoc, snapshot);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [enabled, localChanges, machineInfoQuery.data, ydoc]);

  useEffect(() => {
    return () => {
      /**
       * Preserve snapshot on unmount instead of removing.
       * This allows remote collaborators to view last known state
       * even after the agent/browser session ends.
       */
      if (machineIdRef.current) {
        markMachineDisconnected(ydoc, machineIdRef.current);
      }
    };
  }, [ydoc]);

  useEffect(() => {
    let visibilityTimer: ReturnType<typeof setTimeout> | null = null;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && machineIdRef.current) {
        /**
         * Cancel pending sync to prevent race: debounce timer could fire
         * after disconnect and set isLive: true, overwriting the disconnected state.
         */
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }

        /**
         * 10-second grace period prevents marking disconnected on brief tab switches
         * (Cmd+Tab, checking another app). Without this, even 0.1s visibility changes
         * would immediately mark the machine disconnected, causing UI flicker.
         */
        visibilityTimer = setTimeout(() => {
          if (machineIdRef.current) {
            markMachineDisconnected(ydoc, machineIdRef.current);
          }
        }, 10000);
      } else if (document.visibilityState === 'visible') {
        /** Cancel pending disconnect since user returned to tab */
        if (visibilityTimer) {
          clearTimeout(visibilityTimer);
          visibilityTimer = null;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (visibilityTimer) {
        clearTimeout(visibilityTimer);
      }
    };
  }, [ydoc]);
}
