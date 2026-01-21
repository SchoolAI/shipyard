import { Artifact, Deliverable, PlanMetadata, PlanSnapshot } from "./plan.mjs";
import { Block } from "@blocknote/core";

//#region src/url-encoding.d.ts

/**
 * Lightweight snapshot reference for URL encoding.
 * Contains metadata only - full content is in keyVersions or the live Y.Doc.
 */
interface UrlSnapshotRef {
  id: string;
  status: PlanMetadata['status'];
  createdBy: string;
  reason: string;
  createdAt: number;
  /** Thread summary (lightweight) */
  threads?: {
    total: number;
    unresolved: number;
  };
}
/**
 * Key version with full content.
 * Used for significant versions (initial, approval, completion).
 */
interface UrlKeyVersion {
  id: string;
  content: Block[];
}
/**
 * URL-encoded plan structure v1 (legacy).
 * This is a snapshot of the plan state that can be shared via URL.
 */
interface UrlEncodedPlanV1 {
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
interface UrlEncodedPlanV2 {
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
type UrlEncodedPlan = UrlEncodedPlanV1 | UrlEncodedPlanV2;
/**
 * Type guard for v1 plans.
 */
declare function isUrlEncodedPlanV1(plan: UrlEncodedPlan): plan is UrlEncodedPlanV1;
/**
 * Type guard for v2 plans with version history.
 */
declare function isUrlEncodedPlanV2(plan: UrlEncodedPlan): plan is UrlEncodedPlanV2;
/**
 * Encodes a plan to a URL-safe compressed string.
 *
 * Uses lz-string compression + URI encoding for maximum compatibility.
 * Typical compression: 40-60% reduction.
 */
declare function encodePlan(plan: UrlEncodedPlan): string;
/**
 * Decodes a URL-encoded plan string.
 * Supports both v1 and v2 plan formats.
 *
 * Returns null if decoding fails or data is corrupted.
 */
declare function decodePlan(encoded: string): UrlEncodedPlan | null;
/**
 * Creates a complete plan URL from a plan object.
 *
 * @param baseUrl - Base URL for the app (e.g., "https://org.github.io/shipyard")
 * @param plan - Plan object to encode
 * @returns Complete URL with encoded plan
 */
declare function createPlanUrl(baseUrl: string, plan: UrlEncodedPlan): string;
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
declare function createPlanUrlWithHistory(baseUrl: string, plan: Omit<UrlEncodedPlanV2, 'v' | 'versionRefs' | 'keyVersions'>, snapshots: PlanSnapshot[]): string;
/**
 * Extracts and decodes plan from current URL.
 *
 * @returns Decoded plan or null if not found/invalid
 */
declare function getPlanFromUrl(): UrlEncodedPlan | null;
//#endregion
export { UrlEncodedPlan, UrlEncodedPlanV1, UrlEncodedPlanV2, UrlKeyVersion, UrlSnapshotRef, createPlanUrl, createPlanUrlWithHistory, decodePlan, encodePlan, getPlanFromUrl, isUrlEncodedPlanV1, isUrlEncodedPlanV2 };
//# sourceMappingURL=url-encoding.d.mts.map