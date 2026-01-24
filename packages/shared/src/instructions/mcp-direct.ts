/**
 * MCP-direct instructions for platforms without hook support.
 * These are for Cursor, Windsurf, Claude Desktop, and other MCP-only clients.
 * Users must call MCP tools directly (createPlan, addArtifact, etc.).
 */

import {
  ARTIFACT_TYPES_SECTION,
  CRITICAL_USAGE_SECTION,
  DELIVERABLES_SECTION,
  TIPS_SECTION,
  TROUBLESHOOTING_SECTION,
  WHEN_NOT_TO_USE_SECTION,
} from './common.js';

export const MCP_DIRECT_HEADER = `# Shipyard: Verified Work Tasks

> **MCP Integration:** Use \`execute_code\` to call Shipyard APIs. This skill teaches the workflow.

Shipyard turns invisible agent work into reviewable, verifiable tasks. Instead of trusting that code was written correctly, reviewers see screenshots, videos, and test results as proof.`;

export const MCP_TOOLS_OVERVIEW = `## Available MCP Tools

| Tool | Purpose |
|------|---------|
| \`execute_code\` | Run TypeScript that calls Shipyard APIs (recommended) |
| \`request_user_input\` | Ask user questions via browser modal |

**Preferred approach:** Use \`execute_code\` to chain multiple API calls in one step.`;

export const MCP_WORKFLOW = `## Workflow (MCP Direct)

### Step 1: Create Plan

\`\`\`typescript
const plan = await createPlan({
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

const { planId, sessionToken, deliverables, monitoringScript } = plan;
// deliverables = [{ id: "del_xxx", text: "Screenshot of login page" }, ...]
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
const status = await readPlan(planId, sessionToken);
if (status.status === "in_progress") {
  // Approved! Proceed with work
}
if (status.status === "changes_requested") {
  // Read feedback, make changes
}
\`\`\`

### Step 3: Do the Work

Implement the feature, taking screenshots/recordings as you go.

### Step 4: Upload Artifacts

\`\`\`typescript
await addArtifact({
  planId,
  sessionToken,
  type: 'screenshot',
  filename: 'login-page.png',
  source: 'file',
  filePath: '/path/to/screenshot.png',
  deliverableId: deliverables[0].id  // Links to specific deliverable
});

const result = await addArtifact({
  planId,
  sessionToken,
  type: 'screenshot',
  filename: 'error-handling.png',
  source: 'file',
  filePath: '/path/to/error.png',
  deliverableId: deliverables[1].id
});

// Auto-complete triggers when ALL deliverables have artifacts
if (result.allDeliverablesComplete) {
  console.log('Done!', result.snapshotUrl);
}
\`\`\``;

export const API_REFERENCE = `## API Reference

### createPlan(options)

Creates a new plan and opens it in the browser.

**Parameters:**
- \`title\` (string) - Plan title
- \`content\` (string) - Markdown content with \`{#deliverable}\` markers
- \`repo\` (string, optional) - GitHub repo for artifact storage
- \`prNumber\` (number, optional) - PR number to link

**Returns:** \`{ planId, sessionToken, url, deliverables, monitoringScript }\`

### readPlan(planId, sessionToken, options?)

Reads current plan state.

**Parameters:**
- \`planId\` (string) - Plan ID
- \`sessionToken\` (string) - Session token from createPlan
- \`options.includeAnnotations\` (boolean) - Include reviewer comments

**Returns:** \`{ content, status, title, deliverables }\`

### addArtifact(options)

Uploads proof-of-work artifact.

**Parameters:**
- \`planId\` (string) - Plan ID
- \`sessionToken\` (string) - Session token
- \`type\` ('screenshot' | 'video' | 'test_results' | 'diff')
- \`filename\` (string) - File name
- \`source\` ('file' | 'url' | 'base64')
- \`filePath\` (string) - Local file path (when source='file')
- \`deliverableId\` (string, optional) - Links artifact to deliverable

**Returns:** \`{ artifactId, url, allDeliverablesComplete, snapshotUrl? }\`

### requestUserInput(options)

Asks user a question via browser modal.

**Parameters:**
- \`message\` (string) - Question to ask
- \`type\` ('text' | 'choice' | 'confirm' | 'multiline')
- \`options\` (string[], for 'choice') - Available choices
- \`timeout\` (number, optional) - Timeout in seconds

**Returns:** \`{ success, response?, status }\`

**Response format:**
- All responses are strings
- Multi-select: \`"option1, option2"\` (comma-space separated)
- Confirm: \`"yes"\` or \`"no"\` (lowercase)
- See docs/INPUT-RESPONSE-FORMATS.md for details`;

export const HANDLING_FEEDBACK = `## Handling Reviewer Feedback

\`\`\`typescript
const status = await readPlan(planId, sessionToken, {
  includeAnnotations: true
});

if (status.status === "changes_requested") {
  // Read the content for inline comments
  console.log(status.content);

  // Make changes based on feedback
  // Upload new artifacts
  // Plan will transition back to pending_review
}
\`\`\``;

/**
 * Complete MCP-direct instructions for SKILL.md and other non-hook platforms.
 */
export const MCP_DIRECT_INSTRUCTIONS = [
  MCP_DIRECT_HEADER,
  '',
  CRITICAL_USAGE_SECTION,
  '',
  MCP_TOOLS_OVERVIEW,
  '',
  MCP_WORKFLOW,
  '',
  DELIVERABLES_SECTION,
  '',
  ARTIFACT_TYPES_SECTION,
  '',
  API_REFERENCE,
  '',
  HANDLING_FEEDBACK,
  '',
  TIPS_SECTION,
  '',
  WHEN_NOT_TO_USE_SECTION,
  '',
  TROUBLESHOOTING_SECTION,
].join('\n');
