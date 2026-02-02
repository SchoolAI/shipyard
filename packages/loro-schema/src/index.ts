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
export { RoomDocument, type GetTasksOptions } from "./room/document.js";
// Inferred types (primary types for consumers)
export type {
	ChangeSnapshot,
	MutableTaskDocument,
	SyncedFileChange,
	TaskArtifact,
	TaskComment,
	TaskDeliverable,
	TaskDocument as TaskDocumentType,
	TaskDocumentShape,
	TaskEvent,
	TaskInputRequest,
	TaskLinkedPR,
	TaskMeta,
} from "./task/schema.js";
export type {
	MutableRoom,
	Room,
	RoomShape,
	TaskIndexEntry,
} from "./room/schema.js";
// Shapes (for advanced use cases)
export { RoomSchema } from "./room/schema.js";
export { TaskDocumentSchema } from "./task/schema.js";
// Document classes (primary API)
export { TaskDocument } from "./task/document.js";
