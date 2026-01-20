import type { Block } from '@blocknote/core';
import lzstring from 'lz-string';
import type { Artifact, Deliverable, PlanMetadata, PlanSnapshot } from './plan.js';

/**
 * Lightweight snapshot reference for URL encoding.
 * Contains metadata only - full content is in keyVersions or the live Y.Doc.
 */
export interface UrlSnapshotRef {
  id: string;
  status: PlanMetadata['status'];
  createdBy: string;
  reason: string;
  createdAt: number;
  /** Thread summary (lightweight) */
  threads?: { total: number; unresolved: number };
}

/**
 * Key version with full content.
 * Used for significant versions (initial, approval, completion).
 */
export interface UrlKeyVersion {
  id: string;
  content: Block[];
}

/**
 * URL-encoded plan structure v1 (legacy).
 * This is a snapshot of the plan state that can be shared via URL.
 */
export interface UrlEncodedPlanV1 {
  v: 1;
  id: string;
  title: string;
  /** Status uses the same union type as PlanMetadata for type safety */
  status: PlanMetadata['status'];
  repo?: string;
  pr?: number;
  content: Block[];
  artifacts?: Artifact[];
  /** Deliverables with linkage info (which artifact fulfills each deliverable) */
  deliverables?: Deliverable[];
  comments?: unknown[];
}

/**
 * URL-encoded plan structure v2 with version history.
 * Includes lightweight refs for all versions + full content for key versions.
 */
export interface UrlEncodedPlanV2 {
  v: 2;
  id: string;
  title: string;
  /** Current status */
  status: PlanMetadata['status'];
  repo?: string;
  pr?: number;
  /** Current content (the latest version) */
  content: Block[];
  artifacts?: Artifact[];
  /** Deliverables with linkage info */
  deliverables?: Deliverable[];
  comments?: unknown[];

  /** Version history metadata (lightweight refs, not full content) */
  versionRefs?: UrlSnapshotRef[];

  /**
   * Full snapshots for key versions only (e.g., initial + approval + final).
   * To limit URL size, we store at most 3 full snapshots.
   */
  keyVersions?: UrlKeyVersion[];
}

/**
 * Union type for all URL-encoded plan versions.
 * Use type guards to distinguish between versions.
 */
export type UrlEncodedPlan = UrlEncodedPlanV1 | UrlEncodedPlanV2;

/**
 * Type guard for v1 plans.
 */
export function isUrlEncodedPlanV1(plan: UrlEncodedPlan): plan is UrlEncodedPlanV1 {
  return plan.v === 1;
}

/**
 * Type guard for v2 plans with version history.
 */
export function isUrlEncodedPlanV2(plan: UrlEncodedPlan): plan is UrlEncodedPlanV2 {
  return plan.v === 2;
}

/**
 * Encodes a plan to a URL-safe compressed string.
 *
 * Uses lz-string compression + URI encoding for maximum compatibility.
 * Typical compression: 40-60% reduction.
 */
export function encodePlan(plan: UrlEncodedPlan): string {
  const json = JSON.stringify(plan);
  return lzstring.compressToEncodedURIComponent(json);
}

/**
 * Decodes a URL-encoded plan string.
 * Supports both v1 and v2 plan formats.
 *
 * Returns null if decoding fails or data is corrupted.
 */
export function decodePlan(encoded: string): UrlEncodedPlan | null {
  try {
    const json = lzstring.decompressFromEncodedURIComponent(encoded);
    if (!json) return null;

    const parsed = JSON.parse(json) as { v?: number };

    // NOTE: Accept v1 and v2 (silently accept unknown versions for forward compatibility)
    return parsed as UrlEncodedPlan;
  } catch (_error) {
    return null;
  }
}

/**
 * Creates a complete plan URL from a plan object.
 *
 * @param baseUrl - Base URL for the app (e.g., "https://org.github.io/peer-plan")
 * @param plan - Plan object to encode
 * @returns Complete URL with encoded plan
 */
export function createPlanUrl(baseUrl: string, plan: UrlEncodedPlan): string {
  const encoded = encodePlan(plan);
  const url = new URL(baseUrl);
  url.searchParams.set('d', encoded);
  return url.toString();
}

/**
 * Select key versions for URL encoding.
 * Returns IDs of significant versions: first, first approval, and latest.
 * Maximum 3 versions to limit URL size.
 */
function selectKeyVersionIds(snapshots: PlanSnapshot[]): string[] {
  if (snapshots.length === 0) return [];
  if (snapshots.length <= 3) return snapshots.map((s) => s.id);

  const ids: string[] = [];

  const first = snapshots[0];
  if (first) ids.push(first.id);

  const firstApproval = snapshots.find((s) => s.status === 'in_progress');
  if (firstApproval && !ids.includes(firstApproval.id)) {
    ids.push(firstApproval.id);
  }

  const last = snapshots[snapshots.length - 1];
  if (last && !ids.includes(last.id)) {
    ids.push(last.id);
  }

  return ids;
}

/**
 * Creates a plan URL with version history included.
 * Optimizes size by storing:
 * - Current state (full content)
 * - Version refs (lightweight metadata) for all versions
 * - Key versions (full content) for 2-3 significant versions
 *
 * @param baseUrl - Base URL for the app
 * @param plan - Base plan data (without version info)
 * @param snapshots - All snapshots from Y.Doc
 * @returns Complete URL with version history
 */
export function createPlanUrlWithHistory(
  baseUrl: string,
  plan: Omit<UrlEncodedPlanV2, 'v' | 'versionRefs' | 'keyVersions'>,
  snapshots: PlanSnapshot[]
): string {
  const versionRefs: UrlSnapshotRef[] = snapshots.map((s) => ({
    id: s.id,
    status: s.status,
    createdBy: s.createdBy,
    reason: s.reason,
    createdAt: s.createdAt,
    threads: s.threadSummary,
  }));

  const keyVersionIds = selectKeyVersionIds(snapshots);
  const keyVersions: UrlKeyVersion[] = snapshots
    .filter((s) => keyVersionIds.includes(s.id))
    .map((s) => ({
      id: s.id,
      content: s.content as Block[],
    }));

  const urlPlan: UrlEncodedPlanV2 = {
    v: 2,
    ...plan,
    versionRefs: versionRefs.length > 0 ? versionRefs : undefined,
    keyVersions: keyVersions.length > 0 ? keyVersions : undefined,
  };

  return createPlanUrl(baseUrl, urlPlan);
}

/**
 * Extracts and decodes plan from current URL.
 *
 * @returns Decoded plan or null if not found/invalid
 */
export function getPlanFromUrl(): UrlEncodedPlan | null {
  if (typeof globalThis !== 'undefined' && 'location' in globalThis) {
    const location = (globalThis as typeof globalThis & { location: { search: string } }).location;
    const params = new URLSearchParams(location.search);
    const encoded = params.get('d');
    if (!encoded) return null;

    return decodePlan(encoded);
  }

  return null;
}
