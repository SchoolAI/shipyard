/**
 * MCP-direct instructions for platforms without hook support.
 * These are for Cursor, Windsurf, Claude Desktop, and other MCP-only clients.
 * Users must call MCP tools directly (createTask, addArtifact, etc.).
 */

import {
	ARTIFACT_TYPES_SECTION,
	CRITICAL_USAGE_SECTION,
	DELIVERABLES_SECTION,
	TIPS_SECTION,
	TROUBLESHOOTING_SECTION,
	USER_INPUT_SECTION,
	WHEN_NOT_TO_USE_SECTION,
} from "./common.js";
import { TOOL_NAMES } from "./tool-names.js";

export const MCP_DIRECT_HEADER = `# Shipyard: Your Agent Management Hub

> **Shipyard is the central interface where humans manage AI agents.** Tasks, artifacts, feedback, and communication all happen here.

Shipyard turns invisible agent work into reviewable, verifiable tasks. Instead of trusting that code was written correctly, reviewers see screenshots, videos, and test results as proof.

**Key principle:** When you're working in Shipyard, ALL human-agent communication should happen through \`requestUserInput()\` inside \`${TOOL_NAMES.EXECUTE_CODE}\`. The human is already in the browser viewing your task - that's where they expect to interact with you.`;

export const MCP_TOOLS_OVERVIEW = `## Available MCP Tools

| Tool | Purpose |
|------|---------|
| \`${TOOL_NAMES.EXECUTE_CODE}\` | Run TypeScript that calls ALL Shipyard APIs including \`requestUserInput()\` |

### requestUserInput(): Your Direct Line to the Human

This is how you talk to humans during active work. Don't use your platform's built-in question tools (AskUserQuestion, etc.) - use \`requestUserInput()\` inside \`${TOOL_NAMES.EXECUTE_CODE}\` instead. The human is in the browser viewing your task, and that's where they expect to see your questions.

All Shipyard operations (createTask, addArtifact, requestUserInput, etc.) are available inside \`${TOOL_NAMES.EXECUTE_CODE}\`.`;

export const MCP_WORKFLOW = `## Workflow (MCP Direct)

### Step 1: Create Task

\`\`\`typescript
const task = await createTask({
  title: "Add user authentication",
  content: \`
## Deliverables
- [ ] Screenshot of login page {#deliverable}
- [ ] Screenshot of error handling {#deliverable}

## Implementation
1. Create login form component
2. Add validation
3. Connect to auth API
\`
});

const { taskId, sessionToken, deliverables, monitoringScript } = task;
/** deliverables = [{ id: "del_xxx", text: "Screenshot of login page" }, ...] */
\`\`\`

### Step 2: Wait for Approval

For platforms without hooks, run the monitoring script in the background:

\`\`\`bash
# The monitoringScript polls for approval status
# Run it in background while you wait
bash <(echo "$monitoringScript") &
\`\`\`

Or poll manually:

\`\`\`typescript
const status = await readTask(taskId, sessionToken);
if (status.status === "in_progress") {
  /** Approved! Proceed with work */
}
if (status.status === "changes_requested") {
  /** Read feedback, make changes */
}
\`\`\`

### Step 3: Do the Work

Implement the feature, taking screenshots/recordings as you go.

### Step 4: Upload Artifacts

\`\`\`typescript
await addArtifact({
  taskId,
  sessionToken,
  type: 'image',
  filename: 'login-page.png',
  source: 'file',
  filePath: '/path/to/screenshot.png',
  deliverableId: deliverables[0].id
});

const result = await addArtifact({
  taskId,
  sessionToken,
  type: 'image',
  filename: 'error-handling.png',
  source: 'file',
  filePath: '/path/to/error.png',
  deliverableId: deliverables[1].id
});

/** Auto-complete triggers when ALL deliverables have artifacts */
if (result.allDeliverablesComplete) {
  console.log('Done!', result.snapshotUrl);
}
\`\`\``;

export const API_REFERENCE = `## API Reference (inside execute_code)

### createTask(options)

Creates a new task and opens it in the browser.

**Parameters:**
- \`title\` (string) - Task title
- \`content\` (string) - Markdown content with \`{#deliverable}\` markers
- \`repo\` (string, optional) - GitHub repo for artifact storage
- \`prNumber\` (number, optional) - PR number to link

**Returns:** \`{ taskId, sessionToken, url, deliverables, monitoringScript }\`

### readTask(taskId, sessionToken, options?)

Reads current task state.

**Parameters:**
- \`taskId\` (string) - Task ID
- \`sessionToken\` (string) - Session token from createTask
- \`options.includeAnnotations\` (boolean) - Include reviewer comments

**Returns:** \`{ content, status, title, deliverables }\`

### addArtifact(options)

Uploads proof-of-work artifact.

**Parameters:**
- \`taskId\` (string) - Task ID
- \`sessionToken\` (string) - Session token
- \`type\` ('html' | 'image' | 'video')
- \`filename\` (string) - File name
- \`source\` ('file' | 'url' | 'base64')
- \`filePath\` (string) - Local file path (when source='file')
- \`deliverableId\` (string, optional) - Links artifact to deliverable

**Returns:** \`{ artifactId, url, allDeliverablesComplete, snapshotUrl? }\`

### requestUserInput(options)

**THE primary human-agent communication channel.** Asks user a question via browser modal.

**IMPORTANT: Always RETURN the response value in your execute_code result.**

✅ **RECOMMENDED (primary pattern):**
\`\`\`typescript
const result = await requestUserInput({ message: "Which database?", type: "choice", options: ["PostgreSQL", "SQLite"] });
return { userChoice: result.response, status: result.status };
// Clean, structured output appears once in the final result
\`\`\`

⚠️ **AVOID (use only for debugging):**
\`\`\`typescript
console.log(\\\`User chose: \\\${result.response}\\\`);
// Clutters output, not structured
\`\`\`

**Two modes - choose based on dependencies:**

**Multi-step (dependencies):** Chain calls when later questions depend on earlier answers
\`\`\`typescript
const db = await requestUserInput({ message: "Database?", type: "choice", options: ["PostgreSQL", "SQLite"] });
const port = await requestUserInput({ message: \\\`Port for \\\${db.response}?\\\`, type: "number" });
return { database: db.response, port: port.response };
\`\`\`

**Multi-form (independent):** Single call for unrelated questions
\`\`\`typescript
const config = await requestUserInput({
  questions: [
    { message: "Project name?", type: "text" },
    { message: "Use TypeScript?", type: "confirm" }
  ]
});
return { config: config.response };
\`\`\`

**Parameters (single-question mode):**
- \`message\` (string) - Question to ask
- \`type\` (string) - Input type (see below)
- \`options\` (string[], for 'choice') - Available choices
- \`timeout\` (number, optional) - Timeout in seconds
- Type-specific parameters (min, max, format, etc.)

**Parameters (multi-question mode):**
- \`questions\` (array) - Array of 1-10 questions (8 recommended)
- \`timeout\` (number, optional) - Timeout in seconds

**Returns:** \`{ success, response?, status }\`

**Supported types (8 total):**
1. \`text\` - Single-line text
2. \`multiline\` - Multi-line text area
3. \`choice\` - Radio/checkbox/dropdown (auto-adds "Other" option)
4. \`confirm\` - Yes/No buttons
5. \`number\` - Numeric input with validation
6. \`email\` - Email validation
7. \`date\` - Date picker with range
8. \`rating\` - Scale rating`;

export const HANDLING_FEEDBACK = `## Handling Reviewer Feedback

\`\`\`typescript
const status = await readTask(taskId, sessionToken, {
  includeAnnotations: true
});

if (status.status === "changes_requested") {
  /** Read the content for inline comments */
  console.log(status.content);

  /**
   * Make changes based on feedback
   * Upload new artifacts
   * Task will transition back to pending_review
   */
}
\`\`\``;

/**
 * Complete MCP-direct instructions for SKILL.md and other non-hook platforms.
 */
export const MCP_DIRECT_INSTRUCTIONS = [
	MCP_DIRECT_HEADER,
	"",
	CRITICAL_USAGE_SECTION,
	"",
	USER_INPUT_SECTION,
	"",
	MCP_TOOLS_OVERVIEW,
	"",
	MCP_WORKFLOW,
	"",
	DELIVERABLES_SECTION,
	"",
	ARTIFACT_TYPES_SECTION,
	"",
	API_REFERENCE,
	"",
	HANDLING_FEEDBACK,
	"",
	TIPS_SECTION,
	"",
	WHEN_NOT_TO_USE_SECTION,
	"",
	TROUBLESHOOTING_SECTION,
].join("\n");
