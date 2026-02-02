/**
 * Room document schema and types.
 *
 * Defines the Loro shape for room documents (one per room).
 */

import {
	type Infer,
	type InferMutableType,
	Shape,
} from "@loro-extended/change";
import { TaskEventShape } from "../internal/event-shape.js";

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

export type RoomShape = typeof RoomSchema;
export type Room = Infer<typeof RoomSchema>;
export type MutableRoom = InferMutableType<typeof RoomSchema>;
export type TaskIndexEntry = Infer<typeof RoomSchema.shapes.taskIndex>;
