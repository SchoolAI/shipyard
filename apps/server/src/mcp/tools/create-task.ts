/**
 * MCP Tool: create_task
 *
 * Creates a new task in the Loro document.
 * Ported from apps/server-legacy/src/tools/create-task.ts
 *
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import { generateTaskId } from "@shipyard/loro-schema";
import { z } from "zod";
import { parseEnv } from "../../env.js";
import {
	getEnvironmentContext,
	getGitHubUsername,
	getRepositoryFullName,
} from "../../utils/identity.js";
import { logger } from "../../utils/logger.js";
import type { McpServer } from "../index.js";
import { getOrCreateTaskDocument } from "./helpers.js";
import { generateSessionToken, hashSessionToken } from "./session-token.js";

/** Tool name constant */
const TOOL_NAME = "create_task";

/** Origin platforms for conversation export */
const OriginPlatformValues = [
	"claude-code",
	"cursor",
	"devin",
	"windsurf",
	"cline",
	"continue",
	"aider",
	"codex",
	"vscode",
	"zed",
	"browser",
	"unknown",
] as const;

/** Input Schema */
const CreateTaskInput = z.object({
	title: z.string().describe("Task title"),
	content: z.string().describe("Task content (markdown)"),
	repo: z.string().optional().describe("GitHub repo (org/repo)"),
	prNumber: z.number().optional().describe("PR number"),
	originPlatform: z
		.enum(OriginPlatformValues)
		.optional()
		.describe("Platform where this plan originated (for conversation export)"),
	originSessionId: z
		.string()
		.optional()
		.describe("Platform-specific session ID"),
	originMetadata: z
		.record(z.string(), z.unknown())
		.optional()
		.describe("Platform-specific metadata for conversation export"),
	tags: z
		.array(z.string())
		.optional()
		.describe(
			'Tags for categorization (e.g., ["ui", "bug", "project:mobile-app"])',
		),
});

/**
 * Register the create_task tool.
 */
export function registerCreateTaskTool(server: McpServer): void {
	server.tool(
		TOOL_NAME,
		`Create a new implementation task and open it in browser.

NOTE FOR CLAUDE CODE USERS: If you have the shipyard hook installed, use native plan mode (Shift+Tab) instead of this tool. The hook handles task creation automatically and provides a better experience.

This tool is for agents WITHOUT hook support (Cursor, Devin, etc).

DELIVERABLES: Mark checkbox items as deliverables using {#deliverable} marker. Deliverables are measurable outcomes you can prove with artifacts.

Good deliverables (provable with artifacts):
- [ ] Screenshot of working feature {#deliverable}
- [ ] Video demo of user flow {#deliverable}
- [ ] Test results showing all tests pass {#deliverable}

Bad deliverables (not provable):
- [ ] Implement the API  <- This is a task, not a deliverable
- [ ] Add error handling <- Can't prove this with an artifact`,
		{
			title: { type: "string", description: "Task title" },
			content: {
				type: "string",
				description:
					"Task content in markdown. Use {#deliverable} marker on checkbox items to mark them as deliverables that can be linked to artifacts.",
			},
			repo: {
				type: "string",
				description:
					"GitHub repo (org/repo). Auto-detected from current directory if not provided. Required for artifact uploads.",
			},
			prNumber: {
				type: "number",
				description: "PR number. Required for artifact uploads.",
			},
			originPlatform: {
				type: "string",
				enum: [...OriginPlatformValues],
				description:
					"Platform where this plan originated. Used for conversation export/import.",
			},
			originSessionId: {
				type: "string",
				description:
					"Platform-specific session ID. Include this so conversation history can be exported later.",
			},
			originMetadata: {
				type: "object",
				description: "Platform-specific metadata for conversation export.",
			},
			tags: {
				type: "array",
				items: { type: "string" },
				description:
					'Tags for categorization (e.g., ["ui", "bug", "project:mobile-app"]). Use conventions like "project:name" for grouping.',
			},
		},
		async (args: unknown) => {
			const input = CreateTaskInput.parse(args);
			const taskId = generateTaskId();
			const sessionToken = generateSessionToken();
			const sessionTokenHash = hashSessionToken(sessionToken);
			const now = Date.now();

			const repo = input.repo || getRepositoryFullName() || undefined;
			if (repo && !input.repo) {
				logger.info(
					{ repo },
					"Auto-detected repository from current directory",
				);
			}

			logger.info({ taskId, title: input.title, repo }, "Creating task");

			/** Get owner identity */
			const ownerId = await getGitHubUsername();
			logger.info({ ownerId }, "GitHub username for task ownership");

			/** Create task document */
			const taskResult = await getOrCreateTaskDocument(taskId);
			if (!taskResult.success) {
				return {
					content: [{ type: "text", text: taskResult.error }],
					isError: true,
				};
			}
			const { doc, meta: _meta } = taskResult;

			/** Initialize metadata */
			const meta = doc.meta;
			meta.id = taskId;
			meta.title = input.title;
			meta.status = "pending_review";
			meta.createdAt = now;
			meta.updatedAt = now;
			meta.ownerId = ownerId;
			meta.sessionTokenHash = sessionTokenHash;
			meta.epoch = 1;
			meta.repo = repo ?? null;

			if (input.tags) {
				const tagsContainer = meta.tags;
				for (const tag of input.tags) {
					tagsContainer.push(tag);
				}
			}

			/** Log task created event */
			doc.logEvent("task_created", ownerId);

			/*
			 * TODO: Parse markdown content and extract deliverables
			 * For now, store raw content and extract deliverables later
			 * const blocks = await parseMarkdownToBlocks(input.content)
			 * extractDeliverables(blocks).forEach(d => doc.deliverables.push(d))
			 */

			/** Build task URL */
			const env = parseEnv();
			const url = `${env.WEB_URL}/tasks/${taskId}`;

			const envContext = getEnvironmentContext();
			const repoInfo = repo
				? `Repo: ${repo}${!input.repo ? " (auto-detected)" : ""}`
				: "Repo: Not set (provide repo and prNumber for artifact uploads)";

			return {
				content: [
					{
						type: "text",
						text: `Task created!
ID: ${taskId}
Session Token: ${sessionToken}
${repoInfo}
URL: ${url}
Context: ${envContext.projectName || "unknown"} / ${envContext.branch || "unknown"}

IMPORTANT: Save the session token - it's required for add_artifact calls.

Next steps:
1. Wait for human to review and approve the task in the browser
2. Once approved, use add_artifact to upload proof for each deliverable
3. When all deliverables have artifacts, the task auto-completes with a snapshot URL`,
					},
				],
			};
		},
	);
}
