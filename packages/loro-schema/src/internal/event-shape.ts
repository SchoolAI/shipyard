/**
 * Internal module: Task event shape shared between task and room schemas.
 * NOT exported from the package (avoids TS4023 errors with @loro-extended/change).
 */

import { Shape } from "@loro-extended/change";

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
 * Task event discriminated union shape.
 * Shared between TaskDocumentSchema.events and RoomSchema.taskIndex.inboxEvents.
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
