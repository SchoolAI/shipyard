/**
 * Loro Shape definitions for Shipyard.
 *
 * Two document types:
 * 1. Task document (one per task)
 * 2. Global room document (one per room)
 */

import { type DocShape, type Infer, type InferMutableType, Shape } from '@loro-extended/change';

/**
 * Base fields shared across all comment types.
 * Used by: inline, pr, local, overall comments
 */
const CommentBaseFields = {
  id: Shape.plain.string(),
  threadId: Shape.plain.string(),
  body: Shape.plain.string(),
  author: Shape.plain.string(),
  createdAt: Shape.plain.number(),
  resolved: Shape.plain.boolean(),
  inReplyTo: Shape.plain.string().nullable(),
} as const;

/**
 * Base fields shared across all event types.
 * Used by: All 20+ event variants
 */
const EventBaseFields = {
  id: Shape.plain.string(),
  actor: Shape.plain.string(),
  timestamp: Shape.plain.number(),
  inboxWorthy: Shape.plain.boolean().nullable(),
  inboxFor: Shape.plain.any(), // string | string[] | null
} as const;

/**
 * Base fields shared across all artifact types.
 * Used by: github, local artifact storage
 */
const ArtifactBaseFields = {
  id: Shape.plain.string(),
  type: Shape.plain.string('html', 'image', 'video'),
  filename: Shape.plain.string(),
  description: Shape.plain.string().nullable(),
  uploadedAt: Shape.plain.number().nullable(),
} as const;

/**
 * Base fields shared across all input request types.
 * Used by: text, multiline, choice, confirm, number, email, date, rating, multi
 */
const InputRequestBaseFields = {
  id: Shape.plain.string(),
  message: Shape.plain.string(),
  status: Shape.plain.string('pending', 'answered', 'declined', 'cancelled'),
  createdAt: Shape.plain.number(),
  expiresAt: Shape.plain.number(),
  response: Shape.plain.any(),
  answeredAt: Shape.plain.number().nullable(),
  answeredBy: Shape.plain.string().nullable(),
  isBlocker: Shape.plain.boolean().nullable(),
} as const;

/**
 * Variant-specific fields for each input request type.
 * Extracted to avoid duplication between global and per-task schemas.
 */
const TextInputFields = {
  defaultValue: Shape.plain.string().nullable(),
  placeholder: Shape.plain.string().nullable(),
} as const;

const MultilineInputFields = {
  defaultValue: Shape.plain.string().nullable(),
  placeholder: Shape.plain.string().nullable(),
} as const;

const ChoiceInputFields = {
  options: Shape.plain.any(), // Array<{ label: string, value: string, description?: string }>
  multiSelect: Shape.plain.boolean().nullable(),
  displayAs: Shape.plain.string('radio', 'checkbox', 'dropdown').nullable(),
  placeholder: Shape.plain.string().nullable(),
} as const;

const NumberInputFields = {
  min: Shape.plain.number().nullable(),
  max: Shape.plain.number().nullable(),
  format: Shape.plain.string('integer', 'decimal', 'currency', 'percentage').nullable(),
  defaultValue: Shape.plain.number().nullable(),
} as const;

const EmailInputFields = {
  domain: Shape.plain.string().nullable(),
  placeholder: Shape.plain.string().nullable(),
} as const;

const DateInputFields = {
  min: Shape.plain.number().nullable(), // Unix timestamp
  max: Shape.plain.number().nullable(), // Unix timestamp
} as const;

const RatingInputFields = {
  min: Shape.plain.number().nullable(),
  max: Shape.plain.number().nullable(),
  ratingStyle: Shape.plain.string('stars', 'numbers', 'emoji').nullable(),
  ratingLabels: Shape.plain.any(), // { low?: string, high?: string }
} as const;

const MultiInputFields = {
  questions: Shape.plain.any(), // Array of nested question definitions
  responses: Shape.plain.any(), // Record<questionId, answer>
} as const;

/**
 * Schema for individual file changes in a ChangeSnapshot.
 */
const SyncedFileChangeSchema = Shape.plain.struct({
  path: Shape.plain.string(),
  status: Shape.plain.string('added', 'modified', 'deleted', 'renamed'),
  /** Unified diff patch */
  patch: Shape.plain.string(),
  staged: Shape.plain.boolean(),
});

/**
 * Individual task document schema.
 * One doc per task, contains all task-specific state.
 */
export const TaskDocumentSchema: DocShape = Shape.doc({
  meta: Shape.struct({
    id: Shape.plain.string(),
    title: Shape.plain.string(),
    status: Shape.plain.string('draft', 'pending_review', 'changes_requested', 'in_progress', 'completed'),

    /** Unix timestamp in milliseconds */
    createdAt: Shape.plain.number(),

    /** Unix timestamp in milliseconds */
    updatedAt: Shape.plain.number(),

    /** Unix timestamp in milliseconds */
    completedAt: Shape.plain.number().nullable(),

    completedBy: Shape.plain.string().nullable(),

    /**
     * GitHub username who owns this task.
     * Will become Shipyard user ID when adding auth system.
     */
    ownerId: Shape.plain.string().nullable(),

    /** CRDT schema version for breaking change detection */
    epoch: Shape.plain.number().nullable(),

    /** JSON-stringified OriginMetadata (platform: claude-code, devin, cursor, browser, unknown) */
    origin: Shape.plain.string().nullable(),

    /** GitHub repo in "owner/repo" format */
    repo: Shape.plain.string().nullable(),

    tags: Shape.list(Shape.plain.string()),

    /** username → Unix timestamp of last view */
    viewedBy: Shape.record(Shape.plain.number()),

    /** Unix timestamp in milliseconds */
    archivedAt: Shape.plain.number().nullable(),

    archivedBy: Shape.plain.string().nullable(),
  }),

  /** Tiptap/loro-prosemirror document (loro-prosemirror manages internal structure) */
  content: Shape.any(),

  /** commentId → comment (discriminated by 'kind': inline, pr, local, overall) */
  comments: Shape.record(
    Shape.plain.discriminatedUnion('kind', {
      inline: Shape.plain.struct({
        kind: Shape.plain.string('inline'),
        ...CommentBaseFields,
        blockId: Shape.plain.string(),
        selectedText: Shape.plain.string().nullable(),
      }),

      pr: Shape.plain.struct({
        kind: Shape.plain.string('pr'),
        ...CommentBaseFields,
        prNumber: Shape.plain.number(),
        path: Shape.plain.string(),
        line: Shape.plain.number(),
      }),

      local: Shape.plain.struct({
        kind: Shape.plain.string('local'),
        ...CommentBaseFields,
        path: Shape.plain.string(),
        line: Shape.plain.number(),
        baseRef: Shape.plain.string(),
        lineContentHash: Shape.plain.string(),
        machineId: Shape.plain.string().nullable(),
      }),

      overall: Shape.plain.struct({
        kind: Shape.plain.string('overall'),
        ...CommentBaseFields,
      }),
    })
  ),

  /**
   * Artifact metadata (discriminated by 'storage': github, local).
   * Binary content stored separately (not in CRDT).
   */
  artifacts: Shape.list(
    Shape.plain.discriminatedUnion('storage', {
      github: Shape.plain.struct({
        storage: Shape.plain.string('github'),
        ...ArtifactBaseFields,
        /** Full URL to raw.githubusercontent.com content */
        url: Shape.plain.string(),
      }),

      local: Shape.plain.struct({
        storage: Shape.plain.string('local'),
        ...ArtifactBaseFields,
        /** Path identifier in format "{planId}/{filename}" */
        localArtifactId: Shape.plain.string(),
      }),
    })
  ),

  /**
   * Measurable outcomes extracted from content checkboxes marked with {#deliverable}.
   * Task auto-completes when all deliverables have linked artifacts.
   */
  deliverables: Shape.list(
    Shape.plain.struct({
      id: Shape.plain.string(),
      text: Shape.plain.string(),
      linkedArtifactId: Shape.plain.string().nullable(),

      /** Unix timestamp in milliseconds */
      linkedAt: Shape.plain.number().nullable(),
    })
  ),

  /** Activity timeline (discriminated by 'type') */
  events: Shape.list(
    Shape.plain.discriminatedUnion('type', {
      task_created: Shape.plain.struct({
        type: Shape.plain.string('task_created'),
        ...EventBaseFields,
      }),
      status_changed: Shape.plain.struct({
        type: Shape.plain.string('status_changed'),
        ...EventBaseFields,
        fromStatus: Shape.plain.string(),
        toStatus: Shape.plain.string(),
      }),
      completed: Shape.plain.struct({
        type: Shape.plain.string('completed'),
        ...EventBaseFields,
      }),
      task_archived: Shape.plain.struct({
        type: Shape.plain.string('task_archived'),
        ...EventBaseFields,
      }),
      task_unarchived: Shape.plain.struct({
        type: Shape.plain.string('task_unarchived'),
        ...EventBaseFields,
      }),
      approved: Shape.plain.struct({
        type: Shape.plain.string('approved'),
        ...EventBaseFields,
        message: Shape.plain.string().nullable(),
      }),
      changes_requested: Shape.plain.struct({
        type: Shape.plain.string('changes_requested'),
        ...EventBaseFields,
        message: Shape.plain.string().nullable(),
      }),
      comment_added: Shape.plain.struct({
        type: Shape.plain.string('comment_added'),
        ...EventBaseFields,
        commentId: Shape.plain.string(),
        threadId: Shape.plain.string().nullable(),
        preview: Shape.plain.string().nullable(),
      }),
      comment_resolved: Shape.plain.struct({
        type: Shape.plain.string('comment_resolved'),
        ...EventBaseFields,
        commentId: Shape.plain.string(),
        threadId: Shape.plain.string().nullable(),
      }),
      artifact_uploaded: Shape.plain.struct({
        type: Shape.plain.string('artifact_uploaded'),
        ...EventBaseFields,
        artifactId: Shape.plain.string(),
        filename: Shape.plain.string(),
        artifactType: Shape.plain.string().nullable(),
      }),
      deliverable_linked: Shape.plain.struct({
        type: Shape.plain.string('deliverable_linked'),
        ...EventBaseFields,
        deliverableId: Shape.plain.string(),
        artifactId: Shape.plain.string(),
        deliverableText: Shape.plain.string().nullable(),
      }),
      pr_linked: Shape.plain.struct({
        type: Shape.plain.string('pr_linked'),
        ...EventBaseFields,
        prNumber: Shape.plain.number(),
        title: Shape.plain.string().nullable(),
      }),
      pr_unlinked: Shape.plain.struct({
        type: Shape.plain.string('pr_unlinked'),
        ...EventBaseFields,
        prNumber: Shape.plain.number(),
      }),
      content_edited: Shape.plain.struct({
        type: Shape.plain.string('content_edited'),
        ...EventBaseFields,
        summary: Shape.plain.string().nullable(),
      }),
      input_request_created: Shape.plain.struct({
        type: Shape.plain.string('input_request_created'),
        ...EventBaseFields,
        requestId: Shape.plain.string(),
        message: Shape.plain.string(),
        isBlocker: Shape.plain.boolean().nullable(),
      }),
      input_request_answered: Shape.plain.struct({
        type: Shape.plain.string('input_request_answered'),
        ...EventBaseFields,
        requestId: Shape.plain.string(),
      }),
      input_request_declined: Shape.plain.struct({
        type: Shape.plain.string('input_request_declined'),
        ...EventBaseFields,
        requestId: Shape.plain.string(),
      }),
      input_request_cancelled: Shape.plain.struct({
        type: Shape.plain.string('input_request_cancelled'),
        ...EventBaseFields,
        requestId: Shape.plain.string(),
      }),
      agent_activity: Shape.plain.struct({
        type: Shape.plain.string('agent_activity'),
        ...EventBaseFields,
        message: Shape.plain.string(),
        isBlocker: Shape.plain.boolean().nullable(),
      }),
      tag_added: Shape.plain.struct({
        type: Shape.plain.string('tag_added'),
        ...EventBaseFields,
        tag: Shape.plain.string(),
      }),
      tag_removed: Shape.plain.struct({
        type: Shape.plain.string('tag_removed'),
        ...EventBaseFields,
        tag: Shape.plain.string(),
      }),
      owner_changed: Shape.plain.struct({
        type: Shape.plain.string('owner_changed'),
        ...EventBaseFields,
        fromOwner: Shape.plain.string().nullable(),
        toOwner: Shape.plain.string(),
      }),
      repo_changed: Shape.plain.struct({
        type: Shape.plain.string('repo_changed'),
        ...EventBaseFields,
        fromRepo: Shape.plain.string().nullable(),
        toRepo: Shape.plain.string(),
      }),
      title_changed: Shape.plain.struct({
        type: Shape.plain.string('title_changed'),
        ...EventBaseFields,
        fromTitle: Shape.plain.string(),
        toTitle: Shape.plain.string(),
      }),
    })
  ),

  /** GitHub PR references */
  linkedPRs: Shape.list(
    Shape.plain.struct({
      prNumber: Shape.plain.number(),

      /** Cached from GitHub API (not auto-fetched to avoid rate limits) */
      status: Shape.plain.string('draft', 'open', 'merged', 'closed'),

      branch: Shape.plain.string().nullable(),
      title: Shape.plain.string().nullable(),
    })
  ),

  /**
   * Per-task input requests (discriminated by 'type').
   * No taskId field - implicit from parent document.
   */
  inputRequests: Shape.list(
    Shape.plain.discriminatedUnion('type', {
      text: Shape.plain.struct({
        type: Shape.plain.string('text'),
        ...InputRequestBaseFields,
        ...TextInputFields,
      }),
      multiline: Shape.plain.struct({
        type: Shape.plain.string('multiline'),
        ...InputRequestBaseFields,
        ...MultilineInputFields,
      }),
      choice: Shape.plain.struct({
        type: Shape.plain.string('choice'),
        ...InputRequestBaseFields,
        ...ChoiceInputFields,
      }),
      confirm: Shape.plain.struct({
        type: Shape.plain.string('confirm'),
        ...InputRequestBaseFields,
      }),
      number: Shape.plain.struct({
        type: Shape.plain.string('number'),
        ...InputRequestBaseFields,
        ...NumberInputFields,
      }),
      email: Shape.plain.struct({
        type: Shape.plain.string('email'),
        ...InputRequestBaseFields,
        ...EmailInputFields,
      }),
      date: Shape.plain.struct({
        type: Shape.plain.string('date'),
        ...InputRequestBaseFields,
        ...DateInputFields,
      }),
      rating: Shape.plain.struct({
        type: Shape.plain.string('rating'),
        ...InputRequestBaseFields,
        ...RatingInputFields,
      }),
      multi: Shape.plain.struct({
        type: Shape.plain.string('multi'),
        ...InputRequestBaseFields,
        ...MultiInputFields,
      }),
    })
  ),

  /** machineId → ChangeSnapshot (git diff state per machine) */
  changeSnapshots: Shape.record(
    Shape.struct({
      machineId: Shape.plain.string(),
      machineName: Shape.plain.string(),
      ownerId: Shape.plain.string(),
      headSha: Shape.plain.string(),
      branch: Shape.plain.string(),
      cwd: Shape.plain.string(),
      isLive: Shape.plain.boolean(),
      /** Unix timestamp in milliseconds */
      updatedAt: Shape.plain.number(),
      files: Shape.list(SyncedFileChangeSchema),
      totalAdditions: Shape.plain.number(),
      totalDeletions: Shape.plain.number(),
    })
  ),
}) satisfies DocShape;

/**
 * Global room document schema.
 * One doc per room, shared across all tasks.
 */
export const GlobalRoomSchema: DocShape = Shape.doc({
  /**
   * Global input requests (discriminated by 'type').
   * Has taskId field for task association.
   */
  inputRequests: Shape.list(
    Shape.plain.discriminatedUnion('type', {
      text: Shape.plain.struct({
        type: Shape.plain.string('text'),
        ...InputRequestBaseFields,
        taskId: Shape.plain.string().nullable(),
        ...TextInputFields,
      }),
      multiline: Shape.plain.struct({
        type: Shape.plain.string('multiline'),
        ...InputRequestBaseFields,
        taskId: Shape.plain.string().nullable(),
        ...MultilineInputFields,
      }),
      choice: Shape.plain.struct({
        type: Shape.plain.string('choice'),
        ...InputRequestBaseFields,
        taskId: Shape.plain.string().nullable(),
        ...ChoiceInputFields,
      }),
      confirm: Shape.plain.struct({
        type: Shape.plain.string('confirm'),
        ...InputRequestBaseFields,
        taskId: Shape.plain.string().nullable(),
      }),
      number: Shape.plain.struct({
        type: Shape.plain.string('number'),
        ...InputRequestBaseFields,
        taskId: Shape.plain.string().nullable(),
        ...NumberInputFields,
      }),
      email: Shape.plain.struct({
        type: Shape.plain.string('email'),
        ...InputRequestBaseFields,
        taskId: Shape.plain.string().nullable(),
        ...EmailInputFields,
      }),
      date: Shape.plain.struct({
        type: Shape.plain.string('date'),
        ...InputRequestBaseFields,
        taskId: Shape.plain.string().nullable(),
        ...DateInputFields,
      }),
      rating: Shape.plain.struct({
        type: Shape.plain.string('rating'),
        ...InputRequestBaseFields,
        taskId: Shape.plain.string().nullable(),
        ...RatingInputFields,
      }),
      multi: Shape.plain.struct({
        type: Shape.plain.string('multi'),
        ...InputRequestBaseFields,
        taskId: Shape.plain.string().nullable(),
        ...MultiInputFields,
      }),
    })
  ),
});

export type TaskDocumentShape = typeof TaskDocumentSchema;
export type TaskDocument = Infer<typeof TaskDocumentSchema>;
export type MutableTaskDocument = InferMutableType<typeof TaskDocumentSchema>;
export type TaskMeta = Infer<typeof TaskDocumentSchema.shapes.meta>;
export type TaskComment = Infer<typeof TaskDocumentSchema.shapes.comments>;
export type TaskEvent = Infer<typeof TaskDocumentSchema.shapes.events>;
export type TaskArtifact = Infer<typeof TaskDocumentSchema.shapes.artifacts>;
export type TaskDeliverable = Infer<typeof TaskDocumentSchema.shapes.deliverables>;
export type TaskLinkedPR = Infer<typeof TaskDocumentSchema.shapes.linkedPRs>;
export type TaskInputRequest = Infer<typeof TaskDocumentSchema.shapes.inputRequests>;
export type ChangeSnapshot = Infer<typeof TaskDocumentSchema.shapes.changeSnapshots>;
export type SyncedFileChange = Infer<typeof SyncedFileChangeSchema>;

export type GlobalRoomShape = typeof GlobalRoomSchema;
export type GlobalRoom = Infer<typeof GlobalRoomSchema>;
export type MutableGlobalRoom = InferMutableType<typeof GlobalRoomSchema>;
export type InputRequest = Infer<typeof GlobalRoomSchema.shapes.inputRequests>;

