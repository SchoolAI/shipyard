/**
 * CRDT helper functions for common Loro operations.
 * Provides ID generators and utility functions.
 *
 * For document mutations, use @loro-extended/change's `change()` function
 * with the TypedDoc created from TaskDocumentSchema or RoomSchema.
 */

import { nanoid } from "nanoid";
import type {
	ArtifactId,
	ArtifactType,
	CommentId,
	DeliverableId,
	EventId,
	EventType,
	FileChangeStatus,
	InputRequestId,
	MachineId,
	PRStatus,
	TaskId,
	TaskStatus,
	ThreadId,
} from "./types.js";

/** Generate a new task ID */
export function generateTaskId(): TaskId {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- branded type requires assertion
	return nanoid() as TaskId;
}

/** Generate a new comment ID */
export function generateCommentId(): CommentId {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- branded type requires assertion
	return nanoid() as CommentId;
}

/** Generate a new artifact ID */
export function generateArtifactId(): ArtifactId {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- branded type requires assertion
	return nanoid() as ArtifactId;
}

/** Generate a new deliverable ID */
export function generateDeliverableId(): DeliverableId {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- branded type requires assertion
	return nanoid() as DeliverableId;
}

/** Generate a new event ID */
export function generateEventId(): EventId {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- branded type requires assertion
	return nanoid() as EventId;
}

/** Generate a new input request ID */
export function generateInputRequestId(): InputRequestId {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- branded type requires assertion
	return nanoid() as InputRequestId;
}

/** Generate a new machine ID */
export function generateMachineId(): MachineId {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- branded type requires assertion
	return nanoid() as MachineId;
}

/** Generate a new thread ID */
export function generateThreadId(): ThreadId {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- branded type requires assertion
	return nanoid() as ThreadId;
}

/** Parameters for creating a new task */
export interface CreateTaskParams {
	id?: TaskId;
	title: string;
	ownerId?: string;
	repo?: string;
	tags?: string[];
	origin?: string;
	epoch?: number;
}

/** Parameters for updating task metadata */
export interface UpdateTaskMetaParams {
	title?: string;
	ownerId?: string;
	repo?: string;
	tags?: string[];
	origin?: string;
}

/** Parameters for adding an inline comment */
export interface AddInlineCommentParams {
	id?: CommentId;
	threadId: string;
	body: string;
	author: string;
	blockId: string;
	selectedText?: string;
	inReplyTo?: string;
}

/** Parameters for adding a PR comment */
export interface AddPRCommentParams {
	id?: CommentId;
	threadId: string;
	body: string;
	author: string;
	prNumber: number;
	path: string;
	line: number;
	inReplyTo?: string;
}

/** Parameters for adding a local comment */
export interface AddLocalCommentParams {
	id?: CommentId;
	threadId: string;
	body: string;
	author: string;
	path: string;
	line: number;
	baseRef: string;
	lineContentHash: string;
	machineId?: MachineId;
	inReplyTo?: string;
}

/** Parameters for adding an overall comment */
export interface AddOverallCommentParams {
	id?: CommentId;
	threadId: string;
	body: string;
	author: string;
	inReplyTo?: string;
}

/** Parameters for adding a GitHub artifact */
export interface AddGitHubArtifactParams {
	id?: ArtifactId;
	type: ArtifactType;
	filename: string;
	url: string;
	description?: string;
}

/** Parameters for adding a local artifact */
export interface AddLocalArtifactParams {
	id?: ArtifactId;
	type: ArtifactType;
	filename: string;
	localArtifactId: string;
	description?: string;
}

/** Parameters for adding a deliverable */
export interface AddDeliverableParams {
	id?: DeliverableId;
	text: string;
}

/** Parameters for linking a PR */
export interface LinkPRParams {
	prNumber: number;
	status: PRStatus;
	branch?: string;
	title?: string;
}

/** Parameters for adding a change snapshot */
export interface AddChangeSnapshotParams {
	machineId: MachineId;
	machineName: string;
	ownerId: string;
	headSha: string;
	branch: string;
	cwd: string;
	files: Array<{
		path: string;
		status: FileChangeStatus;
		patch: string;
		staged: boolean;
	}>;
	totalAdditions: number;
	totalDeletions: number;
}

/** Base event parameters */
export interface BaseEventParams {
	id?: EventId;
	actor: string;
	inboxWorthy?: boolean;
	inboxFor?: string | string[];
}

/** Event-specific data types */
export type EventData = {
	task_created: Record<string, never>;
	status_changed: { fromStatus: string; toStatus: string };
	completed: Record<string, never>;
	task_archived: Record<string, never>;
	task_unarchived: Record<string, never>;
	approved: { message?: string };
	changes_requested: { message?: string };
	comment_added: { commentId: string; threadId?: string; preview?: string };
	comment_resolved: { commentId: string; threadId?: string };
	artifact_uploaded: {
		artifactId: string;
		filename: string;
		artifactType?: string;
	};
	deliverable_linked: {
		deliverableId: string;
		artifactId: string;
		deliverableText?: string;
	};
	pr_linked: { prNumber: number; title?: string };
	pr_unlinked: { prNumber: number };
	content_edited: { summary?: string };
	input_request_created: {
		requestId: string;
		message: string;
		isBlocker?: boolean;
	};
	input_request_answered: { requestId: string };
	input_request_declined: { requestId: string };
	input_request_cancelled: { requestId: string };
	agent_activity: { message: string; isBlocker?: boolean };
	tag_added: { tag: string };
	tag_removed: { tag: string };
	owner_changed: { fromOwner?: string; toOwner: string };
	repo_changed: { fromRepo?: string; toRepo: string };
	title_changed: { fromTitle: string; toTitle: string };
};

/** Parameters for logging an event */
export type LogEventParams<T extends EventType> = BaseEventParams &
	(EventData[T] extends Record<string, never>
		? { data?: never }
		: { data: EventData[T] });

/**
 * Create initial task metadata object.
 * Use with the change() function to set on a typed doc.
 */
export function createTaskMetaData(params: CreateTaskParams): {
	id: TaskId;
	title: string;
	status: TaskStatus;
	createdAt: number;
	updatedAt: number;
	completedAt: null;
	completedBy: null;
	ownerId: string | null;
	epoch: number | null;
	origin: string | null;
	repo: string | null;
	tags: string[];
	viewedBy: Record<string, number>;
	archivedAt: null;
	archivedBy: null;
} {
	const id = params.id ?? generateTaskId();
	const now = Date.now();

	return {
		id,
		title: params.title,
		status: "draft",
		createdAt: now,
		updatedAt: now,
		completedAt: null,
		completedBy: null,
		ownerId: params.ownerId ?? null,
		epoch: params.epoch ?? null,
		origin: params.origin ?? null,
		repo: params.repo ?? null,
		tags: params.tags ?? [],
		viewedBy: {},
		archivedAt: null,
		archivedBy: null,
	};
}

/**
 * Create an inline comment object.
 */
export function createInlineComment(params: AddInlineCommentParams): {
	kind: "inline";
	id: CommentId;
	threadId: string;
	body: string;
	author: string;
	createdAt: number;
	resolved: boolean;
	inReplyTo: string | null;
	blockId: string;
	selectedText: string | null;
} {
	return {
		kind: "inline",
		id: params.id ?? generateCommentId(),
		threadId: params.threadId,
		body: params.body,
		author: params.author,
		createdAt: Date.now(),
		resolved: false,
		inReplyTo: params.inReplyTo ?? null,
		blockId: params.blockId,
		selectedText: params.selectedText ?? null,
	};
}

/**
 * Create a PR comment object.
 */
export function createPRComment(params: AddPRCommentParams): {
	kind: "pr";
	id: CommentId;
	threadId: string;
	body: string;
	author: string;
	createdAt: number;
	resolved: boolean;
	inReplyTo: string | null;
	prNumber: number;
	path: string;
	line: number;
} {
	return {
		kind: "pr",
		id: params.id ?? generateCommentId(),
		threadId: params.threadId,
		body: params.body,
		author: params.author,
		createdAt: Date.now(),
		resolved: false,
		inReplyTo: params.inReplyTo ?? null,
		prNumber: params.prNumber,
		path: params.path,
		line: params.line,
	};
}

/**
 * Create a local comment object.
 */
export function createLocalComment(params: AddLocalCommentParams): {
	kind: "local";
	id: CommentId;
	threadId: string;
	body: string;
	author: string;
	createdAt: number;
	resolved: boolean;
	inReplyTo: string | null;
	path: string;
	line: number;
	baseRef: string;
	lineContentHash: string;
	machineId: string | null;
} {
	return {
		kind: "local",
		id: params.id ?? generateCommentId(),
		threadId: params.threadId,
		body: params.body,
		author: params.author,
		createdAt: Date.now(),
		resolved: false,
		inReplyTo: params.inReplyTo ?? null,
		path: params.path,
		line: params.line,
		baseRef: params.baseRef,
		lineContentHash: params.lineContentHash,
		machineId: params.machineId ?? null,
	};
}

/**
 * Create an overall comment object.
 */
export function createOverallComment(params: AddOverallCommentParams): {
	kind: "overall";
	id: CommentId;
	threadId: string;
	body: string;
	author: string;
	createdAt: number;
	resolved: boolean;
	inReplyTo: string | null;
} {
	return {
		kind: "overall",
		id: params.id ?? generateCommentId(),
		threadId: params.threadId,
		body: params.body,
		author: params.author,
		createdAt: Date.now(),
		resolved: false,
		inReplyTo: params.inReplyTo ?? null,
	};
}

/**
 * Create a GitHub artifact object.
 */
export function createGitHubArtifact(params: AddGitHubArtifactParams): {
	storage: "github";
	id: ArtifactId;
	type: ArtifactType;
	filename: string;
	url: string;
	description: string | null;
	uploadedAt: number;
} {
	return {
		storage: "github",
		id: params.id ?? generateArtifactId(),
		type: params.type,
		filename: params.filename,
		url: params.url,
		description: params.description ?? null,
		uploadedAt: Date.now(),
	};
}

/**
 * Create a local artifact object.
 */
export function createLocalArtifact(params: AddLocalArtifactParams): {
	storage: "local";
	id: ArtifactId;
	type: ArtifactType;
	filename: string;
	localArtifactId: string;
	description: string | null;
	uploadedAt: number;
} {
	return {
		storage: "local",
		id: params.id ?? generateArtifactId(),
		type: params.type,
		filename: params.filename,
		localArtifactId: params.localArtifactId,
		description: params.description ?? null,
		uploadedAt: Date.now(),
	};
}

/**
 * Create a deliverable object.
 */
export function createDeliverable(params: AddDeliverableParams): {
	id: DeliverableId;
	text: string;
	linkedArtifactId: null;
	linkedAt: null;
} {
	return {
		id: params.id ?? generateDeliverableId(),
		text: params.text,
		linkedArtifactId: null,
		linkedAt: null,
	};
}

/**
 * Create a linked PR object.
 */
export function createLinkedPR(params: LinkPRParams): {
	prNumber: number;
	status: PRStatus;
	branch: string | null;
	title: string | null;
} {
	return {
		prNumber: params.prNumber,
		status: params.status,
		branch: params.branch ?? null,
		title: params.title ?? null,
	};
}

/**
 * Create an event object.
 */
export function createEvent<T extends EventType>(
	type: T,
	params: LogEventParams<T>,
): {
	type: T;
	id: EventId;
	actor: string;
	timestamp: number;
	inboxWorthy: boolean | null;
	inboxFor: string | string[] | null;
} & (EventData[T] extends Record<string, never>
	? Record<string, never>
	: EventData[T]) {
	const base = {
		type,
		id: params.id ?? generateEventId(),
		actor: params.actor,
		timestamp: Date.now(),
		inboxWorthy: params.inboxWorthy ?? null,
		inboxFor: params.inboxFor ?? null,
	};

	if ("data" in params && params.data) {
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- generic event factory requires assertion for discriminated union
		return { ...base, ...params.data } as ReturnType<typeof createEvent<T>>;
	}

	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- generic event factory requires assertion for discriminated union
	return base as ReturnType<typeof createEvent<T>>;
}

/**
 * Create a change snapshot object.
 */
export function createChangeSnapshot(params: AddChangeSnapshotParams): {
	machineId: MachineId;
	machineName: string;
	ownerId: string;
	headSha: string;
	branch: string;
	cwd: string;
	isLive: boolean;
	updatedAt: number;
	files: Array<{
		path: string;
		status: FileChangeStatus;
		patch: string;
		staged: boolean;
	}>;
	totalAdditions: number;
	totalDeletions: number;
} {
	return {
		machineId: params.machineId,
		machineName: params.machineName,
		ownerId: params.ownerId,
		headSha: params.headSha,
		branch: params.branch,
		cwd: params.cwd,
		isLive: true,
		updatedAt: Date.now(),
		files: params.files,
		totalAdditions: params.totalAdditions,
		totalDeletions: params.totalDeletions,
	};
}

/**
 * Normalize a tag (lowercase, trim).
 */
export function normalizeTag(tag: string): string {
	return tag.toLowerCase().trim();
}

/**
 * Check if a task is unread for a user.
 */
export function isTaskUnread(
	updatedAt: number,
	username: string,
	viewedBy: Record<string, number>,
): boolean {
	const lastViewed = viewedBy[username];
	if (!lastViewed) return true;
	return lastViewed < updatedAt;
}
