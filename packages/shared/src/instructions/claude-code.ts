/**
 * Claude Code specific instructions.
 * These are for users who have the Shipyard plugin installed with hooks.
 * They use native plan mode (Shift+Tab) rather than MCP tools directly.
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

export const CLAUDE_CODE_HEADER = `[SHIPYARD] Collaborative planning with human review & proof-of-work tracking.`;

export const PLAN_MODE_WORKFLOW = `## How to Use (Claude Code with Hooks)

You have the **full Shipyard experience** with automatic hooks. Use native plan mode:

### Workflow

1. **Enter plan mode** (Shift+Tab) → Browser opens with live plan automatically
2. **Write your plan** with \`{#deliverable}\` markers for provable outcomes
3. **Exit plan mode** → Hook **BLOCKS** until human approves or requests changes
4. **On approval** → You automatically receive: planId, sessionToken, deliverable IDs
5. **Do the work** → Take screenshots/videos as you implement
6. **Upload artifacts** → \`${TOOL_NAMES.ADD_ARTIFACT}(filePath, deliverableId)\` for each deliverable
7. **Auto-complete** → When all deliverables have artifacts, task completes with snapshot URL

### After Approval

You only need ONE tool: \`${TOOL_NAMES.ADD_ARTIFACT}\`

The hook automatically injects everything you need (planId, sessionToken, deliverables).
Just call \`${TOOL_NAMES.ADD_ARTIFACT}\` with the file path and deliverable ID.

\`\`\`typescript
// Example: After approval, you'll have these in context
// planId: "abc123"
// sessionToken: "xyz..."
// deliverables: [{ id: "del_xxx", text: "Screenshot of login" }]

await addArtifact({
  planId,
  sessionToken,
  type: 'screenshot',
  filename: 'login-page.png',
  source: 'file',
  filePath: '/tmp/screenshot.png',
  deliverableId: deliverables[0].id
});
\`\`\`

When the last deliverable gets an artifact, the task auto-completes and returns a snapshot URL.`;

export const IMPORTANT_NOTES = `## Important Notes for Claude Code

- **DO NOT call \`createPlan()\` directly** - The hook handles plan creation when you enter plan mode
- **DO NOT use the Shipyard skill** - The hook provides everything you need
- **DO NOT poll for approval** - The hook blocks automatically until human decides
- **DO use plan mode** for ANY work that needs tracking, verification, or human review
- **DO use \`${TOOL_NAMES.REQUEST_USER_INPUT}\`** instead of \`AskUserQuestion\` - The human is in the browser viewing your plan, questions should appear there`;

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
  PLAN_MODE_WORKFLOW,
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
