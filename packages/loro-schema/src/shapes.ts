/**
 * Loro Shape definitions for Shipyard.
 *
 * Two document types:
 * 1. Task document (one per task)
 * 2. Global room document (one per room)
 */

import {
	type Infer,
	type InferMutableType,
	Shape,
} from "@loro-extended/change";

/**
 * Base fields shared across all comment types.
 * Used by: inline, pr, local, overall comments
 */
const CommentBaseFields = {
	id: Shape.plain.string(),
	threadId: Shape.plain.string(),
	body: Shape.plain.string(),
	author: Shape.plain.string(),
	createdAt: Shape.plain.number(),
	resolved: Shape.plain.boolean(),
	inReplyTo: Shape.plain.string().nullable(),
} as const;

/**
 * Base fields shared across all event types.
 * Used by: All 20+ event variants
 */
const EventBaseFields = {
	id: Shape.plain.string(),
	actor: Shape.plain.string(),
	timestamp: Shape.plain.number(),
	inboxWorthy: Shape.plain.boolean().nullable(),
	inboxFor: Shape.plain.union([
		Shape.plain.string(),
		Shape.plain.array(Shape.plain.string()),
		Shape.plain.null(),
	]),
} as const;

/**
 * Base fields shared across all artifact types.
 * Used by: github, local artifact storage
 */
const ArtifactBaseFields = {
	id: Shape.plain.string(),
	type: Shape.plain.string("html", "image", "video"),
	filename: Shape.plain.string(),
	description: Shape.plain.string().nullable(),
	uploadedAt: Shape.plain.number().nullable(),
} as const;

/**
 * Metadata fields for input requests (tracking/state, not the question itself).
 * Combined with question shapes to create full input request types.
 */
const InputRequestMetaFields = {
	id: Shape.plain.string(),
	status: Shape.plain.string("pending", "answered", "declined", "cancelled"),
	createdAt: Shape.plain.number(),
	expiresAt: Shape.plain.number(),
	response: Shape.plain.union([
		Shape.plain.string(),
		Shape.plain.number(),
		Shape.plain.boolean(),
		Shape.plain.array(Shape.plain.string()),
		Shape.plain.null(),
	]),
	answeredAt: Shape.plain.number().nullable(),
	answeredBy: Shape.plain.string().nullable(),
	isBlocker: Shape.plain.boolean().nullable(),
} as const;

/**
 * Choice option shape used in choice questions.
 */
const ChoiceOptionShape = Shape.plain.struct({
	label: Shape.plain.string(),
	value: Shape.plain.string(),
	description: Shape.plain.string().nullable(),
});

const TextQuestionFields = {
	type: Shape.plain.string("text"),
	message: Shape.plain.string(),
	defaultValue: Shape.plain.string().nullable(),
	placeholder: Shape.plain.string().nullable(),
} as const;

const MultilineQuestionFields = {
	type: Shape.plain.string("multiline"),
	message: Shape.plain.string(),
	defaultValue: Shape.plain.string().nullable(),
	placeholder: Shape.plain.string().nullable(),
} as const;

const ChoiceQuestionFields = {
	type: Shape.plain.string("choice"),
	message: Shape.plain.string(),
	options: Shape.plain.array(ChoiceOptionShape),
	multiSelect: Shape.plain.boolean().nullable(),
	displayAs: Shape.plain.string("radio", "checkbox", "dropdown").nullable(),
	placeholder: Shape.plain.string().nullable(),
} as const;

const ConfirmQuestionFields = {
	type: Shape.plain.string("confirm"),
	message: Shape.plain.string(),
} as const;

const NumberQuestionFields = {
	type: Shape.plain.string("number"),
	message: Shape.plain.string(),
	min: Shape.plain.number().nullable(),
	max: Shape.plain.number().nullable(),
	format: Shape.plain
		.string("integer", "decimal", "currency", "percentage")
		.nullable(),
	defaultValue: Shape.plain.number().nullable(),
} as const;

const TextQuestionShape = Shape.plain.struct(TextQuestionFields);
const MultilineQuestionShape = Shape.plain.struct(MultilineQuestionFields);
const ChoiceQuestionShape = Shape.plain.struct(ChoiceQuestionFields);
const ConfirmQuestionShape = Shape.plain.struct(ConfirmQuestionFields);
const NumberQuestionShape = Shape.plain.struct(NumberQuestionFields);

/**
 * Union of all question shapes, discriminated by 'type'.
 * Used for multi-input nested questions.
 */
const QuestionUnionShape = Shape.plain.discriminatedUnion("type", {
	text: TextQuestionShape,
	multiline: MultilineQuestionShape,
	choice: ChoiceQuestionShape,
	confirm: ConfirmQuestionShape,
	number: NumberQuestionShape,
});

/**
 * Shape definition for individual file changes in a ChangeSnapshot.
 */
const SyncedFileChangeShape = Shape.plain.struct({
	path: Shape.plain.string(),
	status: Shape.plain.string("added", "modified", "deleted", "renamed"),
	patch: Shape.plain.string(),
	staged: Shape.plain.boolean(),
});

/**
 * Task event discriminated union shape.
 * Shared between TaskDocumentSchema.events and RoomSchema.taskIndex.inboxEvents.
 * Exported for type extraction in TaskDocument.logEvent().
 */
export const TaskEventShape = Shape.plain.discriminatedUnion("type", {
	task_created: Shape.plain.struct({
		type: Shape.plain.string("task_created"),
		...EventBaseFields,
	}),
	status_changed: Shape.plain.struct({
		type: Shape.plain.string("status_changed"),
		...EventBaseFields,
		fromStatus: Shape.plain.string(),
		toStatus: Shape.plain.string(),
	}),
	completed: Shape.plain.struct({
		type: Shape.plain.string("completed"),
		...EventBaseFields,
	}),
	task_archived: Shape.plain.struct({
		type: Shape.plain.string("task_archived"),
		...EventBaseFields,
	}),
	task_unarchived: Shape.plain.struct({
		type: Shape.plain.string("task_unarchived"),
		...EventBaseFields,
	}),
	approved: Shape.plain.struct({
		type: Shape.plain.string("approved"),
		...EventBaseFields,
		message: Shape.plain.string().nullable(),
	}),
	changes_requested: Shape.plain.struct({
		type: Shape.plain.string("changes_requested"),
		...EventBaseFields,
		message: Shape.plain.string().nullable(),
	}),
	comment_added: Shape.plain.struct({
		type: Shape.plain.string("comment_added"),
		...EventBaseFields,
		commentId: Shape.plain.string(),
		threadId: Shape.plain.string().nullable(),
		preview: Shape.plain.string().nullable(),
	}),
	comment_resolved: Shape.plain.struct({
		type: Shape.plain.string("comment_resolved"),
		...EventBaseFields,
		commentId: Shape.plain.string(),
		threadId: Shape.plain.string().nullable(),
	}),
	artifact_uploaded: Shape.plain.struct({
		type: Shape.plain.string("artifact_uploaded"),
		...EventBaseFields,
		artifactId: Shape.plain.string(),
		filename: Shape.plain.string(),
		artifactType: Shape.plain.string().nullable(),
	}),
	deliverable_linked: Shape.plain.struct({
		type: Shape.plain.string("deliverable_linked"),
		...EventBaseFields,
		deliverableId: Shape.plain.string(),
		artifactId: Shape.plain.string(),
		deliverableText: Shape.plain.string().nullable(),
	}),
	pr_linked: Shape.plain.struct({
		type: Shape.plain.string("pr_linked"),
		...EventBaseFields,
		prNumber: Shape.plain.number(),
		title: Shape.plain.string().nullable(),
	}),
	content_edited: Shape.plain.struct({
		type: Shape.plain.string("content_edited"),
		...EventBaseFields,
		summary: Shape.plain.string().nullable(),
	}),
	input_request_created: Shape.plain.struct({
		type: Shape.plain.string("input_request_created"),
		...EventBaseFields,
		requestId: Shape.plain.string(),
		message: Shape.plain.string(),
		isBlocker: Shape.plain.boolean().nullable(),
	}),
	input_request_answered: Shape.plain.struct({
		type: Shape.plain.string("input_request_answered"),
		...EventBaseFields,
		requestId: Shape.plain.string(),
	}),
	input_request_declined: Shape.plain.struct({
		type: Shape.plain.string("input_request_declined"),
		...EventBaseFields,
		requestId: Shape.plain.string(),
	}),
	input_request_cancelled: Shape.plain.struct({
		type: Shape.plain.string("input_request_cancelled"),
		...EventBaseFields,
		requestId: Shape.plain.string(),
	}),
	agent_activity: Shape.plain.struct({
		type: Shape.plain.string("agent_activity"),
		...EventBaseFields,
		message: Shape.plain.string(),
		isBlocker: Shape.plain.boolean().nullable(),
	}),
	title_changed: Shape.plain.struct({
		type: Shape.plain.string("title_changed"),
		...EventBaseFields,
		fromTitle: Shape.plain.string(),
		toTitle: Shape.plain.string(),
	}),
	spawn_requested: Shape.plain.struct({
		type: Shape.plain.string("spawn_requested"),
		...EventBaseFields,
		targetMachineId: Shape.plain.string(),
		prompt: Shape.plain.string(),
		cwd: Shape.plain.string(),
		requestedBy: Shape.plain.string(),
	}),
	spawn_started: Shape.plain.struct({
		type: Shape.plain.string("spawn_started"),
		...EventBaseFields,
		requestId: Shape.plain.string(),
		pid: Shape.plain.number(),
	}),
	spawn_completed: Shape.plain.struct({
		type: Shape.plain.string("spawn_completed"),
		...EventBaseFields,
		requestId: Shape.plain.string(),
		exitCode: Shape.plain.number(),
	}),
	spawn_failed: Shape.plain.struct({
		type: Shape.plain.string("spawn_failed"),
		...EventBaseFields,
		requestId: Shape.plain.string(),
		error: Shape.plain.string(),
	}),
});

/**
 * Individual task document schema.
 * One doc per task, contains all task-specific state.
 */
export const TaskDocumentSchema = Shape.doc({
	meta: Shape.struct({
		id: Shape.plain.string(),
		title: Shape.plain.string(),
		status: Shape.plain.string(
			"draft",
			"pending_review",
			"changes_requested",
			"in_progress",
			"completed",
		),

		createdAt: Shape.plain.number(),
		updatedAt: Shape.plain.number(),
		completedAt: Shape.plain.number().nullable(),
		completedBy: Shape.plain.string().nullable(),

		ownerId: Shape.plain.string().nullable(),
		sessionTokenHash: Shape.plain.string(),
		epoch: Shape.plain.number(),
		repo: Shape.plain.string().nullable(),

		tags: Shape.list(Shape.plain.string()),

		archivedAt: Shape.plain.number().nullable(),
		archivedBy: Shape.plain.string().nullable(),
	}),

	/**
	 * Tiptap editor document managed by loro-prosemirror.
	 * Uses Shape.any() because loro-prosemirror manages its own internal LoroMap structure.
	 * @see https://github.com/loro-dev/loro-prosemirror
	 */
	content: Shape.any(),

	comments: Shape.record(
		Shape.plain.discriminatedUnion("kind", {
			inline: Shape.plain.struct({
				kind: Shape.plain.string("inline"),
				...CommentBaseFields,
				blockId: Shape.plain.string(),
				selectedText: Shape.plain.string().nullable(),
			}),

			pr: Shape.plain.struct({
				kind: Shape.plain.string("pr"),
				...CommentBaseFields,
				prNumber: Shape.plain.number(),
				path: Shape.plain.string(),
				line: Shape.plain.number(),
			}),

			local: Shape.plain.struct({
				kind: Shape.plain.string("local"),
				...CommentBaseFields,
				path: Shape.plain.string(),
				line: Shape.plain.number(),
				baseRef: Shape.plain.string(),
				lineContentHash: Shape.plain.string(),
				machineId: Shape.plain.string().nullable(),
			}),

			overall: Shape.plain.struct({
				kind: Shape.plain.string("overall"),
				...CommentBaseFields,
			}),
		}),
	),

	artifacts: Shape.list(
		Shape.plain.discriminatedUnion("storage", {
			github: Shape.plain.struct({
				storage: Shape.plain.string("github"),
				...ArtifactBaseFields,
				url: Shape.plain.string(),
			}),

			// TODO: may add local support in the future
			// local: Shape.plain.struct({
			// 	storage: Shape.plain.string("local"),
			// 	...ArtifactBaseFields,
			// 	localArtifactId: Shape.plain.string(),
			// }),
		}),
	),

	deliverables: Shape.list(
		Shape.plain.struct({
			id: Shape.plain.string(),
			text: Shape.plain.string(),
			linkedArtifactId: Shape.plain.string().nullable(),
			linkedAt: Shape.plain.number().nullable(),
		}),
	),

	events: Shape.list(TaskEventShape),

	linkedPRs: Shape.list(
		Shape.plain.struct({
			prNumber: Shape.plain.number(),
			status: Shape.plain.string("draft", "open", "merged", "closed"),
			branch: Shape.plain.string().nullable(),
			title: Shape.plain.string().nullable(),
		}),
	),

	inputRequests: Shape.list(
		Shape.plain.discriminatedUnion("type", {
			text: Shape.plain.struct({
				...TextQuestionFields,
				...InputRequestMetaFields,
			}),
			multiline: Shape.plain.struct({
				...MultilineQuestionFields,
				...InputRequestMetaFields,
			}),
			choice: Shape.plain.struct({
				...ChoiceQuestionFields,
				...InputRequestMetaFields,
			}),
			confirm: Shape.plain.struct({
				...ConfirmQuestionFields,
				...InputRequestMetaFields,
			}),
			number: Shape.plain.struct({
				...NumberQuestionFields,
				...InputRequestMetaFields,
			}),
			multi: Shape.plain.struct({
				type: Shape.plain.string("multi"),
				message: Shape.plain.string(),
				...InputRequestMetaFields,
				questions: Shape.plain.array(QuestionUnionShape),
				responses: Shape.plain.record(
					Shape.plain.union([
						Shape.plain.string(),
						Shape.plain.number(),
						Shape.plain.boolean(),
						Shape.plain.array(Shape.plain.string()),
					]),
				),
			}),
		}),
	),

	changeSnapshots: Shape.record(
		Shape.struct({
			machineId: Shape.plain.string(),
			machineName: Shape.plain.string(),
			ownerId: Shape.plain.string(),
			headSha: Shape.plain.string(),
			branch: Shape.plain.string(),
			cwd: Shape.plain.string(),
			isLive: Shape.plain.boolean(),
			updatedAt: Shape.plain.number(),
			files: Shape.list(SyncedFileChangeShape),
			totalAdditions: Shape.plain.number(),
			totalDeletions: Shape.plain.number(),
		}),
	),
});

/**
 * Room document schema.
 * One doc per room (Personal or Collab), contains task index for dashboard.
 *
 * Input requests live in TaskDocumentSchema, not here.
 * This schema is intentionally minimal - just enough for dashboard/discovery.
 */
export const RoomSchema = Shape.doc({
	/**
	 * Denormalized task metadata for dashboard display.
	 * Updated by TaskDocument operations when task state changes.
	 *
	 * Using Record keyed by taskId for O(1) lookups instead of O(n) list scans.
	 * Includes viewedBy tracking nested per-task.
	 */
	taskIndex: Shape.record(
		Shape.struct({
			taskId: Shape.plain.string(),
			title: Shape.plain.string(),
			status: Shape.plain.string(
				"draft",
				"pending_review",
				"changes_requested",
				"in_progress",
				"completed",
			),
			ownerId: Shape.plain.string(),
			hasPendingRequests: Shape.plain.boolean(),
			lastUpdated: Shape.plain.number(),
			createdAt: Shape.plain.number(),

			/**
			 * Per-task read tracking for inbox: username → timestamp
			 */
			viewedBy: Shape.record(Shape.plain.number()),

			/**
			 * Per-task event read tracking for inbox: eventId → username → timestamp
			 */
			eventViewedBy: Shape.record(Shape.record(Shape.plain.number())),

			/**
			 * Inbox-worthy events for this task (denormalized from TaskDocument.events).
			 * Only includes events with inboxWorthy: true.
			 * Synced by TaskDocument.logEvent() when event is inbox-worthy.
			 *
			 * This enables building inbox view without loading full task documents.
			 */
			inboxEvents: Shape.list(TaskEventShape),
		}),
	),
});

export type TaskDocumentShape = typeof TaskDocumentSchema;
export type TaskDocument = Infer<typeof TaskDocumentSchema>;
export type MutableTaskDocument = InferMutableType<typeof TaskDocumentSchema>;

/**
 * TODO (2026-02-01): Workaround for @loro-extended/change@5.3.0 bug
 *
 * The published npm version doesn't export BooleanValueShape, StringValueShape, etc.,
 * causing TS4023 errors when using Infer<typeof ...> in exported types.
 *
 * Explicit interface definitions are used below instead of Infer<> to ensure
 * proper type exports. Once a newer version of @loro-extended/change is published
 * with these exports, we can switch back to using Infer<>.
 */

/**
 * Task metadata type - explicitly defined for cross-package compatibility.
 */
export interface TaskMeta {
	id: string;
	title: string;
	status:
		| "draft"
		| "pending_review"
		| "changes_requested"
		| "in_progress"
		| "completed";
	createdAt: number;
	updatedAt: number;
	completedAt: number | null;
	completedBy: string | null;
	ownerId: string | null;
	sessionTokenHash: string;
	epoch: number;
	repo: string | null;
	tags: string[];
	archivedAt: number | null;
	archivedBy: string | null;
}

// Internal types using Infer (not exported for cross-package use)
type TaskCommentInternal = Infer<typeof TaskDocumentSchema.shapes.comments>;
type TaskEventInternal = Infer<typeof TaskDocumentSchema.shapes.events>;
type TaskArtifactInternal = Infer<typeof TaskDocumentSchema.shapes.artifacts>;
type TaskDeliverableInternal = Infer<
	typeof TaskDocumentSchema.shapes.deliverables
>;
type TaskLinkedPRInternal = Infer<typeof TaskDocumentSchema.shapes.linkedPRs>;
type TaskInputRequestInternal = Infer<
	typeof TaskDocumentSchema.shapes.inputRequests
>;

// Event item type (element of events list)
export type TaskEventItem = Infer<typeof TaskEventShape>;
type ChangeSnapshotInternal = Infer<
	typeof TaskDocumentSchema.shapes.changeSnapshots
>;

// Export aliases for the internal types (consumers should be aware these may be `unknown`)
export type TaskComment = TaskCommentInternal;
export type TaskEvent = TaskEventInternal;
export type TaskArtifact = TaskArtifactInternal;
export type TaskDeliverable = TaskDeliverableInternal;
export type TaskLinkedPR = TaskLinkedPRInternal;
export type TaskInputRequest = TaskInputRequestInternal;
export type ChangeSnapshot = ChangeSnapshotInternal;

/**
 * Workaround for @loro-extended/change@5.3.0 bug
 *
 * The published npm version doesn't export BooleanValueShape, StringValueShape, etc.,
 * causing TS4023 errors when using Infer<typeof SyncedFileChangeShape> in exported types.
 *
 * The loro-extended source code already has the fix, but it hasn't been published yet.
 * Once a newer version is published with these exports, replace with:
 * export type SyncedFileChange = Infer<typeof SyncedFileChangeShape>;
 */
export type SyncedFileChange = {
	path: string;
	status: "added" | "modified" | "deleted" | "renamed";
	patch: string;
	staged: boolean;
};
export type RoomShape = typeof RoomSchema;
export type Room = Infer<typeof RoomSchema>;
export type MutableRoom = InferMutableType<typeof RoomSchema>;
export type TaskIndexEntry = Infer<typeof RoomSchema.shapes.taskIndex>;
