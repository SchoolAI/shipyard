---
name: shipyard
description: |
  Companion skill for the Shipyard MCP server - creates verified work tasks with proof-of-work tracking.

  **IMPORTANT:** When Shipyard MCP tools are available (`mcp__shipyard__*` or `mcp__plugin_shipyard_shipyard__*`), ALWAYS load this skill first. The MCP provides tools; this skill teaches the workflow for using them effectively together.

  Use when tasks need human review, screenshot/video evidence, audit trails, or collaborative review. Invoke when the user says "create a task", "I need proof of this", "track my work", "make this reviewable", or needs accountability for implementation work.
---

# Shipyard: Verified Work Tasks

> **MCP + Skill = Full Power:** If you see `mcp__shipyard__*` tools available, you have the Shipyard MCP. This skill teaches you how to use those tools effectively. Always use both together for the best workflow.

Shipyard turns invisible agent work into reviewable, verifiable tasks. Instead of trusting that code was written correctly, reviewers see screenshots, videos, and test results as proof.

**Why use Shipyard?**
- **Accountability** - Prove you did the work with artifacts
- **Human-in-the-loop** - Reviewers can approve, request changes, or leave feedback
- **Audit trail** - Every task has a permanent record with timestamps
- **Collaboration** - Real-time sync between agent and reviewers via browser

## MCP Integration

This skill complements the Shipyard MCP server. The MCP provides tools; this skill teaches you how to use them effectively.

**MCP tools available:**
| Tool | Purpose |
|------|---------|
| `execute_code` | Run TypeScript that calls Shipyard APIs (recommended) |
| `request_user_input` | Ask user questions via browser modal |
| `create_plan` | Start a new verified task |
| `add_artifact` | Upload proof (screenshot, video, test results) |
| `read_plan` | Check status and reviewer feedback |
| `link_pr` | Connect a GitHub PR to the task |

**Preferred approach:** Use `execute_code` to chain multiple API calls in one step, reducing round-trips.

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
  planId,
  sessionToken,
  type: 'test_results',
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
  planId,
  sessionToken,
  type: 'screenshot',
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
const plan = await createPlan({
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

const { planId, sessionToken, deliverables, monitoringScript } = plan;
// deliverables = [{ id: "del_xxx", text: "Screenshot of profile page with avatar" }, ...]
// monitoringScript = bash script to poll for approval (for non-hook agents)

// For non-hook agents (Cursor, Devin, etc.): Run the monitoring script in background
// to wait for human approval before proceeding:
// bash <(echo "$monitoringScript") &

// Step 2: Implement the feature (your actual work happens here)

// Step 3: Upload proof
await addArtifact({
  planId,
  sessionToken,
  type: 'screenshot',
  filename: 'profile-page.png',
  source: 'file',
  filePath: '/tmp/screenshots/profile.png',
  deliverableId: deliverables[0].id
});

const result = await addArtifact({
  planId,
  sessionToken,
  type: 'screenshot',
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

## Asking Users Questions

Use `request_user_input` instead of your platform's built-in question tools. This shows questions in the browser where users view tasks.

```typescript
const result = await requestUserInput({
  message: "Which database should we use?",
  type: "choice",
  options: ["PostgreSQL", "SQLite", "MongoDB"]
});

if (result.success) {
  console.log("User chose:", result.response);
}
```

**Input types:** `text`, `multiline`, `choice`, `confirm`

## Handling Reviewer Feedback

Check for comments and change requests:

```typescript
const status = await readPlan(planId, sessionToken, {
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
| `screenshot` | UI changes, visual proof | .png, .jpg |
| `video` | Complex flows, interactions | .mp4, .webm |
| `test_results` | Test output, coverage | .json, .txt |
| `diff` | Code changes | .diff, .patch |

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

1. **Plan deliverables first** - Decide what proves success before coding
2. **Capture during work** - Take screenshots as you implement, not after
3. **Be specific** - "Login page with error state" beats "Screenshot"
4. **Link every artifact** - Always set `deliverableId` for auto-completion
5. **Check feedback** - Poll `readPlan` when awaiting review

## When NOT to Use

- Quick answers or research (no artifacts to capture)
- Internal refactoring with no visible output
- Tasks where proof adds no value
- Exploration or debugging sessions

## Troubleshooting

**Browser doesn't open:** Check MCP server is running and `SHIPYARD_WEB_URL` is set.

**Upload fails:** Verify file path exists, check `GITHUB_TOKEN` has repo write access.

**No auto-complete:** Ensure every deliverable has an artifact with matching `deliverableId`.
