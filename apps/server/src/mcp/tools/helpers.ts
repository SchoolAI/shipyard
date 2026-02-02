/**
 * Shared helper functions for MCP tools.
 * Ported from apps/server-legacy/src/tools/*.ts
 */

import { timingSafeEqual } from "node:crypto";
import type { TaskDocument, TaskMeta } from "@shipyard/loro-schema";
import { hashSessionToken } from "./session-token.js";

// TODO: Import from Loro repo when available
// import { getRepo } from '../../loro/repo.js'

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
	_taskId: string,
): Promise<TaskDocumentResult> {
	// TODO: Implement using Loro repo
	// const repo = getRepo()
	// const taskDoc = await repo.open(taskId, TaskDocumentSchema)
	// const roomDoc = await repo.open(ROOM_DOC_ID, RoomSchema)
	// const doc = new TaskDocument(taskDoc, roomDoc, taskId as TaskId)
	// const meta = doc.meta.toJSON()
	// return { success: true, doc, meta }
	throw new Error("Not implemented - Loro repo integration pending");
}

/**
 * Get or create a task document (for creating new tasks).
 */
export async function getOrCreateTaskDocument(
	_taskId: string,
): Promise<TaskDocumentResult> {
	// TODO: Implement using Loro repo with create option
	throw new Error("Not implemented - Loro repo integration pending");
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
	/** Check for missing/invalid token */
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

	/** Check for missing hash (task has no token set) */
	if (!storedHash) {
		return (
			`Invalid session token for task "${taskId}". ` +
			"The sessionToken must be the one returned from createTask(). " +
			"If you lost your token, use regenerateSessionToken(taskId) to get a new one."
		);
	}

	/** Verify token using constant-time comparison */
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

		return null; // Valid token
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
