/**
 * Shared Y.Doc key constants to prevent typos and mismatches.
 *
 * CRITICAL: These keys define the structure of the Y.Doc CRDT.
 * All parts of the codebase (server, web, tests) MUST use these constants
 * to ensure data is written to and read from the same locations.
 *
 * @see docs/yjs-data-model.md for detailed explanation of each key
 */

/**
 * Y.Doc keys used across the application.
 * Using `as const` makes these literal types for better type safety.
 */
export const YDOC_KEYS = {
  /**
   * Plan metadata (Y.Map<string, unknown>)
   * Contains: id, title, status, createdAt, updatedAt, reviewedAt, reviewedBy, repo, pr
   *
   * Used by:
   * - Server: packages/server/src/tools/create-plan.ts (write)
   * - Web: packages/web/src/pages/PlanPage.tsx (read)
   * - Web: packages/web/src/hooks/useHydration.ts (write)
   * - Web: packages/web/src/components/ReviewActions.tsx (write)
   * - Helpers: packages/schema/src/yjs-helpers.ts (read/write)
   */
  METADATA: 'metadata' as const,

  /**
   * BlockNote document (Y.XmlFragment) - SOURCE OF TRUTH for plan content
   * Used for: Real-time collaborative editing, read_plan tool, all content operations
   *
   * CRITICAL: BlockNote expects this to be an XmlFragment, NOT an Array!
   * This is the authoritative source for all plan content.
   *
   * Used by:
   * - Server: apps/server/src/tools/create-plan.ts (write via blocksToYXmlFragment)
   * - Server: apps/server/src/export-markdown.ts (read via yXmlFragmentToBlocks)
   * - Web: apps/web/src/components/PlanViewer.tsx (BlockNote collaboration)
   * - Web: apps/web/src/hooks/useHydration.ts (write from URL snapshot)
   */
  DOCUMENT_FRAGMENT: 'document' as const,

  /**
   * Comment threads (Y.Map<string, Thread>)
   * Managed by BlockNote's YjsThreadStore
   *
   * Structure: Map of thread ID → Thread object with comments array
   *
   * Used by:
   * - Web: packages/web/src/components/PlanViewer.tsx (YjsThreadStore initialization)
   * - Web: packages/web/src/components/CommentsPanel.tsx (read)
   * - Server: packages/server/src/tools/get-feedback.ts (read)
   */
  THREADS: 'threads' as const,

  /**
   * Step completion status (Y.Map<string, boolean>)
   * Maps step ID → completion status
   *
   * Used by:
   * - Helpers: packages/schema/src/yjs-helpers.ts (read/write)
   */
  STEP_COMPLETIONS: 'stepCompletions' as const,

  /**
   * Plan index (Y.Map<string, PlanIndexEntry>)
   * Only used in the special PLAN_INDEX_DOC_NAME document
   * Maps plan ID → index entry (title, status, timestamps)
   *
   * Used by:
   * - Web: packages/web/src/hooks/usePlanIndex.ts (read)
   * - Helpers: packages/schema/src/plan-index-helpers.ts (read/write)
   */
  PLANS: 'plans' as const,

  /**
   * Artifact references (Y.Array<Artifact>)
   * Contains: id, type, filename, url
   * Binary content lives in GitHub orphan branch, not in CRDT
   *
   * Used by:
   * - Server: apps/server/src/tools/add-artifact.ts (write)
   * - Web: apps/web/src/components/Attachments.tsx (read)
   * - Helpers: packages/schema/src/yjs-helpers.ts (read/write)
   */
  ARTIFACTS: 'artifacts' as const,

  /**
   * Deliverables extracted from plan (Y.Array<Deliverable>)
   * Contains checkboxes marked with {#deliverable} tag
   * Linked to artifacts when agent uploads proof
   *
   * Used by:
   * - Server: apps/server/src/tools/create-plan.ts (write)
   * - Server: apps/server/src/tools/add-artifact.ts (update on link)
   * - Web: apps/web/src/components/DeliverablesView.tsx (read)
   * - Helpers: packages/schema/src/yjs-helpers.ts (read/write)
   */
  DELIVERABLES: 'deliverables' as const,

  /**
   * Agent presence (Y.Map<string, AgentPresence>)
   * Maps session ID → presence info (agentType, connectedAt, lastSeenAt)
   * Used for real-time "Claude is here" indicator
   *
   * Used by:
   * - Server: apps/server/src/registry-server.ts (write via hook API)
   * - Web: apps/web/src/components/PresenceIndicator.tsx (read)
   * - Helpers: packages/schema/src/yjs-helpers.ts (read/write)
   */
  PRESENCE: 'presence' as const,
} as const;

/**
 * Type-safe accessor for Y.Doc keys.
 * This ensures we can't accidentally use a wrong key.
 */
export type YDocKey = (typeof YDOC_KEYS)[keyof typeof YDOC_KEYS];

/**
 * Helper to validate a key is one of the known Y.Doc keys.
 * Useful for runtime validation when keys come from external sources.
 */
export function isValidYDocKey(key: string): key is YDocKey {
  return Object.values(YDOC_KEYS).includes(key as YDocKey);
}
