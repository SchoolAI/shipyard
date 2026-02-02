/**
 * Task document schema and types.
 *
 * Defines the Loro shape for individual task documents.
 */

import {
	type DocShape,
	type Infer,
	type InferMutableType,
	Shape,
} from "@loro-extended/change";
import { TaskEventShape } from "../internal/event-shape.js";

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
}) satisfies DocShape;

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
