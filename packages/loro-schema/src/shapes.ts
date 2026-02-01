/**
 * Loro Shape definitions for Shipyard.
 *
 * Two document types:
 * 1. Task document (one per task)
 * 2. Global room document (one per room)
 */

import {
	type DocShape,
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
 * Base fields shared across all input request types.
 * Used by: text, multiline, choice, confirm, number, email, date, rating, multi
 */
const InputRequestBaseFields = {
	id: Shape.plain.string(),
	message: Shape.plain.string(),
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

// =============================================================================
// Input Request Variant-Specific Fields
// =============================================================================
// These field definitions are extracted so they can be reused in both:
// 1. Top-level inputRequests (discriminated union with full base fields)
// 2. Multi input's nested questions (union with simplified base fields)
// =============================================================================

/**
 * Variant-specific fields for text input requests.
 * Shared between top-level and multi-nested text inputs.
 */
const TextInputVariantFields = {
	defaultValue: Shape.plain.string().nullable(),
	placeholder: Shape.plain.string().nullable(),
} as const;

/**
 * Variant-specific fields for multiline input requests.
 * Shared between top-level and multi-nested multiline inputs.
 */
const MultilineInputVariantFields = {
	defaultValue: Shape.plain.string().nullable(),
	placeholder: Shape.plain.string().nullable(),
} as const;

/**
 * Choice option shape used in choice input requests.
 */
const ChoiceOptionShape = Shape.plain.struct({
	label: Shape.plain.string(),
	value: Shape.plain.string(),
	description: Shape.plain.string().nullable(),
});

/**
 * Variant-specific fields for choice input requests.
 * Shared between top-level and multi-nested choice inputs.
 */
const ChoiceInputVariantFields = {
	options: Shape.plain.array(ChoiceOptionShape),
	multiSelect: Shape.plain.boolean().nullable(),
	displayAs: Shape.plain.string("radio", "checkbox", "dropdown").nullable(),
	placeholder: Shape.plain.string().nullable(),
} as const;

/**
 * Variant-specific fields for number input requests.
 * Shared between top-level and multi-nested number inputs.
 */
const NumberInputVariantFields = {
	min: Shape.plain.number().nullable(),
	max: Shape.plain.number().nullable(),
	format: Shape.plain
		.string("integer", "decimal", "currency", "percentage")
		.nullable(),
	defaultValue: Shape.plain.number().nullable(),
} as const;

/**
 * Variant-specific fields for email input requests.
 * Shared between top-level and multi-nested email inputs.
 */
const EmailInputVariantFields = {
	domain: Shape.plain.string().nullable(),
	placeholder: Shape.plain.string().nullable(),
} as const;

/**
 * Variant-specific fields for date input requests.
 * Shared between top-level and multi-nested date inputs.
 */
const DateInputVariantFields = {
	/** Unix timestamp in milliseconds */
	min: Shape.plain.number().nullable(),
	/** Unix timestamp in milliseconds */
	max: Shape.plain.number().nullable(),
} as const;

/**
 * Rating labels shape used in rating input requests.
 */
const RatingLabelsShape = Shape.plain
	.struct({
		low: Shape.plain.string().nullable(),
		high: Shape.plain.string().nullable(),
	})
	.nullable();

/**
 * Variant-specific fields for rating input requests.
 * Shared between top-level and multi-nested rating inputs.
 */
const RatingInputVariantFields = {
	min: Shape.plain.number().nullable(),
	max: Shape.plain.number().nullable(),
	ratingStyle: Shape.plain.string("stars", "numbers", "emoji").nullable(),
	ratingLabels: RatingLabelsShape,
} as const;

// Confirm has no variant-specific fields (only type + base fields)

// =============================================================================
// Multi Input Nested Question Shapes
// =============================================================================
// These shapes are used for questions inside a multi input request.
// They have a simplified base (only message) plus the variant-specific fields.
// =============================================================================

/**
 * Nested text question shape for multi inputs.
 */
const MultiQuestionTextShape = Shape.plain.struct({
	type: Shape.plain.string("text"),
	message: Shape.plain.string(),
	...TextInputVariantFields,
});

/**
 * Nested multiline question shape for multi inputs.
 */
const MultiQuestionMultilineShape = Shape.plain.struct({
	type: Shape.plain.string("multiline"),
	message: Shape.plain.string(),
	...MultilineInputVariantFields,
});

/**
 * Nested choice question shape for multi inputs.
 */
const MultiQuestionChoiceShape = Shape.plain.struct({
	type: Shape.plain.string("choice"),
	message: Shape.plain.string(),
	...ChoiceInputVariantFields,
});

/**
 * Nested confirm question shape for multi inputs.
 */
const MultiQuestionConfirmShape = Shape.plain.struct({
	type: Shape.plain.string("confirm"),
	message: Shape.plain.string(),
});

/**
 * Nested number question shape for multi inputs.
 */
const MultiQuestionNumberShape = Shape.plain.struct({
	type: Shape.plain.string("number"),
	message: Shape.plain.string(),
	...NumberInputVariantFields,
});

/**
 * Nested email question shape for multi inputs.
 */
const MultiQuestionEmailShape = Shape.plain.struct({
	type: Shape.plain.string("email"),
	message: Shape.plain.string(),
	...EmailInputVariantFields,
});

/**
 * Nested date question shape for multi inputs.
 */
const MultiQuestionDateShape = Shape.plain.struct({
	type: Shape.plain.string("date"),
	message: Shape.plain.string(),
	...DateInputVariantFields,
});

/**
 * Nested rating question shape for multi inputs.
 */
const MultiQuestionRatingShape = Shape.plain.struct({
	type: Shape.plain.string("rating"),
	message: Shape.plain.string(),
	...RatingInputVariantFields,
});

/**
 * Union of all nested question shapes for multi inputs.
 * Supports all 8 input types: text, multiline, choice, confirm, number, email, date, rating.
 */
const MultiQuestionUnionShape = Shape.plain.union([
	MultiQuestionTextShape,
	MultiQuestionMultilineShape,
	MultiQuestionChoiceShape,
	MultiQuestionConfirmShape,
	MultiQuestionNumberShape,
	MultiQuestionEmailShape,
	MultiQuestionDateShape,
	MultiQuestionRatingShape,
]);


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
 * Individual task document schema.
 * One doc per task, contains all task-specific state.
 */
export const TaskDocumentSchema: DocShape = Shape.doc({
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
		epoch: Shape.plain.number(),
		// ASK: what is this?
		origin: Shape.plain.string().nullable(),
		repo: Shape.plain.string().nullable(),

		tags: Shape.list(Shape.plain.string()),
		// ASK: what is this for?
		viewedBy: Shape.record(Shape.plain.number()),

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

	events: Shape.list(
		Shape.plain.discriminatedUnion("type", {
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
		}),
	),

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
				type: Shape.plain.string("text"),
				...InputRequestBaseFields,
				...TextInputVariantFields,
			}),
			multiline: Shape.plain.struct({
				type: Shape.plain.string("multiline"),
				...InputRequestBaseFields,
				...MultilineInputVariantFields,
			}),
			choice: Shape.plain.struct({
				type: Shape.plain.string("choice"),
				...InputRequestBaseFields,
				...ChoiceInputVariantFields,
			}),
			confirm: Shape.plain.struct({
				type: Shape.plain.string("confirm"),
				...InputRequestBaseFields,
			}),
			number: Shape.plain.struct({
				type: Shape.plain.string("number"),
				...InputRequestBaseFields,
				...NumberInputVariantFields,
			}),
			email: Shape.plain.struct({
				type: Shape.plain.string("email"),
				...InputRequestBaseFields,
				...EmailInputVariantFields,
			}),
			date: Shape.plain.struct({
				type: Shape.plain.string("date"),
				...InputRequestBaseFields,
				...DateInputVariantFields,
			}),
			rating: Shape.plain.struct({
				type: Shape.plain.string("rating"),
				...InputRequestBaseFields,
				...RatingInputVariantFields,
			}),
			multi: Shape.plain.struct({
				type: Shape.plain.string("multi"),
				...InputRequestBaseFields,
				/**
				 * Nested questions supporting all 8 input types.
				 * Each question has a simplified base (message only) plus variant-specific fields.
				 */
				questions: Shape.plain.array(MultiQuestionUnionShape),
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
}) satisfies DocShape;

/**
 * Room document schema.
 * One doc per room (Personal or Collab), contains task index for dashboard.
 *
 * Input requests live in TaskDocumentSchema, not here.
 * This schema is intentionally minimal - just enough for dashboard/discovery.
 */
export const RoomSchema: DocShape = Shape.doc({
	/**
	 * Denormalized task metadata for dashboard display.
	 * Updated by TaskDocument operations when task state changes.
	 *
	 * Using Record keyed by taskId for O(1) lookups instead of O(n) list scans.
	 */
	taskIndex: Shape.record(
		Shape.plain.struct({
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
		}),
	),
});

export type TaskDocumentShape = typeof TaskDocumentSchema;
export type TaskDocument = Infer<typeof TaskDocumentSchema>;
export type MutableTaskDocument = InferMutableType<typeof TaskDocumentSchema>;
export type TaskMeta = Infer<typeof TaskDocumentSchema.shapes.meta>;
export type TaskComment = Infer<typeof TaskDocumentSchema.shapes.comments>;
export type TaskEvent = Infer<typeof TaskDocumentSchema.shapes.events>;
export type TaskArtifact = Infer<typeof TaskDocumentSchema.shapes.artifacts>;
export type TaskDeliverable = Infer<
	typeof TaskDocumentSchema.shapes.deliverables
>;
export type TaskLinkedPR = Infer<typeof TaskDocumentSchema.shapes.linkedPRs>;
export type TaskInputRequest = Infer<
	typeof TaskDocumentSchema.shapes.inputRequests
>;
export type ChangeSnapshot = Infer<
	typeof TaskDocumentSchema.shapes.changeSnapshots
>;

/**
 * TODO (2026-02-01): Workaround for @loro-extended/change@5.3.0 bug
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
