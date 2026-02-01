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
  TaskDocumentSchema,
  type TaskDocumentShape,
  type TaskDocument,
  type MutableTaskDocument,
  type TaskMeta,
  type TaskComment,
  type TaskEvent,
  type TaskArtifact,
  type TaskDeliverable,
  type TaskSnapshot,
  type TaskLinkedPR,
  type TaskInputRequest,
  type TaskPRReviewComment,
  type TaskLocalDiffComment,
} from './shapes.js';
