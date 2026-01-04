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
   * BlockNote content as JSON blocks (Y.Array<Block>)
   * Used for: JSON serialization, URL snapshots, read_plan tool
   *
   * NOTE: This is separate from DOCUMENT_FRAGMENT which BlockNote uses for editing.
   * Both must be kept in sync!
   *
   * Used by:
   * - Server: packages/server/src/tools/create-plan.ts (write)
   * - Server: packages/server/src/tools/read-plan.ts (read)
   * - Web: packages/web/src/hooks/useHydration.ts (write)
   * - Web: packages/web/src/pages/PlanPage.tsx (read, for fallback)
   */
  CONTENT: 'content' as const,

  /**
   * BlockNote document (Y.XmlFragment)
   * Used for: Real-time collaborative editing in BlockNote
   *
   * CRITICAL: BlockNote expects this to be an XmlFragment, NOT an Array!
   * This is the authoritative source for the editor display.
   *
   * Used by:
   * - Server: packages/server/src/tools/create-plan.ts (write via blocksToYXmlFragment)
   * - Web: packages/web/src/components/PlanViewer.tsx (read, BlockNote collaboration)
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

/**
 * CRITICAL ISSUE FIXED:
 *
 * Previously, there was a mismatch between:
 * - Server: stored content in ydoc.getArray('content')
 * - Browser: read content from ydoc.getXmlFragment('document')
 *
 * These are DIFFERENT Y.Doc structures and never synced!
 *
 * FIX:
 * - CONTENT ('content'): Y.Array for JSON serialization
 * - DOCUMENT_FRAGMENT ('document'): Y.XmlFragment for BlockNote collaboration
 * - Server creates BOTH in create-plan.ts
 * - Browser hydration creates CONTENT, BlockNote manages DOCUMENT_FRAGMENT
 *
 * Both structures contain the same blocks but in different formats:
 * - content: Block[] (plain JSON)
 * - document: Y.XmlFragment (ProseMirror structure)
 */
