import {
  getPlanMetadata,
  getPlanOwnerId,
  NON_PLAN_DB_NAMES,
  type PlanIndexEntry,
} from '@peer-plan/schema';
import { useEffect, useState } from 'react';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';

/**
 * Hook to discover plans stored in IndexedDB that aren't in plan-index.
 * These are "shared" plans that were synced via P2P from other users.
 *
 * Plans migrate automatically: when they appear in plan-index, they stop
 * being returned by this hook (filter based on planIndexPlanIds).
 *
 * Plans owned by the current user (matching GitHub username) are excluded
 * so they appear in "My Plans" instead of "Shared with me".
 */
export function useSharedPlans(
  planIndexPlanIds: string[],
  currentGitHubUsername?: string
): PlanIndexEntry[] {
  const [sharedPlans, setSharedPlans] = useState<PlanIndexEntry[]>([]);

  // Stable reference for planIndexPlanIds to avoid infinite re-runs
  const planIndexIdsKey = planIndexPlanIds.sort().join(',');

  // biome-ignore lint/correctness/useExhaustiveDependencies: Using planIndexIdsKey string and currentGitHubUsername to prevent infinite re-renders from array reference changes
  useEffect(() => {
    async function discoverSharedPlans() {
      try {
        // y-indexeddb creates one database per document (not one database with all docs)
        // Database name = document name (e.g., 'plan-abc123')
        // So we need to list all databases, not object stores
        const databases = await indexedDB.databases();
        const dbNames = databases.map((db) => db.name).filter((name): name is string => !!name);

        // Filter to plan docs (exclude known non-plan databases and plan-index entries)
        const planDocIds = dbNames.filter(
          (name) =>
            !(NON_PLAN_DB_NAMES as readonly string[]).includes(name) &&
            !planIndexPlanIds.includes(name)
        );

        // Load metadata from each plan doc
        const plans = await Promise.all(
          // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Async map with filtering logic for plan discovery
          planDocIds.map(async (id) => {
            try {
              const ydoc = new Y.Doc();
              const idb = new IndexeddbPersistence(id, ydoc);
              await idb.whenSynced;

              const metadata = getPlanMetadata(ydoc);
              const ownerId = getPlanOwnerId(ydoc);
              idb.destroy();

              if (!metadata) {
                return null;
              }

              // Skip archived plans
              if (metadata.archivedAt) {
                return null;
              }

              // Skip plans owned by current user (they belong in "My Plans")
              if (currentGitHubUsername && ownerId === currentGitHubUsername) {
                return null;
              }

              return {
                id: metadata.id,
                title: metadata.title,
                status: metadata.status,
                createdAt: metadata.createdAt ?? Date.now(),
                updatedAt: metadata.updatedAt ?? Date.now(),
              };
            } catch {
              // Skip plans with corrupt metadata
              return null;
            }
          })
        );

        const validPlans = plans.filter((p): p is PlanIndexEntry => p !== null);
        setSharedPlans(validPlans);
      } catch {
        // IndexedDB errors are non-fatal (might be blocked or unavailable)
        setSharedPlans([]);
      }
    }

    discoverSharedPlans();

    // Re-scan when new plans are synced to IndexedDB
    const handlePlanSynced = () => {
      discoverSharedPlans();
    };

    window.addEventListener('indexeddb-plan-synced', handlePlanSynced);
    return () => {
      window.removeEventListener('indexeddb-plan-synced', handlePlanSynced);
    };
  }, [planIndexIdsKey, currentGitHubUsername]);

  return sharedPlans;
}
