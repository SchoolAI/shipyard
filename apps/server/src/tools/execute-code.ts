import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vm from 'node:vm';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import {
  type CreateChoiceInputParams,
  type CreateConfirmInputParams,
  type CreateDateInputParams,
  type CreateEmailInputParams,
  type CreateInputRequestParams,
  type CreateMultilineInputParams,
  type CreateNumberInputParams,
  type CreateRatingInputParams,
  type CreateTextInputParams,
  getArtifacts,
  getDeliverables,
  getPlanMetadata,
  PLAN_INDEX_DOC_NAME,
  type Question,
} from '@shipyard/schema';
import { z } from 'zod';
import { registryConfig } from '../config/env/registry.js';
import { getOrCreateDoc } from '../doc-store.js';
import { logger } from '../logger.js';
import { addArtifactTool } from './add-artifact.js';

/**
 * Extract text from MCP tool result content.
 * MCP tools return { content: [{ type: 'text', text: string }] }.
 */
function getToolResultText(result: { content: unknown[] }): string {
  const first = result.content[0];
  if (!first || typeof first !== 'object') return '';
  const record = Object.fromEntries(Object.entries(first));
  const text = record.text;
  return typeof text === 'string' ? text : '';
}

import { completeTaskTool } from './complete-task.js';
import { createTaskTool } from './create-task.js';
import { linkPRTool } from './link-pr.js';
import { readTaskTool } from './read-task.js';
import { regenerateSessionTokenTool } from './regenerate-session-token.js';
import { setupReviewNotificationTool } from './setup-review-notification.js';
import { TOOL_NAMES } from './tool-names.js';
import { updateBlockContentTool } from './update-block-content.js';
import { updateTaskTool } from './update-task.js';

const BUNDLED_DOCS = `Execute TypeScript code that calls Shipyard APIs. Use this for multi-step workflows to reduce round-trips.

⚠️ IMPORTANT LIMITATION: Dynamic imports (\`await import()\`) are NOT supported in the VM execution context. Use only the pre-provided functions in the execution environment (createTask, readTask, updateTask, addArtifact, completeTask, updateBlockContent, linkPR, requestUserInput, regenerateSessionToken). All necessary APIs are already available in the sandbox.

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

Example:
\`\`\`typescript
const task = await createTask({
  title: "Add auth",
  content: "- [ ] Screenshot of login {#deliverable}"
});
/** Returns: { taskId: "abc", sessionToken: "xyz", url: "...", deliverables: [...], monitoringScript: "#!/bin/bash..." } */

/**
 * For non-hook agents: Run the monitoring script in background to wait for approval
 * bash <(echo "$monitoringScript") &
 */
\`\`\`

---

### readTask(taskId, sessionToken, opts?): Promise<ReadTaskResult>
Read task content, metadata, and deliverables.

Parameters:
- taskId (string): The task ID
- sessionToken (string): Session token from createTask
- opts.includeAnnotations (boolean, optional): Include comment threads
- opts.includeLinkedPRs (boolean, optional): Include linked PRs section

Returns:
- content: Full markdown (with block IDs, annotations, and linked PRs if requested)
- status: Task status (e.g., "draft", "pending_review", "changes_requested")
- title: Task title
- repo: GitHub repo (if set)
- pr: PR number (if set)
- deliverables: Array of { id, text, completed }
- isError: Boolean

Example:
\`\`\`typescript
const data = await readTask(taskId, token, {
  includeAnnotations: true,
  includeLinkedPRs: true
});
if (data.status === "changes_requested") {
  /** Respond to feedback */
}
/** Access deliverables directly */
data.deliverables.forEach(d => console.log(d.id, d.completed));
\`\`\`

---

### updateTask(taskId, sessionToken, updates): Promise<{ success, monitoringScript }>
Update task metadata.

Parameters:
- taskId (string): The task ID
- sessionToken (string): Session token
- updates.title (string, optional): New title
- updates.status (string, optional): 'draft' | 'pending_review' | 'changes_requested' | 'in_progress'

Returns:
- success: Boolean indicating update succeeded
- monitoringScript: Bash script to poll for approval (for non-hook agents)

Note: Most status transitions are automatic. Rarely needed.

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
- contentUrl (string): URL to fetch from (required when source='url')
- content (string): Base64 encoded (required when source='base64', legacy)
- deliverableId (string, optional): Links artifact to deliverable
- description (string, optional): What this artifact proves

Auto-complete: When ALL deliverables have artifacts, returns snapshotUrl.

Example:
\`\`\`typescript
const result = await addArtifact({
  taskId, sessionToken,
  type: 'screenshot',
  filename: 'login.png',
  source: 'file',
  filePath: '/tmp/screenshot.png',
  deliverableId: 'del_abc'
});
if (result.allDeliverablesComplete) {
  console.log('Done!', result.snapshotUrl);
}
\`\`\`

---

### completeTask(taskId, sessionToken, summary?): Promise<{ snapshotUrl }>
Force-complete task. Usually NOT needed - addArtifact auto-completes.

---

### updateBlockContent(taskId, sessionToken, operations): Promise<void>
Modify task content blocks.

Operations array items:
- { type: 'update', blockId: string, content: string }
- { type: 'insert', afterBlockId: string | null, content: string }
- { type: 'delete', blockId: string }
- { type: 'replace_all', content: string }

---

### linkPR(opts): Promise<{ prNumber, url, status, branch, title }>
Link a GitHub PR to a task.

Parameters:
- taskId (string): The task ID
- sessionToken (string): Session token
- prNumber (number): PR number to link
- branch (string, optional): Branch name (will be fetched if omitted)
- repo (string, optional): Repository override (org/repo). Uses task repo if omitted.

Returns:
- prNumber: The PR number
- url: PR URL
- status: 'draft' | 'open' | 'merged' | 'closed'
- branch: Branch name
- title: PR title

Example:
\`\`\`typescript
const pr = await linkPR({
  taskId, sessionToken,
  prNumber: 42
});
console.log('Linked:', pr.title, pr.status);
\`\`\`

---

### requestUserInput(opts): Promise<{ success, response?, status, reason? }>
Request input from the user via browser modal.

**THE primary human-agent communication channel in Shipyard.** ALWAYS use this instead of platform-specific question tools (AskUserQuestion, Cursor prompts, etc.). The human is in the browser viewing your task - that's where they expect to interact with you.

**IMPORTANT: Always RETURN the response value in your execute_code return object.**

✅ **RECOMMENDED (primary pattern):**
\`\`\`typescript
const result = await requestUserInput({ message: "Which database?", type: "choice", options: ["PostgreSQL", "SQLite"] });
return { userChoice: result.response, status: result.status };
// Clean, structured output appears once in the final result
\`\`\`

⚠️ **AVOID (noisy, use only for debugging):**
\`\`\`typescript
const result = await requestUserInput({ message: "Which database?", type: "choice", options: ["PostgreSQL", "SQLite"] });
console.log(\`User chose: \${result.response}\`);
// Clutters output, not structured, harder to parse
\`\`\`

Supports two modes - choose based on whether questions depend on each other:

**Multi-step mode (dependencies):** Chain multiple calls when later questions depend on earlier answers
\`\`\`typescript
// First ask about database...
const dbResult = await requestUserInput({
  message: "Which database?",
  type: "choice",
  options: ["PostgreSQL", "SQLite", "MongoDB"]
});

// ...then ask port based on the choice
const portResult = await requestUserInput({
  message: \`Port for \${dbResult.response}?\`,
  type: "number",
  min: 1000,
  max: 65535
});

// Return both responses in structured format
return { database: dbResult.response, port: portResult.response };
\`\`\`

**Multi-form mode (independent):** Single call with questions array for unrelated info
\`\`\`typescript
const config = await requestUserInput({
  questions: [
    { message: "Project name?", type: "text" },
    { message: "Use TypeScript?", type: "confirm" },
    { message: "License?", type: "choice", options: ["MIT", "Apache-2.0", "GPL-3.0"] }
  ],
  timeout: 600
});
// Return responses in structured format
// config.response = { "0": "my-app", "1": "yes", "2": "MIT" }
return { config: config.response };
\`\`\`

Parameters:
- message (string, required): The question to ask the user
- type (string, required): 'text' | 'multiline' | 'choice' | 'confirm' | 'number' | 'email' | 'date' | 'rating'
- options (string[], optional): For 'choice' type - available options (required for choice)
- multiSelect (boolean, optional): For 'choice' type - allow selecting multiple options (checkboxes)
- displayAs (string, optional): For 'choice' type - override automatic UI ('radio' | 'checkbox' | 'dropdown')
- defaultValue (string, optional): Pre-filled value for text/multiline inputs
- timeout (number, optional): Timeout in seconds (default: 1800, min: 10, max: 14400)
  - Simple yes/no or quick choices: 300-600 seconds (5-10 minutes)
  - Complex questions with code examples: 600-1200 seconds (10-20 minutes)
  - Default (1800 = 30 minutes) is suitable for most cases
  - Max (14400 = 4 hours) for extended user sessions
  - Note: System-level timeouts may cause earlier cancellation
- taskId (string, optional): Optional metadata to link request to task (for activity log filtering)
- min (number, optional): For 'number'/'rating' - minimum value
- max (number, optional): For 'number'/'rating' - maximum value
- format (string, optional): For 'number' - 'integer' | 'decimal' | 'currency' | 'percentage'
- minDate (string, optional): For 'date' - minimum date (YYYY-MM-DD)
- maxDate (string, optional): For 'date' - maximum date (YYYY-MM-DD)
- domain (string, optional): For 'email' - restrict to specific domain
- style (string, optional): For 'rating' - 'stars' | 'numbers' | 'emoji'
- labels (object, optional): For 'rating' - { low?: string, high?: string }

Returns:
- success: Boolean indicating if user responded
- response: User's answer (string - see format details below)
- status: 'answered' | 'declined' | 'cancelled'
- reason: Reason for failure (if success=false): 'cancelled' | timeout message

**Best Practice: Return the response in your execute_code result:**
\`\`\`typescript
if (result.success) {
  return { userAnswer: result.response, status: result.status };  // ✅ Structured output
}
// Avoid: console.log(\`Status: \${result.status}\`);  // ❌ Noisy, not structured
\`\`\`

Response format (all responses are strings):
- text/multiline: Raw string (multiline preserves newlines as \n)
- choice (single): Selected option string (e.g., "PostgreSQL")
- choice (multi): Comma-space separated (e.g., "PostgreSQL, SQLite")
- choice (other): Custom text entered by user (e.g., "Redis")
- confirm: "yes" or "no" (lowercase)
- number: Decimal representation (e.g., "42" or "3.14")
- email: Email address (e.g., "user@example.com")
- date: ISO 8601 date (e.g., "2026-01-24")
- rating: Integer as string (e.g., "4")
- See docs/INPUT-RESPONSE-FORMATS.md for complete format specification

The request appears as a modal in the browser. The function blocks until:
- User responds (success=true, status='answered')
- User declines (success=true, status='declined')
- Timeout occurs (success=false, status='cancelled')

## Supported Input Types (8 total)

All examples below show the recommended pattern of returning responses:

1. **text** - Single-line text input
\`\`\`typescript
const url = await requestUserInput({ message: "API endpoint URL?", type: "text" });
return { apiUrl: url.response };  // e.g., "https://api.example.com"
\`\`\`

2. **multiline** - Multi-line text area
\`\`\`typescript
const desc = await requestUserInput({ message: "Describe the bug:", type: "multiline" });
return { bugDescription: desc.response };
\`\`\`

3. **choice** - Select from options (auto-adds "Other" escape hatch)
\`\`\`typescript
const db = await requestUserInput({
  message: "Which database?",
  type: "choice",
  options: ["PostgreSQL", "SQLite", "MongoDB"]
});
return { database: db.response };  // e.g., "PostgreSQL"

// Multi-select example:
const features = await requestUserInput({
  message: "Which features?",
  type: "choice",
  options: ["Dark mode", "Offline support", "Analytics"],
  multiSelect: true
});
return { features: features.response };  // e.g., "Dark mode, Analytics"

// Dropdown example:
const country = await requestUserInput({
  message: "Select country:",
  type: "choice",
  options: ["USA", "Canada", "Mexico"],
  displayAs: "dropdown"
});
return { country: country.response };
\`\`\`

4. **confirm** - Yes/No confirmation
\`\`\`typescript
const deploy = await requestUserInput({ message: "Deploy to production?", type: "confirm" });
return { shouldDeploy: deploy.response === "yes" };  // response is "yes" or "no"
\`\`\`

5. **number** - Numeric input with validation
\`\`\`typescript
const port = await requestUserInput({
  message: "Port number?",
  type: "number",
  min: 1,
  max: 65535,
  format: "integer"
});
return { port: parseInt(port.response, 10) };  // e.g., 8080

const budget = await requestUserInput({
  message: "Budget amount?",
  type: "number",
  format: "currency"
});
return { budget: parseFloat(budget.response) };  // e.g., 1500.00
\`\`\`

6. **email** - Email address with validation
\`\`\`typescript
const contact = await requestUserInput({
  message: "Contact email?",
  type: "email",
  domain: "company.com"
});
return { contactEmail: contact.response };  // e.g., "user@company.com"
\`\`\`

7. **date** - Date selection with range
\`\`\`typescript
const deadline = await requestUserInput({
  message: "Project deadline?",
  type: "date",
  minDate: "2026-01-24",
  maxDate: "2026-12-31"
});
return { deadline: deadline.response };  // e.g., "2026-03-15"
\`\`\`

8. **rating** - Scale rating (auto-selects stars for <=5, numbers for >5)
\`\`\`typescript
const rating = await requestUserInput({
  message: "Rate this approach:",
  type: "rating",
  min: 1,
  max: 5,
  labels: { low: "Poor", high: "Excellent" }
});
return { rating: parseInt(rating.response, 10) };  // e.g., 4

// NPS scale example:
const nps = await requestUserInput({
  message: "NPS Score (0-10):",
  type: "rating",
  min: 0,
  max: 10,
  style: "numbers"
});
return { npsScore: parseInt(nps.response, 10) };  // e.g., 8
\`\`\`

---

### regenerateSessionToken(taskId): Promise<{ sessionToken, taskId }>
Regenerate the session token for a task you own.

USE WHEN:
- Your Claude Code session ended and you lost the original token
- You need to resume work on a task from a previous session
- The old token may have been compromised

REQUIREMENTS:
- You must be the task owner (verified via GitHub identity)
- The task must exist and have an ownerId set

Returns:
- sessionToken: New token for API calls
- taskId: The task ID

SECURITY:
- Only the task owner can regenerate tokens
- Old token is immediately invalidated
- GitHub identity verification happens on MCP server (via gh auth login)

Example:
\`\`\`typescript
/** Lost your session token? Regenerate it: */
const { sessionToken, taskId } = await regenerateSessionToken("abc123");

/** Now use the new token for operations */
await addArtifact({
  taskId,
  sessionToken,
  type: 'screenshot',
  filename: 'screenshot.png',
  source: 'file',
  filePath: '/tmp/screenshot.png',
  deliverableId: 'del_xxx'
});
\`\`\`

---

## Common Pattern

\`\`\`typescript
const task = await createTask({
  title: "Feature X",
  content: "- [ ] Screenshot {#deliverable}\\n- [ ] Video {#deliverable}"
});

/**
 * task includes: taskId, sessionToken, url, deliverables, monitoringScript
 * For non-hook agents: Run monitoringScript in background to wait for approval
 * The script polls and exits when human approves/rejects
 */

/** Do work, take screenshots... */

await addArtifact({
  taskId: task.taskId,
  sessionToken: task.sessionToken,
  type: 'screenshot',
  source: 'file',
  filename: 'screenshot.png',
  filePath: './screenshot.png',
  deliverableId: task.deliverables[0].id
});

const result = await addArtifact({
  taskId: task.taskId,
  sessionToken: task.sessionToken,
  type: 'video',
  source: 'file',
  filename: 'demo.mp4',
  filePath: './demo.mp4',
  deliverableId: task.deliverables[1].id
});

return { taskId: task.taskId, snapshotUrl: result.snapshotUrl };
\`\`\`
`;

const ExecuteCodeInput = z.object({
  code: z.string().describe('TypeScript code to execute'),
});

/**
 * NOTE: String array (not let) to work around TypeScript control flow issues
 * where reassignment in async handlers isn't detected.
 */
const scriptTracker: string[] = [];

async function createTask(opts: {
  title: string;
  content: string;
  repo?: string;
  prNumber?: number;
}) {
  const result = await createTaskTool.handler(opts);
  const text = getToolResultText(result);
  const taskId = text.match(/ID: (\S+)/)?.[1] || '';

  let deliverables: Array<{ id: string; text: string }> = [];
  if (taskId) {
    const ydoc = await getOrCreateDoc(taskId);
    const allDeliverables = getDeliverables(ydoc);
    deliverables = allDeliverables.map((d) => ({ id: d.id, text: d.text }));
  }

  const { script: monitoringScript } = await setupReviewNotification(taskId, 30);

  scriptTracker.push(`Task "${taskId}" created.\n\n${monitoringScript}`);

  return {
    taskId,
    sessionToken: text.match(/Session Token: (\S+)/)?.[1] || '',
    url: text.match(/URL: (\S+)/)?.[1] || '',
    deliverables,
    monitoringScript,
  };
}

async function readTask(
  taskId: string,
  sessionToken: string,
  opts?: { includeAnnotations?: boolean; includeLinkedPRs?: boolean }
) {
  const result = await readTaskTool.handler({
    taskId,
    sessionToken,
    includeAnnotations: opts?.includeAnnotations,
    includeLinkedPRs: opts?.includeLinkedPRs,
  });
  const text = getToolResultText(result);

  const ydoc = await getOrCreateDoc(taskId);
  const metadata = getPlanMetadata(ydoc);
  const deliverables = getDeliverables(ydoc).map((d) => ({
    id: d.id,
    text: d.text,
    completed: !!d.linkedArtifactId,
  }));

  return {
    content: text,
    status: metadata?.status || '',
    title: metadata?.title || '',
    repo: metadata?.repo,
    pr: metadata?.pr,
    deliverables,
    isError: result.isError,
  };
}

async function updateTask(
  taskId: string,
  sessionToken: string,
  updates: { title?: string; status?: string }
) {
  await updateTaskTool.handler({ taskId, sessionToken, ...updates });

  const { script: monitoringScript } = await setupReviewNotification(taskId, 30);

  scriptTracker.push(`Task "${taskId}" updated.\n\n${monitoringScript}`);

  return {
    success: true,
    monitoringScript,
  };
}

type AddArtifactOpts = {
  taskId: string;
  sessionToken: string;
  type: string;
  filename: string;
  description?: string;
  deliverableId?: string;
} & (
  | { source: 'file'; filePath: string }
  | { source: 'url'; contentUrl: string }
  | { source: 'base64'; content: string }
);

async function addArtifact(opts: AddArtifactOpts) {
  /** Map taskId to planId for backwards compatibility with add-artifact tool */
  const result = await addArtifactTool.handler({ ...opts, planId: opts.taskId });
  const text = getToolResultText(result);

  if (result.isError) {
    return { isError: true, error: text };
  }

  const ydoc = await getOrCreateDoc(opts.taskId);
  const artifacts = getArtifacts(ydoc);
  const deliverables = getDeliverables(ydoc);

  const addedArtifact = artifacts.find((a) => a.filename === opts.filename);

  const allDeliverablesComplete =
    deliverables.length > 0 && deliverables.every((d) => d.linkedArtifactId);

  const metadata = getPlanMetadata(ydoc);

  let artifactUrl = '';
  if (addedArtifact) {
    artifactUrl =
      addedArtifact.storage === 'github'
        ? addedArtifact.url
        : `http://localhost:${registryConfig.REGISTRY_PORT[0]}/artifacts/${addedArtifact.localArtifactId}`;
  }

  return {
    artifactId: addedArtifact?.id || '',
    url: artifactUrl,
    allDeliverablesComplete,
    snapshotUrl: metadata?.status === 'completed' ? metadata.snapshotUrl : undefined,
    isError: false,
  };
}

async function completeTask(taskId: string, sessionToken: string, summary?: string) {
  /** Map taskId to planId for backwards compatibility with complete-task tool */
  const result = await completeTaskTool.handler({ planId: taskId, sessionToken, summary });
  const text = getToolResultText(result);

  if (result.isError) {
    return { isError: true, error: text };
  }

  const ydoc = await getOrCreateDoc(taskId);
  const metadata = getPlanMetadata(ydoc);

  return {
    snapshotUrl: metadata?.status === 'completed' ? metadata.snapshotUrl || '' : '',
    status: metadata?.status || '',
    isError: false,
  };
}

async function updateBlockContent(
  taskId: string,
  sessionToken: string,
  operations: Array<{
    type: 'update' | 'insert' | 'delete' | 'replace_all';
    blockId?: string;
    afterBlockId?: string | null;
    content?: string;
  }>
) {
  /** Map taskId to planId for backwards compatibility with update-block-content tool */
  await updateBlockContentTool.handler({ planId: taskId, sessionToken, operations });
}

async function linkPR(opts: {
  taskId: string;
  sessionToken: string;
  prNumber: number;
  branch?: string;
  repo?: string;
}) {
  /** Map taskId to planId for backwards compatibility with link-pr tool */
  const result = await linkPRTool.handler({ ...opts, planId: opts.taskId });
  const text = getToolResultText(result);

  if (result.isError) {
    throw new Error(text);
  }

  const prNumber = opts.prNumber;
  const urlMatch = text.match(/URL: (https:\/\/[^\s]+)/);
  const statusMatch = text.match(/Status: (\w+)/);
  const branchMatch = text.match(/Branch: ([^\n]+)/);
  const titleMatch = text.match(/PR: #\d+ - ([^\n]+)/);

  return {
    prNumber,
    url: urlMatch?.[1] || '',
    status: statusMatch?.[1] || '',
    branch: branchMatch?.[1] || '',
    title: titleMatch?.[1] || '',
  };
}

async function setupReviewNotification(taskId: string, pollIntervalSeconds?: number) {
  const result = await setupReviewNotificationTool.handler({
    planId: taskId,
    pollIntervalSeconds: pollIntervalSeconds ?? 30,
  });
  const text = getToolResultText(result);

  const scriptMatch = text.match(/```bash\n([\s\S]*?)\n```/);
  const script = scriptMatch?.[1] || '';

  return { script, fullResponse: text };
}

/**
 * Request user input via browser modal.
 * Supports both single-question mode (message + type) and multi-question mode (questions array).
 */
async function requestUserInput(
  opts:
    | {
        /** Single-question mode */
        message: string;
        type: 'text' | 'choice' | 'confirm' | 'multiline' | 'number' | 'email' | 'date' | 'rating';
        options?: string[];
        multiSelect?: boolean;
        defaultValue?: string;
        timeout?: number;
        planId?: string;
        /** If true, this request is blocking the agent from proceeding. Shows as red/urgent. */
        isBlocker?: boolean;
        min?: number;
        max?: number;
        format?: 'integer' | 'decimal' | 'currency' | 'percentage';
        minDate?: string;
        maxDate?: string;
        domain?: string;
        style?: 'stars' | 'numbers' | 'emoji';
        labels?: { low?: string; high?: string };
        questions?: never;
      }
    | {
        /** Multi-question mode */
        questions: Question[];
        timeout?: number;
        planId?: string;
        /** If true, this request is blocking the agent from proceeding. Shows as red/urgent. */
        isBlocker?: boolean;
        message?: never;
        type?: never;
      }
) {
  const { InputRequestManager } = await import('../services/input-request-manager.js');

  /*
   * Always use plan-index doc so browser can see requests from all agents
   * Browser is already connected to plan-index for plan discovery
   */
  const ydoc = await getOrCreateDoc(PLAN_INDEX_DOC_NAME);

  const manager = new InputRequestManager();

  if ('questions' in opts && opts.questions) {
    const validQuestions = opts.questions.filter((q): q is NonNullable<typeof q> => q != null);
    if (validQuestions.length === 0) {
      throw new Error(
        'questions array is empty after filtering. Each question must be an object with "message" and "type" fields.'
      );
    }

    const requestId = await manager.createMultiQuestionRequest(ydoc, {
      questions: validQuestions,
      timeout: opts.timeout,
      planId: opts.planId,
      isBlocker: opts.isBlocker,
    });

    const result = await manager.waitForResponse(ydoc, requestId, opts.timeout);

    if (result.status === 'answered') {
      return {
        success: true as const,
        response: result.response,
        status: result.status,
        reason: undefined,
      };
    }

    if (result.status === 'declined') {
      return {
        success: false as const,
        response: undefined,
        status: result.status,
        reason: result.reason,
      };
    }

    return {
      success: false as const,
      response: undefined,
      status: result.status,
      reason: result.reason,
    };
  }

  let params: CreateInputRequestParams;

  switch (opts.type) {
    case 'choice':
      params = {
        message: opts.message,
        defaultValue: opts.defaultValue,
        timeout: opts.timeout,
        planId: opts.planId,
        isBlocker: opts.isBlocker,
        type: opts.type,
        options: opts.options ?? [],
        multiSelect: opts.multiSelect,
      } satisfies CreateChoiceInputParams;
      break;
    case 'number':
      params = {
        message: opts.message,
        defaultValue: opts.defaultValue,
        timeout: opts.timeout,
        planId: opts.planId,
        isBlocker: opts.isBlocker,
        type: opts.type,
        min: opts.min,
        max: opts.max,
        format: opts.format,
      } satisfies CreateNumberInputParams;
      break;
    case 'email':
      params = {
        message: opts.message,
        defaultValue: opts.defaultValue,
        timeout: opts.timeout,
        planId: opts.planId,
        isBlocker: opts.isBlocker,
        type: opts.type,
        domain: opts.domain,
      } satisfies CreateEmailInputParams;
      break;
    case 'date':
      params = {
        message: opts.message,
        defaultValue: opts.defaultValue,
        timeout: opts.timeout,
        planId: opts.planId,
        isBlocker: opts.isBlocker,
        type: opts.type,
        min: opts.minDate,
        max: opts.maxDate,
      } satisfies CreateDateInputParams;
      break;
    case 'rating':
      params = {
        message: opts.message,
        defaultValue: opts.defaultValue,
        timeout: opts.timeout,
        planId: opts.planId,
        isBlocker: opts.isBlocker,
        type: opts.type,
        min: opts.min,
        max: opts.max,
        style: opts.style,
        labels: opts.labels,
      } satisfies CreateRatingInputParams;
      break;
    default:
      params = {
        message: opts.message,
        defaultValue: opts.defaultValue,
        timeout: opts.timeout,
        planId: opts.planId,
        isBlocker: opts.isBlocker,
        type: opts.type,
      } satisfies CreateTextInputParams | CreateMultilineInputParams | CreateConfirmInputParams;
  }

  const requestId = await manager.createRequest(ydoc, params);

  const result = await manager.waitForResponse(ydoc, requestId, opts.timeout);

  if (result.status === 'answered') {
    return {
      success: true as const,
      response: result.response,
      status: result.status,
      reason: undefined,
    };
  }

  if (result.status === 'declined') {
    return {
      success: false as const,
      response: undefined,
      status: result.status,
      reason: result.reason,
    };
  }

  return {
    success: false as const,
    response: undefined,
    status: result.status,
    reason: result.reason,
  };
}

async function regenerateSessionToken(taskId: string) {
  const result = await regenerateSessionTokenTool.handler({ planId: taskId });
  const text = getToolResultText(result);

  if (result.isError) {
    throw new Error(text);
  }

  const tokenMatch = text.match(/New Session Token: (\S+)/);
  return {
    sessionToken: tokenMatch?.[1] || '',
    taskId,
  };
}

export const executeCodeTool = {
  definition: {
    name: TOOL_NAMES.EXECUTE_CODE,
    description: BUNDLED_DOCS,
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'TypeScript code to execute with access to all Shipyard APIs',
        },
      },
      required: ['code'],
    },
  },

  handler: async (args: unknown) => {
    const { code } = ExecuteCodeInput.parse(args);

    logger.info({ codeLength: code.length }, 'Executing code');

    scriptTracker.length = 0;

    try {
      async function encodeVideo(opts: {
        framesDir: string;
        fps?: number;
        outputPath?: string;
      }): Promise<string> {
        const fps = opts.fps || 6;
        const outputPath = opts.outputPath || path.join(os.tmpdir(), `video-${Date.now()}.mp4`);

        const { spawnSync } = child_process;
        const result = spawnSync(
          ffmpegInstaller.path,
          [
            '-y',
            '-framerate',
            String(fps),
            '-i',
            path.join(opts.framesDir, 'frame-%06d.jpg'),
            '-vf',
            'scale=trunc(iw/2)*2:trunc(ih/2)*2',
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            '-preset',
            'fast',
            outputPath,
          ],
          { encoding: 'utf-8', timeout: 60000 }
        );

        if (result.status !== 0) {
          throw new Error(`FFmpeg encoding failed: ${result.stderr?.slice(-300)}`);
        }

        fs.rmSync(opts.framesDir, { recursive: true, force: true });

        return outputPath;
      }

      const sandbox = {
        createTask,
        readTask,
        updateTask,
        addArtifact,
        completeTask,
        updateBlockContent,
        linkPR,
        requestUserInput,
        regenerateSessionToken,
        encodeVideo,
        child_process,
        fs,
        path,
        os,
        ffmpegPath: ffmpegInstaller.path,
        console: {
          log: (...logArgs: unknown[]) => logger.info({ output: logArgs }, 'console.log'),
          error: (...logArgs: unknown[]) => logger.error({ output: logArgs }, 'console.error'),
        },
      };

      const wrappedCode = `(async () => { ${code} })()`;

      const context = vm.createContext(sandbox);
      const script = new vm.Script(wrappedCode);
      const result = await script.runInContext(context, { timeout: 120000 });

      logger.info({ result }, 'Code execution complete');

      const content: Array<{ type: string; text: string }> = [
        {
          type: 'text',
          text:
            typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result ?? 'Done'),
        },
      ];

      /*
       * Auto-append monitoring script reminder if createTask or updateTask was called
       * This ensures non-hook agents always see how to wait for approval
       */
      const latestScript = scriptTracker[scriptTracker.length - 1];
      if (latestScript) {
        const [taskAction, ...scriptParts] = latestScript.split('\n\n');
        content.push({
          type: 'text',
          text: `

---
**⚠️ IMPORTANT FOR NON-HOOK AGENTS (Cursor, Devin, Windsurf, etc.):**

${taskAction} To wait for human approval before proceeding, run this monitoring script in background:

\`\`\`bash
${scriptParts.join('\n\n')}
\`\`\`

Save the script to a file and run: \`bash script.sh &\`
The script will exit when the human approves or requests changes.`,
        });
      }

      return { content };
    } catch (error) {
      logger.error({ error, code }, 'Code execution failed');
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text', text: `Execution error: ${message}` }],
        isError: true,
      };
    }
  },
};
