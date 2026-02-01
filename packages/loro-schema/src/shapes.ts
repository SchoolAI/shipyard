/**
 * Loro Shape definitions for Shipyard task documents.
 *
 * Uses loro-extended's Shape API to define the CRDT schema.
 * This is the foundation - all sync, storage, and business logic depends on this.
 */

import { type Infer, type InferMutableType, Shape } from '@loro-extended/change';

/**
 * The task document schema.
 *
 * Usage with useHandle:
 *   const handle = useHandle(docId, TaskDocumentSchema)
 *
 * Usage for type annotations:
 *   type Doc = Infer<typeof TaskDocumentSchema>
 *   type MutableDoc = InferMutableType<typeof TaskDocumentSchema>
 */
export const TaskDocumentSchema = Shape.doc({
  //
  // ============================================================================
  // METADATA - Core plan info, status, ownership
  // ============================================================================
  //
  meta: Shape.struct({
    // Core identity
    id: Shape.plain.string(),
    title: Shape.plain.string(),  // TODO: Should this be immutable?

    // Timestamps
    createdAt: Shape.plain.number(),
    updatedAt: Shape.plain.number(),

    // Status tracking
    status: Shape.plain.string(),  // 'draft' | 'pending_review' | 'changes_requested' | 'in_progress' | 'completed'

    // Status-specific fields (nullable based on status)
    reviewRequestId: Shape.plain.string().nullable(),
    reviewedAt: Shape.plain.number().nullable(),
    reviewedBy: Shape.plain.string().nullable(),
    reviewComment: Shape.plain.string().nullable(),
    completedAt: Shape.plain.number().nullable(),
    completedBy: Shape.plain.string().nullable(),
    snapshotUrl: Shape.plain.string().nullable(),

    // GitHub integration
    repo: Shape.plain.string().nullable(),
    pr: Shape.plain.number().nullable(),

    // Ownership
    ownerId: Shape.plain.string().nullable(),

    // Archive
    archivedAt: Shape.plain.number().nullable(),
    archivedBy: Shape.plain.string().nullable(),

    // Session
    epoch: Shape.plain.number().nullable(),
    sessionToken: Shape.plain.string().nullable(),  // Shipyard JWT (not hash)

    // TODO: Origin metadata (platform, sessionId, etc.)
    // How to store discriminated union in Loro?
    // origin: ???
  }),

  //
  // ============================================================================
  // PERMISSIONS - FULL REDESIGN NEEDED
  // ============================================================================
  //
  // TODO: Design permission model from scratch
  //
  // From architecture doc proposal:
  // permissions: {
  //   roles: { "owner": ["*"], "collaborator": ["plan:read", "plan:write"], ... }
  //   grants: { "user-alice": "collaborator", ... }
  // }
  //
  // Questions to answer:
  // 1. What permissions exist? (plan:read, plan:write, events:write, admin:invite, etc.)
  // 2. Signaling server permissions? (in doc or separate?)
  // 3. Default permissions for approved users?
  //
  // PLACEHOLDER: userId → role mapping (simplified)
  permissions: Shape.record(Shape.plain.string()),  // userId → role

  //
  // ============================================================================
  // CONTENT - ProseMirror/Tiptap document
  // ============================================================================
  //
  // From prosemirror-collab example: loro-prosemirror manages its own structure
  // Use Shape.any() to let loro-prosemirror handle it internally
  //
  content: Shape.any(),  // loro-prosemirror manages this

  //
  // ============================================================================
  // COMMENTS - Thread storage with anchoring
  // ============================================================================
  //
  // TODO: Design comment structure and anchoring
  //
  // Map of commentId → comment data
  comments: Shape.record(
    Shape.struct({
      id: Shape.plain.string(),
      threadId: Shape.plain.string(),
      body: Shape.plain.string(),
      author: Shape.plain.string(),
      createdAt: Shape.plain.number(),
      resolved: Shape.plain.boolean(),

      // TODO: Anchoring - need to spike Loro cursor API
      blockId: Shape.plain.string().nullable(),
      selectedText: Shape.plain.string().nullable(),
    })
  ),

  //
  // ============================================================================
  // ARTIFACTS - Uploaded proof files
  // ============================================================================
  //
  artifacts: Shape.list(
    Shape.plain.struct({
      id: Shape.plain.string(),
      type: Shape.plain.string(),      // 'html' | 'image' | 'video'
      filename: Shape.plain.string(),
      description: Shape.plain.string().nullable(),
      storage: Shape.plain.string(),   // 'github' | 'local'
      url: Shape.plain.string().nullable(),
      localArtifactId: Shape.plain.string().nullable(),
      uploadedAt: Shape.plain.number().nullable(),
    })
  ),

  //
  // ============================================================================
  // DELIVERABLES - Checkboxes marked with {#deliverable}
  // ============================================================================
  //
  deliverables: Shape.list(
    Shape.plain.struct({
      id: Shape.plain.string(),
      text: Shape.plain.string(),
      linkedArtifactId: Shape.plain.string().nullable(),
      linkedAt: Shape.plain.number().nullable(),
    })
  ),

  //
  // ============================================================================
  // EVENTS - Activity timeline
  // ============================================================================
  //
  // Using structured format with event data as JSON string
  // Each event has type + actor + timestamp + type-specific data
  //
  events: Shape.list(
    Shape.plain.struct({
      id: Shape.plain.string(),
      type: Shape.plain.string(),
      actor: Shape.plain.string(),
      timestamp: Shape.plain.number(),
      // Event data as JSON string (supports discriminated unions)
      data: Shape.plain.string(),  // JSON.stringify(eventData)
    })
  ),

  //
  // ============================================================================
  // SNAPSHOTS - Version history
  // ============================================================================
  //
  snapshots: Shape.list(
    Shape.plain.struct({
      id: Shape.plain.string(),
      status: Shape.plain.string(),
      createdBy: Shape.plain.string(),
      reason: Shape.plain.string(),
      createdAt: Shape.plain.number(),

      // Tiptap content as JSON string (editor.getJSON())
      content: Shape.plain.string(),  // JSON.stringify(tiptapJSON)

      // Optional metadata (flattened for simplicity)
      threadSummaryTotal: Shape.plain.number().nullable(),
      threadSummaryUnresolved: Shape.plain.number().nullable(),
    })
  ),

  //
  // ============================================================================
  // LINKED_PRS - GitHub PR references
  // ============================================================================
  //
  linkedPRs: Shape.list(
    Shape.plain.struct({
      prNumber: Shape.plain.number(),
      url: Shape.plain.string().nullable(),
      status: Shape.plain.string(),    // 'draft' | 'open' | 'merged' | 'closed'
      linkedAt: Shape.plain.number(),
    })
  ),

  //
  // ============================================================================
  // INPUT_REQUESTS - User input from agents
  // ============================================================================
  //
  inputRequests: Shape.list(
    Shape.plain.struct({
      id: Shape.plain.string(),
      type: Shape.plain.string(),
      message: Shape.plain.string(),
      status: Shape.plain.string(),    // 'pending' | 'answered' | 'declined' | 'cancelled'
      createdAt: Shape.plain.number(),
      timeout: Shape.plain.number(),
      response: Shape.plain.string().nullable(),
      answeredAt: Shape.plain.number().nullable(),
      answeredBy: Shape.plain.string().nullable(),
      // TODO: Multi-question support (questions array, responses map)
    })
  ),

  //
  // ============================================================================
  // PR_REVIEW_COMMENTS - GitHub PR review comments
  // ============================================================================
  //
  prReviewComments: Shape.list(
    Shape.plain.struct({
      id: Shape.plain.string(),
      prNumber: Shape.plain.number(),
      path: Shape.plain.string(),
      line: Shape.plain.number(),
      body: Shape.plain.string(),
      author: Shape.plain.string(),
      createdAt: Shape.plain.number(),
      resolved: Shape.plain.boolean().nullable(),
      inReplyTo: Shape.plain.string().nullable(),
    })
  ),

  //
  // ============================================================================
  // LOCAL_DIFF_COMMENTS - Uncommitted changes review
  // ============================================================================
  //
  localDiffComments: Shape.list(
    Shape.plain.struct({
      id: Shape.plain.string(),
      type: Shape.plain.string(),      // 'local'
      path: Shape.plain.string(),
      line: Shape.plain.number(),
      body: Shape.plain.string(),
      author: Shape.plain.string(),
      createdAt: Shape.plain.number(),
      baseRef: Shape.plain.string(),   // HEAD SHA when comment created
      lineContentHash: Shape.plain.string(),
      resolved: Shape.plain.boolean().nullable(),
      inReplyTo: Shape.plain.string().nullable(),
    })
  ),

  //
  // ============================================================================
  // CHANGE_SNAPSHOTS - Machine-specific git diffs
  // ============================================================================
  //
  // Map of machineId → snapshot data
  // TODO: Define ChangeSnapshot structure (files array, gitRef, timestamp)
  // Using JSON strings for now (can make structured later)
  changeSnapshots: Shape.record(Shape.plain.string()),  // machineId → JSON.stringify(snapshot)

  //
  // ============================================================================
  // PRESENCE - Agent presence audit trail (optional)
  // ============================================================================
  //
  // loro-extended provides ephemeral presence via usePresence()
  // This would only be for persistent audit trail
  // TODO: Decide if needed - commented out for now
  //
  // presence: Shape.record(Shape.struct({
  //   sessionId: Shape.plain.string(),
  //   platform: Shape.plain.string(),
  //   joinedAt: Shape.plain.number(),
  //   leftAt: Shape.plain.number().nullable(),
  // })),
});

/**
 * Type alias for the task document schema.
 * Use this when you need to reference the schema type itself.
 */
export type TaskDocumentShape = typeof TaskDocumentSchema;

/**
 * Inferred plain (JSON-serializable) type from the task document schema.
 * Use this for type-safe access to document data.
 */
export type TaskDocument = Infer<typeof TaskDocumentSchema>;

/**
 * Inferred mutable type from the task document schema.
 * Use this within change() callbacks for type-safe mutations.
 */
export type MutableTaskDocument = InferMutableType<typeof TaskDocumentSchema>;

/**
 * Inferred types for individual containers.
 * Access nested shape types via TaskDocumentSchema.shapes.*
 */
export type TaskMeta = Infer<typeof TaskDocumentSchema.shapes.meta>;
export type TaskComment = Infer<typeof TaskDocumentSchema.shapes.comments>;
export type TaskEvent = Infer<typeof TaskDocumentSchema.shapes.events>;
export type TaskArtifact = Infer<typeof TaskDocumentSchema.shapes.artifacts>;
export type TaskDeliverable = Infer<typeof TaskDocumentSchema.shapes.deliverables>;
export type TaskSnapshot = Infer<typeof TaskDocumentSchema.shapes.snapshots>;
export type TaskLinkedPR = Infer<typeof TaskDocumentSchema.shapes.linkedPRs>;
export type TaskInputRequest = Infer<typeof TaskDocumentSchema.shapes.inputRequests>;
export type TaskPRReviewComment = Infer<typeof TaskDocumentSchema.shapes.prReviewComments>;
export type TaskLocalDiffComment = Infer<typeof TaskDocumentSchema.shapes.localDiffComments>;
