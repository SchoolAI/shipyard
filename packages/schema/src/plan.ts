import { z } from 'zod';

/**
 * Valid status values for a plan.
 *
 * Flow: draft → pending_review → approved → in_progress → completed
 *                    ↓                          ↓
 *              changes_requested ←──────────────┘
 */
export const PlanStatusValues = [
  'draft',
  'pending_review',
  'approved',
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

export interface PlanMetadata {
  id: string;
  title: string;
  status: PlanStatusType;
  createdAt: number;
  updatedAt: number;
  repo?: string;
  pr?: number;
  /** When the plan was reviewed (approved or changes requested) */
  reviewedAt?: number;
  /** Display name of the reviewer */
  reviewedBy?: string;
  reviewComment?: string;
  /** When the task was marked complete */
  completedAt?: number;
  /** Who marked the task complete (agent or reviewer name) */
  completedBy?: string;
  /** Snapshot URL generated on completion */
  snapshotUrl?: string;
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

  // --- Origin tracking for conversation export (Issue #41) ---

  /** Origin metadata for conversation export (platform-specific) */
  origin?: OriginMetadata;

  // --- Per-user read/unread tracking ---

  /** Records when each user last viewed the plan (username → timestamp) */
  viewedBy?: Record<string, number>;

  // --- Review request tracking ---

  /**
   * Unique identifier for current review request.
   * Set by hook when requesting review, checked before accepting approval/denial.
   * Prevents stale review decisions from previous cycles.
   */
  reviewRequestId?: string;
}

export const PlanMetadataSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(PlanStatusValues),
  createdAt: z.number(),
  updatedAt: z.number(),
  repo: z.string().optional(),
  pr: z.number().optional(),
  reviewedAt: z.number().optional(),
  reviewedBy: z.string().optional(),
  reviewComment: z.string().optional(),
  completedAt: z.number().optional(),
  completedBy: z.string().optional(),
  snapshotUrl: z.string().optional(),
  ownerId: z.string().optional(),
  approvalRequired: z.boolean().optional(),
  approvedUsers: z.array(z.string()).optional(),
  rejectedUsers: z.array(z.string()).optional(),
  sessionTokenHash: z.string().optional(),
  archivedAt: z.number().optional(),
  archivedBy: z.string().optional(),

  // Origin tracking for conversation export (Issue #41)
  origin: OriginMetadataSchema.optional(),

  // Per-user read/unread tracking
  viewedBy: z.record(z.string(), z.number()).optional(),

  // Review request tracking
  reviewRequestId: z.string().optional(),
});

export type ArtifactType = 'screenshot' | 'video' | 'test_results' | 'diff';

export interface Artifact {
  id: string;
  type: ArtifactType;
  filename: string;
  url?: string;
  /** Description of what this artifact proves (deliverable name) */
  description?: string;
  /** When the artifact was uploaded */
  uploadedAt?: number;
}

export const ArtifactSchema = z.object({
  id: z.string(),
  type: z.enum(['screenshot', 'video', 'test_results', 'diff']),
  filename: z.string(),
  url: z.string().optional(),
  description: z.string().optional(),
  uploadedAt: z.number().optional(),
});

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

// --- Linked PR Types ---

/**
 * Valid status values for a linked PR.
 */
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

// --- PR Review Comment Types ---

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
