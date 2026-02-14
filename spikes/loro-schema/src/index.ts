/**
 * @shipyard/loro-schema - Loro-based schema and CRDT helpers for Shipyard
 *
 * This package provides the Loro document schema for Shipyard task documents,
 * along with type definitions for type-safe CRDT operations.
 */

// Re-export commonly used types from @loro-extended/change
export { type Infer, type InferMutableType, Shape } from '@loro-extended/change';

// Export the task document schema and types
export {
  type ChangeSnapshot,
  type GlobalRoom,
  // Global room schema and types
  GlobalRoomSchema,
  type GlobalRoomShape,
  type InputRequest,
  type MutableGlobalRoom,
  type MutableTaskDocument,
  type SyncedFileChange,
  type TaskArtifact,
  type TaskComment,
  type TaskDeliverable,
  type TaskDocument,
  TaskDocumentSchema,
  type TaskDocumentShape,
  type TaskEvent,
  type TaskInputRequest,
  type TaskLinkedPR,
  type TaskMeta,
} from './shapes.js';
