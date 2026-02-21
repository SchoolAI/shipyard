import { type Infer, type InferMutableType, Shape } from '@loro-extended/change';
import {
  A2A_TASK_STATES,
  ANTHROPIC_AUTH_METHODS,
  ANTHROPIC_AUTH_STATUSES,
  ANTHROPIC_LOGIN_STATUSES,
  PERMISSION_MODES,
  REASONING_EFFORTS,
} from './shapes.js';

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

const WORKTREE_SETUP_STATUSES = ['running', 'done', 'failed'] as const;

/**
 * Status of a worktree setup script.
 * All states (including `running`) are persisted in the CRDT.
 * On daemon startup, orphaned `running` entries (dead PID, same machine)
 * are marked `failed` via PID-based detection.
 * Keyed by worktree path in the document record.
 */
export const WorktreeSetupStatusShape = Shape.struct({
  status: Shape.plain.string(...WORKTREE_SETUP_STATUSES),
  machineId: Shape.plain.string(),
  startedAt: Shape.plain.number(),
  completedAt: Shape.plain.number().nullable(),
  exitCode: Shape.plain.number().nullable(),
  signal: Shape.plain.string().nullable(),
  pid: Shape.plain.number().nullable(),
});

/**
 * Per-repo worktree setup script entry.
 * Stored persistently in the CRDT document so scripts survive daemon restarts.
 * Keyed by source repo path in the `userSettings.worktreeScripts` record.
 */
export const WorktreeScriptShape = Shape.plain.struct({
  script: Shape.plain.string(),
});

/**
 * Persistent user settings stored in the CRDT document.
 * Unlike ephemeral state, these survive page refreshes and daemon restarts.
 */
export const UserSettingsShape = Shape.struct({
  worktreeScripts: Shape.record(WorktreeScriptShape),
});

/**
 * Task index document schema.
 * One per user room. Provides a denormalized index of all tasks
 * for sidebar display and dashboard queries.
 * Document ID pattern: "room:{userId}:{epoch}"
 */
export const TaskIndexDocumentSchema = Shape.doc({
  taskIndex: Shape.record(TaskIndexEntryShape),
  worktreeSetupStatus: Shape.record(WorktreeSetupStatusShape),
  userSettings: UserSettingsShape,
});

export type TaskIndexEntryShape = typeof TaskIndexEntryShape;
export type TaskIndexEntry = Infer<typeof TaskIndexEntryShape>;

export { WORKTREE_SETUP_STATUSES };
export type WorktreeSetupStatusShape = typeof WorktreeSetupStatusShape;
export type WorktreeSetupStatus = Infer<typeof WorktreeSetupStatusShape>;

export type WorktreeScriptValue = Infer<typeof WorktreeScriptShape>;

export type UserSettingsValue = Infer<typeof UserSettingsShape>;

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
/**
 * Anthropic auth status shape for machine capabilities.
 * Indicates whether the daemon can authenticate with Anthropic (API key or OAuth).
 */
const AnthropicAuthShape = Shape.plain.struct({
  status: Shape.plain.string(...ANTHROPIC_AUTH_STATUSES),
  method: Shape.plain.string(...ANTHROPIC_AUTH_METHODS),
  email: Shape.plain.string().nullable(),
});

export const MachineCapabilitiesEphemeral = Shape.plain.struct({
  models: Shape.plain.array(ModelInfoShape),
  environments: Shape.plain.array(GitRepoInfoShape),
  permissionModes: Shape.plain.array(Shape.plain.string(...PERMISSION_MODES)),
  homeDir: Shape.plain.string().nullable(),
  anthropicAuth: AnthropicAuthShape.nullable(),
});

export type MachineCapabilitiesEphemeralShape = typeof MachineCapabilitiesEphemeral;
export type MachineCapabilitiesEphemeralValue = Infer<typeof MachineCapabilitiesEphemeral>;

/**
 * Ephemeral request shape for enhance-prompt (keyed by requestId).
 * Browser writes, daemon reads. Replaces session server relay for prompt data.
 */
export const EnhancePromptRequestEphemeral = Shape.plain.struct({
  machineId: Shape.plain.string(),
  prompt: Shape.plain.string(),
  requestedAt: Shape.plain.number(),
});

export type EnhancePromptRequestEphemeralValue = Infer<typeof EnhancePromptRequestEphemeral>;

/**
 * Ephemeral response shape for enhance-prompt (keyed by requestId).
 * Daemon writes progressively, browser reads reactively.
 * `text` accumulates — each write contains the full text so far.
 */
export const EnhancePromptResponseEphemeral = Shape.plain.struct({
  status: Shape.plain.string('streaming', 'done', 'error'),
  text: Shape.plain.string(),
  error: Shape.plain.string().nullable(),
});

export type EnhancePromptResponseEphemeralValue = Infer<typeof EnhancePromptResponseEphemeral>;

/**
 * Ephemeral request shape for worktree creation (keyed by requestId).
 * Browser writes, daemon reads. All private paths stay in P2P mesh.
 */
export const WorktreeCreateRequestEphemeral = Shape.plain.struct({
  machineId: Shape.plain.string(),
  sourceRepoPath: Shape.plain.string(),
  branchName: Shape.plain.string(),
  baseRef: Shape.plain.string(),
  setupScript: Shape.plain.string().nullable(),
  requestedAt: Shape.plain.number(),
});

export type WorktreeCreateRequestEphemeralValue = Infer<typeof WorktreeCreateRequestEphemeral>;

/**
 * Ephemeral response shape for worktree creation (keyed by requestId).
 * Daemon writes progress updates, browser reads reactively.
 */
export const WorktreeCreateResponseEphemeral = Shape.plain.struct({
  status: Shape.plain.string(
    'creating-worktree',
    'copying-files',
    'running-setup-script',
    'refreshing-environments',
    'done',
    'error'
  ),
  detail: Shape.plain.string().nullable(),
  worktreePath: Shape.plain.string().nullable(),
  branchName: Shape.plain.string().nullable(),
  setupScriptStarted: Shape.plain.boolean().nullable(),
  warnings: Shape.plain.array(Shape.plain.string()).nullable(),
  error: Shape.plain.string().nullable(),
});

export type WorktreeCreateResponseEphemeralValue = Infer<typeof WorktreeCreateResponseEphemeral>;

/**
 * Ephemeral response shape for worktree setup script completion (keyed by requestId).
 * Daemon writes when a setup script's child process exits.
 * Browser reads to display setup script outcome.
 */
export const WorktreeSetupResultEphemeral = Shape.plain.struct({
  exitCode: Shape.plain.number().nullable(),
  signal: Shape.plain.string().nullable(),
  worktreePath: Shape.plain.string(),
});

export type WorktreeSetupResultEphemeralValue = Infer<typeof WorktreeSetupResultEphemeral>;

/**
 * Ephemeral request shape for Anthropic login (keyed by requestId).
 * Browser writes, daemon reads. Triggers `claude auth login` on the daemon.
 */
export const AnthropicLoginRequestEphemeral = Shape.plain.struct({
  machineId: Shape.plain.string(),
  requestedAt: Shape.plain.number(),
});

export type AnthropicLoginRequestEphemeralValue = Infer<typeof AnthropicLoginRequestEphemeral>;

/**
 * Ephemeral response shape for Anthropic login (keyed by requestId).
 * Daemon writes progress, browser reads reactively.
 */
export const AnthropicLoginResponseEphemeral = Shape.plain.struct({
  status: Shape.plain.string(...ANTHROPIC_LOGIN_STATUSES),
  loginUrl: Shape.plain.string().nullable(),
  error: Shape.plain.string().nullable(),
});

export type AnthropicLoginResponseEphemeralValue = Infer<typeof AnthropicLoginResponseEphemeral>;

/**
 * Ephemeral declarations for the room/task-index document.
 * Passed as the third argument to `repo.get(docId, schema, ephemeralDeclarations)`.
 */
export const ROOM_EPHEMERAL_DECLARATIONS = {
  capabilities: MachineCapabilitiesEphemeral,
  enhancePromptReqs: EnhancePromptRequestEphemeral,
  enhancePromptResps: EnhancePromptResponseEphemeral,
  worktreeCreateReqs: WorktreeCreateRequestEphemeral,
  worktreeCreateResps: WorktreeCreateResponseEphemeral,
  worktreeSetupResps: WorktreeSetupResultEphemeral,
  anthropicLoginReqs: AnthropicLoginRequestEphemeral,
  anthropicLoginResps: AnthropicLoginResponseEphemeral,
};
