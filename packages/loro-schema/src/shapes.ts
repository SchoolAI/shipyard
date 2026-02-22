import { type Infer, type InferMutableType, Shape, type TypedDoc } from '@loro-extended/change';

/**
 * Epoch document schema.
 * One per installation, never resets. Coordinates schema version across all peers.
 * When version bumps, all peers switch to new epoch-versioned document IDs.
 */
export const EpochDocumentSchema = Shape.doc({
  schema: Shape.struct({
    version: Shape.plain.number(),
  }),
});

/**
 * MCP-aligned content block types.
 * Matches Claude SDK message structure for direct mapping without translation.
 */
const CONTENT_BLOCK_TYPES = ['text', 'tool_use', 'tool_result', 'thinking', 'image'] as const;

const IMAGE_SOURCE_TYPES = ['base64'] as const;

const SUPPORTED_IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;

/**
 * Image source discriminated union.
 * Discriminated by 'type' — currently only 'base64' (inline).
 * Future: add 'url' variant for GitHub branch CDN storage.
 */
const ImageSourceShape = Shape.plain.discriminatedUnion('type', {
  base64: Shape.plain.struct({
    type: Shape.plain.string('base64'),
    mediaType: Shape.plain.string(),
    data: Shape.plain.string(),
  }),
});

/**
 * Content block discriminated union (MCP-aligned).
 * Discriminated by 'type': text, tool_use, tool_result, or thinking.
 */
export const ContentBlockShape = Shape.plain.discriminatedUnion('type', {
  text: Shape.plain.struct({
    type: Shape.plain.string('text'),
    text: Shape.plain.string(),
  }),
  tool_use: Shape.plain.struct({
    type: Shape.plain.string('tool_use'),
    toolUseId: Shape.plain.string(),
    toolName: Shape.plain.string(),
    input: Shape.plain.string(),
    parentToolUseId: Shape.plain.string().nullable(),
  }),
  tool_result: Shape.plain.struct({
    type: Shape.plain.string('tool_result'),
    toolUseId: Shape.plain.string(),
    content: Shape.plain.string(),
    isError: Shape.plain.boolean(),
    parentToolUseId: Shape.plain.string().nullable(),
  }),
  thinking: Shape.plain.struct({
    type: Shape.plain.string('thinking'),
    text: Shape.plain.string(),
  }),
  image: Shape.plain.struct({
    type: Shape.plain.string('image'),
    id: Shape.plain.string(),
    source: ImageSourceShape,
  }),
});

const A2A_TASK_STATES = [
  'submitted',
  'starting',
  'working',
  'input-required',
  'completed',
  'canceled',
  'failed',
] as const;

const SESSION_STATES = ['pending', 'active', 'completed', 'failed', 'interrupted'] as const;

const REASONING_EFFORTS = ['low', 'medium', 'high'] as const;
const PERMISSION_MODES = ['default', 'accept-edits', 'plan', 'bypass'] as const;

const ANTHROPIC_AUTH_STATUSES = ['authenticated', 'unauthenticated', 'unknown'] as const;
const ANTHROPIC_AUTH_METHODS = ['api-key', 'oauth', 'none'] as const;

const ANTHROPIC_LOGIN_STATUSES = ['starting', 'waiting', 'done', 'error'] as const;

/**
 * Message shape (MCP-aligned).
 * Messages are the units of conversation between user and assistant.
 * Per-turn settings (model, machineId, etc.) live here so each turn
 * carries its own context and switching back to a task restores them.
 */
export const MessageShape = Shape.plain.struct({
  messageId: Shape.plain.string(),
  role: Shape.plain.string('user', 'assistant'),
  content: Shape.plain.array(ContentBlockShape),
  timestamp: Shape.plain.number(),
  model: Shape.plain.string().nullable(),
  machineId: Shape.plain.string().nullable(),
  reasoningEffort: Shape.plain.string(...REASONING_EFFORTS).nullable(),
  permissionMode: Shape.plain.string(...PERMISSION_MODES).nullable(),
  cwd: Shape.plain.string().nullable(),
});

const DiffFileShape = Shape.plain.struct({
  path: Shape.plain.string(),
  status: Shape.plain.string(),
});

export const DiffStateShape = Shape.struct({
  unstaged: Shape.plain.string(),
  staged: Shape.plain.string(),
  files: Shape.list(DiffFileShape),
  updatedAt: Shape.plain.number(),

  branchDiff: Shape.plain.string(),
  branchFiles: Shape.list(DiffFileShape),
  branchBase: Shape.plain.string(),
  branchUpdatedAt: Shape.plain.number(),

  lastTurnDiff: Shape.plain.string(),
  lastTurnFiles: Shape.list(DiffFileShape),
  lastTurnUpdatedAt: Shape.plain.number(),
});

/**
 * Agent session entry shape.
 * Tracks a single Claude Code session associated with a task.
 */
export const SessionEntryShape = Shape.plain.struct({
  sessionId: Shape.plain.string(),
  agentSessionId: Shape.plain.string(),
  status: Shape.plain.string(...SESSION_STATES),
  cwd: Shape.plain.string(),
  model: Shape.plain.string().nullable(),
  machineId: Shape.plain.string().nullable(),
  createdAt: Shape.plain.number(),
  completedAt: Shape.plain.number().nullable(),
  totalCostUsd: Shape.plain.number().nullable(),
  durationMs: Shape.plain.number().nullable(),
  error: Shape.plain.string().nullable(),
});

const PLAN_REVIEW_STATUSES = ['pending', 'approved', 'changes-requested'] as const;

/**
 * Plan version shape.
 * Each ExitPlanMode tool call creates a new version.
 * Stored as an append-only list for history tracking.
 */
export const PlanVersionShape = Shape.plain.struct({
  planId: Shape.plain.string(),
  toolUseId: Shape.plain.string(),
  markdown: Shape.plain.string(),
  reviewStatus: Shape.plain.string(...PLAN_REVIEW_STATUSES),
  reviewFeedback: Shape.plain.string().nullable(),
  createdAt: Shape.plain.number(),
});

const COMMENT_AUTHOR_TYPES = ['human', 'agent'] as const;
const DIFF_COMMENT_SIDES = ['old', 'new'] as const;
const DIFF_COMMENT_SCOPES = ['working-tree', 'last-turn'] as const;

export const DiffCommentShape = Shape.plain.struct({
  commentId: Shape.plain.string(),
  filePath: Shape.plain.string(),
  lineNumber: Shape.plain.number(),
  side: Shape.plain.string(...DIFF_COMMENT_SIDES),
  diffScope: Shape.plain.string(...DIFF_COMMENT_SCOPES),
  lineContentHash: Shape.plain.string(),
  body: Shape.plain.string(),
  authorType: Shape.plain.string(...COMMENT_AUTHOR_TYPES),
  authorId: Shape.plain.string(),
  createdAt: Shape.plain.number(),
  resolvedAt: Shape.plain.number().nullable(),
});

export const PlanCommentShape = Shape.plain.struct({
  commentId: Shape.plain.string(),
  planId: Shape.plain.string(),
  from: Shape.plain.number(),
  to: Shape.plain.number(),
  body: Shape.plain.string(),
  authorType: Shape.plain.string(...COMMENT_AUTHOR_TYPES),
  authorId: Shape.plain.string(),
  createdAt: Shape.plain.number(),
  resolvedAt: Shape.plain.number().nullable(),
});

const TaskMetaStructShape = Shape.struct({
  id: Shape.plain.string(),
  title: Shape.plain.string(),
  status: Shape.plain.string(...A2A_TASK_STATES),
  createdAt: Shape.plain.number(),
  updatedAt: Shape.plain.number(),
});

/**
 * Task meta document schema.
 * Lightweight metadata — changes rarely (~200 bytes).
 * Permission boundary: only owner/agent can write.
 * Document ID pattern: "task-meta:{taskId}:{epoch}"
 */
export const TaskMetaDocumentSchema = Shape.doc({
  meta: TaskMetaStructShape,
});

/**
 * Task conversation document schema.
 * Large and growing — messages, tool calls, thinking blocks.
 * Permission boundary: configurable per collaborator (some get write, others read-only).
 * Document ID pattern: "task-conv:{taskId}:{epoch}"
 */
export const TaskConversationDocumentSchema = Shape.doc({
  conversation: Shape.list(MessageShape),
  pendingFollowUps: Shape.list(MessageShape),
  sessions: Shape.list(SessionEntryShape),
  diffState: DiffStateShape,
});

/**
 * Task review document schema.
 * Medium size — plans, comments, grows with review activity.
 * Permission boundary: all collaborators can write (review is the collaboration surface).
 * Document ID pattern: "task-review:{taskId}:{epoch}"
 */
export const TaskReviewDocumentSchema = Shape.doc({
  plans: Shape.list(PlanVersionShape),
  planEditorDocs: Shape.record(Shape.any()),
  diffComments: Shape.record(DiffCommentShape),
  planComments: Shape.record(PlanCommentShape),
  deliveredCommentIds: Shape.list(Shape.plain.string()),
});

export type EpochDocumentShape = typeof EpochDocumentSchema;
export type EpochDocument = Infer<typeof EpochDocumentSchema>;
export type MutableEpochDocument = InferMutableType<typeof EpochDocumentSchema>;

export type TaskMetaDocumentShape = typeof TaskMetaDocumentSchema;
export type TaskMetaDocument = Infer<typeof TaskMetaDocumentSchema>;
export type MutableTaskMetaDocument = InferMutableType<typeof TaskMetaDocumentSchema>;

export type TaskConversationDocumentShape = typeof TaskConversationDocumentSchema;
export type TaskConversationDocument = Infer<typeof TaskConversationDocumentSchema>;
export type MutableTaskConversationDocument = InferMutableType<
  typeof TaskConversationDocumentSchema
>;

export type TaskReviewDocumentShape = typeof TaskReviewDocumentSchema;
export type TaskReviewDocument = Infer<typeof TaskReviewDocumentSchema>;
export type MutableTaskReviewDocument = InferMutableType<typeof TaskReviewDocumentSchema>;

export interface TaskDocHandles {
  meta: TypedDoc<TaskMetaDocumentShape>;
  conv: TypedDoc<TaskConversationDocumentShape>;
  review: TypedDoc<TaskReviewDocumentShape>;
}

export type TaskMeta = Infer<typeof TaskMetaDocumentSchema.shapes.meta>;
export type ContentBlock = Infer<typeof ContentBlockShape>;
export type Message = Infer<typeof MessageShape>;
export type ContentBlockType = (typeof CONTENT_BLOCK_TYPES)[number];
export type DiffFile = Infer<typeof DiffFileShape>;
export type DiffState = Infer<typeof DiffStateShape>;
export type SessionEntry = Infer<typeof SessionEntryShape>;
export type PlanVersion = Infer<typeof PlanVersionShape>;
export type PlanReviewStatus = (typeof PLAN_REVIEW_STATUSES)[number];

export type A2ATaskState = (typeof A2A_TASK_STATES)[number];
export const TERMINAL_TASK_STATES: readonly A2ATaskState[] = ['completed', 'failed', 'canceled'];
export type SessionState = (typeof SESSION_STATES)[number];
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];
export type PermissionMode = (typeof PERMISSION_MODES)[number];
export type DiffComment = Infer<typeof DiffCommentShape>;
export type PlanComment = Infer<typeof PlanCommentShape>;
export type CommentAuthorType = (typeof COMMENT_AUTHOR_TYPES)[number];
export type DiffCommentSide = (typeof DIFF_COMMENT_SIDES)[number];
export type DiffCommentScope = (typeof DIFF_COMMENT_SCOPES)[number];
export type ImageSourceType = (typeof IMAGE_SOURCE_TYPES)[number];
export type ImageSource = Infer<typeof ImageSourceShape>;
export type SupportedImageMediaType = (typeof SUPPORTED_IMAGE_MEDIA_TYPES)[number];
export {
  A2A_TASK_STATES,
  ANTHROPIC_AUTH_METHODS,
  ANTHROPIC_AUTH_STATUSES,
  ANTHROPIC_LOGIN_STATUSES,
  COMMENT_AUTHOR_TYPES,
  CONTENT_BLOCK_TYPES,
  IMAGE_SOURCE_TYPES,
  SUPPORTED_IMAGE_MEDIA_TYPES,
  DIFF_COMMENT_SCOPES,
  DIFF_COMMENT_SIDES,
  PERMISSION_MODES,
  PLAN_REVIEW_STATUSES,
  REASONING_EFFORTS,
  SESSION_STATES,
};

const TOOL_RISK_LEVELS = ['low', 'medium', 'high'] as const;
const PERMISSION_DECISIONS = ['approved', 'denied'] as const;

/**
 * Ephemeral permission request shape.
 * Daemon writes one per pending tool permission, keyed by toolUseId.
 * Synced to browser via loro-extended ephemeral over WebRTC.
 */
export const PermissionRequestEphemeral = Shape.plain.struct({
  toolName: Shape.plain.string(),
  toolInput: Shape.plain.string(),
  riskLevel: Shape.plain.string(...TOOL_RISK_LEVELS),
  reason: Shape.plain.string().nullable(),
  blockedPath: Shape.plain.string().nullable(),
  description: Shape.plain.string().nullable(),
  agentId: Shape.plain.string().nullable(),
  createdAt: Shape.plain.number(),
});

/**
 * Ephemeral permission response shape.
 * Browser writes one per resolved request, keyed by toolUseId.
 * Daemon subscribes and resolves the canUseTool promise.
 */
export const PermissionResponseEphemeral = Shape.plain.struct({
  decision: Shape.plain.string(...PERMISSION_DECISIONS),
  persist: Shape.plain.boolean(),
  message: Shape.plain.string().nullable(),
  decidedAt: Shape.plain.number(),
});

export type AnthropicAuthStatus = (typeof ANTHROPIC_AUTH_STATUSES)[number];
export type AnthropicAuthMethod = (typeof ANTHROPIC_AUTH_METHODS)[number];
export type AnthropicLoginStatus = (typeof ANTHROPIC_LOGIN_STATUSES)[number];
export type ToolRiskLevel = (typeof TOOL_RISK_LEVELS)[number];
export type PermissionDecision = (typeof PERMISSION_DECISIONS)[number];
export type PermissionRequest = Infer<typeof PermissionRequestEphemeral>;
export type PermissionResponse = Infer<typeof PermissionResponseEphemeral>;
export { TOOL_RISK_LEVELS, PERMISSION_DECISIONS };

const HIGH_RISK_TOOLS = new Set(['Write', 'NotebookEdit']);
const MEDIUM_RISK_TOOLS = new Set(['Edit', 'WebFetch', 'WebSearch']);

/**
 * Classify tool risk level based on tool name and input heuristics.
 * The SDK provides no risk level — this is our own classification.
 */
export function classifyToolRisk(toolName: string, input: Record<string, unknown>): ToolRiskLevel {
  if (toolName === 'Bash') {
    const cmd = typeof input.command === 'string' ? input.command : '';
    if (/\brm\b|--force|--hard|\bdd\b|\bmkfs\b/.test(cmd)) return 'high';
    return 'medium';
  }
  if (HIGH_RISK_TOOLS.has(toolName)) return 'high';
  if (MEDIUM_RISK_TOOLS.has(toolName)) return 'medium';
  return 'low';
}
