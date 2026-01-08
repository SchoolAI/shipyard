import type * as Y from 'yjs';
import { type AgentPresence, AgentPresenceSchema } from './hook-api.js';
import {
  type Artifact,
  ArtifactSchema,
  type Deliverable,
  DeliverableSchema,
  type PlanMetadata,
  PlanMetadataSchema,
} from './plan.js';
import { YDOC_KEYS } from './yjs-keys.js';

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

/**
 * Gets all artifacts from Y.Doc with validation.
 *
 * @param ydoc - Yjs document
 * @returns Array of validated artifacts (invalid entries filtered out)
 */
export function getArtifacts(ydoc: Y.Doc): Artifact[] {
  const array = ydoc.getArray(YDOC_KEYS.ARTIFACTS);
  const data = array.toJSON() as unknown[];

  return data
    .map((item) => ArtifactSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);
}

/**
 * Adds an artifact to the Y.Doc.
 *
 * @param ydoc - Yjs document
 * @param artifact - Artifact to add
 */
export function addArtifact(ydoc: Y.Doc, artifact: Artifact): void {
  const array = ydoc.getArray(YDOC_KEYS.ARTIFACTS);
  array.push([artifact]);
}

/**
 * Removes an artifact from Y.Doc by ID.
 *
 * @param ydoc - Yjs document
 * @param artifactId - ID of artifact to remove
 * @returns true if removed, false if not found
 */
export function removeArtifact(ydoc: Y.Doc, artifactId: string): boolean {
  const array = ydoc.getArray(YDOC_KEYS.ARTIFACTS);
  const artifacts = array.toJSON() as Artifact[];
  const index = artifacts.findIndex((a) => a.id === artifactId);

  if (index === -1) return false;

  array.delete(index, 1);
  return true;
}

// --- Agent Presence Helpers ---

/**
 * Gets all agent presences from Y.Doc with validation.
 *
 * @param ydoc - Yjs document
 * @returns Map of sessionId → AgentPresence
 */
export function getAgentPresences(ydoc: Y.Doc): Map<string, AgentPresence> {
  const map = ydoc.getMap(YDOC_KEYS.PRESENCE);
  const result = new Map<string, AgentPresence>();

  for (const [sessionId, value] of map.entries()) {
    const parsed = AgentPresenceSchema.safeParse(value);
    if (parsed.success) {
      result.set(sessionId, parsed.data);
    }
  }

  return result;
}

/**
 * Sets agent presence in Y.Doc.
 *
 * @param ydoc - Yjs document
 * @param presence - Agent presence to set
 */
export function setAgentPresence(ydoc: Y.Doc, presence: AgentPresence): void {
  const map = ydoc.getMap(YDOC_KEYS.PRESENCE);
  map.set(presence.sessionId, presence);
}

/**
 * Clears agent presence from Y.Doc.
 *
 * @param ydoc - Yjs document
 * @param sessionId - Session ID to clear
 * @returns true if cleared, false if not found
 */
export function clearAgentPresence(ydoc: Y.Doc, sessionId: string): boolean {
  const map = ydoc.getMap(YDOC_KEYS.PRESENCE);
  if (!map.has(sessionId)) return false;
  map.delete(sessionId);
  return true;
}

/**
 * Gets a single agent presence by session ID.
 *
 * @param ydoc - Yjs document
 * @param sessionId - Session ID to get
 * @returns AgentPresence or null if not found
 */
export function getAgentPresence(ydoc: Y.Doc, sessionId: string): AgentPresence | null {
  const map = ydoc.getMap(YDOC_KEYS.PRESENCE);
  const value = map.get(sessionId);
  if (!value) return null;

  const parsed = AgentPresenceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// --- Deliverable Helpers ---

/**
 * Gets all deliverables from Y.Doc with validation.
 *
 * @param ydoc - Yjs document
 * @returns Array of validated deliverables
 */
export function getDeliverables(ydoc: Y.Doc): Deliverable[] {
  const array = ydoc.getArray(YDOC_KEYS.DELIVERABLES);
  const data = array.toJSON() as unknown[];

  return data
    .map((item) => DeliverableSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);
}

/**
 * Adds a deliverable to Y.Doc.
 *
 * @param ydoc - Yjs document
 * @param deliverable - Deliverable to add
 */
export function addDeliverable(ydoc: Y.Doc, deliverable: Deliverable): void {
  const array = ydoc.getArray(YDOC_KEYS.DELIVERABLES);
  array.push([deliverable]);
}

/**
 * Links an artifact to a deliverable.
 * Updates the deliverable with the artifact ID and timestamp.
 *
 * @param ydoc - Yjs document
 * @param deliverableId - ID of the deliverable
 * @param artifactId - ID of the artifact to link
 * @returns true if updated, false if deliverable not found
 */
export function linkArtifactToDeliverable(
  ydoc: Y.Doc,
  deliverableId: string,
  artifactId: string
): boolean {
  const array = ydoc.getArray(YDOC_KEYS.DELIVERABLES);
  const deliverables = array.toJSON() as Deliverable[];
  const index = deliverables.findIndex((d) => d.id === deliverableId);

  if (index === -1) return false;

  const existing = deliverables[index];
  if (!existing) return false; // Should never happen, but TypeScript requires check

  const updated: Deliverable = {
    id: existing.id,
    text: existing.text,
    linkedArtifactId: artifactId,
    linkedAt: Date.now(),
  };

  array.delete(index, 1);
  array.insert(index, [updated]);
  return true;
}
