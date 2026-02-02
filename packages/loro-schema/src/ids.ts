/**
 * Branded ID types and generators for type-safe identifiers.
 */

import { nanoid } from "nanoid";

/** Branded type helper utility */

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

export function generateTaskId(): TaskId {
	return nanoid() as TaskId;
}

export function generateCommentId(): CommentId {
	return nanoid() as CommentId;
}

export function generateArtifactId(): ArtifactId {
	return nanoid() as ArtifactId;
}

export function generateDeliverableId(): DeliverableId {
	return nanoid() as DeliverableId;
}

export function generateEventId(): EventId {
	return nanoid() as EventId;
}

export function generateInputRequestId(): InputRequestId {
	return nanoid() as InputRequestId;
}

export function generateMachineId(): MachineId {
	return nanoid() as MachineId;
}

export function generateThreadId(): ThreadId {
	return nanoid() as ThreadId;
}
