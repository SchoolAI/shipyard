import type * as Y from 'yjs';
import { type PlanMetadata, PlanMetadataSchema } from './plan.js';

/**
 * Type-safe helpers for working with Yjs Y.Map for plan metadata.
 *
 * These wrappers provide runtime validation via Zod and TypeScript types,
 * making up for Y.Map's lack of compile-time type safety.
 */

/**
 * Reads plan metadata from Y.Doc with validation.
 *
 * @param ydoc - Yjs document
 * @returns Validated plan metadata or null if invalid/missing
 */
export function getPlanMetadata(ydoc: Y.Doc): PlanMetadata | null {
  const map = ydoc.getMap('metadata');
  const data = map.toJSON();

  const result = PlanMetadataSchema.safeParse(data);
  if (!result.success) {
    return null;
  }

  return result.data;
}

/**
 * Updates plan metadata in Y.Doc.
 *
 * @param ydoc - Yjs document
 * @param metadata - Partial metadata to update
 */
export function setPlanMetadata(ydoc: Y.Doc, metadata: Partial<PlanMetadata>): void {
  const map = ydoc.getMap('metadata');

  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined) {
      map.set(key, value);
    }
  }

  map.set('updatedAt', Date.now());
}

/**
 * Initializes plan metadata in a new Y.Doc.
 *
 * @param ydoc - Yjs document
 * @param init - Initial metadata values
 */
export function initPlanMetadata(
  ydoc: Y.Doc,
  init: Omit<PlanMetadata, 'createdAt' | 'updatedAt'>
): void {
  const map = ydoc.getMap('metadata');
  const now = Date.now();

  map.set('id', init.id);
  map.set('title', init.title);
  map.set('status', init.status);
  map.set('createdAt', now);
  map.set('updatedAt', now);

  if (init.repo) map.set('repo', init.repo);
  if (init.pr) map.set('pr', init.pr);
}

/**
 * Gets the completion status of all steps in a plan.
 *
 * @param ydoc - Yjs document
 * @returns Map of stepId → completed boolean
 */
export function getStepCompletions(ydoc: Y.Doc): Map<string, boolean> {
  const steps = ydoc.getMap<boolean>('stepCompletions');
  return new Map(steps.entries());
}

/**
 * Toggles the completion status of a step.
 *
 * @param ydoc - Yjs document
 * @param stepId - ID of the step to toggle
 */
export function toggleStepCompletion(ydoc: Y.Doc, stepId: string): void {
  const steps = ydoc.getMap<boolean>('stepCompletions');
  const current = steps.get(stepId) || false;
  steps.set(stepId, !current);
}

/**
 * Gets the completion status of a single step.
 *
 * @param ydoc - Yjs document
 * @param stepId - ID of the step
 * @returns true if completed, false otherwise
 */
export function isStepCompleted(ydoc: Y.Doc, stepId: string): boolean {
  const steps = ydoc.getMap<boolean>('stepCompletions');
  return steps.get(stepId) || false;
}
