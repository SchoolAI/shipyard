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
export type A2APart = Infer<typeof A2APartShape>;
export type A2AMessage = Infer<typeof A2AMessageShape>;
export type SessionEntry = Infer<typeof SessionEntryShape>;

export type A2ATaskState = (typeof A2A_TASK_STATES)[number];
export type SessionState = (typeof SESSION_STATES)[number];
export { A2A_TASK_STATES, SESSION_STATES };
