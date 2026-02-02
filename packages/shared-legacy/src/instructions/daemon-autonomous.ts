/**
 * Instructions for agents spawned by the Shipyard daemon.
 * These agents run autonomously (not in interactive task mode).
 *
 * Key difference from claude-code.ts:
 * - No task mode workflow (Shift+Tab)
 * - No ExitPlanMode approval blocking
 * - Agent works directly on existing task created by browser
 */

import {
	ARTIFACT_TYPES_SECTION,
	DELIVERABLES_SECTION,
	TIPS_SECTION,
	USER_INPUT_SECTION,
	WHEN_NOT_TO_USE_SECTION,
} from "./common.js";
import { TOOL_NAMES } from "./tool-names.js";

export const AUTONOMOUS_HEADER = `[SHIPYARD AUTONOMOUS AGENT]`;

export const AUTONOMOUS_WORKFLOW = `## Workflow

You are running autonomously to complete a Shipyard task that was already created.

### Critical Instructions

1. **DO NOT create a new task** - You are ALREADY in an existing task
2. **Read the task first** - Call \`${TOOL_NAMES.READ_TASK}(taskId, sessionToken)\` to see what to build
3. **Work autonomously** - Don't wait for approval, just do the work
4. **Upload artifacts** - Call \`${TOOL_NAMES.ADD_ARTIFACT}(...)\` for each deliverable as you complete them
5. **Use \`requestUserInput()\`** - If you need clarification, ask via browser modal (inside \`${TOOL_NAMES.EXECUTE_CODE}\`)

### Step-by-Step

\`\`\`typescript
// 1. Read the task to understand what to build
const task = await readTask(taskId, sessionToken);
// Returns: { content, deliverables: [{ id, text, completed }], status, ... }

// 2. Do the work described in task.content
// ... implement the feature, build the app, etc ...

// 3. Upload artifacts as you go
await addArtifact({
  taskId,
  sessionToken,
  type: 'image',
  filename: 'screenshot.png',
  source: 'file',
  filePath: '/tmp/screenshot.png',
  deliverableId: task.deliverables[0].id,
  description: 'Screenshot of working feature'
});

// 4. Repeat for all deliverables
// When the last deliverable gets an artifact, task auto-completes
\`\`\``;

export const IMPORTANT_NOTES = `## Important Notes

- **DO NOT call \`createTask()\`** - The task already exists, you're working on it
- **DO NOT use the Shipyard skill** - These instructions are everything you need
- **DO use \`${TOOL_NAMES.EXECUTE_CODE}\`** - All Shipyard APIs are available inside it
- **DO use \`requestUserInput()\`** - For asking questions during work
- **Working directory** - Save temporary files to your cwd, they'll be available for upload`;

export const CONTEXT_SECTION = (
	taskId: string,
	taskUrl: string,
) => `## Your Task Context

- **Task ID**: ${taskId}
- **Session Token**: Available via \`${TOOL_NAMES.READ_TASK}()\` or in environment
- **Browser View**: ${taskUrl}
- **Environment Variable**: SHIPYARD_TASK_ID=${taskId}

The human created this task in the browser and is viewing your progress at the URL above.`;

/**
 * Complete instructions for daemon-spawned autonomous agents.
 * Replaces task mode workflow with direct MCP tool usage.
 */
export function buildDaemonInstructions(
	taskId: string,
	taskUrl: string,
): string {
	return [
		AUTONOMOUS_HEADER,
		"",
		CONTEXT_SECTION(taskId, taskUrl),
		"",
		AUTONOMOUS_WORKFLOW,
		"",
		USER_INPUT_SECTION,
		"",
		DELIVERABLES_SECTION,
		"",
		ARTIFACT_TYPES_SECTION,
		"",
		IMPORTANT_NOTES,
		"",
		TIPS_SECTION,
		"",
		WHEN_NOT_TO_USE_SECTION,
	].join("\n");
}
