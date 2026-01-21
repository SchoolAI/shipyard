/**
 * Hook to load plan metadata (deliverables, linked PRs) from IndexedDB.
 * Used by KanbanCard to display plan details without blocking render.
 */

import { getDeliverables, getLinkedPRs, type LinkedPR } from '@shipyard/schema';
import { useEffect, useState } from 'react';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';

/**
 * Plan metadata - discriminated union on isLoading.
 * When isLoading is true, no data fields are available.
 * When isLoading is false, all data fields are guaranteed present.
 */
export type PlanMetadataInfo =
  | { isLoading: true }
  | {
      isLoading: false;
      /** Total number of deliverables */
      deliverableCount: number;
      /** Number of completed deliverables (have linked artifacts) */
      completedDeliverables: number;
      /** Linked PRs for this plan */
      linkedPRs: LinkedPR[];
    };

/**
 * Type guard for loaded plan metadata.
 * Use this to narrow PlanMetadataInfo to the loaded variant.
 */
export function isPlanMetadataLoaded(
  info: PlanMetadataInfo
): info is Extract<PlanMetadataInfo, { isLoading: false }> {
  return !info.isLoading;
}

// Cache to avoid reloading the same plan data
const metadataCache = new Map<string, { data: PlanMetadataInfo; timestamp: number }>();
const CACHE_TTL = 30_000; // 30 seconds

/** Loaded metadata type (without isLoading) */
type LoadedPlanMetadata = Extract<PlanMetadataInfo, { isLoading: false }>;

/**
 * Load plan metadata from IndexedDB.
 * Results are cached for 30 seconds to avoid repeated loads.
 */
async function loadPlanMetadata(planId: string): Promise<LoadedPlanMetadata> {
  // Check cache first
  const cached = metadataCache.get(planId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL && isPlanMetadataLoaded(cached.data)) {
    return cached.data;
  }

  try {
    const planDoc = new Y.Doc();
    const idb = new IndexeddbPersistence(planId, planDoc);
    await idb.whenSynced;

    const deliverables = getDeliverables(planDoc);
    const linkedPRs = getLinkedPRs(planDoc);

    idb.destroy();

    const result: LoadedPlanMetadata = {
      isLoading: false,
      deliverableCount: deliverables.length,
      completedDeliverables: deliverables.filter((d) => d.linkedArtifactId).length,
      linkedPRs,
    };

    // Cache the result
    metadataCache.set(planId, { data: result, timestamp: Date.now() });

    return result;
  } catch {
    // Return empty state on error
    return {
      isLoading: false,
      deliverableCount: 0,
      completedDeliverables: 0,
      linkedPRs: [],
    };
  }
}

/**
 * Hook to load metadata for a single plan.
 * Returns deliverable counts and linked PRs.
 */
export function usePlanMetadata(planId: string): PlanMetadataInfo {
  const [metadata, setMetadata] = useState<PlanMetadataInfo>({ isLoading: true });

  useEffect(() => {
    let isActive = true;

    // Check cache synchronously for instant display
    const cached = metadataCache.get(planId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL && isPlanMetadataLoaded(cached.data)) {
      setMetadata(cached.data);
      return;
    }

    // Reset to loading state when planId changes
    setMetadata({ isLoading: true });

    loadPlanMetadata(planId).then((data) => {
      if (isActive) {
        setMetadata(data);
      }
    });

    return () => {
      isActive = false;
    };
  }, [planId]);

  return metadata;
}

/**
 * Invalidate cache for a specific plan.
 * Call this when a plan is updated.
 */
export function invalidatePlanMetadataCache(planId: string): void {
  metadataCache.delete(planId);
}

/**
 * Clear the entire metadata cache.
 */
export function clearPlanMetadataCache(): void {
  metadataCache.clear();
}
