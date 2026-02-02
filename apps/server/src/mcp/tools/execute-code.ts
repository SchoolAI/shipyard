/**
 * MCP Tool: execute_code
 *
 * Executes JavaScript code in a sandboxed VM with access to task APIs.
 * This is the main tool agents use to interact with the task document.
 *
 * Ported from apps/server-legacy/src/tools/execute-code.ts
 *
 * @see docs/whips/daemon-mcp-server-merge.md#mcp-tools
 */

import { z } from "zod";
import { logger } from "../../utils/logger.js";
import type { McpServer } from "../index.js";
import {
	createSandboxContext,
	executeInSandbox,
	serializeError,
} from "../sandbox/index.js";

/** Tool name constant */
const TOOL_NAME = "execute_code";

/** Input validation schema */
const ExecuteCodeInput = z.object({
	code: z.string().describe("TypeScript code to execute"),
});

/** Bundled documentation for LLM */
const BUNDLED_DOCS = `Execute TypeScript code that calls Shipyard APIs. Use this for multi-step workflows to reduce round-trips.

⚠️ IMPORTANT LIMITATION: Dynamic imports (\`await import()\`) are NOT supported in the VM execution context. Use only the pre-provided functions in the execution environment (createTask, readTask, readDiffComments, updateTask, addArtifact, completeTask, updateBlockContent, linkPR, replyToThreadComment, replyToDiffComment, requestUserInput, regenerateSessionToken, postUpdate). All necessary APIs are already available in the sandbox.

⚠️ NO process.env ACCESS: The sandbox does NOT have access to \`process.env\`. Session tokens are returned from \`createTask()\` and must be passed explicitly to subsequent API calls. If you lose your session token, use \`regenerateSessionToken(taskId)\` to get a new one.

## Available APIs

### createTask(opts): Promise<{ taskId, sessionToken, url, deliverables, monitoringScript }>
Create a new task and open it in browser.

Parameters:
- title (string, required): Task title
- content (string, required): Markdown content. Use \`{#deliverable}\` on checkbox items.
- repo (string, optional): GitHub repo (org/repo). Auto-detected if not provided.
- prNumber (number, optional): PR number for artifact uploads.

Returns:
- taskId: The task ID
- sessionToken: Required for subsequent API calls
- url: Browser URL for the task
- deliverables: Array of { id, text } for linking artifacts
- monitoringScript: Bash script to poll for approval (for non-hook agents)

---

### readTask(taskId, sessionToken, opts?): Promise<ReadTaskResult>
Read task content, metadata, and deliverables.

---

### updateTask(taskId, sessionToken, updates): Promise<{ success, monitoringScript }>
Update task metadata.

---

### addArtifact(opts): Promise<{ artifactId, url, allDeliverablesComplete, snapshotUrl? }>
Upload proof-of-work artifact.

Parameters:
- taskId (string): The task ID
- sessionToken (string): Session token
- type (string): 'html' | 'image' | 'video'
- filename (string): e.g., "screenshot.png"
- source (string): Content source type - 'file' | 'url' | 'base64'
- filePath (string): Local file path (required when source='file') - RECOMMENDED
- deliverableId (string, optional): Links artifact to deliverable

---

### completeTask(taskId, sessionToken, summary?): Promise<{ snapshotUrl }>
Force-complete task. Usually NOT needed - addArtifact auto-completes.

---

### requestUserInput(opts): Promise<{ success, response?, status, reason? }>
Request input from the user via browser modal.

**THE primary human-agent communication channel in Shipyard.** ALWAYS use this instead of platform-specific question tools.

Supported input types: text, multiline, choice, confirm, number, email, date, rating

---

### regenerateSessionToken(taskId): Promise<{ sessionToken, taskId }>
Regenerate the session token for a task you own.

## Common Pattern

\`\`\`typescript
const task = await createTask({
  title: "Feature X",
  content: "- [ ] Screenshot {#deliverable}"
});

await addArtifact({
  taskId: task.taskId,
  sessionToken: task.sessionToken,
  type: 'image',
  source: 'file',
  filename: 'screenshot.png',
  filePath: './screenshot.png',
  deliverableId: task.deliverables[0].id
});
\`\`\`
`;

/**
 * Register the execute_code tool.
 */
export function registerExecuteCodeTool(server: McpServer): void {
	server.tool(
		TOOL_NAME,
		BUNDLED_DOCS,
		{
			code: {
				type: "string",
				description:
					"TypeScript code to execute with access to all Shipyard APIs",
			},
		},
		async (args: unknown) => {
			const { code } = ExecuteCodeInput.parse(args);

			logger.info({ codeLength: code.length }, "Executing code");

			try {
				/** Create sandbox context with all APIs */
				const context = createSandboxContext();

				/** Execute the code */
				const result = await executeInSandbox(code, context);

				logger.info({ result }, "Code execution complete");

				const content: Array<{ type: string; text: string }> = [
					{
						type: "text",
						text:
							typeof result === "object"
								? JSON.stringify(result, null, 2)
								: String(result ?? "Done"),
					},
				];

				return { content };
			} catch (error) {
				const { details, message, stack } = await serializeError(error);
				logger.error({ error: details, code }, "Code execution failed");

				const errorText = stack
					? `Execution error: ${message}\n\nStack trace:\n${stack}`
					: `Execution error: ${message}`;

				return {
					content: [{ type: "text", text: errorText }],
					isError: true,
				};
			}
		},
	);
}
