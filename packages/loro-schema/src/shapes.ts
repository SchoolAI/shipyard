import { type Infer, type InferMutableType, Shape } from '@loro-extended/change';

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
 * A2A Part discriminated union (per A2A protocol spec).
 * Discriminated by 'kind': text, file, or data.
 */
export const A2APartShape = Shape.plain.discriminatedUnion('kind', {
  text: Shape.plain.struct({
    kind: Shape.plain.string('text'),
    text: Shape.plain.string(),
  }),
  file: Shape.plain.struct({
    kind: Shape.plain.string('file'),
    name: Shape.plain.string().nullable(),
    mimeType: Shape.plain.string().nullable(),
    uri: Shape.plain.string().nullable(),
    bytes: Shape.plain.string().nullable(),
  }),
  data: Shape.plain.struct({
    kind: Shape.plain.string('data'),
    data: Shape.plain.string(),
  }),
});

/**
 * A2A Message shape (per A2A protocol spec).
 * Messages are the units of conversation between agents.
 */
export const A2AMessageShape = Shape.plain.struct({
  messageId: Shape.plain.string(),
  role: Shape.plain.string('user', 'agent'),
  contextId: Shape.plain.string().nullable(),
  taskId: Shape.plain.string().nullable(),
  parts: Shape.plain.array(A2APartShape),
  referenceTaskIds: Shape.plain.array(Shape.plain.string()),
  timestamp: Shape.plain.number(),
});

const A2A_TASK_STATES = [
  'submitted',
  'working',
  'input-required',
  'completed',
  'canceled',
  'failed',
] as const;

const SESSION_STATES = ['pending', 'active', 'completed', 'failed', 'interrupted'] as const;

const REASONING_EFFORTS = ['low', 'medium', 'high'] as const;
const PERMISSION_MODES = ['default', 'accept-edits', 'plan', 'bypass'] as const;

/**
 * Task configuration shape.
 * Per-turn session config written by the browser, read by the daemon.
 * Lives in the CRDT so it syncs naturally and never touches signaling.
 */
export const TaskConfigShape = Shape.struct({
  model: Shape.plain.string().nullable(),
  cwd: Shape.plain.string().nullable(),
  reasoningEffort: Shape.plain.string(...REASONING_EFFORTS).nullable(),
  permissionMode: Shape.plain.string(...PERMISSION_MODES).nullable(),
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

/**
 * Task document schema.
 * One doc per task. Contains metadata, A2A conversation, and session tracking.
 * Document ID pattern: "task:{taskId}:{epoch}"
 */
export const TaskDocumentSchema = Shape.doc({
  meta: Shape.struct({
    id: Shape.plain.string(),
    title: Shape.plain.string(),
    status: Shape.plain.string(...A2A_TASK_STATES),
    createdAt: Shape.plain.number(),
    updatedAt: Shape.plain.number(),
  }),

  config: TaskConfigShape,

  conversation: Shape.list(A2AMessageShape),

  sessions: Shape.list(SessionEntryShape),
});

export type EpochDocumentShape = typeof EpochDocumentSchema;
export type EpochDocument = Infer<typeof EpochDocumentSchema>;
export type MutableEpochDocument = InferMutableType<typeof EpochDocumentSchema>;

export type TaskDocumentShape = typeof TaskDocumentSchema;
export type TaskDocument = Infer<typeof TaskDocumentSchema>;
export type MutableTaskDocument = InferMutableType<typeof TaskDocumentSchema>;

export type TaskMeta = Infer<typeof TaskDocumentSchema.shapes.meta>;
export type TaskConfig = Infer<typeof TaskConfigShape>;
export type A2APart = Infer<typeof A2APartShape>;
export type A2AMessage = Infer<typeof A2AMessageShape>;
export type SessionEntry = Infer<typeof SessionEntryShape>;

export type A2ATaskState = (typeof A2A_TASK_STATES)[number];
export type SessionState = (typeof SESSION_STATES)[number];
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];
export type PermissionMode = (typeof PERMISSION_MODES)[number];
export { A2A_TASK_STATES, PERMISSION_MODES, REASONING_EFFORTS, SESSION_STATES };

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
  message: Shape.plain.string().nullable(),
  decidedAt: Shape.plain.number(),
});

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
