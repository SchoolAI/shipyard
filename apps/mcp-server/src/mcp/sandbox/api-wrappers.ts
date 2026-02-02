/**
 * Sandbox API wrappers for execute_code.
 *
 * These functions are exposed in the VM sandbox for user code to call.
 * They wrap MCP tool handlers and provide cleaner return types.
 * Ported from apps/server-legacy/src/tools/execute-code.ts.
 */

// TODO: Import from Loro doc helpers
// import { getOrCreateDoc } from '../../loro/index.js'

/**
 * Create a new task.
 */
export async function createTask(_opts: {
	title: string;
	content: string;
	repo?: string;
	prNumber?: number;
}): Promise<{
	taskId: string;
	sessionToken: string;
	url: string;
	deliverables: Array<{ id: string; text: string }>;
	monitoringScript: string;
}> {
	// TODO: Implement using Loro doc
	throw new Error("Not implemented");
}

/**
 * Read a task.
 */
export async function readTask(
	_taskId: string,
	_sessionToken: string,
	_opts?: { includeAnnotations?: boolean; includeLinkedPRs?: boolean },
): Promise<{
	content: string;
	status: string;
	title: string;
	repo?: string;
	pr?: number;
	deliverables: Array<{ id: string; text: string; completed: boolean }>;
	isError: boolean;
}> {
	// TODO: Implement using Loro doc
	throw new Error("Not implemented");
}

/**
 * Update task metadata.
 */
export async function updateTask(
	_taskId: string,
	_sessionToken: string,
	_updates: { title?: string; status?: string },
): Promise<{ success: boolean; monitoringScript: string }> {
	// TODO: Implement using Loro doc
	throw new Error("Not implemented");
}

/**
 * Add an artifact to a task.
 */
export async function addArtifact(_opts: {
	taskId: string;
	sessionToken: string;
	type: string;
	filename: string;
	source: "file" | "url" | "base64";
	filePath?: string;
	contentUrl?: string;
	content?: string;
	deliverableId?: string;
	description?: string;
}): Promise<{
	artifactId: string;
	url: string;
	allDeliverablesComplete: boolean;
	snapshotUrl?: string;
	isError: boolean;
}> {
	// TODO: Implement using Loro doc
	throw new Error("Not implemented");
}

/**
 * Complete a task.
 */
export async function completeTask(
	_taskId: string,
	_sessionToken: string,
	_summary?: string,
): Promise<{ snapshotUrl: string; status: string; isError: boolean }> {
	// TODO: Implement using Loro doc
	throw new Error("Not implemented");
}

/**
 * Update block content.
 */
export async function updateBlockContent(
	_taskId: string,
	_sessionToken: string,
	_operations: Array<{
		type: "update" | "insert" | "delete" | "replace_all";
		blockId?: string;
		afterBlockId?: string | null;
		content?: string;
	}>,
): Promise<void> {
	// TODO: Implement using Loro doc
	throw new Error("Not implemented");
}

/**
 * Link a PR to a task.
 */
export async function linkPR(_opts: {
	taskId: string;
	sessionToken: string;
	prNumber: number;
	branch?: string;
	repo?: string;
}): Promise<{
	prNumber: number;
	url: string;
	status: string;
	branch: string;
	title: string;
}> {
	// TODO: Implement using Loro doc
	throw new Error("Not implemented");
}

/**
 * Post an update to the task timeline.
 */
export async function postUpdate(_opts: {
	taskId: string;
	sessionToken: string;
	message: string;
}): Promise<{ success: boolean; isError: boolean; error?: string }> {
	// TODO: Implement using Loro doc
	throw new Error("Not implemented");
}

/**
 * Read diff comments.
 */
export async function readDiffComments(
	_taskId: string,
	_sessionToken: string,
	_opts?: {
		includeLocal?: boolean;
		includePR?: boolean;
		includeResolved?: boolean;
	},
): Promise<string> {
	// TODO: Implement using Loro doc
	throw new Error("Not implemented");
}

/**
 * Reply to a diff comment.
 */
export async function replyToDiffComment(_opts: {
	taskId: string;
	sessionToken: string;
	commentId: string;
	body: string;
}): Promise<string> {
	// TODO: Implement using Loro doc
	throw new Error("Not implemented");
}

/**
 * Reply to a thread comment.
 */
export async function replyToThreadComment(_opts: {
	taskId: string;
	sessionToken: string;
	threadId: string;
	body: string;
}): Promise<string> {
	// TODO: Implement using Loro doc
	throw new Error("Not implemented");
}

/**
 * Regenerate session token.
 */
export async function regenerateSessionToken(
	_taskId: string,
): Promise<{ sessionToken: string; taskId: string }> {
	// TODO: Implement using Loro doc
	throw new Error("Not implemented");
}
