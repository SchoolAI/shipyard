/**
 * Sandbox API wrappers for execute_code.
 *
 * These functions are exposed in the VM sandbox for user code to call.
 * They wrap the tool handlers and provide cleaner return types.
 * Ported from apps/server-legacy/src/tools/execute-code.ts.
 */

import { generateTaskId } from "@shipyard/loro-schema";
import { parseEnv } from "../../env.js";
import {
	getGitHubUsername,
	getRepositoryFullName,
} from "../../utils/identity.js";
import { logger } from "../../utils/logger.js";
import {
	getOrCreateTaskDocument,
	getTaskDocument,
	verifySessionToken,
} from "../tools/helpers.js";
import {
	generateSessionToken,
	hashSessionToken,
} from "../tools/session-token.js";

/**
 * Create a new task.
 */
export async function createTask(opts: {
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
	const taskId = generateTaskId();
	const sessionToken = generateSessionToken();
	const sessionTokenHash = hashSessionToken(sessionToken);
	const now = Date.now();

	const repo = opts.repo || getRepositoryFullName() || undefined;
	if (repo && !opts.repo) {
		logger.info({ repo }, "Auto-detected repository from current directory");
	}

	logger.info({ taskId, title: opts.title, repo }, "Creating task via sandbox");

	/** Get owner identity */
	const ownerId = await getGitHubUsername();

	/** Create task document */
	const taskResult = await getOrCreateTaskDocument(taskId);
	if (!taskResult.success) {
		throw new Error(taskResult.error);
	}
	const { doc } = taskResult;

	/** Initialize metadata */
	const meta = doc.meta;
	meta.id = taskId;
	meta.title = opts.title;
	meta.status = "pending_review";
	meta.createdAt = now;
	meta.updatedAt = now;
	meta.ownerId = ownerId;
	meta.sessionTokenHash = sessionTokenHash;
	meta.epoch = 1;
	meta.repo = repo ?? null;

	/** Log task created event */
	doc.logEvent("task_created", ownerId);

	/** Build task URL */
	const env = parseEnv();
	const url = `${env.WEB_URL}/tasks/${taskId}`;

	/** Get deliverables from the document */
	const deliverables: Array<{ id: string; text: string }> = [];
	const deliverablesData = doc.deliverables.toJSON();
	if (Array.isArray(deliverablesData)) {
		for (const d of deliverablesData) {
			if (d && typeof d === "object" && "id" in d && "text" in d) {
				deliverables.push({ id: String(d.id), text: String(d.text) });
			}
		}
	}

	/** Create monitoring script for non-hook agents */
	const monitoringScript = `#!/bin/bash
# Poll for task approval/rejection
while true; do
  sleep 30
  # TODO: Implement status check endpoint
  echo "Checking task status for ${taskId}..."
done`;

	return {
		taskId,
		sessionToken,
		url,
		deliverables,
		monitoringScript,
	};
}

/**
 * Read a task.
 */
export async function readTask(
	taskId: string,
	sessionToken: string,
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
	/** Get task document */
	const taskResult = await getTaskDocument(taskId);
	if (!taskResult.success) {
		return {
			content: taskResult.error,
			status: "error",
			title: "",
			deliverables: [],
			isError: true,
		};
	}
	const { doc, meta } = taskResult;

	/** Verify session token */
	const tokenError = verifySessionToken(
		sessionToken,
		meta.sessionTokenHash,
		taskId,
	);
	if (tokenError) {
		return {
			content: tokenError,
			status: "error",
			title: "",
			deliverables: [],
			isError: true,
		};
	}

	/** Get deliverables */
	const deliverables: Array<{ id: string; text: string; completed: boolean }> =
		[];
	const deliverablesData = doc.deliverables.toJSON();
	if (Array.isArray(deliverablesData)) {
		for (const d of deliverablesData) {
			if (d && typeof d === "object" && "id" in d && "text" in d) {
				deliverables.push({
					id: String(d.id),
					text: String(d.text),
					completed: !!("linkedArtifactId" in d && d.linkedArtifactId),
				});
			}
		}
	}

	/** Build content string */
	let content = `# ${meta.title}\n\n`;
	content += `**Status:** ${meta.status}\n`;
	content += `**Created:** ${new Date(meta.createdAt).toISOString()}\n`;
	if (meta.repo) {
		content += `**Repo:** ${meta.repo}\n`;
	}
	content += "\n---\n\n";

	return {
		content,
		status: meta.status,
		title: meta.title,
		repo: meta.repo ?? undefined,
		deliverables,
		isError: false,
	};
}

/**
 * Update task metadata.
 */
export async function updateTask(
	taskId: string,
	sessionToken: string,
	updates: { title?: string; status?: string },
): Promise<{ success: boolean; monitoringScript: string }> {
	/** Get task document */
	const taskResult = await getTaskDocument(taskId);
	if (!taskResult.success) {
		throw new Error(taskResult.error);
	}
	const { doc, meta } = taskResult;

	/** Verify session token */
	const tokenError = verifySessionToken(
		sessionToken,
		meta.sessionTokenHash,
		taskId,
	);
	if (tokenError) {
		throw new Error(tokenError);
	}

	const actor = await getGitHubUsername();

	/** Update title if provided */
	if (updates.title) {
		doc.meta.title = updates.title;
		doc.syncTitleToRoom();
	}

	/** Update status if provided */
	if (updates.status) {
		doc.updateStatus(
			updates.status as
				| "draft"
				| "pending_review"
				| "changes_requested"
				| "in_progress"
				| "completed",
			actor,
		);
	}

	const monitoringScript = `#!/bin/bash
# Poll for task approval/rejection
while true; do
  sleep 30
  echo "Checking task status for ${taskId}..."
done`;

	return { success: true, monitoringScript };
}

/**
 * Add an artifact to a task.
 */
export async function addArtifact(opts: {
	taskId: string;
	sessionToken: string;
	type: "html" | "image" | "video";
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
	const { taskId, sessionToken, type, filename } = opts;

	/** Get task document */
	const taskResult = await getTaskDocument(taskId);
	if (!taskResult.success) {
		return {
			artifactId: "",
			url: "",
			allDeliverablesComplete: false,
			isError: true,
		};
	}
	const { doc, meta } = taskResult;

	/** Verify session token */
	const tokenError = verifySessionToken(
		sessionToken,
		meta.sessionTokenHash,
		taskId,
	);
	if (tokenError) {
		return {
			artifactId: "",
			url: "",
			allDeliverablesComplete: false,
			isError: true,
		};
	}

	const actor = await getGitHubUsername();
	const { generateArtifactId } = await import("@shipyard/loro-schema");
	const artifactId = generateArtifactId();

	/** Create artifact object */
	const artifact = {
		storage: "github" as const,
		id: artifactId,
		type,
		filename,
		description: opts.description ?? null,
		uploadedAt: Date.now(),
		url: `(upload pending)`, // TODO: Implement actual upload
	};

	/** Add artifact to doc */
	doc.artifacts.push(artifact);

	/** Log event */
	doc.logEvent("artifact_uploaded", actor, {
		artifactId,
		filename,
		artifactType: type,
	});

	/** Check if all deliverables are complete */
	const allDeliverables = doc.deliverables.toJSON() as Array<{
		linkedArtifactId: string | null;
	}>;
	const allComplete =
		allDeliverables.length > 0 &&
		allDeliverables.every((d) => d.linkedArtifactId);

	logger.info({ taskId, artifactId }, "Artifact added via sandbox");

	return {
		artifactId,
		url: artifact.url,
		allDeliverablesComplete: allComplete,
		snapshotUrl: allComplete
			? `${parseEnv().WEB_URL}/snapshots/${taskId}`
			: undefined,
		isError: false,
	};
}

/**
 * Complete a task.
 */
export async function completeTask(
	taskId: string,
	sessionToken: string,
	summary?: string,
): Promise<{ snapshotUrl: string; status: string; isError: boolean }> {
	/** Get task document */
	const taskResult = await getTaskDocument(taskId);
	if (!taskResult.success) {
		return { snapshotUrl: "", status: "error", isError: true };
	}
	const { doc, meta } = taskResult;

	/** Verify session token */
	const tokenError = verifySessionToken(
		sessionToken,
		meta.sessionTokenHash,
		taskId,
	);
	if (tokenError) {
		return { snapshotUrl: "", status: "error", isError: true };
	}

	const actor = await getGitHubUsername();

	/** Update status to completed */
	doc.updateStatus("completed", actor);

	/** Log completion event */
	doc.logEvent("completed", actor, { summary });

	const snapshotUrl = `${parseEnv().WEB_URL}/snapshots/${taskId}`;

	logger.info({ taskId }, "Task completed via sandbox");

	return { snapshotUrl, status: "completed", isError: false };
}

/**
 * Update block content.
 */
export async function updateBlockContent(
	taskId: string,
	sessionToken: string,
	operations: Array<{
		type: "update" | "insert" | "delete" | "replace_all";
		blockId?: string;
		afterBlockId?: string | null;
		content?: string;
	}>,
): Promise<void> {
	/** Get task document */
	const taskResult = await getTaskDocument(taskId);
	if (!taskResult.success) {
		throw new Error(taskResult.error);
	}
	const { doc, meta } = taskResult;

	/** Verify session token */
	const tokenError = verifySessionToken(
		sessionToken,
		meta.sessionTokenHash,
		taskId,
	);
	if (tokenError) {
		throw new Error(tokenError);
	}

	const actor = await getGitHubUsername();

	// TODO: Implement actual block content operations
	// For now, just log the event
	doc.logEvent("content_edited", actor, {
		summary: `${operations.length} block operations`,
	});

	logger.info(
		{ taskId, operationCount: operations.length },
		"Block content updated via sandbox",
	);
}

/**
 * Link a PR to a task.
 */
export async function linkPR(opts: {
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
	const { taskId, sessionToken, prNumber } = opts;

	/** Get task document */
	const taskResult = await getTaskDocument(taskId);
	if (!taskResult.success) {
		throw new Error(taskResult.error);
	}
	const { doc, meta } = taskResult;

	/** Verify session token */
	const tokenError = verifySessionToken(
		sessionToken,
		meta.sessionTokenHash,
		taskId,
	);
	if (tokenError) {
		throw new Error(tokenError);
	}

	const actor = await getGitHubUsername();
	const repo = opts.repo || meta.repo;

	/** Add linked PR */
	const pr = {
		prNumber,
		status: "open" as const,
		branch: opts.branch ?? null,
		title: null,
	};
	doc.linkedPRs.push(pr);

	/** Log event */
	doc.logEvent("pr_linked", actor, {
		prNumber,
		title: null,
	});

	const url = repo ? `https://github.com/${repo}/pull/${prNumber}` : "";

	logger.info({ taskId, prNumber }, "PR linked via sandbox");

	return {
		prNumber,
		url,
		status: "open",
		branch: opts.branch || "",
		title: "",
	};
}

/**
 * Post an update to the task timeline.
 */
export async function postUpdate(opts: {
	taskId: string;
	sessionToken: string;
	message: string;
}): Promise<{ success: boolean; isError: boolean; error?: string }> {
	const { taskId, sessionToken, message } = opts;

	/** Get task document */
	const taskResult = await getTaskDocument(taskId);
	if (!taskResult.success) {
		return { success: false, isError: true, error: taskResult.error };
	}
	const { doc, meta } = taskResult;

	/** Verify session token */
	const tokenError = verifySessionToken(
		sessionToken,
		meta.sessionTokenHash,
		taskId,
	);
	if (tokenError) {
		return { success: false, isError: true, error: tokenError };
	}

	const actor = await getGitHubUsername();

	/** Log agent activity event */
	doc.logEvent("agent_activity", actor, {
		message,
		isBlocker: null,
	});

	logger.info({ taskId }, "Update posted via sandbox");

	return { success: true, isError: false };
}

/**
 * Read diff comments.
 */
export async function readDiffComments(
	taskId: string,
	sessionToken: string,
	opts?: {
		includeLocal?: boolean;
		includePR?: boolean;
		includeResolved?: boolean;
	},
): Promise<string> {
	/** Get task document */
	const taskResult = await getTaskDocument(taskId);
	if (!taskResult.success) {
		return `Error: ${taskResult.error}`;
	}
	const { doc, meta } = taskResult;

	/** Verify session token */
	const tokenError = verifySessionToken(
		sessionToken,
		meta.sessionTokenHash,
		taskId,
	);
	if (tokenError) {
		return `Error: ${tokenError}`;
	}

	/** Get comments from document */
	const comments = doc.comments.toJSON();
	if (!comments || typeof comments !== "object") {
		return "No diff comments found.";
	}

	let output = "# Diff Comments\n\n";
	let count = 0;

	for (const [id, comment] of Object.entries(comments)) {
		if (!comment || typeof comment !== "object") continue;
		const c = comment as Record<string, unknown>;

		const kind = c.kind as string;
		const includeLocal = opts?.includeLocal !== false;
		const includePR = opts?.includePR !== false;
		const includeResolved = opts?.includeResolved === true;

		if (kind === "local" && !includeLocal) continue;
		if (kind === "pr" && !includePR) continue;
		if (c.resolved && !includeResolved) continue;

		output += `## [${kind}:${id}]\n`;
		output += `**Author:** ${c.author || "unknown"}\n`;
		if (c.path) output += `**File:** ${c.path}\n`;
		if (c.line) output += `**Line:** ${c.line}\n`;
		output += `\n${c.body || ""}\n\n`;
		count++;
	}

	if (count === 0) {
		return "No diff comments found matching the filter criteria.";
	}

	return output;
}

/**
 * Reply to a diff comment.
 */
export async function replyToDiffComment(opts: {
	taskId: string;
	sessionToken: string;
	commentId: string;
	body: string;
}): Promise<string> {
	const { taskId, sessionToken, commentId, body } = opts;

	/** Get task document */
	const taskResult = await getTaskDocument(taskId);
	if (!taskResult.success) {
		return `Error: ${taskResult.error}`;
	}
	const { doc, meta } = taskResult;

	/** Verify session token */
	const tokenError = verifySessionToken(
		sessionToken,
		meta.sessionTokenHash,
		taskId,
	);
	if (tokenError) {
		return `Error: ${tokenError}`;
	}

	const actor = await getGitHubUsername();
	const { generateCommentId } = await import("@shipyard/loro-schema");
	const replyId = generateCommentId();

	// TODO: Implement actual comment reply
	// For now, just log the event
	doc.logEvent("comment_added", actor, {
		commentId: replyId,
		threadId: commentId,
		preview: body.slice(0, 100),
	});

	logger.info(
		{ taskId, commentId, replyId },
		"Reply to diff comment via sandbox",
	);

	return `Reply added! Comment ID: ${replyId}`;
}

/**
 * Reply to a thread comment.
 */
export async function replyToThreadComment(opts: {
	taskId: string;
	sessionToken: string;
	threadId: string;
	body: string;
}): Promise<string> {
	const { taskId, sessionToken, threadId, body } = opts;

	/** Get task document */
	const taskResult = await getTaskDocument(taskId);
	if (!taskResult.success) {
		return `Error: ${taskResult.error}`;
	}
	const { doc, meta } = taskResult;

	/** Verify session token */
	const tokenError = verifySessionToken(
		sessionToken,
		meta.sessionTokenHash,
		taskId,
	);
	if (tokenError) {
		return `Error: ${tokenError}`;
	}

	const actor = await getGitHubUsername();
	const { generateCommentId } = await import("@shipyard/loro-schema");
	const replyId = generateCommentId();

	// TODO: Implement actual comment reply
	// For now, just log the event
	doc.logEvent("comment_added", actor, {
		commentId: replyId,
		threadId,
		preview: body.slice(0, 100),
	});

	logger.info(
		{ taskId, threadId, replyId },
		"Reply to thread comment via sandbox",
	);

	return `Reply added to thread! Comment ID: ${replyId}`;
}

/**
 * Regenerate session token.
 */
export async function regenerateSessionToken(
	taskId: string,
): Promise<{ sessionToken: string; taskId: string }> {
	/** Get task document */
	const taskResult = await getTaskDocument(taskId);
	if (!taskResult.success) {
		throw new Error(taskResult.error);
	}
	const { doc, meta } = taskResult;

	/** Verify ownership via GitHub identity */
	const currentUser = await getGitHubUsername();
	if (meta.ownerId && meta.ownerId !== currentUser) {
		throw new Error(
			`Cannot regenerate token for task "${taskId}". ` +
				`You (${currentUser}) are not the owner (${meta.ownerId}).`,
		);
	}

	/** Generate new token */
	const sessionToken = generateSessionToken();
	const sessionTokenHash = hashSessionToken(sessionToken);

	/** Update document */
	doc.meta.sessionTokenHash = sessionTokenHash;

	logger.info({ taskId }, "Session token regenerated via sandbox");

	return { sessionToken, taskId };
}
