---
name: shipyard
# prettier-ignore
description: "Shipyard is your agent management hub for human-agent collaboration. Use when tasks need human review, screenshot/video evidence, audit trails, or collaborative review. Invoke for 'create a task', 'track my work', 'make this reviewable'. IMPORTANT: When Shipyard MCP tools are available, ALWAYS load this skill first. Use requestUserInput() inside execute_code for ALL human communication."
---

<!--
  NOTE: This skill is for MCP-direct platforms (Cursor, Windsurf, Claude Desktop, etc.)
  that don't have hook support.

  CONTENT RELATIONSHIP:
  - Core workflow content (CRITICAL section, deliverables, artifacts, tips) comes from
    packages/shared/src/instructions/mcp-direct.ts
  - This file has ADDITIONAL platform-specific content (HTML artifact guidelines, video
    recording workflow) that is NOT in the shared module - this is intentional.

  For Claude Code users with hooks, the hook's SessionStart context provides
  instructions (see apps/hook/src/index.ts using CLAUDE_CODE_INSTRUCTIONS).
-->

# Shipyard: Your Agent Management Hub

> **MCP + Skill = Full Power:** If you see `mcp__shipyard__*` tools available, you have the Shipyard MCP. This skill teaches you how to use those tools effectively. Always use both together for the best workflow.

Shipyard is the central interface where humans manage AI agents. It turns invisible agent work into reviewable, verifiable tasks with screenshots, videos, and test results as proof.

**Key principle:** ALL human-agent communication happens through Shipyard. When you need to ask a question, get a decision, or request clarification - use `requestUserInput()` inside `execute_code`. The human is already in the browser viewing your task. That's where they expect to interact with you.

## CRITICAL: When to Use Shipyard

⚠️ **MANDATORY USAGE RULE:**

If Shipyard is available, you MUST use it for:
- Creating implementation tasks
- Tracking work that needs human review
- Documenting proof of work (screenshots, videos, test results)
- ANY user request involving "task", "track", "verify", or "prove"

**DO NOT:**
- Create tasks manually in chat or as markdown files
- Write implementation docs yourself when Shipyard is available
- Suggest alternatives to Shipyard for trackable work
- Overthink whether to use it - WHEN IN DOUBT, USE SHIPYARD

**Decision Tree:**
```
Need to create/track/verify work?
        │
        ▼
  Shipyard available?
     │           │
    YES          NO
     │           │
     ▼           ▼
  USE IT     Manual approach
  NOW        (tell user why)
```

## Why use Shipyard?

- **Accountability** - Prove you did the work with artifacts
- **Human-in-the-loop** - Reviewers can approve, request changes, or leave feedback
- **Audit trail** - Every task has a permanent record with timestamps
- **Collaboration** - Real-time sync between agent and reviewers via browser

## MCP Integration

This skill complements the Shipyard MCP server. The MCP provides the `execute_code` tool; this skill teaches you how to use the APIs inside it effectively.

**MCP tool:**
| Tool | Purpose |
|------|---------|
| `execute_code` | Run TypeScript that calls ALL Shipyard APIs |

**APIs available inside execute_code:**
| API | Purpose |
|-----|---------|
| `requestUserInput()` | **THE primary communication channel** - Ask questions, get decisions |
| `createTask()` | Start a new verified task |
| `addArtifact()` | Upload proof (screenshot, video, test results) |
| `postUpdate()` | Post progress updates to the task timeline |
| `readTask()` | Check status and reviewer feedback |
| `linkPR()` | Connect a GitHub PR to the task |

**Communication principle:** ALWAYS use `requestUserInput()` instead of your platform's built-in question tools (AskUserQuestion, Cursor prompts, etc.). The human is viewing your task in the browser - that's where they expect to see your questions.

**⚠️ IMPORTANT: No process.env in execute_code sandbox.** Session tokens are returned from `createTask()` and must be passed explicitly to subsequent API calls. If you lose your token, use `regenerateSessionToken(taskId)`.

## Quick Start

1. **Create task** with deliverables (provable outcomes)
2. **Do the work** and capture artifacts as you go
3. **Upload artifacts** linked to deliverables
4. **Auto-complete** when all deliverables have proof

## Deliverable Format Guidelines

**HTML is the primary format for artifacts.** Use HTML for 90% of deliverables - it's self-contained, richly formatted, searchable, and works everywhere.

### 3-Tier Format Hierarchy

| Tier | Format | Use For | Examples |
|------|--------|---------|----------|
| **1** | **HTML** (primary) | Test results, reviews, terminal output, reports | Unit tests, code reviews, build logs, lint output |
| **2** | **Image** | Actual UI screenshots only | App interface, visual bugs, design mockups |
| **3** | **Video** | Complex flows requiring browser automation | Multi-step user journeys, animations, interactions |

### When to Use Each Format

**Use HTML when:**
- ✅ Terminal output (test results, build logs, linting)
- ✅ Code reviews or security audits
- ✅ Structured reports or analysis
- ✅ Any text-based output you'd normally copy-paste
- ✅ Screenshots with annotations or context
- ✅ Coverage reports, profiling data, metrics

**Use Images when:**
- 📸 Showing actual application UI (buttons, forms, layouts)
- 📸 Visual bugs or design issues
- 📸 Before/after comparisons
- 📸 Design mockups or prototypes

**Use Video when:**
- 🎥 Demonstrating multi-step user flows
- 🎥 Showing animations or transitions
- 🎥 Browser automation proof (Playwright/Puppeteer)
- 🎥 Complex interactions that images can't capture

### Decision Tree

```
Is this terminal/CLI output? ──► YES ──► HTML (dark terminal theme)
  │
  NO
  │
Is this a code review/audit? ──► YES ──► HTML (light professional theme)
  │
  NO
  │
Is this test/coverage data? ──► YES ──► HTML (syntax-highlighted)
  │
  NO
  │
Does it require browser automation? ──► YES ──► Video
  │
  NO
  │
Is it showing actual UI? ──► YES ──► Screenshot (Image)
```

### HTML Examples

**Test Results:**
```typescript
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: 'SF Mono', Monaco, monospace;
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 20px;
    }
    .pass { color: #22c55e; }
    .pass::before { content: "✔ "; }
  </style>
</head>
<body>
  <h1>Test Results - PASS</h1>
  <div class="test-case">
    <span class="pass">validates email addresses</span>
  </div>
</body>
</html>`;

await addArtifact({
  taskId,
  sessionToken,
  type: 'html',
  filename: 'test-results.html',
  source: 'base64',
  content: Buffer.from(html).toString('base64'),
  deliverableId: deliverables[0].id
});
```

**Code Review:**
```typescript
const review = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: -apple-system, sans-serif;
      max-width: 1000px;
      margin: 0 auto;
      padding: 40px;
      background: #ffffff;
    }
    .verdict.pass {
      background: #d1fae5;
      border: 2px solid #10b981;
      padding: 20px;
    }
    .issue.critical {
      border-left: 4px solid #dc2626;
      background: #fef2f2;
      padding: 16px;
      margin: 16px 0;
    }
  </style>
</head>
<body>
  <h1>Code Review: Authentication Module</h1>
  <div class="verdict pass">✓ APPROVED</div>
  <!-- Risk tables, findings, recommendations -->
</body>
</html>`;
```

**See `examples/html-artifacts.md` for complete working templates.**

### Base64 Image Embedding

Embed screenshots directly in HTML for self-contained artifacts:

```typescript
import { readFileSync } from 'node:fs';

const imageBuffer = readFileSync('/tmp/screenshot.png');
const base64Image = imageBuffer.toString('base64');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    .screenshot {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
    }
    .screenshot img { width: 100%; display: block; }
  </style>
</head>
<body>
  <h1>Login Page Implementation</h1>
  <div class="screenshot">
    <img src="data:image/png;base64,${base64Image}"
         alt="Login page with validation">
  </div>
</body>
</html>`;

await addArtifact({
  taskId,
  sessionToken,
  type: 'html',
  filename: 'login-demo.html',
  source: 'base64',
  content: Buffer.from(html).toString('base64'),
  deliverableId: deliverables[0].id
});
```

### Why HTML is Primary

1. **Self-contained** - Inline CSS, no external dependencies
2. **Rich formatting** - Colors, structure, syntax highlighting
3. **Searchable** - Text content is indexable
4. **Universal** - Works in any browser
5. **Version control friendly** - Text diffs work
6. **Portable** - Single file, no special viewers needed

### HTML Best Practices

- ✅ Inline all CSS in `<style>` tags
- ✅ Embed images as base64 data URIs
- ✅ Use semantic HTML (h1, h2, table, etc.)
- ✅ Include proper `<meta charset="UTF-8">`
- ✅ Keep files under 5MB for fast loading
- ❌ Never link external stylesheets or scripts
- ❌ Don't use CDNs or remote resources
- ❌ Avoid JavaScript (static HTML only)

## Deliverables: Provable Outcomes

Deliverables are outcomes you prove with artifacts. Mark them with `{#deliverable}`.

**Good (provable):**
- Screenshot of working login page
- Video showing drag-and-drop feature
- Test results showing 100% pass rate

**Bad (not provable):**
- Implement authentication (too vague)
- Refactor code (no artifact)
- Add error handling (internal)

## Workflow Example

```typescript
// Step 1: Create task with deliverables
const task = await createTask({
  title: "Add user profile page",
  content: `
## Deliverables
- [ ] Screenshot of profile page with avatar {#deliverable}
- [ ] Screenshot of edit form validation {#deliverable}

## Implementation
1. Create /profile route
2. Add avatar upload component
3. Build edit form with validation
`
});

const { taskId, sessionToken, deliverables, monitoringScript } = task;
// deliverables = [{ id: "del_xxx", text: "Screenshot of profile page with avatar" }, ...]
// monitoringScript = bash script to poll for approval (for non-hook agents)

// For non-hook agents (Cursor, Devin, etc.): Run the monitoring script in background
// to wait for human approval before proceeding:
// bash <(echo "$monitoringScript") &

// Step 2: Implement the feature (your actual work happens here)

// Step 3: Upload proof
await addArtifact({
  taskId,
  sessionToken,
  type: 'image',
  filename: 'profile-page.png',
  source: 'file',
  filePath: '/tmp/screenshots/profile.png',
  deliverableId: deliverables[0].id
});

const result = await addArtifact({
  taskId,
  sessionToken,
  type: 'image',
  filename: 'validation-errors.png',
  source: 'file',
  filePath: '/tmp/screenshots/validation.png',
  deliverableId: deliverables[1].id
});

// Step 4: Auto-complete triggers when all deliverables have artifacts
if (result.allDeliverablesComplete) {
  return { done: true, proof: result.snapshotUrl };
}
```

## Human-Agent Communication

**`requestUserInput()` inside `execute_code` is THE primary way to talk to humans during active work.**

The human is already in the browser viewing your task. When you need to ask a question, get a decision, or request clarification - that's where they expect to see it. Don't scatter conversations across different interfaces.

### Best Practice: Return the Response Value

**Always return the response in your execute_code result** for clean, structured output:

```typescript
const result = await requestUserInput({
  message: "Which framework?",
  type: "choice",
  options: ["React", "Vue", "Angular"]
});

return {
  userDecision: result.response,
  timestamp: Date.now()
};
// This is cleaner than console.log and appears once in the final output
```

Avoid using `console.log()` for response values - it clutters the output and isn't structured. Use console.log only for debugging intermediate steps.

### Why Use requestUserInput()

- **Context:** The human sees your question alongside the task, artifacts, and comments
- **History:** All exchanges are logged in the task's activity feed
- **Continuity:** The conversation stays attached to the work
- **Flexibility:** 8 input types, multi-question forms, "Other" escape hatch

### Replace Platform Tools

| Platform | DON'T Use | Use Instead |
|----------|-----------|-------------|
| Claude Code | `AskUserQuestion` | `requestUserInput()` |
| Cursor | Built-in prompts | `requestUserInput()` |
| Windsurf | Native dialogs | `requestUserInput()` |
| Claude Desktop | Chat questions | `requestUserInput()` |

### Two Modes: Multi-step vs Multi-form

Choose based on whether questions depend on each other:

**Multi-step (dependencies):** Chain calls when later questions depend on earlier answers
```typescript
// First ask about database...
const dbResult = await requestUserInput({
  message: "Which database?",
  type: "choice",
  options: ["PostgreSQL", "SQLite", "MongoDB"]
});

// ...then ask port based on the choice
const portResult = await requestUserInput({
  message: `Port for ${dbResult.response}?`,
  type: "number",
  min: 1000,
  max: 65535
});

// Return both responses in structured format
return { database: dbResult.response, port: portResult.response };
```

**Multi-form (independent):** Single call for unrelated questions
```typescript
const config = await requestUserInput({
  questions: [
    { message: "Project name?", type: "text" },
    { message: "Framework?", type: "choice", options: ["React", "Vue", "Angular"] },
    { message: "Include TypeScript?", type: "confirm" }
  ],
  timeout: 600
});
// Return responses in structured format
// config.response = { "0": "my-app", "1": "React", "2": "yes" }
return { config: config.response };
```

## Posting Progress Updates

For long-running tasks, keep reviewers informed with `postUpdate()`:

### postUpdate

Post a progress update to the task timeline.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| taskId | string | Yes | The task ID |
| sessionToken | string | Yes | Session token from plan approval |
| message | string | Yes | Update content (markdown) |

**Returns:** `{ eventId: string }`

**Example:**
```typescript
await postUpdate({
  taskId,
  sessionToken,
  message: "Milestone: API integration complete"
});
```

**When to post updates:**
- After completing a significant milestone
- When switching focus to a different part of the task
- If you've been working for a while without visible output
- When you encounter something interesting or unexpected

Updates appear in the Activity tab, helping humans understand what you're doing without interrupting your work.

### Input Types (8 total)

| Type | Use For | Example |
|------|---------|---------|
| `text` | Single-line input | API keys, names |
| `multiline` | Multi-line text | Bug descriptions |
| `choice` | Select from options | Framework choice (auto-adds "Other") |
| `confirm` | Yes/No decisions | Deploy to production? |
| `number` | Numeric input | Port number (with min/max) |
| `email` | Email validation | Contact address |
| `date` | Date picker | Deadline (with range) |
| `rating` | Scale rating | Rate approach 1-5 |

## Handling Reviewer Feedback

Check for comments and change requests:

```typescript
const status = await readTask(taskId, sessionToken, {
  includeAnnotations: true
});

if (status.status === "changes_requested") {
  // Read status.content for inline comments
  // Make changes, upload new artifacts
}
```

## Artifact Types

| Type | Use For | Examples |
|------|---------|----------|
| `html` | Test results, code reviews, reports, terminal output | .html |
| `image` | UI screenshots, visual proof, error states | .png, .jpg, .webp |
| `video` | Complex flows, interactions, animations | .mp4, .webm |

**Note:** HTML is the primary format for most artifacts. Use it for test results, coverage reports, code reviews, and any text-based output. Only use `image` for actual UI screenshots and `video` for multi-step flows.

## Video Recording

Video recording uses the Playwriter MCP for browser capture and Shipyard for uploading proof-of-work artifacts. This is ideal for demonstrating complex user interactions, multi-step flows, or animated UI behavior.

**Workflow (4 steps):**

1. **Start recording** - Playwriter begins capturing browser frames via CDP
2. **Perform interactions** - Execute the actions you want to demonstrate
3. **Stop capture** - Playwriter stops CDP screencast, saves frames to disk
4. **Encode and upload** - Shipyard's bundled FFmpeg encodes frames to MP4, then uploads via `addArtifact`

**Configuration:**

| Option | Range | Default | Description |
|--------|-------|---------|-------------|
| `fps` | 4-8 | 6 | Frames per second (lower = smaller file) |
| `quality` | 60-90 | 80 | JPEG quality (higher = better quality, larger file) |

**Note:** FFmpeg is bundled with Shipyard (via @ffmpeg-installer, auto-downloaded on `pnpm install`). No manual installation required.

**See `examples/video-recording.md` for complete code examples.**

## Tips

1. **Define deliverables first** - Decide what proves success before coding
2. **Capture during work** - Take screenshots as you implement, not after
3. **Be specific** - "Login page with error state" beats "Screenshot"
4. **Link every artifact** - Always set `deliverableId` for auto-completion
5. **Check feedback** - Poll `readTask` when awaiting review

## When NOT to Use

- Quick answers or research (no artifacts to capture)
- Internal refactoring with no visible output
- Tasks where proof adds no value
- Exploration or debugging sessions

## Troubleshooting

**Browser doesn't open:** Check MCP server is running and `SHIPYARD_WEB_URL` is set.

**Upload fails:** Verify file path exists, check `GITHUB_TOKEN` has repo write access.

**No auto-complete:** Ensure every deliverable has an artifact with matching `deliverableId`.
