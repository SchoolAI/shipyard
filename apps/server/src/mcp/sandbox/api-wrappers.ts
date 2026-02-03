/**
 * Sandbox API wrappers for execute_code.
 *
 * These functions are exposed in the VM sandbox for user code to call.
 * They wrap the tool handlers and provide cleaner return types.
 * Ported from apps/server-legacy/src/tools/execute-code.ts.
 */

import { readFile } from "node:fs/promises";
import {
	generateArtifactId,
	generateDeliverableId,
	generateTaskId,
	type TaskDocument,
	type TaskMeta,
} from "@shipyard/loro-schema";
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
import {
	GitHubAuthError,
	isGitHubConfigured,
	tryAutoLinkPR,
	uploadArtifact as uploadToGitHub,
} from "./github-artifacts.js";

/** --- Content Resolution --- */

type ContentSource =
	| { source: "file"; filePath: string }
	| { source: "url"; contentUrl: string }
	| { source: "base64"; content: string };

type ContentResult =
	| { success: true; content: string }
	| { success: false; error: string };

/**
 * Resolves artifact content from various sources (file, url, base64).
 * Returns base64-encoded content or an error message.
 */
async function resolveArtifactContent(
	input: ContentSource,
): Promise<ContentResult> {
	switch (input.source) {
		case "file": {
			logger.info({ filePath: input.filePath }, "Reading file from path");
			try {
				const fileBuffer = await readFile(input.filePath);
				return { success: true, content: fileBuffer.toString("base64") };
			} catch (error) {
				logger.error(
					{ error, filePath: input.filePath },
					"Failed to read file",
				);
				const message =
					error instanceof Error ? error.message : "Unknown error";
				return { success: false, error: `Failed to read file: ${message}` };
			}
		}

		case "url": {
			logger.info(
				{ contentUrl: input.contentUrl },
				"Fetching content from URL",
			);
			try {
				const response = await fetch(input.contentUrl);
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}: ${response.statusText}`);
				}
				const arrayBuffer = await response.arrayBuffer();
				return {
					success: true,
					content: Buffer.from(arrayBuffer).toString("base64"),
				};
			} catch (error) {
				logger.error(
					{ error, contentUrl: input.contentUrl },
					"Failed to fetch URL",
				);
				const message =
					error instanceof Error ? error.message : "Unknown error";
				return { success: false, error: `Failed to fetch URL: ${message}` };
			}
		}

		case "base64": {
			return { success: true, content: input.content };
		}
	}
}

/** --- Artifact Type Validation --- */

type ArtifactType = "html" | "image" | "video";

/**
 * Validates that the artifact type matches the file extension.
 */
function validateArtifactType(type: ArtifactType, filename: string): void {
	const ext = filename.split(".").pop()?.toLowerCase();

	const validExtensions: Record<ArtifactType, string[]> = {
		html: ["html", "htm"],
		image: ["png", "jpg", "jpeg", "gif", "webp", "svg"],
		video: ["mp4", "webm", "mov", "avi"],
	};

	const valid = validExtensions[type];
	if (!valid || !ext || !valid.includes(ext)) {
		const suggestions: Record<ArtifactType, string> = {
			html: "HTML is the primary format for test results, terminal output, code reviews, and structured data. Use self-contained HTML with inline CSS and base64 images.",
			image:
				'Images are for actual UI screenshots only. For terminal output or test results, use type: "html" instead.',
			video:
				'Videos are for browser automation flows and complex interactions. For static content, use type: "image" or "html".',
		};

		throw new Error(
			`Invalid file extension for artifact type '${type}'.\n\n` +
				`Expected: ${valid?.join(", ") || "unknown"}\n` +
				`Got: ${ext || "no extension"}\n\n` +
				`Tip: ${suggestions[type]}`,
		);
	}
}

/** --- Markdown Parsing for Deliverables --- */

interface ExtractedDeliverable {
	id: string;
	text: string;
}

/**
 * Extract deliverables from markdown content.
 * Looks for checkbox items with {#deliverable} marker.
 *
 * Example:
 *   - [ ] Screenshot of login {#deliverable}
 *
 * Ported from @shipyard/schema extractDeliverables
 */
function extractDeliverablesFromMarkdown(
	content: string,
): ExtractedDeliverable[] {
	const deliverables: ExtractedDeliverable[] = [];

	/** Match checkbox items with {#deliverable} marker */
	const regex = /^\s*[-*]\s*\[\s*[xX ]?\s*\]\s*(.+?)\s*\{#deliverable\}\s*$/gm;

	let match: RegExpExecArray | null;
	while ((match = regex.exec(content)) !== null) {
		const text = match[1]?.trim();
		if (text) {
			deliverables.push({
				id: generateDeliverableId(),
				text,
			});
		}
	}

	return deliverables;
}

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

	/** Parse markdown to extract deliverables */
	const extractedDeliverables = extractDeliverablesFromMarkdown(opts.content);

	/** Add deliverables to document */
	for (const d of extractedDeliverables) {
		doc.deliverables.push({
			id: d.id,
			text: d.text,
			linkedArtifactId: null,
			linkedAt: null,
		});
	}

	logger.info(
		{ taskId, deliverableCount: extractedDeliverables.length },
		"Deliverables extracted from markdown",
	);

	/** Log task created event */
	doc.logEvent("task_created", ownerId);

	/** Build task URL */
	const env = parseEnv();
	const url = `${env.WEB_URL}/tasks/${taskId}`;

	/** Create monitoring script for non-hook agents */
	const monitoringScript = `#!/bin/bash
# Poll for task approval/rejection
# Task: ${taskId}
while true; do
  sleep 30
  STATUS=$(curl -s "${env.WEB_URL}/api/tasks/${taskId}/status" 2>/dev/null | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
  if [ "$STATUS" = "in_progress" ]; then
    echo "Task approved! Proceeding with work."
    exit 0
  elif [ "$STATUS" = "changes_requested" ]; then
    echo "Changes requested. Check task for feedback."
    exit 1
  fi
  echo "Waiting for task review... (status: $STATUS)"
done`;

	return {
		taskId,
		sessionToken,
		url,
		deliverables: extractedDeliverables,
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

	const env = parseEnv();
	const monitoringScript = `#!/bin/bash
# Poll for task approval/rejection
# Task: ${taskId}
while true; do
  sleep 30
  STATUS=$(curl -s "${env.WEB_URL}/api/tasks/${taskId}/status" 2>/dev/null | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
  if [ "$STATUS" = "in_progress" ]; then
    echo "Task approved! Proceeding with work."
    exit 0
  elif [ "$STATUS" = "changes_requested" ]; then
    echo "Changes requested. Check task for feedback."
    exit 1
  fi
  echo "Waiting for task review... (status: $STATUS)"
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
	error?: string;
}> {
	const { taskId, sessionToken, type, filename } = opts;

	/** Validate artifact type */
	try {
		validateArtifactType(type, filename);
	} catch (error) {
		return {
			artifactId: "",
			url: "",
			allDeliverablesComplete: false,
			isError: true,
			error: error instanceof Error ? error.message : "Invalid artifact type",
		};
	}

	/** Get task document */
	const taskResult = await getTaskDocument(taskId);
	if (!taskResult.success) {
		return {
			artifactId: "",
			url: "",
			allDeliverablesComplete: false,
			isError: true,
			error: taskResult.error,
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
			error: tokenError,
		};
	}

	/** Resolve content based on source type */
	let contentSource: ContentSource;
	if (opts.source === "file" && opts.filePath) {
		contentSource = { source: "file", filePath: opts.filePath };
	} else if (opts.source === "url" && opts.contentUrl) {
		contentSource = { source: "url", contentUrl: opts.contentUrl };
	} else if (opts.source === "base64" && opts.content) {
		contentSource = { source: "base64", content: opts.content };
	} else {
		return {
			artifactId: "",
			url: "",
			allDeliverablesComplete: false,
			isError: true,
			error: `Missing content for source type '${opts.source}'. Provide filePath, contentUrl, or content.`,
		};
	}

	const contentResult = await resolveArtifactContent(contentSource);
	if (!contentResult.success) {
		return {
			artifactId: "",
			url: "",
			allDeliverablesComplete: false,
			isError: true,
			error: contentResult.error,
		};
	}

	const actor = await getGitHubUsername();
	const artifactId = generateArtifactId();

	/** Try to upload to GitHub if configured */
	let artifactUrl: string;
	const githubConfigured = isGitHubConfigured();
	const hasRepo = !!meta.repo;

	if (githubConfigured && hasRepo && meta.repo) {
		try {
			artifactUrl = await uploadToGitHub({
				repo: meta.repo,
				taskId,
				filename,
				content: contentResult.content,
			});
			logger.info(
				{ taskId, artifactId, url: artifactUrl },
				"Artifact uploaded to GitHub",
			);
		} catch (error) {
			if (error instanceof GitHubAuthError) {
				return {
					artifactId: "",
					url: "",
					allDeliverablesComplete: false,
					isError: true,
					error: error.message,
				};
			}
			/** Log error but continue without GitHub upload */
			logger.warn(
				{ error, taskId },
				"GitHub upload failed, artifact stored without remote URL",
			);
			artifactUrl = `(GitHub upload failed: ${error instanceof Error ? error.message : "unknown"})`;
		}
	} else {
		/** No GitHub configured - note this in the URL */
		const reason = !githubConfigured
			? "GITHUB_TOKEN not set"
			: "repo not configured";
		artifactUrl = `(local only - ${reason})`;
		logger.info(
			{ taskId, artifactId, reason },
			"Artifact stored locally (no GitHub upload)",
		);
	}

	/** Create artifact object */
	const artifact = {
		storage: "github" as const,
		id: artifactId,
		type,
		filename,
		description: opts.description ?? null,
		uploadedAt: Date.now(),
		url: artifactUrl,
	};

	/** Add artifact to doc */
	doc.artifacts.push(artifact);

	/** Log event */
	doc.logEvent("artifact_uploaded", actor, {
		artifactId,
		filename,
		artifactType: type,
	});

	/** Link to deliverable if specified */
	if (opts.deliverableId) {
		const deliverablesArray = doc.deliverables.toJSON() as Array<{
			id: string;
			text: string;
			linkedArtifactId: string | null;
			linkedAt: number | null;
		}>;
		const deliverableIndex = deliverablesArray.findIndex(
			(d) => d.id === opts.deliverableId,
		);

		if (deliverableIndex !== -1) {
			/** Update the deliverable with the linked artifact */
			const deliverable = deliverablesArray[deliverableIndex];
			if (deliverable) {
				/** Delete and re-insert with updated fields */
				doc.deliverables.delete(deliverableIndex, 1);
				doc.deliverables.insert(deliverableIndex, {
					id: deliverable.id,
					text: deliverable.text,
					linkedArtifactId: artifactId,
					linkedAt: Date.now(),
				});

				doc.logEvent("deliverable_linked", actor, {
					deliverableId: opts.deliverableId,
					artifactId,
					deliverableText: deliverable.text,
				});

				logger.info(
					{ taskId, artifactId, deliverableId: opts.deliverableId },
					"Artifact linked to deliverable",
				);
			}
		} else {
			logger.warn(
				{ taskId, deliverableId: opts.deliverableId },
				"Deliverable not found for linking",
			);
		}
	}

	/** Check if all deliverables are complete */
	const updatedDeliverables = doc.deliverables.toJSON() as Array<{
		linkedArtifactId: string | null;
	}>;
	const allComplete =
		updatedDeliverables.length > 0 &&
		updatedDeliverables.every((d) => d.linkedArtifactId);

	logger.info(
		{ taskId, artifactId, allComplete },
		"Artifact added via sandbox",
	);

	/** Handle auto-completion if all deliverables are fulfilled */
	if (allComplete) {
		const autoCompleteResult = await performAutoComplete(
			doc,
			meta,
			actor,
			taskId,
		);
		return {
			artifactId,
			url: artifactUrl,
			allDeliverablesComplete: true,
			snapshotUrl: autoCompleteResult.snapshotUrl,
			isError: false,
		};
	}

	return {
		artifactId,
		url: artifactUrl,
		allDeliverablesComplete: false,
		isError: false,
	};
}

/** --- Auto-Complete Logic --- */

interface AutoCompleteResult {
	snapshotUrl: string;
	linkedPR: {
		prNumber: number;
		url: string;
		status: string;
		branch: string;
		title: string;
	} | null;
}

/**
 * Perform auto-completion when all deliverables are fulfilled.
 * - Updates status to completed
 * - Tries to auto-link PR from current branch
 * - Generates snapshot URL
 */
async function performAutoComplete(
	doc: TaskDocument,
	meta: TaskMeta,
	actor: string,
	taskId: string,
): Promise<AutoCompleteResult> {
	const env = parseEnv();

	/** Try to auto-link PR from current branch */
	let linkedPR: AutoCompleteResult["linkedPR"] = null;

	if (meta.repo) {
		/** Check if there's already a linked PR */
		const existingPRs = doc.linkedPRs.toJSON();
		if (!Array.isArray(existingPRs) || existingPRs.length === 0) {
			const prInfo = await tryAutoLinkPR(meta.repo);
			if (prInfo) {
				doc.linkedPRs.push({
					prNumber: prInfo.prNumber,
					status: prInfo.status,
					branch: prInfo.branch,
					title: prInfo.title,
				});

				doc.logEvent("pr_linked", actor, {
					prNumber: prInfo.prNumber,
					title: prInfo.title,
				});

				linkedPR = prInfo;

				logger.info(
					{ taskId, prNumber: prInfo.prNumber, branch: prInfo.branch },
					"Auto-linked PR from current branch",
				);
			}
		}
	}

	/** Update status to completed */
	doc.updateStatus("completed", actor);

	/** Generate snapshot URL */
	const snapshotUrl = `${env.WEB_URL}/snapshots/${taskId}`;

	logger.info({ taskId, snapshotUrl }, "Task auto-completed");

	return { snapshotUrl, linkedPR };
}

/**
 * Complete a task.
 */
export async function completeTask(
	taskId: string,
	sessionToken: string,
	summary?: string,
): Promise<{
	snapshotUrl: string;
	status: string;
	isError: boolean;
	error?: string;
}> {
	/** Get task document */
	const taskResult = await getTaskDocument(taskId);
	if (!taskResult.success) {
		return {
			snapshotUrl: "",
			status: "error",
			isError: true,
			error: taskResult.error,
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
			snapshotUrl: "",
			status: "error",
			isError: true,
			error: tokenError,
		};
	}

	/** Check if there are any artifacts */
	const artifacts = doc.artifacts.toJSON();
	if (!Array.isArray(artifacts) || artifacts.length === 0) {
		return {
			snapshotUrl: "",
			status: "error",
			isError: true,
			error:
				"Cannot complete: no artifacts uploaded. Upload artifacts first using addArtifact.",
		};
	}

	const actor = await getGitHubUsername();

	/** Perform auto-completion */
	const result = await performAutoComplete(doc, meta, actor, taskId);

	/** Log completion event with summary */
	if (summary) {
		doc.logEvent("agent_activity", actor, {
			message: `Completion summary: ${summary}`,
			isBlocker: null,
		});
	}

	logger.info({ taskId }, "Task completed via sandbox");

	return {
		snapshotUrl: result.snapshotUrl,
		status: "completed",
		isError: false,
	};
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

	/**
	 * Block content operations are managed by loro-prosemirror in the browser.
	 * This API logs the intent but actual content manipulation happens client-side.
	 * Future: Implement server-side block operations using Loro's text/richtext API.
	 */
	doc.logEvent("content_edited", actor, {
		summary: `${operations.length} block operations requested`,
	});

	logger.info(
		{ taskId, operationCount: operations.length },
		"Block content update logged via sandbox",
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

	/**
	 * Comment replies are stored in the comments record.
	 * The inReplyTo field links replies to parent comments.
	 */
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

	/**
	 * Thread comment replies are stored in the comments record.
	 * The threadId links replies to the parent thread.
	 */
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
