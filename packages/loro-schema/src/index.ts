/**
 * @shipyard/loro-schema - Loro schema and document classes for Shipyard
 */

export {
  type Infer,
  type InferMutableType,
  Shape,
} from '@loro-extended/change';

export type {
  ArtifactId,
  CommentId,
  DeliverableId,
  EventId,
  InputRequestId,
  MachineId,
  SessionToken,
  TaskId,
  ThreadId,
} from './ids.js';

export {
  generateArtifactId,
  generateCommentId,
  generateDeliverableId,
  generateEventId,
  generateInputRequestId,
  generateMachineId,
  generateTaskId,
  generateThreadId,
  toArtifactId,
  toCommentId,
  toDeliverableId,
  toEventId,
  toInputRequestId,
  toMachineId,
  toSessionToken,
  toTaskId,
  toThreadId,
} from './ids.js';
export {
  type BrowserContext,
  type EnvironmentContext,
  type PeerPresence,
  PresenceSchema,
  RoomEphemeralDeclarations,
} from './presence.js';
export { type GetTasksOptions, RoomDocument } from './room/document.js';
export { getTaskPath, getTaskUrl, ROUTES } from './routes.js';
export type {
  ChangeSnapshot,
  FrontierOpId,
  MutableRoom,
  MutableTaskDocument,
  Room,
  RoomShape,
  SyncedFileChange,
  TaskArtifact,
  TaskComment,
  TaskDeliverable,
  TaskDocument as TaskDocumentType,
  TaskDocumentShape,
  TaskEvent,
  TaskEventItem,
  TaskIndexEntry,
  TaskInputRequest,
  TaskLinkedPR,
  TaskMeta,
} from './shapes.js';
// eslint-disable-next-line no-restricted-syntax
export { RoomSchema, TaskDocumentSchema } from './shapes.js';
export {
  isTaskStatus,
  TASK_STATUSES,
  TaskDocument,
  type TaskStatus,
} from './task/document.js';
