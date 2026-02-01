/**
 * Zod schemas for boundary validation.
 * These schemas validate data at system boundaries (API, URL encoding, etc.).
 */

import { z } from "zod";
import {
	ArtifactStorageValues,
	ArtifactTypeValues,
	ChoiceDisplayValues,
	CommentKindValues,
	EventTypeValues,
	FileChangeStatusValues,
	InputRequestStatusValues,
	InputRequestTypeValues,
	NumberFormatValues,
	PRStatusValues,
	RatingStyleValues,
	TaskStatusValues,
} from "./types.js";

/** Basic field validators */
export const IdSchema = z.string().min(1);
export const TimestampSchema = z.number().int().nonnegative();
export const OptionalTimestampSchema = TimestampSchema.nullable();

/** Task status enum validation */
export const TaskStatusSchema = z.enum(TaskStatusValues);

/** PR status enum validation */
export const PRStatusSchema = z.enum(PRStatusValues);

/** Input request status enum validation */
export const InputRequestStatusSchema = z.enum(InputRequestStatusValues);

/** Comment kind enum validation */
export const CommentKindSchema = z.enum(CommentKindValues);

/** Input request type enum validation */
export const InputRequestTypeSchema = z.enum(InputRequestTypeValues);

/** Artifact storage enum validation */
export const ArtifactStorageSchema = z.enum(ArtifactStorageValues);

/** Artifact type enum validation */
export const ArtifactTypeSchema = z.enum(ArtifactTypeValues);

/** Event type enum validation */
export const EventTypeSchema = z.enum(EventTypeValues);

/** File change status enum validation */
export const FileChangeStatusSchema = z.enum(FileChangeStatusValues);

/** Number format enum validation */
export const NumberFormatSchema = z.enum(NumberFormatValues);

/** Choice display enum validation */
export const ChoiceDisplaySchema = z.enum(ChoiceDisplayValues);

/** Rating style enum validation */
export const RatingStyleSchema = z.enum(RatingStyleValues);

/** Base comment fields schema */
const CommentBaseSchema = z.object({
	id: IdSchema,
	threadId: IdSchema,
	body: z.string(),
	author: z.string(),
	createdAt: TimestampSchema,
	resolved: z.boolean(),
	inReplyTo: z.string().nullable(),
});

/** Inline comment schema */
export const InlineCommentSchema = CommentBaseSchema.extend({
	kind: z.literal("inline"),
	blockId: z.string(),
	selectedText: z.string().nullable(),
});

/** PR comment schema */
export const PRCommentSchema = CommentBaseSchema.extend({
	kind: z.literal("pr"),
	prNumber: z.number().int().positive(),
	path: z.string(),
	line: z.number().int().nonnegative(),
});

/** Local comment schema */
export const LocalCommentSchema = CommentBaseSchema.extend({
	kind: z.literal("local"),
	path: z.string(),
	line: z.number().int().nonnegative(),
	baseRef: z.string(),
	lineContentHash: z.string(),
	machineId: z.string().nullable(),
});

/** Overall comment schema */
export const OverallCommentSchema = CommentBaseSchema.extend({
	kind: z.literal("overall"),
});

/** Task comment discriminated union */
export const TaskCommentSchema = z.discriminatedUnion("kind", [
	InlineCommentSchema,
	PRCommentSchema,
	LocalCommentSchema,
	OverallCommentSchema,
]);

/** Base artifact fields schema */
const ArtifactBaseSchema = z.object({
	id: IdSchema,
	type: ArtifactTypeSchema,
	filename: z.string(),
	description: z.string().nullable(),
	uploadedAt: OptionalTimestampSchema,
});

/** GitHub artifact schema */
export const GitHubArtifactSchema = ArtifactBaseSchema.extend({
	storage: z.literal("github"),
	url: z.string().url(),
});

/** Local artifact schema */
export const LocalArtifactSchema = ArtifactBaseSchema.extend({
	storage: z.literal("local"),
	localArtifactId: z.string(),
});

/** Task artifact discriminated union */
export const TaskArtifactSchema = z.discriminatedUnion("storage", [
	GitHubArtifactSchema,
	LocalArtifactSchema,
]);

/** Deliverable schema */
export const TaskDeliverableSchema = z.object({
	id: IdSchema,
	text: z.string(),
	linkedArtifactId: z.string().nullable(),
	linkedAt: OptionalTimestampSchema,
});

/** Linked PR schema */
export const TaskLinkedPRSchema = z.object({
	prNumber: z.number().int().positive(),
	status: PRStatusSchema,
	branch: z.string().nullable(),
	title: z.string().nullable(),
});

/** Base event fields schema */
const EventBaseSchema = z.object({
	id: IdSchema,
	actor: z.string(),
	timestamp: TimestampSchema,
	inboxWorthy: z.boolean().nullable(),
	inboxFor: z.union([z.string(), z.array(z.string()), z.null()]),
});

/** Event schemas for each type */
export const TaskCreatedEventSchema = EventBaseSchema.extend({
	type: z.literal("task_created"),
});

export const StatusChangedEventSchema = EventBaseSchema.extend({
	type: z.literal("status_changed"),
	fromStatus: z.string(),
	toStatus: z.string(),
});

export const CompletedEventSchema = EventBaseSchema.extend({
	type: z.literal("completed"),
});

export const TaskArchivedEventSchema = EventBaseSchema.extend({
	type: z.literal("task_archived"),
});

export const TaskUnarchivedEventSchema = EventBaseSchema.extend({
	type: z.literal("task_unarchived"),
});

export const ApprovedEventSchema = EventBaseSchema.extend({
	type: z.literal("approved"),
	message: z.string().nullable(),
});

export const ChangesRequestedEventSchema = EventBaseSchema.extend({
	type: z.literal("changes_requested"),
	message: z.string().nullable(),
});

export const CommentAddedEventSchema = EventBaseSchema.extend({
	type: z.literal("comment_added"),
	commentId: IdSchema,
	threadId: z.string().nullable(),
	preview: z.string().nullable(),
});

export const CommentResolvedEventSchema = EventBaseSchema.extend({
	type: z.literal("comment_resolved"),
	commentId: IdSchema,
	threadId: z.string().nullable(),
});

export const ArtifactUploadedEventSchema = EventBaseSchema.extend({
	type: z.literal("artifact_uploaded"),
	artifactId: IdSchema,
	filename: z.string(),
	artifactType: z.string().nullable(),
});

export const DeliverableLinkedEventSchema = EventBaseSchema.extend({
	type: z.literal("deliverable_linked"),
	deliverableId: IdSchema,
	artifactId: IdSchema,
	deliverableText: z.string().nullable(),
});

export const PRLinkedEventSchema = EventBaseSchema.extend({
	type: z.literal("pr_linked"),
	prNumber: z.number().int().positive(),
	title: z.string().nullable(),
});

export const PRUnlinkedEventSchema = EventBaseSchema.extend({
	type: z.literal("pr_unlinked"),
	prNumber: z.number().int().positive(),
});

export const ContentEditedEventSchema = EventBaseSchema.extend({
	type: z.literal("content_edited"),
	summary: z.string().nullable(),
});

export const InputRequestCreatedEventSchema = EventBaseSchema.extend({
	type: z.literal("input_request_created"),
	requestId: IdSchema,
	message: z.string(),
	isBlocker: z.boolean().nullable(),
});

export const InputRequestAnsweredEventSchema = EventBaseSchema.extend({
	type: z.literal("input_request_answered"),
	requestId: IdSchema,
});

export const InputRequestDeclinedEventSchema = EventBaseSchema.extend({
	type: z.literal("input_request_declined"),
	requestId: IdSchema,
});

export const InputRequestCancelledEventSchema = EventBaseSchema.extend({
	type: z.literal("input_request_cancelled"),
	requestId: IdSchema,
});

export const AgentActivityEventSchema = EventBaseSchema.extend({
	type: z.literal("agent_activity"),
	message: z.string(),
	isBlocker: z.boolean().nullable(),
});

export const TagAddedEventSchema = EventBaseSchema.extend({
	type: z.literal("tag_added"),
	tag: z.string(),
});

export const TagRemovedEventSchema = EventBaseSchema.extend({
	type: z.literal("tag_removed"),
	tag: z.string(),
});

export const OwnerChangedEventSchema = EventBaseSchema.extend({
	type: z.literal("owner_changed"),
	fromOwner: z.string().nullable(),
	toOwner: z.string(),
});

export const RepoChangedEventSchema = EventBaseSchema.extend({
	type: z.literal("repo_changed"),
	fromRepo: z.string().nullable(),
	toRepo: z.string(),
});

export const TitleChangedEventSchema = EventBaseSchema.extend({
	type: z.literal("title_changed"),
	fromTitle: z.string(),
	toTitle: z.string(),
});

/** Task event discriminated union */
export const TaskEventSchema = z.discriminatedUnion("type", [
	TaskCreatedEventSchema,
	StatusChangedEventSchema,
	CompletedEventSchema,
	TaskArchivedEventSchema,
	TaskUnarchivedEventSchema,
	ApprovedEventSchema,
	ChangesRequestedEventSchema,
	CommentAddedEventSchema,
	CommentResolvedEventSchema,
	ArtifactUploadedEventSchema,
	DeliverableLinkedEventSchema,
	PRLinkedEventSchema,
	PRUnlinkedEventSchema,
	ContentEditedEventSchema,
	InputRequestCreatedEventSchema,
	InputRequestAnsweredEventSchema,
	InputRequestDeclinedEventSchema,
	InputRequestCancelledEventSchema,
	AgentActivityEventSchema,
	TagAddedEventSchema,
	TagRemovedEventSchema,
	OwnerChangedEventSchema,
	RepoChangedEventSchema,
	TitleChangedEventSchema,
]);

/** Base input request fields schema */
const InputRequestBaseSchema = z.object({
	id: IdSchema,
	message: z.string(),
	status: InputRequestStatusSchema,
	createdAt: TimestampSchema,
	expiresAt: TimestampSchema,
	response: z.unknown(),
	answeredAt: OptionalTimestampSchema,
	answeredBy: z.string().nullable(),
	isBlocker: z.boolean().nullable(),
});

/** Text input request schema */
export const TextInputRequestSchema = InputRequestBaseSchema.extend({
	type: z.literal("text"),
	defaultValue: z.string().nullable(),
	placeholder: z.string().nullable(),
});

/** Multiline input request schema */
export const MultilineInputRequestSchema = InputRequestBaseSchema.extend({
	type: z.literal("multiline"),
	defaultValue: z.string().nullable(),
	placeholder: z.string().nullable(),
});

/** Choice option schema */
export const ChoiceOptionSchema = z.object({
	label: z.string(),
	value: z.string(),
	description: z.string().optional(),
});

/** Choice input request schema */
export const ChoiceInputRequestSchema = InputRequestBaseSchema.extend({
	type: z.literal("choice"),
	options: z.array(ChoiceOptionSchema),
	multiSelect: z.boolean().nullable(),
	displayAs: ChoiceDisplaySchema.nullable(),
	placeholder: z.string().nullable(),
});

/** Confirm input request schema */
export const ConfirmInputRequestSchema = InputRequestBaseSchema.extend({
	type: z.literal("confirm"),
});

/** Number input request schema */
export const NumberInputRequestSchema = InputRequestBaseSchema.extend({
	type: z.literal("number"),
	min: z.number().nullable(),
	max: z.number().nullable(),
	format: NumberFormatSchema.nullable(),
	defaultValue: z.number().nullable(),
});

/** Email input request schema */
export const EmailInputRequestSchema = InputRequestBaseSchema.extend({
	type: z.literal("email"),
	domain: z.string().nullable(),
	placeholder: z.string().nullable(),
});

/** Date input request schema */
export const DateInputRequestSchema = InputRequestBaseSchema.extend({
	type: z.literal("date"),
	min: OptionalTimestampSchema,
	max: OptionalTimestampSchema,
});

/** Rating labels schema */
export const RatingLabelsSchema = z.object({
	low: z.string().optional(),
	high: z.string().optional(),
});

/** Rating input request schema */
export const RatingInputRequestSchema = InputRequestBaseSchema.extend({
	type: z.literal("rating"),
	min: z.number().nullable(),
	max: z.number().nullable(),
	ratingStyle: RatingStyleSchema.nullable(),
	ratingLabels: RatingLabelsSchema.nullable(),
});

/** Multi input request schema */
export const MultiInputRequestSchema = InputRequestBaseSchema.extend({
	type: z.literal("multi"),
	questions: z.array(z.unknown()),
	responses: z.record(z.string(), z.unknown()),
});

/** Task input request discriminated union */
export const TaskInputRequestSchema = z.discriminatedUnion("type", [
	TextInputRequestSchema,
	MultilineInputRequestSchema,
	ChoiceInputRequestSchema,
	ConfirmInputRequestSchema,
	NumberInputRequestSchema,
	EmailInputRequestSchema,
	DateInputRequestSchema,
	RatingInputRequestSchema,
	MultiInputRequestSchema,
]);

/** Global input request schemas (with taskId) */
export const GlobalTextInputRequestSchema = TextInputRequestSchema.extend({
	taskId: z.string().nullable(),
});

export const GlobalMultilineInputRequestSchema =
	MultilineInputRequestSchema.extend({
		taskId: z.string().nullable(),
	});

export const GlobalChoiceInputRequestSchema = ChoiceInputRequestSchema.extend({
	taskId: z.string().nullable(),
});

export const GlobalConfirmInputRequestSchema = ConfirmInputRequestSchema.extend(
	{
		taskId: z.string().nullable(),
	},
);

export const GlobalNumberInputRequestSchema = NumberInputRequestSchema.extend({
	taskId: z.string().nullable(),
});

export const GlobalEmailInputRequestSchema = EmailInputRequestSchema.extend({
	taskId: z.string().nullable(),
});

export const GlobalDateInputRequestSchema = DateInputRequestSchema.extend({
	taskId: z.string().nullable(),
});

export const GlobalRatingInputRequestSchema = RatingInputRequestSchema.extend({
	taskId: z.string().nullable(),
});

export const GlobalMultiInputRequestSchema = MultiInputRequestSchema.extend({
	taskId: z.string().nullable(),
});

/** Global input request discriminated union */
export const GlobalInputRequestSchema = z.discriminatedUnion("type", [
	GlobalTextInputRequestSchema,
	GlobalMultilineInputRequestSchema,
	GlobalChoiceInputRequestSchema,
	GlobalConfirmInputRequestSchema,
	GlobalNumberInputRequestSchema,
	GlobalEmailInputRequestSchema,
	GlobalDateInputRequestSchema,
	GlobalRatingInputRequestSchema,
	GlobalMultiInputRequestSchema,
]);

/** Synced file change schema */
export const SyncedFileChangeSchema = z.object({
	path: z.string(),
	status: FileChangeStatusSchema,
	patch: z.string(),
	staged: z.boolean(),
});

/** Change snapshot schema */
export const ChangeSnapshotSchema = z.object({
	machineId: z.string(),
	machineName: z.string(),
	ownerId: z.string(),
	headSha: z.string(),
	branch: z.string(),
	cwd: z.string(),
	isLive: z.boolean(),
	updatedAt: TimestampSchema,
	files: z.array(SyncedFileChangeSchema),
	totalAdditions: z.number().int().nonnegative(),
	totalDeletions: z.number().int().nonnegative(),
});

/** Task metadata schema */
export const TaskMetaSchema = z.object({
	id: IdSchema,
	title: z.string(),
	status: TaskStatusSchema,
	createdAt: TimestampSchema,
	updatedAt: TimestampSchema,
	completedAt: OptionalTimestampSchema,
	completedBy: z.string().nullable(),
	ownerId: z.string().nullable(),
	epoch: z.number().nullable(),
	origin: z.string().nullable(),
	repo: z.string().nullable(),
	tags: z.array(z.string()),
	viewedBy: z.record(z.string(), TimestampSchema),
	archivedAt: OptionalTimestampSchema,
	archivedBy: z.string().nullable(),
});

/** Inferred types from schemas */
export type ValidatedTaskMeta = z.infer<typeof TaskMetaSchema>;
export type ValidatedTaskComment = z.infer<typeof TaskCommentSchema>;
export type ValidatedTaskEvent = z.infer<typeof TaskEventSchema>;
export type ValidatedTaskArtifact = z.infer<typeof TaskArtifactSchema>;
export type ValidatedTaskDeliverable = z.infer<typeof TaskDeliverableSchema>;
export type ValidatedTaskLinkedPR = z.infer<typeof TaskLinkedPRSchema>;
export type ValidatedTaskInputRequest = z.infer<typeof TaskInputRequestSchema>;
export type ValidatedChangeSnapshot = z.infer<typeof ChangeSnapshotSchema>;
export type ValidatedSyncedFileChange = z.infer<typeof SyncedFileChangeSchema>;
export type ValidatedGlobalInputRequest = z.infer<
	typeof GlobalInputRequestSchema
>;
