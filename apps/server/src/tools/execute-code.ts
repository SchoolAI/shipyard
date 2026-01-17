import * as vm from 'node:vm';
import { getArtifacts, getDeliverables, getPlanMetadata } from '@peer-plan/schema';
import { z } from 'zod';
import { getOrCreateDoc } from '../doc-store.js';
import { logger } from '../logger.js';
import { addArtifactTool } from './add-artifact.js';
import { addPRReviewCommentTool } from './add-pr-review-comment.js';
import { completeTaskTool } from './complete-task.js';
import { createPlanTool } from './create-plan.js';
import { linkPRTool } from './link-pr.js';
import { readPlanTool } from './read-plan.js';
import { setupReviewNotificationTool } from './setup-review-notification.js';
import { TOOL_NAMES } from './tool-names.js';
import { updateBlockContentTool } from './update-block-content.js';
import { updatePlanTool } from './update-plan.js';

// --- Bundled API Documentation ---

const BUNDLED_DOCS = `Execute TypeScript code that calls Peer-Plan APIs. Use this for multi-step workflows to reduce round-trips.

⚠️ IMPORTANT LIMITATION: Dynamic imports (\`await import()\`) are NOT supported in the VM execution context. Use only the pre-provided functions in the execution environment (createPlan, readPlan, updatePlan, addArtifact, completeTask, updateBlockContent, linkPR, addPRReviewComment, setupReviewNotification). All necessary APIs are already available in the sandbox.

## Available APIs

### createPlan(opts): Promise<{ planId, sessionToken, url, deliverables }>
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

Example:
\`\`\`typescript
const plan = await createPlan({
  title: "Add auth",
  content: "- [ ] Screenshot of login {#deliverable}"
});
// Returns: { planId: "abc", sessionToken: "xyz", url: "...", deliverables: [{ id: "del_xxx", text: "Screenshot of login" }] }
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
  // Respond to feedback
}
// Access deliverables directly
data.deliverables.forEach(d => console.log(d.id, d.completed));
\`\`\`

---

### updatePlan(planId, sessionToken, updates): Promise<void>
Update plan metadata.

Parameters:
- planId (string): The plan ID
- sessionToken (string): Session token
- updates.title (string, optional): New title
- updates.status (string, optional): 'draft' | 'pending_review' | 'changes_requested' | 'in_progress'

Note: Most status transitions are automatic. Rarely needed.

---

### addArtifact(opts): Promise<{ artifactId, url, allDeliverablesComplete, snapshotUrl? }>
Upload proof-of-work artifact.

Parameters:
- planId (string): The plan ID
- sessionToken (string): Session token
- type (string): 'screenshot' | 'video' | 'test_results' | 'diff'
- filename (string): e.g., "screenshot.png"
- filePath (string, optional): Local file path (RECOMMENDED)
- contentUrl (string, optional): URL to fetch from
- content (string, optional): Base64 encoded (legacy)
- deliverableId (string, optional): Links artifact to deliverable

Auto-complete: When ALL deliverables have artifacts, returns snapshotUrl.

Example:
\`\`\`typescript
const result = await addArtifact({
  planId, sessionToken,
  type: 'screenshot',
  filename: 'login.png',
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

### setupReviewNotification(planId, pollIntervalSeconds?): Promise<{ script }>
Get a bash script to poll for plan approval status changes.

Parameters:
- planId (string): Plan ID to monitor
- pollIntervalSeconds (number, optional): Polling interval (default: 30)

Returns:
- script: Bash script that polls registry server and exits when status becomes 'changes_requested' or 'in_progress'

Use this for agents WITHOUT hook support (Cursor, Devin, etc). The script can be run in background.

Example:
\`\`\`typescript
const { script } = await setupReviewNotification(plan.planId, 15);
// Agent runs this script in background to wait for approval
console.log(script);
\`\`\`

---

### requestUserInput(opts): Promise<{ success, response?, status, reason? }>
Request input from the user via browser modal.

Parameters:
- message (string, required): The question to ask the user
- type (string, required): 'text' | 'choice' | 'confirm' | 'multiline'
- options (string[], optional): For 'choice' type - available options (required for choice)
- defaultValue (string, optional): Pre-filled value for text/multiline inputs
- timeout (number, optional): Timeout in seconds (default: 300, min: 10, max: 600)
- planId (string, optional): Plan ID to associate with (uses global doc if omitted)

Returns:
- success: Boolean indicating if user responded
- response: User's answer (if success=true)
- status: 'answered' | 'cancelled'
- reason: Reason for failure (if success=false): 'cancelled' | timeout message

The request appears as a modal in the browser. The function blocks until:
- User responds (success=true)
- User cancels (success=false)
- Timeout occurs (success=false)

Example:
\`\`\`typescript
const result = await requestUserInput({
  message: "Which database should we use?",
  type: "choice",
  options: ["PostgreSQL", "SQLite", "MongoDB"],
  timeout: 120  // 2 minutes
});

if (result.success) {
  console.log("User chose:", result.response);
} else {
  console.log("Request failed:", result.reason);
}
\`\`\`

---

## Common Pattern

\`\`\`typescript
const plan = await createPlan({
  title: "Feature X",
  content: "- [ ] Screenshot {#deliverable}\\n- [ ] Video {#deliverable}"
});

// plan.deliverables = [{ id: "del_xxx", text: "Screenshot" }, { id: "del_yyy", text: "Video" }]

// Do work, take screenshots...

await addArtifact({
  planId: plan.planId,
  sessionToken: plan.sessionToken,
  type: 'screenshot',
  filePath: './screenshot.png',
  deliverableId: plan.deliverables[0].id  // Use actual deliverable ID
});

const result = await addArtifact({
  planId: plan.planId,
  sessionToken: plan.sessionToken,
  type: 'video',
  filePath: './demo.mp4',
  deliverableId: plan.deliverables[1].id  // Use actual deliverable ID
});

return { planId: plan.planId, snapshotUrl: result.snapshotUrl };
\`\`\`
`;

// --- Input Schema ---

const ExecuteCodeInput = z.object({
  code: z.string().describe('TypeScript code to execute'),
});

// --- API Wrapper Functions ---

async function createPlan(opts: {
  title: string;
  content: string;
  repo?: string;
  prNumber?: number;
}) {
  const result = await createPlanTool.handler(opts);
  const text = (result.content[0] as { text: string })?.text || '';
  const planId = text.match(/ID: (\S+)/)?.[1] || '';

  // Fetch deliverables from the Y.Doc
  let deliverables: Array<{ id: string; text: string }> = [];
  if (planId) {
    const ydoc = await getOrCreateDoc(planId);
    const allDeliverables = getDeliverables(ydoc);
    deliverables = allDeliverables.map((d) => ({ id: d.id, text: d.text }));
  }

  return {
    planId,
    sessionToken: text.match(/Session Token: (\S+)/)?.[1] || '',
    url: text.match(/URL: (\S+)/)?.[1] || '',
    deliverables,
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
  const text = (result.content[0] as { text: string })?.text || '';

  // Get structured data directly from Y.Doc instead of parsing strings
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
}

async function addArtifact(opts: {
  planId: string;
  sessionToken: string;
  type: string;
  filename: string;
  filePath?: string;
  contentUrl?: string;
  content?: string;
  description?: string;
  deliverableId?: string;
}) {
  const result = await addArtifactTool.handler(opts);
  const text = (result.content[0] as { text: string })?.text || '';

  if (result.isError) {
    return { isError: true, error: text };
  }

  // Get structured data from Y.Doc instead of parsing strings
  const ydoc = await getOrCreateDoc(opts.planId);
  const artifacts = getArtifacts(ydoc);
  const deliverables = getDeliverables(ydoc);

  // Find the artifact we just added (most recent by filename)
  const addedArtifact = artifacts.find((a) => a.filename === opts.filename);

  // Check if all deliverables are complete
  const allDeliverablesComplete =
    deliverables.length > 0 && deliverables.every((d) => d.linkedArtifactId);

  // Get snapshot URL from metadata if task was completed
  const metadata = getPlanMetadata(ydoc);

  return {
    artifactId: addedArtifact?.id || '',
    url: addedArtifact?.url || '',
    allDeliverablesComplete,
    snapshotUrl: metadata?.snapshotUrl,
    isError: false,
  };
}

async function completeTask(planId: string, sessionToken: string, summary?: string) {
  const result = await completeTaskTool.handler({ planId, sessionToken, summary });
  const text = (result.content[0] as { text: string })?.text || '';

  if (result.isError) {
    return { isError: true, error: text };
  }

  // Get structured data from Y.Doc
  const ydoc = await getOrCreateDoc(planId);
  const metadata = getPlanMetadata(ydoc);

  return {
    snapshotUrl: metadata?.snapshotUrl || '',
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
  const text = (result.content[0] as { text: string })?.text || '';

  if (result.isError) {
    throw new Error(text);
  }

  // Parse PR details from response text
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
  const text = (result.content[0] as { text: string })?.text || '';

  // Extract script from markdown code block
  const scriptMatch = text.match(/```bash\n([\s\S]*?)\n```/);
  const script = scriptMatch?.[1] || '';

  return { script, fullResponse: text };
}

async function requestUserInput(opts: {
  message: string;
  type: 'text' | 'choice' | 'confirm' | 'multiline';
  options?: string[];
  defaultValue?: string;
  timeout?: number;
  planId?: string;
}) {
  const { InputRequestManager } = await import('../services/input-request-manager.js');

  // Get or create Y.Doc
  const docName = opts.planId || '__global_input_requests__';
  const ydoc = await getOrCreateDoc(docName);

  // Create manager and make request
  const manager = new InputRequestManager();
  const requestId = manager.createRequest(ydoc, {
    message: opts.message,
    type: opts.type,
    options: opts.options,
    defaultValue: opts.defaultValue,
    timeout: opts.timeout,
  });

  // Wait for response
  const result = await manager.waitForResponse(ydoc, requestId, opts.timeout);

  return {
    success: result.success,
    response: result.response,
    status: result.status,
    reason: result.success ? undefined : result.reason,
  };
}

// --- Public Export ---

export const executeCodeTool = {
  definition: {
    name: TOOL_NAMES.EXECUTE_CODE,
    description: BUNDLED_DOCS,
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'TypeScript code to execute with access to all Peer-Plan APIs',
        },
      },
      required: ['code'],
    },
  },

  handler: async (args: unknown) => {
    const { code } = ExecuteCodeInput.parse(args);

    logger.info({ codeLength: code.length }, 'Executing code');

    try {
      // Create sandbox with API functions
      const sandbox = {
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
        console: {
          log: (...logArgs: unknown[]) => logger.info({ output: logArgs }, 'console.log'),
          error: (...logArgs: unknown[]) => logger.error({ output: logArgs }, 'console.error'),
        },
      };

      // Wrap in async IIFE
      const wrappedCode = `(async () => { ${code} })()`;

      // Execute in sandboxed context
      const context = vm.createContext(sandbox);
      const script = new vm.Script(wrappedCode);
      const result = await script.runInContext(context, { timeout: 120000 });

      logger.info({ result }, 'Code execution complete');

      return {
        content: [
          {
            type: 'text',
            text:
              typeof result === 'object'
                ? JSON.stringify(result, null, 2)
                : String(result ?? 'Done'),
          },
        ],
      };
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
