import type * as Y from 'yjs';
import { type PlanIndexEntry, PlanIndexEntrySchema } from './plan-index.js';

/**
 * Gets all plans from the index Y.Doc, sorted by updatedAt (most recent first).
 */
export function getPlanIndex(ydoc: Y.Doc): PlanIndexEntry[] {
  const plansMap = ydoc.getMap<Record<string, unknown>>('plans');
  const entries: PlanIndexEntry[] = [];

  for (const [_id, data] of plansMap.entries()) {
    const result = PlanIndexEntrySchema.safeParse(data);
    if (result.success) {
      entries.push(result.data);
    }
  }

  // Sort by updatedAt descending (most recent first)
  return entries.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Gets a single plan entry from the index.
 */
export function getPlanIndexEntry(ydoc: Y.Doc, planId: string): PlanIndexEntry | null {
  const plansMap = ydoc.getMap<Record<string, unknown>>('plans');
  const data = plansMap.get(planId);
  if (!data) return null;

  const result = PlanIndexEntrySchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Adds or updates a plan in the index.
 */
export function setPlanIndexEntry(ydoc: Y.Doc, entry: PlanIndexEntry): void {
  const plansMap = ydoc.getMap<Record<string, unknown>>('plans');
  plansMap.set(entry.id, {
    id: entry.id,
    title: entry.title,
    status: entry.status,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  });
}

/**
 * Removes a plan from the index.
 */
export function removePlanIndexEntry(ydoc: Y.Doc, planId: string): void {
  const plansMap = ydoc.getMap<Record<string, unknown>>('plans');
  plansMap.delete(planId);
}

/**
 * Updates only the updatedAt timestamp for a plan in the index.
 * Useful when plan content changes but not metadata.
 */
export function touchPlanIndexEntry(ydoc: Y.Doc, planId: string): void {
  const entry = getPlanIndexEntry(ydoc, planId);
  if (entry) {
    setPlanIndexEntry(ydoc, { ...entry, updatedAt: Date.now() });
  }
}
