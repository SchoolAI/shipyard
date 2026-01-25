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

import { addPRReviewCommentTool } from './add-pr-review-comment.js';
import { completeTaskTool } from './complete-task.js';
import { createPlanTool } from './create-plan.js';
import { linkPRTool } from './link-pr.js';
import { readPlanTool } from './read-plan.js';
import { regenerateSessionTokenTool } from './regenerate-session-token.js';
import { setupReviewNotificationTool } from './setup-review-notification.js';
import { TOOL_NAMES } from './tool-names.js';
import { updateBlockContentTool } from './update-block-content.js';
import { updatePlanTool } from './update-plan.js';

/** --- Bundled API Documentation --- */

const BUNDLED_DOCS = `Execute TypeScript code that calls Shipyard APIs. Use this for multi-step workflows to reduce round-trips.

⚠️ IMPORTANT LIMITATION: Dynamic imports (\`await import()\`) are NOT supported in the VM execution context. Use only the pre-provided functions in the execution environment (createPlan, readPlan, updatePlan, addArtifact, completeTask, updateBlockContent, linkPR, addPRReviewComment, setupReviewNotification). All necessary APIs are already available in the sandbox.

## Available APIs

### createPlan(opts): Promise<{ planId, sessionToken, url, deliverables, monitoringScript }>
Create a new plan and open it in browser.

Parameters:
- title (string, required): Plan title
- content (string, required): Markdown content. Use \`{#deliverable}\` on checkbox items.
- repo (string, optional): GitHub repo (org/repo). Auto-detected if not provided.
- prNumber (number, optional): PR number for artifact uploads.

Returns:
- planId: The plan ID
- sessionToken: Required for subsequent API calls
- url: Browser URL for the plan
- deliverables: Array of { id, text } for linking artifacts
- monitoringScript: Bash script to poll for approval (for non-hook agents)

Example:
\`\`\`typescript
const plan = await createPlan({
  title: "Add auth",
  content: "- [ ] Screenshot of login {#deliverable}"
});
/** Returns: { planId: "abc", sessionToken: "xyz", url: "...", deliverables: [...], monitoringScript: "#!/bin/bash..." } */

/**
 * For non-hook agents: Run the monitoring script in background to wait for approval
 * bash <(echo "$monitoringScript") &
 */
\`\`\`

---

### readPlan(planId, sessionToken, opts?): Promise<ReadPlanResult>
Read plan content, metadata, and deliverables.

Parameters:
- planId (string): The plan ID
- sessionToken (string): Session token from createPlan
- opts.includeAnnotations (boolean, optional): Include comment threads
- opts.includeLinkedPRs (boolean, optional): Include linked PRs section

Returns:
- content: Full markdown (with block IDs, annotations, and linked PRs if requested)
- status: Plan status (e.g., "draft", "pending_review", "changes_requested")
- title: Plan title
- repo: GitHub repo (if set)
- pr: PR number (if set)
- deliverables: Array of { id, text, completed }
- isError: Boolean

Example:
\`\`\`typescript
const data = await readPlan(planId, token, {
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

### updatePlan(planId, sessionToken, updates): Promise<{ success, monitoringScript }>
Update plan metadata.

Parameters:
- planId (string): The plan ID
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
- planId (string): The plan ID
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
  planId, sessionToken,
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

### completeTask(planId, sessionToken, summary?): Promise<{ snapshotUrl }>
Force-complete task. Usually NOT needed - addArtifact auto-completes.

---

### updateBlockContent(planId, sessionToken, operations): Promise<void>
Modify plan content blocks.

Operations array items:
- { type: 'update', blockId: string, content: string }
- { type: 'insert', afterBlockId: string | null, content: string }
- { type: 'delete', blockId: string }
- { type: 'replace_all', content: string }

---

### linkPR(opts): Promise<{ prNumber, url, status, branch, title }>
Link a GitHub PR to a plan.

Parameters:
- planId (string): The plan ID
- sessionToken (string): Session token
- prNumber (number): PR number to link
- branch (string, optional): Branch name (will be fetched if omitted)
- repo (string, optional): Repository override (org/repo). Uses plan repo if omitted.

Returns:
- prNumber: The PR number
- url: PR URL
- status: 'draft' | 'open' | 'merged' | 'closed'
- branch: Branch name
- title: PR title

Example:
\`\`\`typescript
const pr = await linkPR({
  planId, sessionToken,
  prNumber: 42
});
console.log('Linked:', pr.title, pr.status);
\`\`\`

---

### addPRReviewComment(opts): Promise<void>
Add review comment to PR diff.

Parameters:
- planId, sessionToken, prNumber, path, line, body

---

### requestUserInput(opts): Promise<{ success, response?, status, reason? }>
Request input from the user via browser modal.

Supports both single-question and multi-question modes (1-10 questions, 8 recommended for optimal UX).

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
- planId (string, optional): Optional metadata to link request to plan (for activity log filtering)
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

1. **text** - Single-line text input
\`\`\`typescript
await requestUserInput({ message: "API endpoint URL?", type: "text" })
\`\`\`

2. **multiline** - Multi-line text area
\`\`\`typescript
await requestUserInput({ message: "Describe the bug:", type: "multiline" })
\`\`\`

3. **choice** - Select from options (auto-adds "Other" escape hatch)
\`\`\`typescript
await requestUserInput({
  message: "Which database?",
  type: "choice",
  options: ["PostgreSQL", "SQLite", "MongoDB"]
})

await requestUserInput({
  message: "Which features?",
  type: "choice",
  options: ["Dark mode", "Offline support", "Analytics"],
  multiSelect: true
})

await requestUserInput({
  message: "Select country:",
  type: "choice",
  options: ["USA", "Canada", "Mexico"],
  displayAs: "dropdown"
})
\`\`\`

4. **confirm** - Yes/No confirmation
\`\`\`typescript
await requestUserInput({ message: "Deploy to production?", type: "confirm" })
\`\`\`

5. **number** - Numeric input with validation
\`\`\`typescript
await requestUserInput({
  message: "Port number?",
  type: "number",
  min: 1,
  max: 65535,
  format: "integer"
})

await requestUserInput({
  message: "Budget amount?",
  type: "number",
  format: "currency"
})
\`\`\`

6. **email** - Email address with validation
\`\`\`typescript
await requestUserInput({
  message: "Contact email?",
  type: "email",
  domain: "company.com"
})
\`\`\`

7. **date** - Date selection with range
\`\`\`typescript
await requestUserInput({
  message: "Project deadline?",
  type: "date",
  minDate: "2026-01-24",
  maxDate: "2026-12-31"
})
\`\`\`

8. **rating** - Scale rating (auto-selects stars for <=5, numbers for >5)
\`\`\`typescript
await requestUserInput({
  message: "Rate this approach:",
  type: "rating",
  min: 1,
  max: 5,
  labels: { low: "Poor", high: "Excellent" }
})

await requestUserInput({
  message: "NPS Score (0-10):",
  type: "rating",
  min: 0,
  max: 10,
  style: "numbers"
})
\`\`\`

---

### postActivityUpdate(opts): Promise<{ success, eventId, requestId? }>
Post an activity update to the agent activity feed.

Parameters:
- planId (string): The plan ID
- activityType (string): 'status' | 'note' | 'help_request' | 'milestone' | 'blocker'
- message (string): The activity message
- status (string, optional): For 'status' type: 'working' | 'blocked' | 'idle' | 'waiting'
- category (string, optional): For 'note' type: 'info' | 'progress' | 'decision' | 'question'

Returns:
- success: Boolean indicating if the update was logged
- eventId: The ID of the created event
- requestId: The request ID (only for 'help_request' and 'blocker' types)

Examples:
\`\`\`typescript
/** Status update */
await postActivityUpdate({
  planId: "abc",
  activityType: "status",
  status: "working",
  message: "Implementing authentication"
});

/** Informational note */
await postActivityUpdate({
  planId: "abc",
  activityType: "note",
  message: "Found a better approach using JWT",
  category: "decision"
});

/** Request for help (non-blocking) */
const result = await postActivityUpdate({
  planId: "abc",
  activityType: "help_request",
  message: "Should we use PostgreSQL or SQLite?"
});
/** Save result.requestId to resolve later */

/** Milestone reached */
await postActivityUpdate({
  planId: "abc",
  activityType: "milestone",
  message: "Authentication flow complete"
});

/** Hit a blocker (needs resolution to proceed) */
const blockerResult = await postActivityUpdate({
  planId: "abc",
  activityType: "blocker",
  message: "Missing API credentials"
});
/** Save blockerResult.requestId to resolve later */
\`\`\`

---

### resolveActivityRequest(opts): Promise<{ success }>
Resolve a previously posted help_request or blocker.

Parameters:
- planId (string): The plan ID
- requestId (string): The request ID from postActivityUpdate
- resolution (string, optional): How the request was resolved

Example:
\`\`\`typescript
/** First, create a help request */
const helpResult = await postActivityUpdate({
  planId: "abc",
  activityType: "help_request",
  message: "Which database should we use?"
});

/** Later, resolve it */
await resolveActivityRequest({
  planId: "abc",
  requestId: helpResult.requestId,
  resolution: "Using PostgreSQL based on team feedback"
});
\`\`\`

---

### regenerateSessionToken(planId): Promise<{ sessionToken, planId }>
Regenerate the session token for a plan you own.

USE WHEN:
- Your Claude Code session ended and you lost the original token
- You need to resume work on a plan from a previous session
- The old token may have been compromised

REQUIREMENTS:
- You must be the plan owner (verified via GitHub identity)
- The plan must exist and have an ownerId set

Returns:
- sessionToken: New token for API calls
- planId: The plan ID

SECURITY:
- Only the plan owner can regenerate tokens
- Old token is immediately invalidated
- GitHub identity verification happens on MCP server (via gh auth login)

Example:
\`\`\`typescript
/** Lost your session token? Regenerate it: */
const { sessionToken, planId } = await regenerateSessionToken("abc123");

/** Now use the new token for operations */
await addArtifact({
  planId,
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
const plan = await createPlan({
  title: "Feature X",
  content: "- [ ] Screenshot {#deliverable}\\n- [ ] Video {#deliverable}"
});

/**
 * plan includes: planId, sessionToken, url, deliverables, monitoringScript
 * For non-hook agents: Run monitoringScript in background to wait for approval
 * The script polls and exits when human approves/rejects
 */

/** Do work, take screenshots... */

await addArtifact({
  planId: plan.planId,
  sessionToken: plan.sessionToken,
  type: 'screenshot',
  source: 'file',
  filename: 'screenshot.png',
  filePath: './screenshot.png',
  deliverableId: plan.deliverables[0].id
});

const result = await addArtifact({
  planId: plan.planId,
  sessionToken: plan.sessionToken,
  type: 'video',
  source: 'file',
  filename: 'demo.mp4',
  filePath: './demo.mp4',
  deliverableId: plan.deliverables[1].id
});

return { planId: plan.planId, snapshotUrl: result.snapshotUrl };
\`\`\`
`;

/** --- Input Schema --- */

const ExecuteCodeInput = z.object({
  code: z.string().describe('TypeScript code to execute'),
});

/** --- API Wrapper Functions --- */

/*
 * Track monitoring script for auto-append to tool result
 * String array to work around TypeScript control flow issues
 */
const scriptTracker: string[] = [];

async function createPlan(opts: {
  title: string;
  content: string;
  repo?: string;
  prNumber?: number;
}) {
  const result = await createPlanTool.handler(opts);
  const text = getToolResultText(result);
  const planId = text.match(/ID: (\S+)/)?.[1] || '';

  /** Fetch deliverables from the Y.Doc */
  let deliverables: Array<{ id: string; text: string }> = [];
  if (planId) {
    const ydoc = await getOrCreateDoc(planId);
    const allDeliverables = getDeliverables(ydoc);
    deliverables = allDeliverables.map((d) => ({ id: d.id, text: d.text }));
  }

  /** Always include monitoring script for non-hook agents */
  const { script: monitoringScript } = await setupReviewNotification(planId, 30);

  /** Track for auto-append to tool result (use array.push to track in handler) */
  scriptTracker.push(`Plan "${planId}" created.\n\n${monitoringScript}`);

  return {
    planId,
    sessionToken: text.match(/Session Token: (\S+)/)?.[1] || '',
    url: text.match(/URL: (\S+)/)?.[1] || '',
    deliverables,
    monitoringScript,
  };
}

async function readPlan(
  planId: string,
  sessionToken: string,
  opts?: { includeAnnotations?: boolean; includeLinkedPRs?: boolean }
) {
  const result = await readPlanTool.handler({
    planId,
    sessionToken,
    includeAnnotations: opts?.includeAnnotations,
    includeLinkedPRs: opts?.includeLinkedPRs,
  });
  const text = getToolResultText(result);

  /** Get structured data directly from Y.Doc instead of parsing strings */
  const ydoc = await getOrCreateDoc(planId);
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

async function updatePlan(
  planId: string,
  sessionToken: string,
  updates: { title?: string; status?: string }
) {
  await updatePlanTool.handler({ planId, sessionToken, ...updates });

  /** Always include monitoring script for non-hook agents */
  const { script: monitoringScript } = await setupReviewNotification(planId, 30);

  /** Track for auto-append to tool result */
  scriptTracker.push(`Plan "${planId}" updated.\n\n${monitoringScript}`);

  return {
    success: true,
    monitoringScript,
  };
}

type AddArtifactOpts = {
  planId: string;
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
  const result = await addArtifactTool.handler(opts);
  const text = getToolResultText(result);

  if (result.isError) {
    return { isError: true, error: text };
  }

  /** Get structured data from Y.Doc instead of parsing strings */
  const ydoc = await getOrCreateDoc(opts.planId);
  const artifacts = getArtifacts(ydoc);
  const deliverables = getDeliverables(ydoc);

  /** Find the artifact we just added (most recent by filename) */
  const addedArtifact = artifacts.find((a) => a.filename === opts.filename);

  /** Check if all deliverables are complete */
  const allDeliverablesComplete =
    deliverables.length > 0 && deliverables.every((d) => d.linkedArtifactId);

  /** Get snapshot URL from metadata if task was completed */
  const metadata = getPlanMetadata(ydoc);

  /** Get URL from discriminated union */
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

async function completeTask(planId: string, sessionToken: string, summary?: string) {
  const result = await completeTaskTool.handler({ planId, sessionToken, summary });
  const text = getToolResultText(result);

  if (result.isError) {
    return { isError: true, error: text };
  }

  /** Get structured data from Y.Doc */
  const ydoc = await getOrCreateDoc(planId);
  const metadata = getPlanMetadata(ydoc);

  return {
    snapshotUrl: metadata?.status === 'completed' ? metadata.snapshotUrl || '' : '',
    status: metadata?.status || '',
    isError: false,
  };
}

async function updateBlockContent(
  planId: string,
  sessionToken: string,
  operations: Array<{
    type: 'update' | 'insert' | 'delete' | 'replace_all';
    blockId?: string;
    afterBlockId?: string | null;
    content?: string;
  }>
) {
  await updateBlockContentTool.handler({ planId, sessionToken, operations });
}

async function linkPR(opts: {
  planId: string;
  sessionToken: string;
  prNumber: number;
  branch?: string;
  repo?: string;
}) {
  const result = await linkPRTool.handler(opts);
  const text = getToolResultText(result);

  if (result.isError) {
    throw new Error(text);
  }

  /** Parse PR details from response text */
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

async function addPRReviewComment(opts: {
  planId: string;
  sessionToken: string;
  prNumber: number;
  path: string;
  line: number;
  body: string;
}) {
  await addPRReviewCommentTool.handler(opts);
}

async function setupReviewNotification(planId: string, pollIntervalSeconds?: number) {
  const result = await setupReviewNotificationTool.handler({
    planId,
    pollIntervalSeconds: pollIntervalSeconds ?? 30,
  });
  const text = getToolResultText(result);

  /** Extract script from markdown code block */
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

  /** Create manager and make request */
  const manager = new InputRequestManager();

  /** Handle multi-question mode */
  if ('questions' in opts && opts.questions) {
    /** Filter out any null/undefined elements from questions array (defensive) */
    const validQuestions = opts.questions.filter(
      (q): q is NonNullable<typeof q> => q != null
    );
    if (validQuestions.length === 0) {
      throw new Error(
        'questions array is empty after filtering. Each question must be an object with "message" and "type" fields.'
      );
    }

    const requestId = manager.createMultiQuestionRequest(ydoc, {
      questions: validQuestions,
      timeout: opts.timeout,
      planId: opts.planId,
    });

    /** Wait for response */
    const result = await manager.waitForResponse(ydoc, requestId, opts.timeout);

    /** Narrow the discriminated union to access appropriate fields */
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

  /** Single-question mode */
  let params: CreateInputRequestParams;

  switch (opts.type) {
    case 'choice':
      params = {
        message: opts.message,
        defaultValue: opts.defaultValue,
        timeout: opts.timeout,
        planId: opts.planId,
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
        type: opts.type,
      } satisfies CreateTextInputParams | CreateMultilineInputParams | CreateConfirmInputParams;
  }

  const requestId = manager.createRequest(ydoc, params);

  /** Wait for response */
  const result = await manager.waitForResponse(ydoc, requestId, opts.timeout);

  /** Narrow the discriminated union to access appropriate fields */
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

async function postActivityUpdate(opts: {
  planId: string;
  activityType: 'help_request' | 'blocker';
  message: string;
}): Promise<{ success: boolean; eventId: string; requestId?: string }> {
  const { logPlanEvent } = await import('@shipyard/schema');
  const { getGitHubUsername } = await import('../server-identity.js');
  const { nanoid } = await import('nanoid');

  const doc = await getOrCreateDoc(opts.planId);
  const actorName = await getGitHubUsername();

  /** Generate requestId and log event as inbox-worthy for plan owner */
  const requestId = nanoid();
  const eventId = logPlanEvent(
    doc,
    'agent_activity',
    actorName,
    {
      activityType: opts.activityType,
      requestId,
      message: opts.message,
    },
    {
      inboxWorthy: true,
      inboxFor: 'owner',
    }
  );

  return { success: true, eventId, requestId };
}

async function resolveActivityRequest(opts: {
  planId: string;
  requestId: string;
  resolution?: string;
}): Promise<{ success: boolean }> {
  const { logPlanEvent, getPlanEvents } = await import('@shipyard/schema');
  const { getGitHubUsername } = await import('../server-identity.js');

  const doc = await getOrCreateDoc(opts.planId);
  const actorName = await getGitHubUsername();
  const events = getPlanEvents(doc);

  /** Find original unresolved request (help_request or blocker only) */
  const originalEvent = events.find(
    (e) =>
      e.type === 'agent_activity' &&
      e.data &&
      'requestId' in e.data &&
      e.data.requestId === opts.requestId &&
      (e.data.activityType === 'help_request' || e.data.activityType === 'blocker')
  );

  if (!originalEvent || originalEvent.type !== 'agent_activity') {
    throw new Error(`Unresolved request ${opts.requestId} not found`);
  }

  /** Check if already resolved */
  const existingResolution = events.find(
    (e) =>
      e.type === 'agent_activity' &&
      e.data &&
      'requestId' in e.data &&
      e.data.requestId === opts.requestId &&
      (e.data.activityType === 'help_request_resolved' ||
        e.data.activityType === 'blocker_resolved')
  );

  if (existingResolution) {
    throw new Error(`Request ${opts.requestId} has already been resolved`);
  }

  /** Determine resolution type - TypeScript narrowing ensures data exists */
  const activityType = originalEvent.data.activityType;
  const resolvedType =
    activityType === 'help_request' ? 'help_request_resolved' : 'blocker_resolved';

  logPlanEvent(doc, 'agent_activity', actorName, {
    activityType: resolvedType,
    requestId: opts.requestId,
    resolution: opts.resolution,
  });

  return { success: true };
}

async function regenerateSessionToken(planId: string) {
  const result = await regenerateSessionTokenTool.handler({ planId });
  const text = getToolResultText(result);

  if (result.isError) {
    throw new Error(text);
  }

  /** Extract session token from response text */
  const tokenMatch = text.match(/New Session Token: (\S+)/);
  return {
    sessionToken: tokenMatch?.[1] || '',
    planId,
  };
}

/** --- Public Export --- */

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

    /** Reset tracking for this execution */
    scriptTracker.length = 0;

    try {
      /** Helper: Encode frames to MP4 using bundled FFmpeg */
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

        /** Cleanup frames directory */
        fs.rmSync(opts.framesDir, { recursive: true, force: true });

        return outputPath;
      }

      /** Create sandbox with API functions and Node.js modules for video encoding */
      const sandbox = {
        /** Shipyard API functions */
        createPlan,
        readPlan,
        updatePlan,
        addArtifact,
        completeTask,
        updateBlockContent,
        linkPR,
        addPRReviewComment,
        setupReviewNotification,
        requestUserInput,
        postActivityUpdate,
        resolveActivityRequest,
        regenerateSessionToken,
        /** Video encoding helper (uses bundled FFmpeg) */
        encodeVideo,
        /** Node.js modules for advanced workflows (file ops, process spawning) */
        child_process,
        fs,
        path,
        os,
        /** FFmpeg bundled with server - no installation required */
        ffmpegPath: ffmpegInstaller.path,
        console: {
          log: (...logArgs: unknown[]) => logger.info({ output: logArgs }, 'console.log'),
          error: (...logArgs: unknown[]) => logger.error({ output: logArgs }, 'console.error'),
        },
      };

      /** Wrap in async IIFE */
      const wrappedCode = `(async () => { ${code} })()`;

      /** Execute in sandboxed context */
      const context = vm.createContext(sandbox);
      const script = new vm.Script(wrappedCode);
      const result = await script.runInContext(context, { timeout: 120000 });

      logger.info({ result }, 'Code execution complete');

      /** Build result content */
      const content: Array<{ type: string; text: string }> = [
        {
          type: 'text',
          text:
            typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result ?? 'Done'),
        },
      ];

      /*
       * Auto-append monitoring script reminder if createPlan or updatePlan was called
       * This ensures non-hook agents always see how to wait for approval
       */
      const latestScript = scriptTracker[scriptTracker.length - 1];
      if (latestScript) {
        const [planAction, ...scriptParts] = latestScript.split('\n\n');
        content.push({
          type: 'text',
          text: `

---
**⚠️ IMPORTANT FOR NON-HOOK AGENTS (Cursor, Devin, Windsurf, etc.):**

${planAction} To wait for human approval before proceeding, run this monitoring script in background:

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
