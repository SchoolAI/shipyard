import { z } from 'zod';

/**
 * Valid status values for a plan.
 *
 * Flow: draft → pending_review ⟷ changes_requested (loop) → in_progress → completed
 *
 * When reviewer approves: pending_review → in_progress (with matching reviewRequestId)
 * When reviewer requests changes: pending_review → changes_requested (with matching reviewRequestId)
 * Agent fixes and re-submits: changes_requested → pending_review (new reviewRequestId)
 */
export const PlanStatusValues = [
  'draft',
  'pending_review',
  'changes_requested',
  'in_progress',
  'completed',
] as const;
export type PlanStatusType = (typeof PlanStatusValues)[number];

/**
 * Supported origin platforms for conversation export.
 * Used to identify where a plan/conversation originated.
 */
export const OriginPlatformValues = [
  'claude-code',
  'devin',
  'cursor',
  'windsurf',
  'aider',
  'unknown',
] as const;
export type OriginPlatform = (typeof OriginPlatformValues)[number];

/**
 * Origin metadata for conversation export - discriminated by platform.
 * Each platform has different session tracking mechanisms.
 */
export const ClaudeCodeOriginMetadataSchema = z.object({
  platform: z.literal('claude-code'),
  sessionId: z.string(),
  transcriptPath: z.string(),
  cwd: z.string().optional(),
});

export const DevinOriginMetadataSchema = z.object({
  platform: z.literal('devin'),
  sessionId: z.string(),
  // Add devin-specific fields when implemented
});

export const CursorOriginMetadataSchema = z.object({
  platform: z.literal('cursor'),
  conversationId: z.string(),
  generationId: z.string().optional(),
  // Add cursor-specific fields when implemented
});

export const UnknownOriginMetadataSchema = z.object({
  platform: z.literal('unknown'),
});

export const OriginMetadataSchema = z.discriminatedUnion('platform', [
  ClaudeCodeOriginMetadataSchema,
  DevinOriginMetadataSchema,
  CursorOriginMetadataSchema,
  UnknownOriginMetadataSchema,
]);

export type OriginMetadata = z.infer<typeof OriginMetadataSchema>;
export type ClaudeCodeOriginMetadata = z.infer<typeof ClaudeCodeOriginMetadataSchema>;
export type DevinOriginMetadata = z.infer<typeof DevinOriginMetadataSchema>;
export type CursorOriginMetadata = z.infer<typeof CursorOriginMetadataSchema>;

/**
 * Parse and validate Claude Code hook metadata.
 * Safely extracts origin fields with runtime validation.
 */
export function parseClaudeCodeOrigin(
  hookMetadata: Record<string, unknown> | undefined
): ClaudeCodeOriginMetadata | null {
  if (!hookMetadata) return null;

  const result = ClaudeCodeOriginMetadataSchema.safeParse({
    platform: 'claude-code',
    sessionId: hookMetadata.originSessionId,
    transcriptPath: hookMetadata.originTranscriptPath,
    cwd: hookMetadata.originCwd,
  });

  return result.success ? result.data : null;
}

/**
 * A conversation version tracked on the plan.
 * Content is NOT stored in CRDT - only metadata for provenance tracking.
 * Actual content is transferred on-demand via P2P during handoff.
 */
export interface ConversationVersion {
  versionId: string;
  creator: string;
  platform: OriginPlatform;
  /** Foreign key to local file - content NOT stored in CRDT */
  sessionId: string;
  messageCount: number;
  createdAt: number;
  handedOffAt?: number;
  handedOffTo?: string;
}

export const ConversationVersionSchema = z.object({
  versionId: z.string(),
  creator: z.string(),
  platform: z.enum(OriginPlatformValues),
  sessionId: z.string(),
  messageCount: z.number(),
  createdAt: z.number(),
  handedOffAt: z.number().optional(),
  handedOffTo: z.string().optional(),
});

export const PlanEventTypes = [
  'plan_created',
  'status_changed',
  'comment_added',
  'comment_resolved',
  'artifact_uploaded',
  'deliverable_linked',
  'pr_linked',
  'content_edited',
  'approved',
  'changes_requested',
  'completed',
  'conversation_imported',
  'conversation_handed_off',
  'step_completed',
  'plan_archived',
  'plan_unarchived',
  'conversation_exported',
  'plan_shared',
  'approval_requested',
] as const;
export type PlanEventType = (typeof PlanEventTypes)[number];

export interface PlanEvent {
  id: string;
  type: PlanEventType;
  actor: string;
  timestamp: number;
  data?: {
    fromStatus?: PlanStatusType;
    toStatus?: PlanStatusType;
    artifactId?: string;
    commentId?: string;
    prNumber?: number;
    stepId?: string;
    completed?: boolean;
    conversationId?: string;
    messageCount?: number;
    [key: string]: unknown;
  };
  /** Whether this event should appear in the user's inbox (requires action) */
  inboxWorthy?: boolean;
  /**
   * Who should see this event in their inbox.
   * Can be: GitHub username(s), 'owner', 'mentioned', 'shared_recipient'
   */
  inboxFor?: string | string[];
}

export const PlanEventSchema = z.object({
  id: z.string(),
  type: z.enum(PlanEventTypes),
  actor: z.string(),
  timestamp: z.number(),
  data: z.record(z.string(), z.unknown()).optional(),
  inboxWorthy: z.boolean().optional(),
  inboxFor: z.union([z.string(), z.array(z.string())]).optional(),
});

/**
 * Check if an event should appear in a user's inbox.
 *
 * @param event - The event to check
 * @param username - GitHub username to check against
 * @returns true if the event is inbox-worthy for this user
 */
export function isInboxWorthy(event: PlanEvent, username: string): boolean {
  // Not inbox-worthy if flag is explicitly false or missing
  if (!event.inboxWorthy) {
    return false;
  }

  // No inboxFor means inbox-worthy for everyone
  if (!event.inboxFor) {
    return true;
  }

  // Handle array of usernames
  if (Array.isArray(event.inboxFor)) {
    return event.inboxFor.includes(username);
  }

  // Handle single username or role
  return event.inboxFor === username;
}

/** Base fields shared by all plan statuses */
interface PlanMetadataBase {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  repo?: string;
  pr?: number;
  ownerId?: string;
  /** Defaults to true when ownerId is set */
  approvalRequired?: boolean;
  approvedUsers?: string[];
  /** Users who have been denied access to this plan */
  rejectedUsers?: string[];
  /** SHA256 hash of session token for MCP API access */
  sessionTokenHash?: string;
  /** When the plan was archived (hidden from sidebar by default) */
  archivedAt?: number;
  /** Display name of who archived the plan */
  archivedBy?: string;
  /** Origin metadata for conversation export (platform-specific) */
  origin?: OriginMetadata;
  /** Records when each user last viewed the plan (username → timestamp) */
  viewedBy?: Record<string, number>;
  /**
   * Conversation versions tracked on this plan.
   * Content is NOT stored - only metadata for provenance tracking.
   * Actual content is transferred on-demand via P2P.
   */
  conversationVersions?: ConversationVersion[];
  /** Event log for timeline display and audit trail */
  events?: PlanEvent[];
}

/** Discriminated union based on status field */
export type PlanMetadata =
  | (PlanMetadataBase & {
      status: 'draft';
    })
  | (PlanMetadataBase & {
      status: 'pending_review';
      /**
       * Unique identifier for current review request.
       * Set by hook when requesting review, checked before accepting approval/denial.
       * Prevents stale review decisions from previous cycles.
       */
      reviewRequestId: string;
    })
  | (PlanMetadataBase & {
      status: 'changes_requested';
      /** When the plan was reviewed (changes requested) */
      reviewedAt: number;
      /** Display name of the reviewer */
      reviewedBy: string;
      /** Feedback from reviewer about requested changes */
      reviewComment?: string;
    })
  | (PlanMetadataBase & {
      status: 'in_progress';
      /** When the plan was approved */
      reviewedAt: number;
      /** Display name of the reviewer who approved */
      reviewedBy: string;
    })
  | (PlanMetadataBase & {
      status: 'completed';
      /** When the task was marked complete */
      completedAt: number;
      /** Who marked the task complete (agent or reviewer name) */
      completedBy: string;
      /** Snapshot URL generated on completion */
      snapshotUrl?: string;
    });

/** Base schema shared by all statuses */
const PlanMetadataBaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  repo: z.string().optional(),
  pr: z.number().optional(),
  ownerId: z.string().optional(),
  approvalRequired: z.boolean().optional(),
  approvedUsers: z.array(z.string()).optional(),
  rejectedUsers: z.array(z.string()).optional(),
  sessionTokenHash: z.string().optional(),
  archivedAt: z.number().optional(),
  archivedBy: z.string().optional(),
  origin: OriginMetadataSchema.optional(),
  viewedBy: z.record(z.string(), z.number()).optional(),
  conversationVersions: z.array(ConversationVersionSchema).optional(),
  events: z.array(PlanEventSchema).optional(),
});

export const PlanMetadataSchema = z.discriminatedUnion('status', [
  PlanMetadataBaseSchema.extend({
    status: z.literal('draft'),
  }),
  PlanMetadataBaseSchema.extend({
    status: z.literal('pending_review'),
    reviewRequestId: z.string(),
  }),
  PlanMetadataBaseSchema.extend({
    status: z.literal('changes_requested'),
    reviewedAt: z.number(),
    reviewedBy: z.string(),
    reviewComment: z.string().optional(),
  }),
  PlanMetadataBaseSchema.extend({
    status: z.literal('in_progress'),
    reviewedAt: z.number(),
    reviewedBy: z.string(),
  }),
  PlanMetadataBaseSchema.extend({
    status: z.literal('completed'),
    completedAt: z.number(),
    completedBy: z.string(),
    snapshotUrl: z.string().optional(),
  }),
]);

export type ArtifactType = 'screenshot' | 'video' | 'test_results' | 'diff';

// Base fields shared by both storage types
interface BaseArtifact {
  id: string;
  type: ArtifactType;
  filename: string;
  description?: string;
  uploadedAt?: number;
}

// GitHub storage: MUST have url
export interface GitHubArtifact extends BaseArtifact {
  storage: 'github';
  url: string;
}

// Local storage: MUST have localArtifactId
export interface LocalArtifact extends BaseArtifact {
  storage: 'local';
  localArtifactId: string;
}

// Discriminated union - TypeScript enforces correctness
export type Artifact = GitHubArtifact | LocalArtifact;

export const ArtifactSchema = z.discriminatedUnion('storage', [
  z.object({
    id: z.string(),
    type: z.enum(['screenshot', 'video', 'test_results', 'diff']),
    filename: z.string(),
    storage: z.literal('github'),
    url: z.string(),
    description: z.string().optional(),
    uploadedAt: z.number().optional(),
  }),
  z.object({
    id: z.string(),
    type: z.enum(['screenshot', 'video', 'test_results', 'diff']),
    filename: z.string(),
    storage: z.literal('local'),
    localArtifactId: z.string(),
    description: z.string().optional(),
    uploadedAt: z.number().optional(),
  }),
]);

export function getArtifactUrl(repo: string, pr: number, planId: string, filename: string): string {
  return `https://raw.githubusercontent.com/${repo}/plan-artifacts/pr-${pr}/${planId}/${filename}`;
}

export interface StepCompletion {
  stepId: string;
  completed: boolean;
  completedAt?: number;
  completedBy?: string;
}

/**
 * A deliverable extracted from plan content.
 * Checkboxes marked with {#deliverable} become deliverables.
 */
export interface Deliverable {
  /** Unique ID (typically the BlockNote block ID) */
  id: string;
  /** Checkbox text (e.g., "Screenshot of login page") */
  text: string;
  /** Artifact ID when linked */
  linkedArtifactId?: string;
  /** When the artifact was linked */
  linkedAt?: number;
}

export const DeliverableSchema = z.object({
  id: z.string(),
  text: z.string(),
  linkedArtifactId: z.string().optional(),
  linkedAt: z.number().optional(),
});

/**
 * A point-in-time snapshot of plan state.
 * Created at significant status transitions for version history.
 * Stored in Y.Array(YDOC_KEYS.SNAPSHOTS) for CRDT sync.
 */
export interface PlanSnapshot {
  /** Unique snapshot ID */
  id: string;
  /** Status at time of snapshot */
  status: PlanStatusType;
  /** Who created this snapshot (agent or human name) */
  createdBy: string;
  /** Why this snapshot was created (e.g., "Approved by reviewer") */
  reason: string;
  /** Timestamp when snapshot was taken */
  createdAt: number;
  /** Plan content blocks at this point (BlockNote Block[]) */
  content: unknown[];
  /** Thread summary (lightweight, not full threads) */
  threadSummary?: {
    total: number;
    unresolved: number;
  };
  /** Artifacts at this point */
  artifacts?: Artifact[];
  /** Deliverables with linkage state */
  deliverables?: Deliverable[];
}

export const PlanSnapshotSchema = z.object({
  id: z.string(),
  status: z.enum(PlanStatusValues),
  createdBy: z.string(),
  reason: z.string(),
  createdAt: z.number(),
  content: z.array(z.unknown()),
  threadSummary: z
    .object({
      total: z.number(),
      unresolved: z.number(),
    })
    .optional(),
  artifacts: z.array(ArtifactSchema).optional(),
  deliverables: z.array(DeliverableSchema).optional(),
});

export const LinkedPRStatusValues = ['draft', 'open', 'merged', 'closed'] as const;
export type LinkedPRStatus = (typeof LinkedPRStatusValues)[number];

/**
 * A GitHub PR linked to a plan.
 * Auto-detected from branch when complete_task runs.
 */
export interface LinkedPR {
  /** GitHub PR number */
  prNumber: number;
  /** Full PR URL (e.g., https://github.com/org/repo/pull/123) */
  url: string;
  /** When the PR was linked to this plan */
  linkedAt: number;
  /** Current PR status */
  status: LinkedPRStatus;
  /** Branch name the PR is from */
  branch?: string;
  /** PR title for display */
  title?: string;
}

export const LinkedPRSchema = z.object({
  prNumber: z.number(),
  url: z.string(),
  linkedAt: z.number(),
  status: z.enum(LinkedPRStatusValues),
  branch: z.string().optional(),
  title: z.string().optional(),
});

/**
 * A review comment on a PR diff.
 * Can be added by AI (via MCP tool) or human (via UI).
 */
export interface PRReviewComment {
  /** Unique comment ID */
  id: string;
  /** PR number this comment belongs to */
  prNumber: number;
  /** File path in the diff */
  path: string;
  /** Line number in the diff (in modified file) */
  line: number;
  /** Comment content (markdown supported) */
  body: string;
  /** Author - GitHub username or "AI" */
  author: string;
  /** When the comment was created */
  createdAt: number;
  /** Whether the comment has been resolved */
  resolved?: boolean;
}

export const PRReviewCommentSchema = z.object({
  id: z.string(),
  prNumber: z.number(),
  path: z.string(),
  line: z.number(),
  body: z.string(),
  author: z.string(),
  createdAt: z.number(),
  resolved: z.boolean().optional(),
});
