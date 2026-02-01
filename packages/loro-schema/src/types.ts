/**
 * Branded types, status enums, and type utilities for Loro schema.
 */

/**
 * Branded type helper for nominal typing.
 * Creates distinct types for IDs that are structurally strings/numbers.
 */
declare const __brand: unique symbol;
type Brand<T, B> = T & { readonly [__brand]: B };

/** Task ID - unique identifier for a task document */
export type TaskId = Brand<string, "TaskId">;

/** Session token for agent authentication */
export type SessionToken = Brand<string, "SessionToken">;

/** Machine ID - unique identifier for a development machine */
export type MachineId = Brand<string, "MachineId">;

/** Comment ID - unique identifier for a comment */
export type CommentId = Brand<string, "CommentId">;

/** Artifact ID - unique identifier for an artifact */
export type ArtifactId = Brand<string, "ArtifactId">;

/** Deliverable ID - unique identifier for a deliverable */
export type DeliverableId = Brand<string, "DeliverableId">;

/** Event ID - unique identifier for an event */
export type EventId = Brand<string, "EventId">;

/** Input Request ID - unique identifier for an input request */
export type InputRequestId = Brand<string, "InputRequestId">;

/** Thread ID - unique identifier for a comment thread */
export type ThreadId = Brand<string, "ThreadId">;

/**
 * Status values for tasks.
 */
export const TaskStatusValues = [
	"draft",
	"pending_review",
	"changes_requested",
	"in_progress",
	"completed",
] as const;
export type TaskStatus = (typeof TaskStatusValues)[number];

/**
 * Status values for linked PRs.
 */
export const PRStatusValues = ["draft", "open", "merged", "closed"] as const;
export type PRStatus = (typeof PRStatusValues)[number];

/**
 * Status values for input requests.
 */
export const InputRequestStatusValues = [
	"pending",
	"answered",
	"declined",
	"cancelled",
] as const;
export type InputRequestStatus = (typeof InputRequestStatusValues)[number];

/**
 * Comment kinds (discriminator values).
 */
export const CommentKindValues = ["inline", "pr", "local", "overall"] as const;
export type CommentKind = (typeof CommentKindValues)[number];

/**
 * Input request types (discriminator values).
 */
export const InputRequestTypeValues = [
	"text",
	"multiline",
	"choice",
	"confirm",
	"number",
	"email",
	"date",
	"rating",
	"multi",
] as const;
export type InputRequestType = (typeof InputRequestTypeValues)[number];

/**
 * Artifact storage types (discriminator values).
 */
export const ArtifactStorageValues = ["github", "local"] as const;
export type ArtifactStorage = (typeof ArtifactStorageValues)[number];

/**
 * Artifact content types.
 */
export const ArtifactTypeValues = ["html", "image", "video"] as const;
export type ArtifactType = (typeof ArtifactTypeValues)[number];

/**
 * Event types (discriminator values).
 */
export const EventTypeValues = [
	"task_created",
	"status_changed",
	"completed",
	"task_archived",
	"task_unarchived",
	"approved",
	"changes_requested",
	"comment_added",
	"comment_resolved",
	"artifact_uploaded",
	"deliverable_linked",
	"pr_linked",
	"pr_unlinked",
	"content_edited",
	"input_request_created",
	"input_request_answered",
	"input_request_declined",
	"input_request_cancelled",
	"agent_activity",
	"tag_added",
	"tag_removed",
	"owner_changed",
	"repo_changed",
	"title_changed",
] as const;
export type EventType = (typeof EventTypeValues)[number];

/**
 * File change status in ChangeSnapshot.
 */
export const FileChangeStatusValues = [
	"added",
	"modified",
	"deleted",
	"renamed",
] as const;
export type FileChangeStatus = (typeof FileChangeStatusValues)[number];

/**
 * Number format options for number input requests.
 */
export const NumberFormatValues = [
	"integer",
	"decimal",
	"currency",
	"percentage",
] as const;
export type NumberFormat = (typeof NumberFormatValues)[number];

/**
 * Display options for choice input requests.
 */
export const ChoiceDisplayValues = ["radio", "checkbox", "dropdown"] as const;
export type ChoiceDisplay = (typeof ChoiceDisplayValues)[number];

/**
 * Rating style options for rating input requests.
 */
export const RatingStyleValues = ["stars", "numbers", "emoji"] as const;
export type RatingStyle = (typeof RatingStyleValues)[number];

/**
 * Re-export types from shapes.ts for convenience.
 */
export type {
	ChangeSnapshot,
	GlobalRoom,
	GlobalRoomShape,
	InputRequest,
	MutableGlobalRoom,
	MutableTaskDocument,
	SyncedFileChange,
	TaskArtifact,
	TaskComment,
	TaskDeliverable,
	TaskDocument,
	TaskDocumentShape,
	TaskEvent,
	TaskInputRequest,
	TaskLinkedPR,
	TaskMeta,
} from "./shapes.js";
