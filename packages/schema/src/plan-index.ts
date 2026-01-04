import { z } from 'zod';

/**
 * The document name for the plan index Y.Doc.
 * This is a special Y.Doc that tracks all plan metadata for the sidebar.
 */
export const PLAN_INDEX_DOC_NAME = 'plan-index';

/**
 * Status values for a plan.
 */
export const PlanStatus = {
  DRAFT: 'draft',
  PENDING_REVIEW: 'pending_review',
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes_requested',
} as const;

export type PlanStatusType = (typeof PlanStatus)[keyof typeof PlanStatus];

/**
 * Plan summary for the index (minimal data for sidebar display).
 */
export interface PlanIndexEntry {
  id: string;
  title: string;
  status: PlanStatusType;
  createdAt: number;
  updatedAt: number;
}

/**
 * Zod schema for validating plan index entries from Y.Map.
 */
export const PlanIndexEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(['draft', 'pending_review', 'approved', 'changes_requested']),
  createdAt: z.number(),
  updatedAt: z.number(),
});
