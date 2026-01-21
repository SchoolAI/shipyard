import { z } from "zod";

//#region src/plan.d.ts

/**
 * Valid status values for a plan.
 *
 * Flow: draft → pending_review ⟷ changes_requested (loop) → in_progress → completed
 *
 * When reviewer approves: pending_review → in_progress (with matching reviewRequestId)
 * When reviewer requests changes: pending_review → changes_requested (with matching reviewRequestId)
 * Agent fixes and re-submits: changes_requested → pending_review (new reviewRequestId)
 */
declare const PlanStatusValues: readonly ["draft", "pending_review", "changes_requested", "in_progress", "completed"];
type PlanStatusType = (typeof PlanStatusValues)[number];
/**
 * Valid tab/view types for plan content display.
 * Used for tab navigation in PlanContent component and URL routing.
 */
declare const PlanViewTabValues: readonly ["plan", "activity", "deliverables", "changes"];
type PlanViewTab = (typeof PlanViewTabValues)[number];
/**
 * Supported origin platforms for conversation export.
 * Used to identify where a plan/conversation originated.
 */
declare const OriginPlatformValues: readonly ["claude-code", "devin", "cursor", "windsurf", "aider", "unknown"];
type OriginPlatform = (typeof OriginPlatformValues)[number];
/**
 * Origin metadata for conversation export - discriminated by platform.
 * Each platform has different session tracking mechanisms.
 */
declare const ClaudeCodeOriginMetadataSchema: z.ZodObject<{
  platform: z.ZodLiteral<"claude-code">;
  sessionId: z.ZodString;
  transcriptPath: z.ZodString;
  cwd: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
declare const DevinOriginMetadataSchema: z.ZodObject<{
  platform: z.ZodLiteral<"devin">;
  sessionId: z.ZodString;
}, z.core.$strip>;
declare const CursorOriginMetadataSchema: z.ZodObject<{
  platform: z.ZodLiteral<"cursor">;
  conversationId: z.ZodString;
  generationId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
declare const UnknownOriginMetadataSchema: z.ZodObject<{
  platform: z.ZodLiteral<"unknown">;
}, z.core.$strip>;
declare const OriginMetadataSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
  platform: z.ZodLiteral<"claude-code">;
  sessionId: z.ZodString;
  transcriptPath: z.ZodString;
  cwd: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
  platform: z.ZodLiteral<"devin">;
  sessionId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
  platform: z.ZodLiteral<"cursor">;
  conversationId: z.ZodString;
  generationId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
  platform: z.ZodLiteral<"unknown">;
}, z.core.$strip>], "platform">;
type OriginMetadata = z.infer<typeof OriginMetadataSchema>;
type ClaudeCodeOriginMetadata = z.infer<typeof ClaudeCodeOriginMetadataSchema>;
type DevinOriginMetadata = z.infer<typeof DevinOriginMetadataSchema>;
type CursorOriginMetadata = z.infer<typeof CursorOriginMetadataSchema>;
/**
 * Parse and validate Claude Code hook metadata.
 * Safely extracts origin fields with runtime validation.
 */
declare function parseClaudeCodeOrigin(hookMetadata: Record<string, unknown> | undefined): ClaudeCodeOriginMetadata | null;
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
type ConversationVersion = (ConversationVersionBase & {
  handedOff: false;
}) | (ConversationVersionBase & {
  handedOff: true;
  handedOffAt: number;
  handedOffTo: string;
});
declare const ConversationVersionSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
  versionId: z.ZodString;
  creator: z.ZodString;
  platform: z.ZodEnum<{
    "claude-code": "claude-code";
    devin: "devin";
    cursor: "cursor";
    windsurf: "windsurf";
    aider: "aider";
    unknown: "unknown";
  }>;
  sessionId: z.ZodString;
  messageCount: z.ZodNumber;
  createdAt: z.ZodNumber;
  handedOff: z.ZodLiteral<false>;
}, z.core.$strip>, z.ZodObject<{
  versionId: z.ZodString;
  creator: z.ZodString;
  platform: z.ZodEnum<{
    "claude-code": "claude-code";
    devin: "devin";
    cursor: "cursor";
    windsurf: "windsurf";
    aider: "aider";
    unknown: "unknown";
  }>;
  sessionId: z.ZodString;
  messageCount: z.ZodNumber;
  createdAt: z.ZodNumber;
  handedOff: z.ZodLiteral<true>;
  handedOffAt: z.ZodNumber;
  handedOffTo: z.ZodString;
}, z.core.$strip>], "handedOff">;
declare const PlanEventTypes: readonly ["plan_created", "status_changed", "comment_added", "comment_resolved", "artifact_uploaded", "deliverable_linked", "pr_linked", "content_edited", "approved", "changes_requested", "completed", "conversation_imported", "conversation_handed_off", "step_completed", "plan_archived", "plan_unarchived", "conversation_exported", "plan_shared", "approval_requested", "input_request_created", "input_request_answered", "input_request_declined", "agent_activity"];
type PlanEventType = (typeof PlanEventTypes)[number];
/**
 * Agent activity types for tracking agent work status and updates.
 * Used in agent_activity events to communicate agent state to humans.
 */
declare const AgentActivityTypes: readonly ["help_request", "help_request_resolved", "blocker", "blocker_resolved"];
type AgentActivityType = (typeof AgentActivityTypes)[number];
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
type PlanEvent = (PlanEventBase & {
  type: 'plan_created' | 'content_edited' | 'plan_archived' | 'plan_unarchived' | 'plan_shared';
}) | (PlanEventBase & {
  type: 'status_changed';
  data: {
    fromStatus: PlanStatusType;
    toStatus: PlanStatusType;
  };
}) | (PlanEventBase & {
  type: 'artifact_uploaded';
  data: {
    artifactId: string;
  };
}) | (PlanEventBase & {
  type: 'comment_added';
  data?: {
    commentId?: string;
    prNumber?: number;
    mentions?: boolean;
  };
}) | (PlanEventBase & {
  type: 'comment_resolved';
  data?: {
    commentId?: string;
    resolvedCount?: number;
  };
}) | (PlanEventBase & {
  type: 'deliverable_linked';
  data?: {
    deliverableId?: string;
    artifactId?: string;
    allFulfilled?: boolean;
  };
}) | (PlanEventBase & {
  type: 'pr_linked';
  data: {
    prNumber: number;
    url?: string;
  };
}) | (PlanEventBase & {
  type: 'approved' | 'changes_requested';
  data?: {
    comment?: string;
  };
}) | (PlanEventBase & {
  type: 'completed';
}) | (PlanEventBase & {
  type: 'step_completed';
  data: {
    stepId: string;
    completed: boolean;
  };
}) | (PlanEventBase & {
  type: 'conversation_imported';
  data: {
    sourcePlatform?: string;
    messageCount: number;
    sourceSessionId?: string;
  };
}) | (PlanEventBase & {
  type: 'conversation_exported';
  data: {
    messageCount: number;
  };
}) | (PlanEventBase & {
  type: 'conversation_handed_off';
  data: {
    handedOffTo: string;
    messageCount: number;
  };
}) | (PlanEventBase & {
  type: 'approval_requested';
  data?: {
    requesterName?: string;
  };
}) | (PlanEventBase & {
  type: 'input_request_created';
  data: {
    requestId: string;
    requestType: 'text' | 'multiline' | 'choice' | 'confirm';
    requestMessage: string;
  };
}) | (PlanEventBase & {
  type: 'input_request_answered';
  data: {
    requestId: string;
    response: unknown;
    answeredBy: string;
  };
}) | (PlanEventBase & {
  type: 'input_request_declined';
  data: {
    requestId: string;
  };
}) | (PlanEventBase & {
  type: 'agent_activity';
  data: AgentActivityData;
});
/** Zod schema for agent activity data discriminated union */
declare const AgentActivityDataSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
  activityType: z.ZodLiteral<"help_request">;
  requestId: z.ZodString;
  message: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
  activityType: z.ZodLiteral<"help_request_resolved">;
  requestId: z.ZodString;
  resolution: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
  activityType: z.ZodLiteral<"blocker">;
  message: z.ZodString;
  requestId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
  activityType: z.ZodLiteral<"blocker_resolved">;
  requestId: z.ZodString;
  resolution: z.ZodOptional<z.ZodString>;
}, z.core.$strip>], "activityType">;
/**
 * Discriminated union for agent activity event data.
 * Each activity type has specific required/optional fields.
 * Derived from AgentActivityDataSchema to prevent drift.
 */
type AgentActivityData = z.infer<typeof AgentActivityDataSchema>;
/** Discriminated union schema for plan events */
declare const PlanEventSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
  id: z.ZodString;
  actor: z.ZodString;
  timestamp: z.ZodNumber;
  inboxWorthy: z.ZodOptional<z.ZodBoolean>;
  inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
  type: z.ZodEnum<{
    plan_created: "plan_created";
    content_edited: "content_edited";
    plan_archived: "plan_archived";
    plan_unarchived: "plan_unarchived";
    plan_shared: "plan_shared";
  }>;
}, z.core.$strip>, z.ZodObject<{
  id: z.ZodString;
  actor: z.ZodString;
  timestamp: z.ZodNumber;
  inboxWorthy: z.ZodOptional<z.ZodBoolean>;
  inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
  type: z.ZodLiteral<"status_changed">;
  data: z.ZodObject<{
    fromStatus: z.ZodEnum<{
      draft: "draft";
      pending_review: "pending_review";
      changes_requested: "changes_requested";
      in_progress: "in_progress";
      completed: "completed";
    }>;
    toStatus: z.ZodEnum<{
      draft: "draft";
      pending_review: "pending_review";
      changes_requested: "changes_requested";
      in_progress: "in_progress";
      completed: "completed";
    }>;
  }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
  id: z.ZodString;
  actor: z.ZodString;
  timestamp: z.ZodNumber;
  inboxWorthy: z.ZodOptional<z.ZodBoolean>;
  inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
  type: z.ZodLiteral<"artifact_uploaded">;
  data: z.ZodObject<{
    artifactId: z.ZodString;
  }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
  id: z.ZodString;
  actor: z.ZodString;
  timestamp: z.ZodNumber;
  inboxWorthy: z.ZodOptional<z.ZodBoolean>;
  inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
  type: z.ZodLiteral<"comment_added">;
  data: z.ZodOptional<z.ZodObject<{
    commentId: z.ZodOptional<z.ZodString>;
    prNumber: z.ZodOptional<z.ZodNumber>;
    mentions: z.ZodOptional<z.ZodBoolean>;
  }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
  id: z.ZodString;
  actor: z.ZodString;
  timestamp: z.ZodNumber;
  inboxWorthy: z.ZodOptional<z.ZodBoolean>;
  inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
  type: z.ZodLiteral<"comment_resolved">;
  data: z.ZodOptional<z.ZodObject<{
    commentId: z.ZodOptional<z.ZodString>;
    resolvedCount: z.ZodOptional<z.ZodNumber>;
  }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
  id: z.ZodString;
  actor: z.ZodString;
  timestamp: z.ZodNumber;
  inboxWorthy: z.ZodOptional<z.ZodBoolean>;
  inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
  type: z.ZodLiteral<"deliverable_linked">;
  data: z.ZodOptional<z.ZodObject<{
    deliverableId: z.ZodOptional<z.ZodString>;
    artifactId: z.ZodOptional<z.ZodString>;
    allFulfilled: z.ZodOptional<z.ZodBoolean>;
  }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
  id: z.ZodString;
  actor: z.ZodString;
  timestamp: z.ZodNumber;
  inboxWorthy: z.ZodOptional<z.ZodBoolean>;
  inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
  type: z.ZodLiteral<"pr_linked">;
  data: z.ZodObject<{
    prNumber: z.ZodNumber;
    url: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
  id: z.ZodString;
  actor: z.ZodString;
  timestamp: z.ZodNumber;
  inboxWorthy: z.ZodOptional<z.ZodBoolean>;
  inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
  type: z.ZodEnum<{
    changes_requested: "changes_requested";
    approved: "approved";
  }>;
  data: z.ZodOptional<z.ZodObject<{
    comment: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
  id: z.ZodString;
  actor: z.ZodString;
  timestamp: z.ZodNumber;
  inboxWorthy: z.ZodOptional<z.ZodBoolean>;
  inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
  type: z.ZodLiteral<"completed">;
}, z.core.$strip>, z.ZodObject<{
  id: z.ZodString;
  actor: z.ZodString;
  timestamp: z.ZodNumber;
  inboxWorthy: z.ZodOptional<z.ZodBoolean>;
  inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
  type: z.ZodLiteral<"step_completed">;
  data: z.ZodObject<{
    stepId: z.ZodString;
    completed: z.ZodBoolean;
  }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
  id: z.ZodString;
  actor: z.ZodString;
  timestamp: z.ZodNumber;
  inboxWorthy: z.ZodOptional<z.ZodBoolean>;
  inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
  type: z.ZodLiteral<"conversation_imported">;
  data: z.ZodObject<{
    sourcePlatform: z.ZodOptional<z.ZodString>;
    messageCount: z.ZodNumber;
    sourceSessionId: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
  id: z.ZodString;
  actor: z.ZodString;
  timestamp: z.ZodNumber;
  inboxWorthy: z.ZodOptional<z.ZodBoolean>;
  inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
  type: z.ZodLiteral<"conversation_exported">;
  data: z.ZodObject<{
    messageCount: z.ZodNumber;
  }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
  id: z.ZodString;
  actor: z.ZodString;
  timestamp: z.ZodNumber;
  inboxWorthy: z.ZodOptional<z.ZodBoolean>;
  inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
  type: z.ZodLiteral<"conversation_handed_off">;
  data: z.ZodObject<{
    handedOffTo: z.ZodString;
    messageCount: z.ZodNumber;
  }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
  id: z.ZodString;
  actor: z.ZodString;
  timestamp: z.ZodNumber;
  inboxWorthy: z.ZodOptional<z.ZodBoolean>;
  inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
  type: z.ZodLiteral<"approval_requested">;
  data: z.ZodOptional<z.ZodObject<{
    requesterName: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
  id: z.ZodString;
  actor: z.ZodString;
  timestamp: z.ZodNumber;
  inboxWorthy: z.ZodOptional<z.ZodBoolean>;
  inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
  type: z.ZodLiteral<"input_request_created">;
  data: z.ZodObject<{
    requestId: z.ZodString;
    requestType: z.ZodEnum<{
      text: "text";
      multiline: "multiline";
      choice: "choice";
      confirm: "confirm";
    }>;
    requestMessage: z.ZodString;
  }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
  id: z.ZodString;
  actor: z.ZodString;
  timestamp: z.ZodNumber;
  inboxWorthy: z.ZodOptional<z.ZodBoolean>;
  inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
  type: z.ZodLiteral<"input_request_answered">;
  data: z.ZodObject<{
    requestId: z.ZodString;
    response: z.ZodUnknown;
    answeredBy: z.ZodString;
  }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
  id: z.ZodString;
  actor: z.ZodString;
  timestamp: z.ZodNumber;
  inboxWorthy: z.ZodOptional<z.ZodBoolean>;
  inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
  type: z.ZodLiteral<"input_request_declined">;
  data: z.ZodObject<{
    requestId: z.ZodString;
  }, z.core.$strip>;
}, z.core.$strip>, z.ZodObject<{
  id: z.ZodString;
  actor: z.ZodString;
  timestamp: z.ZodNumber;
  inboxWorthy: z.ZodOptional<z.ZodBoolean>;
  inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
  type: z.ZodLiteral<"agent_activity">;
  data: z.ZodDiscriminatedUnion<[z.ZodObject<{
    activityType: z.ZodLiteral<"help_request">;
    requestId: z.ZodString;
    message: z.ZodString;
  }, z.core.$strip>, z.ZodObject<{
    activityType: z.ZodLiteral<"help_request_resolved">;
    requestId: z.ZodString;
    resolution: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>, z.ZodObject<{
    activityType: z.ZodLiteral<"blocker">;
    message: z.ZodString;
    requestId: z.ZodString;
  }, z.core.$strip>, z.ZodObject<{
    activityType: z.ZodLiteral<"blocker_resolved">;
    requestId: z.ZodString;
    resolution: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>], "activityType">;
}, z.core.$strip>], "type">;
/**
 * Check if an event should appear in a user's inbox.
 *
 * @param event - The event to check
 * @param username - GitHub username to check against
 * @param ownerId - Optional plan owner's username (needed to resolve 'owner' in inboxFor)
 * @returns true if the event is inbox-worthy for this user
 */
declare function isInboxWorthy(event: PlanEvent, username: string, ownerId?: string): boolean;
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
type PlanMetadata = (PlanMetadataBase & {
  status: 'draft';
}) | (PlanMetadataBase & {
  status: 'pending_review';
  /**
   * Unique identifier for current review request.
   * Set by hook when requesting review, checked before accepting approval/denial.
   * Prevents stale review decisions from previous cycles.
   */
  reviewRequestId: string;
}) | (PlanMetadataBase & {
  status: 'changes_requested';
  /** When the plan was reviewed (changes requested) */
  reviewedAt: number;
  /** Display name of the reviewer */
  reviewedBy: string;
  /** Feedback from reviewer about requested changes */
  reviewComment?: string;
}) | (PlanMetadataBase & {
  status: 'in_progress';
  /** When the plan was approved */
  reviewedAt: number;
  /** Display name of the reviewer who approved */
  reviewedBy: string;
  /** Optional feedback from reviewer on approval */
  reviewComment?: string;
}) | (PlanMetadataBase & {
  status: 'completed';
  /** When the task was marked complete */
  completedAt: number;
  /** Who marked the task complete (agent or reviewer name) */
  completedBy: string;
  /** Snapshot URL generated on completion */
  snapshotUrl?: string;
});
declare const PlanMetadataSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
  id: z.ZodString;
  title: z.ZodString;
  createdAt: z.ZodNumber;
  updatedAt: z.ZodNumber;
  repo: z.ZodOptional<z.ZodString>;
  pr: z.ZodOptional<z.ZodNumber>;
  ownerId: z.ZodOptional<z.ZodString>;
  approvalRequired: z.ZodOptional<z.ZodBoolean>;
  approvedUsers: z.ZodOptional<z.ZodArray<z.ZodString>>;
  rejectedUsers: z.ZodOptional<z.ZodArray<z.ZodString>>;
  sessionTokenHash: z.ZodOptional<z.ZodString>;
  archivedAt: z.ZodOptional<z.ZodNumber>;
  archivedBy: z.ZodOptional<z.ZodString>;
  origin: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
    platform: z.ZodLiteral<"claude-code">;
    sessionId: z.ZodString;
    transcriptPath: z.ZodString;
    cwd: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>, z.ZodObject<{
    platform: z.ZodLiteral<"devin">;
    sessionId: z.ZodString;
  }, z.core.$strip>, z.ZodObject<{
    platform: z.ZodLiteral<"cursor">;
    conversationId: z.ZodString;
    generationId: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>, z.ZodObject<{
    platform: z.ZodLiteral<"unknown">;
  }, z.core.$strip>], "platform">>;
  viewedBy: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
  conversationVersions: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
    versionId: z.ZodString;
    creator: z.ZodString;
    platform: z.ZodEnum<{
      "claude-code": "claude-code";
      devin: "devin";
      cursor: "cursor";
      windsurf: "windsurf";
      aider: "aider";
      unknown: "unknown";
    }>;
    sessionId: z.ZodString;
    messageCount: z.ZodNumber;
    createdAt: z.ZodNumber;
    handedOff: z.ZodLiteral<false>;
  }, z.core.$strip>, z.ZodObject<{
    versionId: z.ZodString;
    creator: z.ZodString;
    platform: z.ZodEnum<{
      "claude-code": "claude-code";
      devin: "devin";
      cursor: "cursor";
      windsurf: "windsurf";
      aider: "aider";
      unknown: "unknown";
    }>;
    sessionId: z.ZodString;
    messageCount: z.ZodNumber;
    createdAt: z.ZodNumber;
    handedOff: z.ZodLiteral<true>;
    handedOffAt: z.ZodNumber;
    handedOffTo: z.ZodString;
  }, z.core.$strip>], "handedOff">>>;
  events: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodEnum<{
      plan_created: "plan_created";
      content_edited: "content_edited";
      plan_archived: "plan_archived";
      plan_unarchived: "plan_unarchived";
      plan_shared: "plan_shared";
    }>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"status_changed">;
    data: z.ZodObject<{
      fromStatus: z.ZodEnum<{
        draft: "draft";
        pending_review: "pending_review";
        changes_requested: "changes_requested";
        in_progress: "in_progress";
        completed: "completed";
      }>;
      toStatus: z.ZodEnum<{
        draft: "draft";
        pending_review: "pending_review";
        changes_requested: "changes_requested";
        in_progress: "in_progress";
        completed: "completed";
      }>;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"artifact_uploaded">;
    data: z.ZodObject<{
      artifactId: z.ZodString;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"comment_added">;
    data: z.ZodOptional<z.ZodObject<{
      commentId: z.ZodOptional<z.ZodString>;
      prNumber: z.ZodOptional<z.ZodNumber>;
      mentions: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"comment_resolved">;
    data: z.ZodOptional<z.ZodObject<{
      commentId: z.ZodOptional<z.ZodString>;
      resolvedCount: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"deliverable_linked">;
    data: z.ZodOptional<z.ZodObject<{
      deliverableId: z.ZodOptional<z.ZodString>;
      artifactId: z.ZodOptional<z.ZodString>;
      allFulfilled: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"pr_linked">;
    data: z.ZodObject<{
      prNumber: z.ZodNumber;
      url: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodEnum<{
      changes_requested: "changes_requested";
      approved: "approved";
    }>;
    data: z.ZodOptional<z.ZodObject<{
      comment: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"completed">;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"step_completed">;
    data: z.ZodObject<{
      stepId: z.ZodString;
      completed: z.ZodBoolean;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"conversation_imported">;
    data: z.ZodObject<{
      sourcePlatform: z.ZodOptional<z.ZodString>;
      messageCount: z.ZodNumber;
      sourceSessionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"conversation_exported">;
    data: z.ZodObject<{
      messageCount: z.ZodNumber;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"conversation_handed_off">;
    data: z.ZodObject<{
      handedOffTo: z.ZodString;
      messageCount: z.ZodNumber;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"approval_requested">;
    data: z.ZodOptional<z.ZodObject<{
      requesterName: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"input_request_created">;
    data: z.ZodObject<{
      requestId: z.ZodString;
      requestType: z.ZodEnum<{
        text: "text";
        multiline: "multiline";
        choice: "choice";
        confirm: "confirm";
      }>;
      requestMessage: z.ZodString;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"input_request_answered">;
    data: z.ZodObject<{
      requestId: z.ZodString;
      response: z.ZodUnknown;
      answeredBy: z.ZodString;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"input_request_declined">;
    data: z.ZodObject<{
      requestId: z.ZodString;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"agent_activity">;
    data: z.ZodDiscriminatedUnion<[z.ZodObject<{
      activityType: z.ZodLiteral<"help_request">;
      requestId: z.ZodString;
      message: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
      activityType: z.ZodLiteral<"help_request_resolved">;
      requestId: z.ZodString;
      resolution: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
      activityType: z.ZodLiteral<"blocker">;
      message: z.ZodString;
      requestId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
      activityType: z.ZodLiteral<"blocker_resolved">;
      requestId: z.ZodString;
      resolution: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>], "activityType">;
  }, z.core.$strip>], "type">>>;
  tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
  status: z.ZodLiteral<"draft">;
}, z.core.$strip>, z.ZodObject<{
  id: z.ZodString;
  title: z.ZodString;
  createdAt: z.ZodNumber;
  updatedAt: z.ZodNumber;
  repo: z.ZodOptional<z.ZodString>;
  pr: z.ZodOptional<z.ZodNumber>;
  ownerId: z.ZodOptional<z.ZodString>;
  approvalRequired: z.ZodOptional<z.ZodBoolean>;
  approvedUsers: z.ZodOptional<z.ZodArray<z.ZodString>>;
  rejectedUsers: z.ZodOptional<z.ZodArray<z.ZodString>>;
  sessionTokenHash: z.ZodOptional<z.ZodString>;
  archivedAt: z.ZodOptional<z.ZodNumber>;
  archivedBy: z.ZodOptional<z.ZodString>;
  origin: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
    platform: z.ZodLiteral<"claude-code">;
    sessionId: z.ZodString;
    transcriptPath: z.ZodString;
    cwd: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>, z.ZodObject<{
    platform: z.ZodLiteral<"devin">;
    sessionId: z.ZodString;
  }, z.core.$strip>, z.ZodObject<{
    platform: z.ZodLiteral<"cursor">;
    conversationId: z.ZodString;
    generationId: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>, z.ZodObject<{
    platform: z.ZodLiteral<"unknown">;
  }, z.core.$strip>], "platform">>;
  viewedBy: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
  conversationVersions: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
    versionId: z.ZodString;
    creator: z.ZodString;
    platform: z.ZodEnum<{
      "claude-code": "claude-code";
      devin: "devin";
      cursor: "cursor";
      windsurf: "windsurf";
      aider: "aider";
      unknown: "unknown";
    }>;
    sessionId: z.ZodString;
    messageCount: z.ZodNumber;
    createdAt: z.ZodNumber;
    handedOff: z.ZodLiteral<false>;
  }, z.core.$strip>, z.ZodObject<{
    versionId: z.ZodString;
    creator: z.ZodString;
    platform: z.ZodEnum<{
      "claude-code": "claude-code";
      devin: "devin";
      cursor: "cursor";
      windsurf: "windsurf";
      aider: "aider";
      unknown: "unknown";
    }>;
    sessionId: z.ZodString;
    messageCount: z.ZodNumber;
    createdAt: z.ZodNumber;
    handedOff: z.ZodLiteral<true>;
    handedOffAt: z.ZodNumber;
    handedOffTo: z.ZodString;
  }, z.core.$strip>], "handedOff">>>;
  events: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodEnum<{
      plan_created: "plan_created";
      content_edited: "content_edited";
      plan_archived: "plan_archived";
      plan_unarchived: "plan_unarchived";
      plan_shared: "plan_shared";
    }>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"status_changed">;
    data: z.ZodObject<{
      fromStatus: z.ZodEnum<{
        draft: "draft";
        pending_review: "pending_review";
        changes_requested: "changes_requested";
        in_progress: "in_progress";
        completed: "completed";
      }>;
      toStatus: z.ZodEnum<{
        draft: "draft";
        pending_review: "pending_review";
        changes_requested: "changes_requested";
        in_progress: "in_progress";
        completed: "completed";
      }>;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"artifact_uploaded">;
    data: z.ZodObject<{
      artifactId: z.ZodString;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"comment_added">;
    data: z.ZodOptional<z.ZodObject<{
      commentId: z.ZodOptional<z.ZodString>;
      prNumber: z.ZodOptional<z.ZodNumber>;
      mentions: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"comment_resolved">;
    data: z.ZodOptional<z.ZodObject<{
      commentId: z.ZodOptional<z.ZodString>;
      resolvedCount: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"deliverable_linked">;
    data: z.ZodOptional<z.ZodObject<{
      deliverableId: z.ZodOptional<z.ZodString>;
      artifactId: z.ZodOptional<z.ZodString>;
      allFulfilled: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"pr_linked">;
    data: z.ZodObject<{
      prNumber: z.ZodNumber;
      url: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodEnum<{
      changes_requested: "changes_requested";
      approved: "approved";
    }>;
    data: z.ZodOptional<z.ZodObject<{
      comment: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"completed">;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"step_completed">;
    data: z.ZodObject<{
      stepId: z.ZodString;
      completed: z.ZodBoolean;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"conversation_imported">;
    data: z.ZodObject<{
      sourcePlatform: z.ZodOptional<z.ZodString>;
      messageCount: z.ZodNumber;
      sourceSessionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"conversation_exported">;
    data: z.ZodObject<{
      messageCount: z.ZodNumber;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"conversation_handed_off">;
    data: z.ZodObject<{
      handedOffTo: z.ZodString;
      messageCount: z.ZodNumber;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"approval_requested">;
    data: z.ZodOptional<z.ZodObject<{
      requesterName: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"input_request_created">;
    data: z.ZodObject<{
      requestId: z.ZodString;
      requestType: z.ZodEnum<{
        text: "text";
        multiline: "multiline";
        choice: "choice";
        confirm: "confirm";
      }>;
      requestMessage: z.ZodString;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"input_request_answered">;
    data: z.ZodObject<{
      requestId: z.ZodString;
      response: z.ZodUnknown;
      answeredBy: z.ZodString;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"input_request_declined">;
    data: z.ZodObject<{
      requestId: z.ZodString;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"agent_activity">;
    data: z.ZodDiscriminatedUnion<[z.ZodObject<{
      activityType: z.ZodLiteral<"help_request">;
      requestId: z.ZodString;
      message: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
      activityType: z.ZodLiteral<"help_request_resolved">;
      requestId: z.ZodString;
      resolution: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
      activityType: z.ZodLiteral<"blocker">;
      message: z.ZodString;
      requestId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
      activityType: z.ZodLiteral<"blocker_resolved">;
      requestId: z.ZodString;
      resolution: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>], "activityType">;
  }, z.core.$strip>], "type">>>;
  tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
  status: z.ZodLiteral<"pending_review">;
  reviewRequestId: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
  id: z.ZodString;
  title: z.ZodString;
  createdAt: z.ZodNumber;
  updatedAt: z.ZodNumber;
  repo: z.ZodOptional<z.ZodString>;
  pr: z.ZodOptional<z.ZodNumber>;
  ownerId: z.ZodOptional<z.ZodString>;
  approvalRequired: z.ZodOptional<z.ZodBoolean>;
  approvedUsers: z.ZodOptional<z.ZodArray<z.ZodString>>;
  rejectedUsers: z.ZodOptional<z.ZodArray<z.ZodString>>;
  sessionTokenHash: z.ZodOptional<z.ZodString>;
  archivedAt: z.ZodOptional<z.ZodNumber>;
  archivedBy: z.ZodOptional<z.ZodString>;
  origin: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
    platform: z.ZodLiteral<"claude-code">;
    sessionId: z.ZodString;
    transcriptPath: z.ZodString;
    cwd: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>, z.ZodObject<{
    platform: z.ZodLiteral<"devin">;
    sessionId: z.ZodString;
  }, z.core.$strip>, z.ZodObject<{
    platform: z.ZodLiteral<"cursor">;
    conversationId: z.ZodString;
    generationId: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>, z.ZodObject<{
    platform: z.ZodLiteral<"unknown">;
  }, z.core.$strip>], "platform">>;
  viewedBy: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
  conversationVersions: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
    versionId: z.ZodString;
    creator: z.ZodString;
    platform: z.ZodEnum<{
      "claude-code": "claude-code";
      devin: "devin";
      cursor: "cursor";
      windsurf: "windsurf";
      aider: "aider";
      unknown: "unknown";
    }>;
    sessionId: z.ZodString;
    messageCount: z.ZodNumber;
    createdAt: z.ZodNumber;
    handedOff: z.ZodLiteral<false>;
  }, z.core.$strip>, z.ZodObject<{
    versionId: z.ZodString;
    creator: z.ZodString;
    platform: z.ZodEnum<{
      "claude-code": "claude-code";
      devin: "devin";
      cursor: "cursor";
      windsurf: "windsurf";
      aider: "aider";
      unknown: "unknown";
    }>;
    sessionId: z.ZodString;
    messageCount: z.ZodNumber;
    createdAt: z.ZodNumber;
    handedOff: z.ZodLiteral<true>;
    handedOffAt: z.ZodNumber;
    handedOffTo: z.ZodString;
  }, z.core.$strip>], "handedOff">>>;
  events: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodEnum<{
      plan_created: "plan_created";
      content_edited: "content_edited";
      plan_archived: "plan_archived";
      plan_unarchived: "plan_unarchived";
      plan_shared: "plan_shared";
    }>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"status_changed">;
    data: z.ZodObject<{
      fromStatus: z.ZodEnum<{
        draft: "draft";
        pending_review: "pending_review";
        changes_requested: "changes_requested";
        in_progress: "in_progress";
        completed: "completed";
      }>;
      toStatus: z.ZodEnum<{
        draft: "draft";
        pending_review: "pending_review";
        changes_requested: "changes_requested";
        in_progress: "in_progress";
        completed: "completed";
      }>;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"artifact_uploaded">;
    data: z.ZodObject<{
      artifactId: z.ZodString;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"comment_added">;
    data: z.ZodOptional<z.ZodObject<{
      commentId: z.ZodOptional<z.ZodString>;
      prNumber: z.ZodOptional<z.ZodNumber>;
      mentions: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"comment_resolved">;
    data: z.ZodOptional<z.ZodObject<{
      commentId: z.ZodOptional<z.ZodString>;
      resolvedCount: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"deliverable_linked">;
    data: z.ZodOptional<z.ZodObject<{
      deliverableId: z.ZodOptional<z.ZodString>;
      artifactId: z.ZodOptional<z.ZodString>;
      allFulfilled: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"pr_linked">;
    data: z.ZodObject<{
      prNumber: z.ZodNumber;
      url: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodEnum<{
      changes_requested: "changes_requested";
      approved: "approved";
    }>;
    data: z.ZodOptional<z.ZodObject<{
      comment: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"completed">;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"step_completed">;
    data: z.ZodObject<{
      stepId: z.ZodString;
      completed: z.ZodBoolean;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"conversation_imported">;
    data: z.ZodObject<{
      sourcePlatform: z.ZodOptional<z.ZodString>;
      messageCount: z.ZodNumber;
      sourceSessionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"conversation_exported">;
    data: z.ZodObject<{
      messageCount: z.ZodNumber;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"conversation_handed_off">;
    data: z.ZodObject<{
      handedOffTo: z.ZodString;
      messageCount: z.ZodNumber;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"approval_requested">;
    data: z.ZodOptional<z.ZodObject<{
      requesterName: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"input_request_created">;
    data: z.ZodObject<{
      requestId: z.ZodString;
      requestType: z.ZodEnum<{
        text: "text";
        multiline: "multiline";
        choice: "choice";
        confirm: "confirm";
      }>;
      requestMessage: z.ZodString;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"input_request_answered">;
    data: z.ZodObject<{
      requestId: z.ZodString;
      response: z.ZodUnknown;
      answeredBy: z.ZodString;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"input_request_declined">;
    data: z.ZodObject<{
      requestId: z.ZodString;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"agent_activity">;
    data: z.ZodDiscriminatedUnion<[z.ZodObject<{
      activityType: z.ZodLiteral<"help_request">;
      requestId: z.ZodString;
      message: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
      activityType: z.ZodLiteral<"help_request_resolved">;
      requestId: z.ZodString;
      resolution: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
      activityType: z.ZodLiteral<"blocker">;
      message: z.ZodString;
      requestId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
      activityType: z.ZodLiteral<"blocker_resolved">;
      requestId: z.ZodString;
      resolution: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>], "activityType">;
  }, z.core.$strip>], "type">>>;
  tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
  status: z.ZodLiteral<"changes_requested">;
  reviewedAt: z.ZodNumber;
  reviewedBy: z.ZodString;
  reviewComment: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
  id: z.ZodString;
  title: z.ZodString;
  createdAt: z.ZodNumber;
  updatedAt: z.ZodNumber;
  repo: z.ZodOptional<z.ZodString>;
  pr: z.ZodOptional<z.ZodNumber>;
  ownerId: z.ZodOptional<z.ZodString>;
  approvalRequired: z.ZodOptional<z.ZodBoolean>;
  approvedUsers: z.ZodOptional<z.ZodArray<z.ZodString>>;
  rejectedUsers: z.ZodOptional<z.ZodArray<z.ZodString>>;
  sessionTokenHash: z.ZodOptional<z.ZodString>;
  archivedAt: z.ZodOptional<z.ZodNumber>;
  archivedBy: z.ZodOptional<z.ZodString>;
  origin: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
    platform: z.ZodLiteral<"claude-code">;
    sessionId: z.ZodString;
    transcriptPath: z.ZodString;
    cwd: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>, z.ZodObject<{
    platform: z.ZodLiteral<"devin">;
    sessionId: z.ZodString;
  }, z.core.$strip>, z.ZodObject<{
    platform: z.ZodLiteral<"cursor">;
    conversationId: z.ZodString;
    generationId: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>, z.ZodObject<{
    platform: z.ZodLiteral<"unknown">;
  }, z.core.$strip>], "platform">>;
  viewedBy: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
  conversationVersions: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
    versionId: z.ZodString;
    creator: z.ZodString;
    platform: z.ZodEnum<{
      "claude-code": "claude-code";
      devin: "devin";
      cursor: "cursor";
      windsurf: "windsurf";
      aider: "aider";
      unknown: "unknown";
    }>;
    sessionId: z.ZodString;
    messageCount: z.ZodNumber;
    createdAt: z.ZodNumber;
    handedOff: z.ZodLiteral<false>;
  }, z.core.$strip>, z.ZodObject<{
    versionId: z.ZodString;
    creator: z.ZodString;
    platform: z.ZodEnum<{
      "claude-code": "claude-code";
      devin: "devin";
      cursor: "cursor";
      windsurf: "windsurf";
      aider: "aider";
      unknown: "unknown";
    }>;
    sessionId: z.ZodString;
    messageCount: z.ZodNumber;
    createdAt: z.ZodNumber;
    handedOff: z.ZodLiteral<true>;
    handedOffAt: z.ZodNumber;
    handedOffTo: z.ZodString;
  }, z.core.$strip>], "handedOff">>>;
  events: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodEnum<{
      plan_created: "plan_created";
      content_edited: "content_edited";
      plan_archived: "plan_archived";
      plan_unarchived: "plan_unarchived";
      plan_shared: "plan_shared";
    }>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"status_changed">;
    data: z.ZodObject<{
      fromStatus: z.ZodEnum<{
        draft: "draft";
        pending_review: "pending_review";
        changes_requested: "changes_requested";
        in_progress: "in_progress";
        completed: "completed";
      }>;
      toStatus: z.ZodEnum<{
        draft: "draft";
        pending_review: "pending_review";
        changes_requested: "changes_requested";
        in_progress: "in_progress";
        completed: "completed";
      }>;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"artifact_uploaded">;
    data: z.ZodObject<{
      artifactId: z.ZodString;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"comment_added">;
    data: z.ZodOptional<z.ZodObject<{
      commentId: z.ZodOptional<z.ZodString>;
      prNumber: z.ZodOptional<z.ZodNumber>;
      mentions: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"comment_resolved">;
    data: z.ZodOptional<z.ZodObject<{
      commentId: z.ZodOptional<z.ZodString>;
      resolvedCount: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"deliverable_linked">;
    data: z.ZodOptional<z.ZodObject<{
      deliverableId: z.ZodOptional<z.ZodString>;
      artifactId: z.ZodOptional<z.ZodString>;
      allFulfilled: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"pr_linked">;
    data: z.ZodObject<{
      prNumber: z.ZodNumber;
      url: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodEnum<{
      changes_requested: "changes_requested";
      approved: "approved";
    }>;
    data: z.ZodOptional<z.ZodObject<{
      comment: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"completed">;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"step_completed">;
    data: z.ZodObject<{
      stepId: z.ZodString;
      completed: z.ZodBoolean;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"conversation_imported">;
    data: z.ZodObject<{
      sourcePlatform: z.ZodOptional<z.ZodString>;
      messageCount: z.ZodNumber;
      sourceSessionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"conversation_exported">;
    data: z.ZodObject<{
      messageCount: z.ZodNumber;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"conversation_handed_off">;
    data: z.ZodObject<{
      handedOffTo: z.ZodString;
      messageCount: z.ZodNumber;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"approval_requested">;
    data: z.ZodOptional<z.ZodObject<{
      requesterName: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"input_request_created">;
    data: z.ZodObject<{
      requestId: z.ZodString;
      requestType: z.ZodEnum<{
        text: "text";
        multiline: "multiline";
        choice: "choice";
        confirm: "confirm";
      }>;
      requestMessage: z.ZodString;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"input_request_answered">;
    data: z.ZodObject<{
      requestId: z.ZodString;
      response: z.ZodUnknown;
      answeredBy: z.ZodString;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"input_request_declined">;
    data: z.ZodObject<{
      requestId: z.ZodString;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"agent_activity">;
    data: z.ZodDiscriminatedUnion<[z.ZodObject<{
      activityType: z.ZodLiteral<"help_request">;
      requestId: z.ZodString;
      message: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
      activityType: z.ZodLiteral<"help_request_resolved">;
      requestId: z.ZodString;
      resolution: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
      activityType: z.ZodLiteral<"blocker">;
      message: z.ZodString;
      requestId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
      activityType: z.ZodLiteral<"blocker_resolved">;
      requestId: z.ZodString;
      resolution: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>], "activityType">;
  }, z.core.$strip>], "type">>>;
  tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
  status: z.ZodLiteral<"in_progress">;
  reviewedAt: z.ZodNumber;
  reviewedBy: z.ZodString;
  reviewComment: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
  id: z.ZodString;
  title: z.ZodString;
  createdAt: z.ZodNumber;
  updatedAt: z.ZodNumber;
  repo: z.ZodOptional<z.ZodString>;
  pr: z.ZodOptional<z.ZodNumber>;
  ownerId: z.ZodOptional<z.ZodString>;
  approvalRequired: z.ZodOptional<z.ZodBoolean>;
  approvedUsers: z.ZodOptional<z.ZodArray<z.ZodString>>;
  rejectedUsers: z.ZodOptional<z.ZodArray<z.ZodString>>;
  sessionTokenHash: z.ZodOptional<z.ZodString>;
  archivedAt: z.ZodOptional<z.ZodNumber>;
  archivedBy: z.ZodOptional<z.ZodString>;
  origin: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
    platform: z.ZodLiteral<"claude-code">;
    sessionId: z.ZodString;
    transcriptPath: z.ZodString;
    cwd: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>, z.ZodObject<{
    platform: z.ZodLiteral<"devin">;
    sessionId: z.ZodString;
  }, z.core.$strip>, z.ZodObject<{
    platform: z.ZodLiteral<"cursor">;
    conversationId: z.ZodString;
    generationId: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>, z.ZodObject<{
    platform: z.ZodLiteral<"unknown">;
  }, z.core.$strip>], "platform">>;
  viewedBy: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
  conversationVersions: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
    versionId: z.ZodString;
    creator: z.ZodString;
    platform: z.ZodEnum<{
      "claude-code": "claude-code";
      devin: "devin";
      cursor: "cursor";
      windsurf: "windsurf";
      aider: "aider";
      unknown: "unknown";
    }>;
    sessionId: z.ZodString;
    messageCount: z.ZodNumber;
    createdAt: z.ZodNumber;
    handedOff: z.ZodLiteral<false>;
  }, z.core.$strip>, z.ZodObject<{
    versionId: z.ZodString;
    creator: z.ZodString;
    platform: z.ZodEnum<{
      "claude-code": "claude-code";
      devin: "devin";
      cursor: "cursor";
      windsurf: "windsurf";
      aider: "aider";
      unknown: "unknown";
    }>;
    sessionId: z.ZodString;
    messageCount: z.ZodNumber;
    createdAt: z.ZodNumber;
    handedOff: z.ZodLiteral<true>;
    handedOffAt: z.ZodNumber;
    handedOffTo: z.ZodString;
  }, z.core.$strip>], "handedOff">>>;
  events: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodEnum<{
      plan_created: "plan_created";
      content_edited: "content_edited";
      plan_archived: "plan_archived";
      plan_unarchived: "plan_unarchived";
      plan_shared: "plan_shared";
    }>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"status_changed">;
    data: z.ZodObject<{
      fromStatus: z.ZodEnum<{
        draft: "draft";
        pending_review: "pending_review";
        changes_requested: "changes_requested";
        in_progress: "in_progress";
        completed: "completed";
      }>;
      toStatus: z.ZodEnum<{
        draft: "draft";
        pending_review: "pending_review";
        changes_requested: "changes_requested";
        in_progress: "in_progress";
        completed: "completed";
      }>;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"artifact_uploaded">;
    data: z.ZodObject<{
      artifactId: z.ZodString;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"comment_added">;
    data: z.ZodOptional<z.ZodObject<{
      commentId: z.ZodOptional<z.ZodString>;
      prNumber: z.ZodOptional<z.ZodNumber>;
      mentions: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"comment_resolved">;
    data: z.ZodOptional<z.ZodObject<{
      commentId: z.ZodOptional<z.ZodString>;
      resolvedCount: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"deliverable_linked">;
    data: z.ZodOptional<z.ZodObject<{
      deliverableId: z.ZodOptional<z.ZodString>;
      artifactId: z.ZodOptional<z.ZodString>;
      allFulfilled: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"pr_linked">;
    data: z.ZodObject<{
      prNumber: z.ZodNumber;
      url: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodEnum<{
      changes_requested: "changes_requested";
      approved: "approved";
    }>;
    data: z.ZodOptional<z.ZodObject<{
      comment: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"completed">;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"step_completed">;
    data: z.ZodObject<{
      stepId: z.ZodString;
      completed: z.ZodBoolean;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"conversation_imported">;
    data: z.ZodObject<{
      sourcePlatform: z.ZodOptional<z.ZodString>;
      messageCount: z.ZodNumber;
      sourceSessionId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"conversation_exported">;
    data: z.ZodObject<{
      messageCount: z.ZodNumber;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"conversation_handed_off">;
    data: z.ZodObject<{
      handedOffTo: z.ZodString;
      messageCount: z.ZodNumber;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"approval_requested">;
    data: z.ZodOptional<z.ZodObject<{
      requesterName: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"input_request_created">;
    data: z.ZodObject<{
      requestId: z.ZodString;
      requestType: z.ZodEnum<{
        text: "text";
        multiline: "multiline";
        choice: "choice";
        confirm: "confirm";
      }>;
      requestMessage: z.ZodString;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"input_request_answered">;
    data: z.ZodObject<{
      requestId: z.ZodString;
      response: z.ZodUnknown;
      answeredBy: z.ZodString;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"input_request_declined">;
    data: z.ZodObject<{
      requestId: z.ZodString;
    }, z.core.$strip>;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    actor: z.ZodString;
    timestamp: z.ZodNumber;
    inboxWorthy: z.ZodOptional<z.ZodBoolean>;
    inboxFor: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    type: z.ZodLiteral<"agent_activity">;
    data: z.ZodDiscriminatedUnion<[z.ZodObject<{
      activityType: z.ZodLiteral<"help_request">;
      requestId: z.ZodString;
      message: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
      activityType: z.ZodLiteral<"help_request_resolved">;
      requestId: z.ZodString;
      resolution: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
      activityType: z.ZodLiteral<"blocker">;
      message: z.ZodString;
      requestId: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
      activityType: z.ZodLiteral<"blocker_resolved">;
      requestId: z.ZodString;
      resolution: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>], "activityType">;
  }, z.core.$strip>], "type">>>;
  tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
  status: z.ZodLiteral<"completed">;
  completedAt: z.ZodNumber;
  completedBy: z.ZodString;
  snapshotUrl: z.ZodOptional<z.ZodString>;
}, z.core.$strip>], "status">;
type ArtifactType = 'screenshot' | 'video' | 'test_results' | 'diff';
declare const GitHubArtifactSchema: z.ZodObject<{
  id: z.ZodString;
  type: z.ZodEnum<{
    screenshot: "screenshot";
    video: "video";
    test_results: "test_results";
    diff: "diff";
  }>;
  filename: z.ZodString;
  description: z.ZodOptional<z.ZodString>;
  uploadedAt: z.ZodOptional<z.ZodNumber>;
  storage: z.ZodLiteral<"github">;
  url: z.ZodString;
}, z.core.$strip>;
declare const LocalArtifactSchema: z.ZodObject<{
  id: z.ZodString;
  type: z.ZodEnum<{
    screenshot: "screenshot";
    video: "video";
    test_results: "test_results";
    diff: "diff";
  }>;
  filename: z.ZodString;
  description: z.ZodOptional<z.ZodString>;
  uploadedAt: z.ZodOptional<z.ZodNumber>;
  storage: z.ZodLiteral<"local">;
  localArtifactId: z.ZodString;
}, z.core.$strip>;
declare const ArtifactSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
  id: z.ZodString;
  type: z.ZodEnum<{
    screenshot: "screenshot";
    video: "video";
    test_results: "test_results";
    diff: "diff";
  }>;
  filename: z.ZodString;
  description: z.ZodOptional<z.ZodString>;
  uploadedAt: z.ZodOptional<z.ZodNumber>;
  storage: z.ZodLiteral<"github">;
  url: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
  id: z.ZodString;
  type: z.ZodEnum<{
    screenshot: "screenshot";
    video: "video";
    test_results: "test_results";
    diff: "diff";
  }>;
  filename: z.ZodString;
  description: z.ZodOptional<z.ZodString>;
  uploadedAt: z.ZodOptional<z.ZodNumber>;
  storage: z.ZodLiteral<"local">;
  localArtifactId: z.ZodString;
}, z.core.$strip>], "storage">;
/**
 * Artifact types - proof-of-work attachments to plans.
 * Can be stored in GitHub (for sharing) or locally (for privacy).
 * Schema is source of truth - types derived via z.infer.
 */
type Artifact = z.infer<typeof ArtifactSchema>;
type GitHubArtifact = z.infer<typeof GitHubArtifactSchema>;
type LocalArtifact = z.infer<typeof LocalArtifactSchema>;
declare function getArtifactUrl(repo: string, pr: number, planId: string, filename: string): string;
interface StepCompletion {
  stepId: string;
  completed: boolean;
  completedAt?: number;
  completedBy?: string;
}
declare const DeliverableSchema: z.ZodObject<{
  id: z.ZodString;
  text: z.ZodString;
  linkedArtifactId: z.ZodOptional<z.ZodString>;
  linkedAt: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
/**
 * A deliverable extracted from plan content.
 * Checkboxes marked with {#deliverable} become deliverables.
 * Schema is source of truth - type derived via z.infer.
 */
type Deliverable = z.infer<typeof DeliverableSchema>;
declare const PlanSnapshotSchema: z.ZodObject<{
  id: z.ZodString;
  status: z.ZodEnum<{
    draft: "draft";
    pending_review: "pending_review";
    changes_requested: "changes_requested";
    in_progress: "in_progress";
    completed: "completed";
  }>;
  createdBy: z.ZodString;
  reason: z.ZodString;
  createdAt: z.ZodNumber;
  content: z.ZodArray<z.ZodUnknown>;
  threadSummary: z.ZodOptional<z.ZodObject<{
    total: z.ZodNumber;
    unresolved: z.ZodNumber;
  }, z.core.$strip>>;
  artifacts: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<{
      screenshot: "screenshot";
      video: "video";
      test_results: "test_results";
      diff: "diff";
    }>;
    filename: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    uploadedAt: z.ZodOptional<z.ZodNumber>;
    storage: z.ZodLiteral<"github">;
    url: z.ZodString;
  }, z.core.$strip>, z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<{
      screenshot: "screenshot";
      video: "video";
      test_results: "test_results";
      diff: "diff";
    }>;
    filename: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    uploadedAt: z.ZodOptional<z.ZodNumber>;
    storage: z.ZodLiteral<"local">;
    localArtifactId: z.ZodString;
  }, z.core.$strip>], "storage">>>;
  deliverables: z.ZodOptional<z.ZodArray<z.ZodObject<{
    id: z.ZodString;
    text: z.ZodString;
    linkedArtifactId: z.ZodOptional<z.ZodString>;
    linkedAt: z.ZodOptional<z.ZodNumber>;
  }, z.core.$strip>>>;
}, z.core.$strip>;
/**
 * A point-in-time snapshot of plan state.
 * Created at significant status transitions for version history.
 * Stored in Y.Array(YDOC_KEYS.SNAPSHOTS) for CRDT sync.
 * Schema is source of truth - type derived via z.infer.
 */
type PlanSnapshot = z.infer<typeof PlanSnapshotSchema>;
declare const LinkedPRStatusValues: readonly ["draft", "open", "merged", "closed"];
type LinkedPRStatus = (typeof LinkedPRStatusValues)[number];
declare const LinkedPRSchema: z.ZodObject<{
  prNumber: z.ZodNumber;
  url: z.ZodString;
  linkedAt: z.ZodNumber;
  status: z.ZodEnum<{
    draft: "draft";
    open: "open";
    merged: "merged";
    closed: "closed";
  }>;
  branch: z.ZodOptional<z.ZodString>;
  title: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/**
 * A GitHub PR linked to a plan.
 * Auto-detected from branch when complete_task runs.
 * Schema is source of truth - type derived via z.infer.
 */
type LinkedPR = z.infer<typeof LinkedPRSchema>;
declare const PRReviewCommentSchema: z.ZodObject<{
  id: z.ZodString;
  prNumber: z.ZodNumber;
  path: z.ZodString;
  line: z.ZodNumber;
  body: z.ZodString;
  author: z.ZodString;
  createdAt: z.ZodNumber;
  resolved: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
/**
 * A review comment on a PR diff.
 * Can be added by AI (via MCP tool) or human (via UI).
 * Schema is source of truth - type derived via z.infer.
 */
type PRReviewComment = z.infer<typeof PRReviewCommentSchema>;
/**
 * Create a LinkedPR object with validation.
 * Ensures all required fields are present and valid.
 */
declare function createLinkedPR(params: {
  prNumber: number;
  url: string;
  status: LinkedPRStatus;
  branch: string;
  title: string;
  linkedAt?: number;
}): LinkedPR;
/**
 * Create a GitHub artifact with validation.
 * Ensures storage discriminator is set correctly.
 */
declare function createGitHubArtifact(params: {
  type: ArtifactType;
  filename: string;
  url: string;
  description?: string;
  uploadedAt?: number;
}): GitHubArtifact;
/**
 * Create a local artifact with validation.
 * Ensures storage discriminator is set correctly.
 */
declare function createLocalArtifact(params: {
  type: ArtifactType;
  filename: string;
  localArtifactId: string;
  description?: string;
  uploadedAt?: number;
}): LocalArtifact;
/**
 * Create initial conversation version with handedOff: false.
 * Enforces compile-time type safety for the discriminated union.
 */
declare function createInitialConversationVersion(params: {
  versionId: string;
  creator: string;
  platform: OriginPlatform;
  sessionId: string;
  messageCount: number;
  createdAt: number;
}): ConversationVersion;
/**
 * Create handed-off conversation version.
 * Enforces compile-time type safety for the discriminated union.
 */
declare function createHandedOffConversationVersion(params: {
  versionId: string;
  creator: string;
  platform: OriginPlatform;
  sessionId: string;
  messageCount: number;
  createdAt: number;
  handedOffAt: number;
  handedOffTo: string;
}): ConversationVersion;
//#endregion
export { AgentActivityData, AgentActivityDataSchema, AgentActivityType, AgentActivityTypes, Artifact, ArtifactSchema, ArtifactType, ClaudeCodeOriginMetadata, ClaudeCodeOriginMetadataSchema, ConversationVersion, ConversationVersionSchema, CursorOriginMetadata, CursorOriginMetadataSchema, Deliverable, DeliverableSchema, DevinOriginMetadata, DevinOriginMetadataSchema, GitHubArtifact, LinkedPR, LinkedPRSchema, LinkedPRStatus, LinkedPRStatusValues, LocalArtifact, OriginMetadata, OriginMetadataSchema, OriginPlatform, OriginPlatformValues, PRReviewComment, PRReviewCommentSchema, PlanEvent, PlanEventSchema, PlanEventType, PlanEventTypes, PlanMetadata, PlanMetadataSchema, PlanSnapshot, PlanSnapshotSchema, PlanStatusType, PlanStatusValues, PlanViewTab, PlanViewTabValues, StepCompletion, UnknownOriginMetadataSchema, createGitHubArtifact, createHandedOffConversationVersion, createInitialConversationVersion, createLinkedPR, createLocalArtifact, getArtifactUrl, isInboxWorthy, parseClaudeCodeOrigin };
//# sourceMappingURL=plan.d.mts.map