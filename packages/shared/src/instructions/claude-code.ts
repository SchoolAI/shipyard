/**
 * Claude Code specific instructions.
 * These are for users who have the Shipyard plugin installed with hooks.
 * They use native task mode (Shift+Tab) rather than MCP tools directly.
 */

import {
  ARTIFACT_TYPES_SECTION,
  CRITICAL_USAGE_SECTION,
  DELIVERABLES_SECTION,
  TIPS_SECTION,
  TROUBLESHOOTING_SECTION,
  USER_INPUT_SECTION,
  WHEN_NOT_TO_USE_SECTION,
} from './common.js';
import { TOOL_NAMES } from './tool-names.js';

export const CLAUDE_CODE_HEADER = `[SHIPYARD] Collaborative task management with human review & proof-of-work tracking.`;

export const TASK_MODE_WORKFLOW = `## How to Use (Claude Code with Hooks)

You have the **full Shipyard experience** with automatic hooks. Use native task mode:

### Workflow

1. **Enter task mode** (Shift+Tab) → Browser opens with live task automatically
2. **Write your task** with \`{#deliverable}\` markers for provable outcomes
3. **Exit task mode** → Hook **BLOCKS** until human approves or requests changes
4. **On approval** → You automatically receive: taskId, sessionToken, deliverable IDs
5. **Do the work** → Take screenshots/videos as you implement
6. **Upload artifacts** → \`${TOOL_NAMES.ADD_ARTIFACT}(filePath, deliverableId)\` for each deliverable
7. **Auto-complete** → When all deliverables have artifacts, task completes with snapshot URL

### After Approval

You only need ONE tool: \`${TOOL_NAMES.ADD_ARTIFACT}\`

The hook automatically injects everything you need (taskId, sessionToken, deliverables).
Just call \`${TOOL_NAMES.ADD_ARTIFACT}\` with the file path and deliverable ID.

\`\`\`typescript
/**
 * Example: After approval, you'll have these in context
 * taskId: "abc123"
 * sessionToken: "xyz..."
 * deliverables: [{ id: "del_xxx", text: "Screenshot of login" }]
 */

await addArtifact({
  taskId,
  sessionToken,
  type: 'image',
  filename: 'login-page.png',
  source: 'file',
  filePath: '/tmp/screenshot.png',
  deliverableId: deliverables[0].id
});
\`\`\`

When the last deliverable gets an artifact, the task auto-completes and returns a snapshot URL.`;

export const POSTING_UPDATES_SECTION = `## Posting Progress Updates

For long-running tasks, keep reviewers informed with periodic updates:

\`\`\`typescript
await postUpdate({
  taskId,
  sessionToken,
  message: "Starting work on authentication module"
});
\`\`\`

**When to post updates:**
- After completing a significant milestone
- When switching focus to a different part of the task
- If you've been working for a while without visible output
- When you encounter something interesting or unexpected

Think about what a human watching your work would want to know.`;

export const IMPORTANT_NOTES = `## Important Notes for Claude Code

- **DO NOT call \`createTask()\` directly** - The hook handles task creation when you enter task mode
- **DO NOT use the Shipyard skill** - The hook provides everything you need
- **DO NOT poll for approval** - The hook blocks automatically until human decides
- **DO use task mode** for ANY work that needs tracking, verification, or human review
- **DO use \`requestUserInput()\`** inside \`${TOOL_NAMES.EXECUTE_CODE}\` instead of \`AskUserQuestion\` - The human is in the browser viewing your task, questions should appear there`;

/**
 * Complete Claude Code instructions for SessionStart hook injection.
 * This replaces the need for a separate skill in Claude Code.
 */
export const CLAUDE_CODE_INSTRUCTIONS = [
  CLAUDE_CODE_HEADER,
  '',
  CRITICAL_USAGE_SECTION,
  '',
  USER_INPUT_SECTION,
  '',
  TASK_MODE_WORKFLOW,
  '',
  POSTING_UPDATES_SECTION,
  '',
  DELIVERABLES_SECTION,
  '',
  ARTIFACT_TYPES_SECTION,
  '',
  IMPORTANT_NOTES,
  '',
  TIPS_SECTION,
  '',
  WHEN_NOT_TO_USE_SECTION,
  '',
  TROUBLESHOOTING_SECTION,
].join('\n');
