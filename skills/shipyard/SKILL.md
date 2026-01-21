---
name: shipyard
description: Companion skill for the Shipyard MCP server - creates verified work tasks with proof-of-work tracking. Use when tasks need human review, screenshot/video evidence, audit trails, or collaborative review. Invoke when the user says "create a task", "I need proof of this", "track my work", "make this reviewable", or needs accountability for implementation work.
---

# Shipyard: Verified Work Tasks

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

const { planId, sessionToken, deliverables } = plan;
// deliverables = [{ id: "del_xxx", text: "Screenshot of profile page with avatar" }, ...]

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
