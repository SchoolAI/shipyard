import { z } from 'zod';
import { type PlanStatusType, PlanStatusValues } from './plan.js';

/**
 * Prefix for plan index document names.
 * Each user has their own index: plan-index-{username}
 */
export const PLAN_INDEX_DOC_NAME_PREFIX = 'plan-index';

/**
 * Generate the plan-index document name for a specific user.
 * Each user has their own plan-index that syncs across their devices.
 *
 * This ensures privacy - you only see your own plans, not other users' plans.
 *
 * @param username - GitHub username
 * @returns Document name like 'plan-index-alice'
 */
export function getPlanIndexDocName(username: string): string {
  if (!username) {
    throw new Error('getPlanIndexDocName requires a username');
  }
  return `${PLAN_INDEX_DOC_NAME_PREFIX}-${username}`;
}

/**
 * Legacy global plan-index document name.
 * @deprecated Use getPlanIndexDocName(username) instead for per-user indexes.
 *
 * Kept for backwards compatibility during migration period.
 * Will be removed once all code uses per-user indexes.
 */
export const PLAN_INDEX_DOC_NAME = 'plan-index';

/**
 * The key for the viewedBy map within the plan-index Y.Doc.
 * Stores per-plan viewedBy data as nested Y.Maps for CRDT merging.
 * Structure: Y.Map<planId, Y.Map<username, timestamp>>
 */
export const PLAN_INDEX_VIEWED_BY_KEY = 'viewedBy';

/**
 * Known IndexedDB database names that are NOT plan documents.
 * Used to filter when querying for shared plans.
 *
 * Note: Per-user index names follow pattern 'plan-index-{username}',
 * so we need to check with startsWith() for filtering.
 */
export const NON_PLAN_DB_NAMES = ['plan-index', 'idb-keyval'] as const;

/**
 * Check if a database name is a plan index (not a plan document).
 * Matches both legacy global index and per-user indexes.
 */
export function isPlanIndexDbName(dbName: string): boolean {
  return dbName === 'plan-index' || dbName.startsWith('plan-index-') || dbName === 'idb-keyval';
}

export type { PlanStatusType };

/**
 * Base fields shared by all plan index entries.
 */
interface PlanIndexEntryBase {
  id: string;
  title: string;
  status: PlanStatusType;
  createdAt: number;
  updatedAt: number;
  /** GitHub username of the plan owner */
  ownerId: string;
  /** Tags for categorization (copied from plan metadata for fast filtering) */
  tags?: string[];
}

/**
 * Plan summary for the index (minimal data for sidebar display).
 * Uses a discriminated union to ensure deletedAt and deletedBy always appear together.
 */
export type PlanIndexEntry =
  | (PlanIndexEntryBase & { deleted: false })
  | (PlanIndexEntryBase & {
      deleted: true;
      /** Timestamp when plan was archived/deleted (hidden from sidebar by default) */
      deletedAt: number;
      /** Display name of who archived/deleted the plan */
      deletedBy: string;
    });

/**
 * Zod schema for validating plan index entries from Y.Map.
 * Uses discriminated union on 'deleted' field for better validation performance.
 */
export const PlanIndexEntrySchema = z.discriminatedUnion('deleted', [
  z.object({
    deleted: z.literal(false),
    id: z.string(),
    title: z.string(),
    status: z.enum(PlanStatusValues),
    createdAt: z.number(),
    updatedAt: z.number(),
    ownerId: z.string(),
    tags: z.array(z.string()).optional(),
  }),
  z.object({
    deleted: z.literal(true),
    id: z.string(),
    title: z.string(),
    status: z.enum(PlanStatusValues),
    createdAt: z.number(),
    updatedAt: z.number(),
    ownerId: z.string(),
    tags: z.array(z.string()).optional(),
    deletedAt: z.number(),
    deletedBy: z.string(),
  }),
]);
