/**
 * @shipyard/loro-schema - Loro schema and document types for Shipyard
 */

export {
  type Infer,
  type InferMutableType,
  Shape,
} from '@loro-extended/change';
export type { EpochCloseCode } from './epoch.js';
export {
  buildDocumentId,
  DEFAULT_EPOCH,
  EPOCH_CLOSE_CODES,
  formatEpochCloseReason,
  isEpochRejection,
  isEpochValid,
  parseDocumentId,
  parseEpochFromReason,
  parseEpochParam,
} from './epoch.js';
export type { SessionId, TaskId } from './ids.js';
export {
  generateSessionId,
  generateTaskId,
  LOCAL_USER_ID,
  toSessionId,
  toTaskId,
} from './ids.js';
export { extractPlanMarkdown } from './plan-helpers.js';
export {
  addTaskToIndex,
  removeTaskFromIndex,
  updateTaskInIndex,
} from './room-helpers.js';
export type {
  MachineCapabilitiesEphemeralShape,
  MachineCapabilitiesEphemeralValue,
  MutableTaskIndexDocument,
  TaskIndexDocument,
  TaskIndexDocumentShape,
  TaskIndexEntry,
} from './room-schema.js';
export {
  MachineCapabilitiesEphemeral,
  ROOM_EPHEMERAL_DECLARATIONS,
  TaskIndexDocumentSchema,
  TaskIndexEntryShape,
} from './room-schema.js';
export type {
  A2ATaskState,
  ContentBlock,
  ContentBlockType,
  DiffFile,
  DiffState,
  EpochDocument,
  EpochDocumentShape,
  Message,
  MutableEpochDocument,
  MutableTaskDocument,
  PermissionDecision,
  PermissionMode,
  PermissionRequest,
  PermissionResponse,
  PlanReviewStatus,
  PlanVersion,
  ReasoningEffort,
  SessionEntry,
  SessionState,
  TaskDocument,
  TaskDocumentShape,
  TaskMeta,
  ToolRiskLevel,
} from './shapes.js';
export {
  A2A_TASK_STATES,
  CONTENT_BLOCK_TYPES,
  ContentBlockShape,
  classifyToolRisk,
  DiffStateShape,
  EpochDocumentSchema,
  MessageShape,
  PERMISSION_DECISIONS,
  PERMISSION_MODES,
  PermissionRequestEphemeral,
  PermissionResponseEphemeral,
  PLAN_REVIEW_STATUSES,
  PlanVersionShape,
  REASONING_EFFORTS,
  SESSION_STATES,
  SessionEntryShape,
  TaskDocumentSchema,
  TOOL_RISK_LEVELS,
} from './shapes.js';
