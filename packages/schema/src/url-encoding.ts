import lzstring from 'lz-string';
import { z } from 'zod';
import {
  type Artifact,
  ArtifactSchema,
  type PlanMetadata,
  type PlanSnapshot,
  PlanStatusValues,
} from './plan.js';

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
  /** Content from URL is unknown[] and needs validation before use as Block[] */
  content: unknown[];
}

/**
 * Deliverable from URL encoding.
 * Similar to Deliverable but with optional id (can be generated on import).
 */
export interface UrlDeliverable {
  id?: string;
  text: string;
  linkedArtifactId?: string | null;
  linkedAt?: number;
}

/**
 * URL-encoded plan structure v1 (legacy).
 * This is a snapshot of the plan state that can be shared via URL.
 * Content is optional for minimal snapshots (e.g., OG preview without full content).
 */
export interface UrlEncodedPlanV1 {
  v: 1;
  id: string;
  title: string;
  /** Status uses the same union type as PlanMetadata for type safety */
  status: PlanMetadata['status'];
  repo?: string;
  pr?: number;
  /** Content from URL is unknown[] and needs validation before use as Block[] */
  content?: unknown[];
  artifacts?: Artifact[];
  deliverables?: UrlDeliverable[];
  comments?: unknown[];
}

/**
 * URL-encoded plan structure v2 with version history.
 * Includes lightweight refs for all versions + full content for key versions.
 * Content is optional for minimal snapshots.
 */
export interface UrlEncodedPlanV2 {
  v: 2;
  id: string;
  title: string;
  /** Current status */
  status: PlanMetadata['status'];
  repo?: string;
  pr?: number;
  /** Current content (the latest version) - unknown[] from URL, needs validation */
  content?: unknown[];
  artifacts?: Artifact[];
  deliverables?: UrlDeliverable[];
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
 * Zod schema for UrlSnapshotRef - lightweight snapshot reference for URL encoding.
 */
const UrlSnapshotRefSchema = z.object({
  id: z.string(),
  status: z.enum(PlanStatusValues),
  createdBy: z.string(),
  reason: z.string(),
  createdAt: z.number(),
  threads: z
    .object({
      total: z.number(),
      unresolved: z.number(),
    })
    .optional(),
});

/**
 * Zod schema for UrlKeyVersion - full content snapshot for key versions.
 */
const UrlKeyVersionSchema = z.object({
  id: z.string(),
  content: z.array(z.unknown()),
});

/**
 * Deliverable schema for URL encoding - more permissive than CRDT schema.
 * ID is optional (can be generated), linkedArtifactId can be null or undefined.
 */
const UrlDeliverableSchema = z.object({
  id: z.string().optional(),
  text: z.string(),
  linkedArtifactId: z.string().nullable().optional(),
  linkedAt: z.number().optional(),
});

/**
 * Zod schema for URL-encoded plan v1.
 * IMPORTANT: URL data is UNTRUSTED - this schema validates external input.
 * Content is optional for minimal snapshots (e.g., from OG proxy worker).
 */
const UrlEncodedPlanV1Schema = z.object({
  v: z.literal(1),
  id: z.string(),
  title: z.string(),
  status: z.enum(PlanStatusValues),
  repo: z.string().optional(),
  pr: z.number().optional(),
  content: z.array(z.unknown()).optional(),
  artifacts: z.array(ArtifactSchema).optional(),
  deliverables: z.array(UrlDeliverableSchema).optional(),
  comments: z.array(z.unknown()).optional(),
});

/**
 * Zod schema for URL-encoded plan v2 with version history.
 * IMPORTANT: URL data is UNTRUSTED - this schema validates external input.
 * Content is optional for minimal snapshots.
 */
const UrlEncodedPlanV2Schema = z.object({
  v: z.literal(2),
  id: z.string(),
  title: z.string(),
  status: z.enum(PlanStatusValues),
  repo: z.string().optional(),
  pr: z.number().optional(),
  content: z.array(z.unknown()).optional(),
  artifacts: z.array(ArtifactSchema).optional(),
  deliverables: z.array(UrlDeliverableSchema).optional(),
  comments: z.array(z.unknown()).optional(),
  versionRefs: z.array(UrlSnapshotRefSchema).optional(),
  keyVersions: z.array(UrlKeyVersionSchema).optional(),
});

/**
 * Zod schema for URL-encoded plan (discriminated union on version).
 * IMPORTANT: URL data is UNTRUSTED user input - always validate!
 */
const UrlEncodedPlanSchema = z.discriminatedUnion('v', [
  UrlEncodedPlanV1Schema,
  UrlEncodedPlanV2Schema,
]);

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
 * SECURITY: URL data is UNTRUSTED user input - validated with Zod schema.
 * Returns null if decoding fails, data is corrupted, or validation fails.
 */
export function decodePlan(encoded: string): UrlEncodedPlan | null {
  try {
    const json = lzstring.decompressFromEncodedURIComponent(encoded);
    if (!json) return null;

    const parsed: unknown = JSON.parse(json);

    const result = UrlEncodedPlanSchema.safeParse(parsed);
    if (!result.success) {
      return null;
    }

    return result.data;
  } catch {
    return null;
  }
}

/**
 * Creates a complete plan URL from a plan object.
 *
 * @param baseUrl - Base URL for the app (e.g., "https://org.github.io/shipyard")
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
      content: s.content,
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
/**
 * Safely extracts the location.search value from globalThis if available.
 */
function getLocationSearch(): string | null {
  if (typeof globalThis === 'undefined') return null;
  if (!('location' in globalThis)) return null;

  const globalRecord = Object.fromEntries(Object.entries(globalThis));
  const location = globalRecord.location;
  if (typeof location !== 'object' || location === null) return null;
  if (!('search' in location)) return null;

  const locationRecord = Object.fromEntries(Object.entries(location));
  const search = locationRecord.search;
  return typeof search === 'string' ? search : null;
}

export function getPlanFromUrl(): UrlEncodedPlan | null {
  const search = getLocationSearch();
  if (!search) return null;

  const params = new URLSearchParams(search);
  const encoded = params.get('d');
  if (!encoded) return null;

  return decodePlan(encoded);
}
