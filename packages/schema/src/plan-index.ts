import { z } from 'zod';
import { type PlanStatusType, PlanStatusValues } from './plan.js';

/**
 * The document name for the plan index Y.Doc.
 * This is a special Y.Doc that tracks all plan metadata for the sidebar.
 */
export const PLAN_INDEX_DOC_NAME = 'plan-index';

/**
 * Known IndexedDB database names that are NOT plan documents.
 * Used to filter when querying for shared plans.
 */
export const NON_PLAN_DB_NAMES = [
  'plan-index', // Our plan index doc
  'idb-keyval', // External library (dependency of UI components)
] as const;

/**
 * Status values for a plan.
 * @deprecated Use PlanStatusValues from plan.ts instead
 */
export const PlanStatus = {
  DRAFT: 'draft',
  PENDING_REVIEW: 'pending_review',
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes_requested',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
} as const;

export type { PlanStatusType };

/**
 * Plan summary for the index (minimal data for sidebar display).
 */
export interface PlanIndexEntry {
  id: string;
  title: string;
  status: PlanStatusType;
  createdAt: number;
  updatedAt: number;
  /** GitHub username of the plan owner */
  ownerId: string;
  /** Timestamp when plan was archived/deleted (hidden from sidebar by default) */
  deletedAt?: number;
  /** Display name of who archived/deleted the plan */
  deletedBy?: string;
}

/**
 * Zod schema for validating plan index entries from Y.Map.
 */
export const PlanIndexEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(PlanStatusValues),
  createdAt: z.number(),
  updatedAt: z.number(),
  ownerId: z.string(),
  deletedAt: z.number().optional(),
  deletedBy: z.string().optional(),
});
