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
  toSessionId,
  toTaskId,
} from './ids.js';

export type {
  A2AMessage,
  A2APart,
  A2ATaskState,
  EpochDocument,
  EpochDocumentShape,
  MutableEpochDocument,
  MutableTaskDocument,
  PermissionMode,
  ReasoningEffort,
  SessionEntry,
  SessionState,
  TaskConfig,
  TaskDocument,
  TaskDocumentShape,
  TaskMeta,
} from './shapes.js';
export {
  A2A_TASK_STATES,
  A2AMessageShape,
  A2APartShape,
  EpochDocumentSchema,
  PERMISSION_MODES,
  REASONING_EFFORTS,
  SESSION_STATES,
  SessionEntryShape,
  TaskConfigShape,
  TaskDocumentSchema,
} from './shapes.js';
