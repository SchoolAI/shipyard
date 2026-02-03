/**
 * @shipyard/loro-schema - Loro schema and document classes for Shipyard
 */

export {
	type Infer,
	type InferMutableType,
	Shape,
} from "@loro-extended/change";

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
export { type GetTasksOptions, RoomDocument } from "./room/document.js";

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

// eslint-disable-next-line no-restricted-syntax
export { RoomSchema, TaskDocumentSchema } from "./shapes.js";

export { TaskDocument, type TaskStatus } from "./task/document.js";
