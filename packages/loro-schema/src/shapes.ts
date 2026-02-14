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
