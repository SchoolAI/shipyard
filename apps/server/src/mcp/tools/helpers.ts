/**
 * Shared helper functions for MCP tools.
 * Ported from apps/server-legacy/src/tools/*.ts
 */

import { timingSafeEqual } from "node:crypto";
import {
	RoomSchema,
	TaskDocument,
	TaskDocumentSchema,
	type TaskId,
	type TaskMeta,
} from "@shipyard/loro-schema";
import { getRepo } from "../../loro/repo.js";
import { logger } from "../../utils/logger.js";
import { hashSessionToken } from "./session-token.js";

/** Well-known room document ID */
const ROOM_DOC_ID = "room";

/** --- Response Helpers --- */

export type ToolResponse = {
	content: Array<{ type: string; text: string }>;
	isError?: boolean;
};

export function errorResponse(message: string): ToolResponse {
	return { content: [{ type: "text", text: message }], isError: true };
}

export function successResponse(message: string): ToolResponse {
	return { content: [{ type: "text", text: message }] };
}

/** --- Task Document Access --- */

export type TaskDocumentResult =
	| { success: true; doc: TaskDocument; meta: TaskMeta }
	| { success: false; error: string };

/**
 * Get a task document from the Loro repo.
 * Returns the TaskDocument wrapper and metadata.
 */
export async function getTaskDocument(
	taskId: string,
): Promise<TaskDocumentResult> {
	try {
		const repo = getRepo();

		const taskHandle = repo.get(taskId, TaskDocumentSchema);

		if (!repo.has(taskId)) {
			return {
				success: false,
				error: `Task "${taskId}" not found. Check the task ID and try again.`,
			};
		}

		const roomHandle = repo.get(ROOM_DOC_ID, RoomSchema);

		const doc = new TaskDocument(
			taskHandle.doc,
			roomHandle.doc,
			taskId as TaskId,
		);

		const metaContainer = taskHandle.doc.meta;
		const meta: TaskMeta = {
			id: metaContainer.id ?? taskId,
			title: metaContainer.title ?? "",
			status: metaContainer.status ?? "draft",
			createdAt: metaContainer.createdAt ?? Date.now(),
			updatedAt: metaContainer.updatedAt ?? Date.now(),
			completedAt: metaContainer.completedAt ?? null,
			completedBy: metaContainer.completedBy ?? null,
			ownerId: metaContainer.ownerId ?? null,
			sessionTokenHash: metaContainer.sessionTokenHash ?? "",
			epoch: metaContainer.epoch ?? 1,
			repo: metaContainer.repo ?? null,
			tags: metaContainer.tags?.toJSON?.() ?? [],
			archivedAt: metaContainer.archivedAt ?? null,
			archivedBy: metaContainer.archivedBy ?? null,
		};

		logger.debug({ taskId }, "Task document loaded");

		return { success: true, doc, meta };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		logger.error({ taskId, error: message }, "Failed to get task document");
		return {
			success: false,
			error: `Failed to load task "${taskId}": ${message}`,
		};
	}
}

/**
 * Get or create a task document (for creating new tasks).
 * The Loro repo's get() method creates the doc if it doesn't exist.
 */
export async function getOrCreateTaskDocument(
	taskId: string,
): Promise<TaskDocumentResult> {
	try {
		const repo = getRepo();

		const taskHandle = repo.get(taskId, TaskDocumentSchema);

		const roomHandle = repo.get(ROOM_DOC_ID, RoomSchema);

		const doc = new TaskDocument(
			taskHandle.doc,
			roomHandle.doc,
			taskId as TaskId,
		);

		const metaContainer = taskHandle.doc.meta;
		const meta: TaskMeta = {
			id: metaContainer.id ?? taskId,
			title: metaContainer.title ?? "",
			status: metaContainer.status ?? "draft",
			createdAt: metaContainer.createdAt ?? Date.now(),
			updatedAt: metaContainer.updatedAt ?? Date.now(),
			completedAt: metaContainer.completedAt ?? null,
			completedBy: metaContainer.completedBy ?? null,
			ownerId: metaContainer.ownerId ?? null,
			sessionTokenHash: metaContainer.sessionTokenHash ?? "",
			epoch: metaContainer.epoch ?? 1,
			repo: metaContainer.repo ?? null,
			tags: metaContainer.tags?.toJSON?.() ?? [],
			archivedAt: metaContainer.archivedAt ?? null,
			archivedBy: metaContainer.archivedBy ?? null,
		};

		logger.debug({ taskId }, "Task document opened/created");

		return { success: true, doc, meta };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		logger.error(
			{ taskId, error: message },
			"Failed to get/create task document",
		);
		return {
			success: false,
			error: `Failed to create task "${taskId}": ${message}`,
		};
	}
}

/** --- Session Token Verification --- */

/**
 * Verify a session token against a stored hash.
 * Uses constant-time comparison to prevent timing attacks.
 * Returns error message if invalid, null if valid.
 */
export function verifySessionToken(
	sessionToken: string,
	storedHash: string | null | undefined,
	taskId: string,
): string | null {
	if (
		!sessionToken ||
		sessionToken === "undefined" ||
		sessionToken === "null"
	) {
		return (
			`sessionToken is required for task "${taskId}". ` +
			"Use the sessionToken returned from createTask(). " +
			"If you lost your token, use regenerateSessionToken(taskId)."
		);
	}

	if (!storedHash) {
		return (
			`Invalid session token for task "${taskId}". ` +
			"The sessionToken must be the one returned from createTask(). " +
			"If you lost your token, use regenerateSessionToken(taskId) to get a new one."
		);
	}

	const tokenHash = hashSessionToken(sessionToken);

	try {
		const tokenHashBuffer = Buffer.from(tokenHash, "hex");
		const storedHashBuffer = Buffer.from(storedHash, "hex");

		if (tokenHashBuffer.length !== storedHashBuffer.length) {
			return (
				`Invalid session token for task "${taskId}". ` +
				"The sessionToken must be the one returned from createTask(). " +
				"If you lost your token, use regenerateSessionToken(taskId) to get a new one."
			);
		}

		if (!timingSafeEqual(tokenHashBuffer, storedHashBuffer)) {
			return (
				`Invalid session token for task "${taskId}". ` +
				"The sessionToken must be the one returned from createTask(). " +
				"If you lost your token, use regenerateSessionToken(taskId) to get a new one."
			);
		}

		return null;
	} catch {
		return (
			`Invalid session token for task "${taskId}". ` +
			"The sessionToken must be the one returned from createTask(). " +
			"If you lost your token, use regenerateSessionToken(taskId) to get a new one."
		);
	}
}

/** --- Plan Header Formatting --- */

/**
 * Formats the metadata header section for task output.
 * Accepts TaskMeta type from getTaskDocument result.
 */
export function formatTaskHeader(meta: TaskMeta): string {
	let output = `# ${meta.title}\n\n`;
	output += `**Status:** ${meta.status.replace("_", " ")}\n`;

	if (meta.repo) {
		output += `**Repo:** ${meta.repo}\n`;
	}

	output += `**Created:** ${new Date(meta.createdAt).toISOString()}\n`;
	output += `**Updated:** ${new Date(meta.updatedAt).toISOString()}\n`;

	output += "\n---\n\n";
	return output;
}
