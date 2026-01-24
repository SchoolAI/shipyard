import { nanoid } from 'nanoid';
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
 * Valid tab/view types for plan content display.
 * Used for tab navigation in PlanContent component and URL routing.
 */
export const PlanViewTabValues = ['plan', 'activity', 'deliverables', 'changes'] as const;
export type PlanViewTab = (typeof PlanViewTabValues)[number];

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
});

export const CursorOriginMetadataSchema = z.object({
  platform: z.literal('cursor'),
  conversationId: z.string(),
  generationId: z.string().optional(),
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
interface ConversationVersionBase {
  versionId: string;
  creator: string;
  platform: OriginPlatform;
  /** Foreign key to local file - content NOT stored in CRDT */
  sessionId: string;
  messageCount: number;
  createdAt: number;
}

export type ConversationVersion =
  | (ConversationVersionBase & { handedOff: false })
  | (ConversationVersionBase & { handedOff: true; handedOffAt: number; handedOffTo: string });

const ConversationVersionBaseSchema = z.object({
  versionId: z.string(),
  creator: z.string(),
  platform: z.enum(OriginPlatformValues),
  sessionId: z.string(),
  messageCount: z.number(),
  createdAt: z.number(),
});

export const ConversationVersionSchema = z.discriminatedUnion('handedOff', [
  ConversationVersionBaseSchema.extend({
    handedOff: z.literal(false),
  }),
  ConversationVersionBaseSchema.extend({
    handedOff: z.literal(true),
    handedOffAt: z.number(),
    handedOffTo: z.string(),
  }),
]);

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
  'input_request_created',
  'input_request_answered',
  'input_request_declined',
  'agent_activity',
  'session_token_regenerated',
] as const;
export type PlanEventType = (typeof PlanEventTypes)[number];

/**
 * Agent activity types for tracking agent work status and updates.
 * Used in agent_activity events to communicate agent state to humans.
 */
export const AgentActivityTypes = [
  'help_request',
  'help_request_resolved',
  'blocker',
  'blocker_resolved',
] as const;
export type AgentActivityType = (typeof AgentActivityTypes)[number];

/** Base fields shared by all plan events */
interface PlanEventBase {
  id: string;
  actor: string;
  timestamp: number;
  /** Whether this event should appear in the user's inbox (requires action) */
  inboxWorthy?: boolean;
  /**
   * Who should see this event in their inbox.
   * Can be: GitHub username(s), 'owner', 'mentioned', 'shared_recipient'
   */
  inboxFor?: string | string[];
}

/** Discriminated union of all plan event types with type-safe data payloads */
export type PlanEvent =
  | (PlanEventBase & {
      type: 'plan_created' | 'content_edited' | 'plan_archived' | 'plan_unarchived' | 'plan_shared';
    })
  | (PlanEventBase & {
      type: 'status_changed';
      data: {
        fromStatus: PlanStatusType;
        toStatus: PlanStatusType;
      };
    })
  | (PlanEventBase & {
      type: 'artifact_uploaded';
      data: {
        artifactId: string;
      };
    })
  | (PlanEventBase & {
      type: 'comment_added';
      data?: {
        commentId?: string;
        prNumber?: number;
        mentions?: boolean;
      };
    })
  | (PlanEventBase & {
      type: 'comment_resolved';
      data?: {
        commentId?: string;
        resolvedCount?: number;
      };
    })
  | (PlanEventBase & {
      type: 'deliverable_linked';
      data?: {
        deliverableId?: string;
        artifactId?: string;
        allFulfilled?: boolean;
      };
    })
  | (PlanEventBase & {
      type: 'pr_linked';
      data: {
        prNumber: number;
        url?: string;
      };
    })
  | (PlanEventBase & {
      type: 'approved' | 'changes_requested';
      data?: {
        comment?: string;
      };
    })
  | (PlanEventBase & {
      type: 'completed';
    })
  | (PlanEventBase & {
      type: 'step_completed';
      data: {
        stepId: string;
        completed: boolean;
      };
    })
  | (PlanEventBase & {
      type: 'conversation_imported';
      data: {
        sourcePlatform?: string;
        messageCount: number;
        sourceSessionId?: string;
      };
    })
  | (PlanEventBase & {
      type: 'conversation_exported';
      data: {
        messageCount: number;
      };
    })
  | (PlanEventBase & {
      type: 'conversation_handed_off';
      data: {
        handedOffTo: string;
        messageCount: number;
      };
    })
  | (PlanEventBase & {
      type: 'approval_requested';
      data?: {
        requesterName?: string;
      };
    })
  | (PlanEventBase & {
      type: 'input_request_created';
      data: {
        requestId: string;
        requestType: 'text' | 'multiline' | 'choice' | 'confirm';
        requestMessage: string;
      };
    })
  | (PlanEventBase & {
      type: 'input_request_answered';
      data: {
        requestId: string;
        response: unknown;
        answeredBy: string;
      };
    })
  | (PlanEventBase & {
      type: 'input_request_declined';
      data: {
        requestId: string;
      };
    })
  | (PlanEventBase & {
      type: 'agent_activity';
      data: AgentActivityData;
    })
  | (PlanEventBase & {
      type: 'session_token_regenerated';
    });

/** Base schema shared by all plan events */
const PlanEventBaseSchema = z.object({
  id: z.string(),
  actor: z.string(),
  timestamp: z.number(),
  inboxWorthy: z.boolean().optional(),
  inboxFor: z.union([z.string(), z.array(z.string())]).optional(),
});

/** Zod schema for agent activity data discriminated union */
export const AgentActivityDataSchema = z.discriminatedUnion('activityType', [
  z.object({
    activityType: z.literal('help_request'),
    requestId: z.string(),
    message: z.string(),
  }),
  z.object({
    activityType: z.literal('help_request_resolved'),
    requestId: z.string(),
    resolution: z.string().optional(),
  }),
  z.object({
    activityType: z.literal('blocker'),
    message: z.string(),
    requestId: z.string(),
  }),
  z.object({
    activityType: z.literal('blocker_resolved'),
    requestId: z.string(),
    resolution: z.string().optional(),
  }),
]);

/**
 * Discriminated union for agent activity event data.
 * Each activity type has specific required/optional fields.
 * Derived from AgentActivityDataSchema to prevent drift.
 */
export type AgentActivityData = z.infer<typeof AgentActivityDataSchema>;

/** Discriminated union schema for plan events */
export const PlanEventSchema = z.discriminatedUnion('type', [
  PlanEventBaseSchema.extend({
    type: z.enum([
      'plan_created',
      'content_edited',
      'plan_archived',
      'plan_unarchived',
      'plan_shared',
    ]),
  }),
  PlanEventBaseSchema.extend({
    type: z.literal('status_changed'),
    data: z.object({
      fromStatus: z.enum(PlanStatusValues),
      toStatus: z.enum(PlanStatusValues),
    }),
  }),
  PlanEventBaseSchema.extend({
    type: z.literal('artifact_uploaded'),
    data: z.object({
      artifactId: z.string(),
    }),
  }),
  PlanEventBaseSchema.extend({
    type: z.literal('comment_added'),
    data: z
      .object({
        commentId: z.string().optional(),
        prNumber: z.number().optional(),
        mentions: z.boolean().optional(),
      })
      .optional(),
  }),
  PlanEventBaseSchema.extend({
    type: z.literal('comment_resolved'),
    data: z
      .object({
        commentId: z.string().optional(),
        resolvedCount: z.number().optional(),
      })
      .optional(),
  }),
  PlanEventBaseSchema.extend({
    type: z.literal('deliverable_linked'),
    data: z
      .object({
        deliverableId: z.string().optional(),
        artifactId: z.string().optional(),
        allFulfilled: z.boolean().optional(),
      })
      .optional(),
  }),
  PlanEventBaseSchema.extend({
    type: z.literal('pr_linked'),
    data: z.object({
      prNumber: z.number(),
      url: z.string().optional(),
    }),
  }),
  PlanEventBaseSchema.extend({
    type: z.enum(['approved', 'changes_requested']),
    data: z
      .object({
        comment: z.string().optional(),
      })
      .optional(),
  }),
  PlanEventBaseSchema.extend({
    type: z.literal('completed'),
  }),
  PlanEventBaseSchema.extend({
    type: z.literal('step_completed'),
    data: z.object({
      stepId: z.string(),
      completed: z.boolean(),
    }),
  }),
  PlanEventBaseSchema.extend({
    type: z.literal('conversation_imported'),
    data: z.object({
      sourcePlatform: z.string().optional(),
      messageCount: z.number(),
      sourceSessionId: z.string().optional(),
    }),
  }),
  PlanEventBaseSchema.extend({
    type: z.literal('conversation_exported'),
    data: z.object({
      messageCount: z.number(),
    }),
  }),
  PlanEventBaseSchema.extend({
    type: z.literal('conversation_handed_off'),
    data: z.object({
      handedOffTo: z.string(),
      messageCount: z.number(),
    }),
  }),
  PlanEventBaseSchema.extend({
    type: z.literal('approval_requested'),
    data: z
      .object({
        requesterName: z.string().optional(),
      })
      .optional(),
  }),
  PlanEventBaseSchema.extend({
    type: z.literal('input_request_created'),
    data: z.object({
      requestId: z.string(),
      requestType: z.enum(['text', 'multiline', 'choice', 'confirm']),
      requestMessage: z.string(),
    }),
  }),
  PlanEventBaseSchema.extend({
    type: z.literal('input_request_answered'),
    data: z.object({
      requestId: z.string(),
      response: z.unknown(),
      answeredBy: z.string(),
    }),
  }),
  PlanEventBaseSchema.extend({
    type: z.literal('input_request_declined'),
    data: z.object({
      requestId: z.string(),
    }),
  }),
  PlanEventBaseSchema.extend({
    type: z.literal('agent_activity'),
    data: AgentActivityDataSchema,
  }),
  PlanEventBaseSchema.extend({
    type: z.literal('session_token_regenerated'),
  }),
]);

/**
 * Check if an event should appear in a user's inbox.
 *
 * @param event - The event to check
 * @param username - GitHub username to check against
 * @param ownerId - Optional plan owner's username (needed to resolve 'owner' in inboxFor)
 * @returns true if the event is inbox-worthy for this user
 */
export function isInboxWorthy(event: PlanEvent, username: string, ownerId?: string): boolean {
  if (!event.inboxWorthy) {
    return false;
  }

  if (!event.inboxFor) {
    return true;
  }

  const resolvedInboxFor = event.inboxFor === 'owner' && ownerId ? ownerId : event.inboxFor;

  if (Array.isArray(resolvedInboxFor)) {
    return resolvedInboxFor.includes(username);
  }

  return resolvedInboxFor === username;
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
  /** Free-form tags for flexible categorization (e.g., "ui", "bug", "project:mobile-app") */
  tags?: string[];
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
      /** Optional feedback from reviewer on approval */
      reviewComment?: string;
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
  tags: z.array(z.string()).optional(),
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
    reviewComment: z.string().optional(),
  }),
  PlanMetadataBaseSchema.extend({
    status: z.literal('completed'),
    completedAt: z.number(),
    completedBy: z.string(),
    snapshotUrl: z.string().optional(),
  }),
]);

export type ArtifactType = 'screenshot' | 'video' | 'test_results' | 'diff';

const BaseArtifactSchema = z.object({
  id: z.string(),
  type: z.enum(['screenshot', 'video', 'test_results', 'diff']),
  filename: z.string(),
  description: z.string().optional(),
  uploadedAt: z.number().optional(),
});

const GitHubArtifactSchema = BaseArtifactSchema.extend({
  storage: z.literal('github'),
  url: z.string(),
});

const LocalArtifactSchema = BaseArtifactSchema.extend({
  storage: z.literal('local'),
  localArtifactId: z.string(),
});

export const ArtifactSchema = z.discriminatedUnion('storage', [
  GitHubArtifactSchema,
  LocalArtifactSchema,
]);

/**
 * Artifact types - proof-of-work attachments to plans.
 * Can be stored in GitHub (for sharing) or locally (for privacy).
 * Schema is source of truth - types derived via z.infer.
 */
export type Artifact = z.infer<typeof ArtifactSchema>;
export type GitHubArtifact = z.infer<typeof GitHubArtifactSchema>;
export type LocalArtifact = z.infer<typeof LocalArtifactSchema>;

export function getArtifactUrl(repo: string, pr: number, planId: string, filename: string): string {
  return `https://raw.githubusercontent.com/${repo}/plan-artifacts/pr-${pr}/${planId}/${filename}`;
}

export interface StepCompletion {
  stepId: string;
  completed: boolean;
  completedAt?: number;
  completedBy?: string;
}

export const DeliverableSchema = z.object({
  id: z.string(),
  text: z.string(),
  linkedArtifactId: z.string().optional(),
  linkedAt: z.number().optional(),
});

/**
 * A deliverable extracted from plan content.
 * Checkboxes marked with {#deliverable} become deliverables.
 * Schema is source of truth - type derived via z.infer.
 */
export type Deliverable = z.infer<typeof DeliverableSchema>;

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

/**
 * A point-in-time snapshot of plan state.
 * Created at significant status transitions for version history.
 * Stored in Y.Array(YDOC_KEYS.SNAPSHOTS) for CRDT sync.
 * Schema is source of truth - type derived via z.infer.
 */
export type PlanSnapshot = z.infer<typeof PlanSnapshotSchema>;

export const LinkedPRStatusValues = ['draft', 'open', 'merged', 'closed'] as const;
export type LinkedPRStatus = (typeof LinkedPRStatusValues)[number];

export const LinkedPRSchema = z.object({
  prNumber: z.number(),
  url: z.string(),
  linkedAt: z.number(),
  status: z.enum(LinkedPRStatusValues),
  branch: z.string().optional(),
  title: z.string().optional(),
});

/**
 * A GitHub PR linked to a plan.
 * Auto-detected from branch when complete_task runs.
 * Schema is source of truth - type derived via z.infer.
 */
export type LinkedPR = z.infer<typeof LinkedPRSchema>;

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

/**
 * A review comment on a PR diff.
 * Can be added by AI (via MCP tool) or human (via UI).
 * Schema is source of truth - type derived via z.infer.
 */
export type PRReviewComment = z.infer<typeof PRReviewCommentSchema>;

/**
 * Create a LinkedPR object with validation.
 * Ensures all required fields are present and valid.
 */
export function createLinkedPR(params: {
  prNumber: number;
  url: string;
  status: LinkedPRStatus;
  branch: string;
  title: string;
  linkedAt?: number;
}): LinkedPR {
  const linkedPR: LinkedPR = {
    ...params,
    linkedAt: params.linkedAt ?? Date.now(),
  };

  return LinkedPRSchema.parse(linkedPR);
}

/**
 * Create a GitHub artifact with validation.
 * Ensures storage discriminator is set correctly.
 */
export function createGitHubArtifact(params: {
  type: ArtifactType;
  filename: string;
  url: string;
  description?: string;
  uploadedAt?: number;
}): GitHubArtifact {
  const artifact = {
    id: nanoid(),
    ...params,
    storage: 'github' as const,
    uploadedAt: params.uploadedAt ?? Date.now(),
  } satisfies GitHubArtifact;

  return ArtifactSchema.parse(artifact) as GitHubArtifact;
}

/**
 * Create a local artifact with validation.
 * Ensures storage discriminator is set correctly.
 */
export function createLocalArtifact(params: {
  type: ArtifactType;
  filename: string;
  localArtifactId: string;
  description?: string;
  uploadedAt?: number;
}): LocalArtifact {
  const artifact = {
    id: nanoid(),
    ...params,
    storage: 'local' as const,
    uploadedAt: params.uploadedAt ?? Date.now(),
  } satisfies LocalArtifact;

  return ArtifactSchema.parse(artifact) as LocalArtifact;
}

/**
 * Create initial conversation version with handedOff: false.
 * Enforces compile-time type safety for the discriminated union.
 */
export function createInitialConversationVersion(params: {
  versionId: string;
  creator: string;
  platform: OriginPlatform;
  sessionId: string;
  messageCount: number;
  createdAt: number;
}): ConversationVersion {
  const version = {
    ...params,
    handedOff: false as const,
  };

  return ConversationVersionSchema.parse(version);
}

/**
 * Create handed-off conversation version.
 * Enforces compile-time type safety for the discriminated union.
 */
export function createHandedOffConversationVersion(params: {
  versionId: string;
  creator: string;
  platform: OriginPlatform;
  sessionId: string;
  messageCount: number;
  createdAt: number;
  handedOffAt: number;
  handedOffTo: string;
}): ConversationVersion {
  const version = {
    ...params,
    handedOff: true as const,
  };

  return ConversationVersionSchema.parse(version);
}
