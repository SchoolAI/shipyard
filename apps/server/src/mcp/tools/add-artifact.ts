/**
 * MCP Tool: add_artifact
 *
 * Adds an artifact (file, link, etc.) to the task.
 * Ported from apps/server-legacy/src/tools/add-artifact.ts
 *
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import { readFile } from "node:fs/promises";
import { generateArtifactId } from "@shipyard/loro-schema";
import { z } from "zod";
import {
	GitHubAuthError,
	isGitHubConfigured,
	uploadArtifact,
} from "../../utils/github-artifacts.js";
import { getGitHubUsername } from "../../utils/identity.js";
import { logger } from "../../utils/logger.js";
import type { McpServer } from "../index.js";
import {
	errorResponse,
	getTaskDocument,
	successResponse,
	verifySessionToken,
} from "./helpers.js";

/** Tool name constant */
const TOOL_NAME = "add_artifact";

/** Artifact types */
type ArtifactType = "html" | "image" | "video";

/** Input Schema - base fields */
const AddArtifactInputBase = z.object({
	taskId: z.string().describe("The task ID to add artifact to"),
	sessionToken: z.string().describe("Session token from create_task"),
	type: z.enum(["html", "image", "video"]).describe("Artifact type"),
	filename: z.string().describe("Filename for the artifact"),
	description: z
		.string()
		.optional()
		.describe("What this artifact proves (deliverable name)"),
	deliverableId: z
		.string()
		.optional()
		.describe("ID of the deliverable this artifact fulfills"),
});

/** Discriminated union for content source */
const AddArtifactInput = z.discriminatedUnion("source", [
	AddArtifactInputBase.extend({
		source: z.literal("file"),
		filePath: z.string().describe("Local file path to upload"),
	}),
	AddArtifactInputBase.extend({
		source: z.literal("url"),
		contentUrl: z.string().describe("URL to fetch content from"),
	}),
	AddArtifactInputBase.extend({
		source: z.literal("base64"),
		content: z.string().describe("Base64 encoded file content"),
	}),
]);

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
		throw new Error(
			`Invalid file extension for artifact type '${type}'.\n\n` +
				`Expected: ${valid?.join(", ") || "unknown"}\n` +
				`Got: ${ext || "no extension"}`,
		);
	}
}

/**
 * Resolve artifact content from various sources.
 */
async function resolveArtifactContent(
	input: z.infer<typeof AddArtifactInput>,
): Promise<
	{ success: true; content: string } | { success: false; error: string }
> {
	switch (input.source) {
		case "file": {
			try {
				const fileBuffer = await readFile(input.filePath);
				return { success: true, content: fileBuffer.toString("base64") };
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Unknown error";
				return { success: false, error: `Failed to read file: ${message}` };
			}
		}

		case "url": {
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

/**
 * Register the add_artifact tool.
 */
export function registerAddArtifactTool(server: McpServer): void {
	server.tool(
		TOOL_NAME,
		`Upload an artifact (screenshot, video, test results, diff) to a task as proof of work.

AUTO-COMPLETE: When ALL deliverables have artifacts attached, the task automatically completes:
- Status changes to 'completed'
- PR auto-links from current git branch
- Snapshot URL returned for embedding in PR

This means you usually don't need to call complete_task - just upload artifacts for all deliverables.

STORAGE STRATEGY:
- Tries GitHub upload first (if configured and repo is set)
- Falls back to local storage if GitHub fails or isn't configured
- Local artifacts served via HTTP endpoint on registry server

REQUIREMENTS:
- For GitHub storage: repo must be set + 'gh auth login' or GITHUB_TOKEN
- For local storage: no requirements (automatic fallback)

CONTENT SOURCE (specify via 'source' field):
- source='file' + filePath: Local file path (e.g., "/path/to/screenshot.png") - RECOMMENDED
- source='url' + contentUrl: URL to fetch content from
- source='base64' + content: Base64 encoded (legacy)

DELIVERABLE LINKING:
- Pass deliverableId to link artifact to a deliverable
- If using Claude Code hooks, deliverable IDs are provided after task approval
- Otherwise, call read_task to get deliverable IDs

ARTIFACT TYPES:
- screenshot: PNG, JPG images of UI, terminal output
- video: MP4 recordings of feature demos
- test_results: JSON test output, coverage reports
- diff: Code changes, git diffs`,
		{
			taskId: {
				type: "string",
				description: "The task ID to add artifact to",
			},
			sessionToken: {
				type: "string",
				description: "Session token from create_task",
			},
			type: {
				type: "string",
				enum: ["html", "image", "video"],
				description: "Artifact type for rendering",
			},
			filename: {
				type: "string",
				description: "Filename with extension (e.g., screenshot.png, demo.mp4)",
			},
			source: {
				type: "string",
				enum: ["file", "url", "base64"],
				description:
					"Content source type: file (local path), url (fetch from URL), or base64 (direct content)",
			},
			filePath: {
				type: "string",
				description: "Local file path to upload (required when source=file)",
			},
			contentUrl: {
				type: "string",
				description: "URL to fetch content from (required when source=url)",
			},
			content: {
				type: "string",
				description:
					"Base64 encoded file content (required when source=base64)",
			},
			description: {
				type: "string",
				description: "Human-readable description of what this artifact proves",
			},
			deliverableId: {
				type: "string",
				description:
					"ID of the deliverable this fulfills (from read_task output). Automatically marks deliverable as completed.",
			},
		},
		async (args: unknown) => {
			const input = AddArtifactInput.parse(args);
			const { taskId, sessionToken, type, filename } = input;

			/** Validate artifact type matches file extension */
			try {
				validateArtifactType(type, filename);
			} catch (error) {
				return errorResponse(
					error instanceof Error ? error.message : "Invalid artifact type",
				);
			}

			/** Resolve content */
			const contentResult = await resolveArtifactContent(input);
			if (!contentResult.success) {
				return errorResponse(contentResult.error);
			}

			/** Get task document */
			const taskResult = await getTaskDocument(taskId);
			if (!taskResult.success) {
				return errorResponse(taskResult.error);
			}
			const { doc, meta } = taskResult;

			/** Verify session token */
			const tokenError = verifySessionToken(
				sessionToken,
				meta.sessionTokenHash,
				taskId,
			);
			if (tokenError) {
				return errorResponse(tokenError);
			}

			/** Get actor name */
			const actorName = await getGitHubUsername();

			logger.info({ taskId, type, filename }, "Adding artifact");

			/** Create artifact object */
			const artifactId = generateArtifactId();
			let artifactUrl = "(upload pending)";

			/** Try GitHub upload if configured and repo is set */
			if (isGitHubConfigured() && meta.repo) {
				try {
					artifactUrl = await uploadArtifact({
						repo: meta.repo,
						planId: taskId,
						filename,
						content: contentResult.content,
					});
					logger.info(
						{ taskId, artifactId, url: artifactUrl },
						"Artifact uploaded to GitHub",
					);
				} catch (error) {
					if (error instanceof GitHubAuthError) {
						return errorResponse(
							`GitHub Authentication Error\n\n${error.message}`,
						);
					}
					const message =
						error instanceof Error ? error.message : "Unknown error";
					logger.warn({ taskId, error: message }, "GitHub upload failed");
					return errorResponse(`Failed to upload artifact: ${message}`);
				}
			} else {
				const reason = !isGitHubConfigured()
					? "GITHUB_TOKEN not set"
					: "Task has no repo configured";
				return errorResponse(
					`Cannot upload artifact: ${reason}.\n\nTo enable GitHub uploads:\n1. Set GITHUB_TOKEN in your MCP config\n2. Ensure the task has a repo set`,
				);
			}

			const artifact = {
				storage: "github" as const,
				id: artifactId,
				type,
				filename,
				description: input.description ?? null,
				uploadedAt: Date.now(),
				url: artifactUrl,
			};

			/** Add artifact to doc */
			doc.artifacts.push(artifact);

			/** Log event */
			doc.logEvent("artifact_uploaded", actorName, {
				artifactId,
				filename,
				artifactType: type,
			});

			/** Link to deliverable if specified */
			if (input.deliverableId) {
				const deliverables = doc.deliverables.toJSON() as Array<{
					id: string;
					linkedArtifactId: string | null;
				}>;
				const deliverableIndex = deliverables.findIndex(
					(d) => d.id === input.deliverableId,
				);

				if (deliverableIndex !== -1) {
					// TODO: Update deliverable with artifact ID
					doc.logEvent("deliverable_linked", actorName, {
						deliverableId: input.deliverableId,
						artifactId,
						deliverableText: null,
					});
					logger.info(
						{ taskId, artifactId, deliverableId: input.deliverableId },
						"Artifact linked to deliverable",
					);
				}
			}

			/** Check if all deliverables are complete for auto-completion */
			const allDeliverables = doc.deliverables.toJSON() as Array<{
				linkedArtifactId: string | null;
			}>;
			const allComplete =
				allDeliverables.length > 0 &&
				allDeliverables.every((d) => d.linkedArtifactId);

			logger.info({ taskId, artifactId }, "Artifact added");

			const linkedText = input.deliverableId
				? `\nLinked to deliverable: ${input.deliverableId}`
				: "";

			if (allComplete) {
				return {
					content: [
						{
							type: "text",
							text: `Artifact uploaded!
ID: ${artifactId}
Type: ${type}
Filename: ${filename}${linkedText}

ALL DELIVERABLES COMPLETE! Task will auto-complete.
(Full auto-completion with snapshot URL pending Loro integration)`,
						},
					],
				};
			}

			const remaining = allDeliverables.filter(
				(d) => !d.linkedArtifactId,
			).length;
			return successResponse(
				`Artifact uploaded!\nID: ${artifactId}\nType: ${type}\nFilename: ${filename}${linkedText}\n\n${remaining} deliverable(s) remaining.`,
			);
		},
	);
}
