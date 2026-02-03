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
	// eslint-disable-next-line no-restricted-syntax -- Branded type requires assertion
	return nanoid() as TaskId;
}

export function generateCommentId(): CommentId {
	// eslint-disable-next-line no-restricted-syntax -- Branded type requires assertion
	return nanoid() as CommentId;
}

export function generateArtifactId(): ArtifactId {
	// eslint-disable-next-line no-restricted-syntax -- Branded type requires assertion
	return nanoid() as ArtifactId;
}

export function generateDeliverableId(): DeliverableId {
	// eslint-disable-next-line no-restricted-syntax -- Branded type requires assertion
	return nanoid() as DeliverableId;
}

export function generateEventId(): EventId {
	// eslint-disable-next-line no-restricted-syntax -- Branded type requires assertion
	return nanoid() as EventId;
}

export function generateInputRequestId(): InputRequestId {
	// eslint-disable-next-line no-restricted-syntax -- Branded type requires assertion
	return nanoid() as InputRequestId;
}

export function generateMachineId(): MachineId {
	// eslint-disable-next-line no-restricted-syntax -- Branded type requires assertion
	return nanoid() as MachineId;
}

export function generateThreadId(): ThreadId {
	// eslint-disable-next-line no-restricted-syntax -- Branded type requires assertion
	return nanoid() as ThreadId;
}

/** --- Conversion Helpers --- */

/**
 * Convert a string to TaskId.
 * Use this at trust boundaries when you know the string is a valid TaskId.
 */
export function toTaskId(value: string): TaskId {
	// eslint-disable-next-line no-restricted-syntax -- Branded type trust boundary
	return value as TaskId;
}

/**
 * Convert a string to MachineId.
 * Use this at trust boundaries when you know the string is a valid MachineId.
 */
export function toMachineId(value: string): MachineId {
	// eslint-disable-next-line no-restricted-syntax -- Branded type trust boundary
	return value as MachineId;
}

/**
 * Convert a string to CommentId.
 * Use this at trust boundaries when you know the string is a valid CommentId.
 */
export function toCommentId(value: string): CommentId {
	// eslint-disable-next-line no-restricted-syntax -- Branded type trust boundary
	return value as CommentId;
}

/**
 * Convert a string to ArtifactId.
 * Use this at trust boundaries when you know the string is a valid ArtifactId.
 */
export function toArtifactId(value: string): ArtifactId {
	// eslint-disable-next-line no-restricted-syntax -- Branded type trust boundary
	return value as ArtifactId;
}

/**
 * Convert a string to DeliverableId.
 * Use this at trust boundaries when you know the string is a valid DeliverableId.
 */
export function toDeliverableId(value: string): DeliverableId {
	// eslint-disable-next-line no-restricted-syntax -- Branded type trust boundary
	return value as DeliverableId;
}

/**
 * Convert a string to EventId.
 * Use this at trust boundaries when you know the string is a valid EventId.
 */
export function toEventId(value: string): EventId {
	// eslint-disable-next-line no-restricted-syntax -- Branded type trust boundary
	return value as EventId;
}

/**
 * Convert a string to InputRequestId.
 * Use this at trust boundaries when you know the string is a valid InputRequestId.
 */
export function toInputRequestId(value: string): InputRequestId {
	// eslint-disable-next-line no-restricted-syntax -- Branded type trust boundary
	return value as InputRequestId;
}

/**
 * Convert a string to ThreadId.
 * Use this at trust boundaries when you know the string is a valid ThreadId.
 */
export function toThreadId(value: string): ThreadId {
	// eslint-disable-next-line no-restricted-syntax -- Branded type trust boundary
	return value as ThreadId;
}

/**
 * Convert a string to SessionToken.
 * Use this at trust boundaries when you know the string is a valid SessionToken.
 */
export function toSessionToken(value: string): SessionToken {
	// eslint-disable-next-line no-restricted-syntax -- Branded type trust boundary
	return value as SessionToken;
}
