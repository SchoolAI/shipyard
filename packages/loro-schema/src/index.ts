/**
 * @shipyard/loro-schema - Loro schema and document classes for Shipyard
 */

// Re-export Loro utilities for convenience
export {
	type Infer,
	type InferMutableType,
	Shape,
} from "@loro-extended/change";
// Branded ID types
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
} from "./ids.js";
// ID generators
export {
	generateArtifactId,
	generateCommentId,
	generateDeliverableId,
	generateEventId,
	generateInputRequestId,
	generateMachineId,
	generateTaskId,
	generateThreadId,
} from "./ids.js";
export { RoomDocument, type GetTasksOptions } from "./room-document.js";
// Inferred types (primary types for consumers)
export type {
	ChangeSnapshot,
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
	TaskIndexEntry,
	TaskInputRequest,
	TaskLinkedPR,
	TaskMeta,
} from "./shapes.js";
// Shapes (for advanced use cases)
export { RoomSchema, TaskDocumentSchema } from "./shapes.js";
// Document classes (primary API)
export { TaskDocument } from "./task-document.js";
