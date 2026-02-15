import { type Infer, type InferMutableType, Shape } from '@loro-extended/change';
import { A2A_TASK_STATES, PERMISSION_MODES, REASONING_EFFORTS } from './shapes.js';

/**
 * Per-entry shape for the task index.
 * Each entry is a nested LoroMap (container struct) so individual fields
 * can be updated without replacing the entire entry, avoiding CRDT conflicts
 * between concurrent status and title changes.
 */
export const TaskIndexEntryShape = Shape.struct({
  taskId: Shape.plain.string(),
  title: Shape.plain.string(),
  status: Shape.plain.string(...A2A_TASK_STATES),
  createdAt: Shape.plain.number(),
  updatedAt: Shape.plain.number(),
});

/**
 * Task index document schema.
 * One per user room. Provides a denormalized index of all tasks
 * for sidebar display and dashboard queries.
 * Document ID pattern: "room:{userId}:{epoch}"
 */
export const TaskIndexDocumentSchema = Shape.doc({
  taskIndex: Shape.record(TaskIndexEntryShape),
});

export type TaskIndexEntryShape = typeof TaskIndexEntryShape;
export type TaskIndexEntry = Infer<typeof TaskIndexEntryShape>;

export type TaskIndexDocumentShape = typeof TaskIndexDocumentSchema;
export type TaskIndexDocument = Infer<typeof TaskIndexDocumentSchema>;
export type MutableTaskIndexDocument = InferMutableType<typeof TaskIndexDocumentSchema>;

/**
 * Ephemeral shapes.
 * Loro represents absent values as `null`; Zod schemas in @shipyard/session use
 * `undefined`. Boundary coercion (null <-> undefined) happens at publish/consume
 * sites (daemon: `?? null`, browser: `?? undefined`). This is intentional.
 */

/**
 * Reasoning capability shape for models that support configurable reasoning effort.
 * Mirrors ReasoningCapabilitySchema from @shipyard/session (Zod).
 */
const ReasoningCapabilityShape = Shape.plain.struct({
  efforts: Shape.plain.array(Shape.plain.string(...REASONING_EFFORTS)),
  defaultEffort: Shape.plain.string(...REASONING_EFFORTS),
});

/**
 * Model info shape for machine capabilities.
 * Mirrors ModelInfoSchema from @shipyard/session (Zod).
 */
const ModelInfoShape = Shape.plain.struct({
  id: Shape.plain.string(),
  label: Shape.plain.string(),
  provider: Shape.plain.string(),
  reasoning: ReasoningCapabilityShape.nullable(),
});

/**
 * Git repo info shape for machine capabilities.
 * Mirrors GitRepoInfoSchema from @shipyard/session (Zod).
 */
const GitRepoInfoShape = Shape.plain.struct({
  path: Shape.plain.string(),
  name: Shape.plain.string(),
  branch: Shape.plain.string(),
  remote: Shape.plain.string().nullable(),
});

/**
 * Ephemeral shape for machine capabilities (keyed by machineId).
 * Daemon writes its capabilities here when it connects via WebRTC.
 * Browser reads them to populate model/environment/permission pickers.
 *
 * Mirrors MachineCapabilitiesSchema from @shipyard/session (Zod).
 */
export const MachineCapabilitiesEphemeral = Shape.plain.struct({
  models: Shape.plain.array(ModelInfoShape),
  environments: Shape.plain.array(GitRepoInfoShape),
  permissionModes: Shape.plain.array(Shape.plain.string(...PERMISSION_MODES)),
  homeDir: Shape.plain.string().nullable(),
});

export type MachineCapabilitiesEphemeralShape = typeof MachineCapabilitiesEphemeral;
export type MachineCapabilitiesEphemeralValue = Infer<typeof MachineCapabilitiesEphemeral>;

/**
 * Ephemeral declarations for the room/task-index document.
 * Passed as the third argument to `repo.get(docId, schema, ephemeralDeclarations)`.
 */
export const ROOM_EPHEMERAL_DECLARATIONS = {
  capabilities: MachineCapabilitiesEphemeral,
};
