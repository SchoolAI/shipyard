---
name: shipyard
description: Create verified work plans with proof-of-work tracking. Use when tasks need human review, artifact evidence, or collaboration.
---

# Shipyard: Verified Work Plans

Use this skill when doing work that needs:
- Human review before completion
- Visual proof (screenshots, videos)
- Collaboration with reviewers
- Audit trail of what was done

## Quick Start

1. **Create a plan** with deliverables (provable outcomes)
2. **Do the work** and capture artifacts as you go
3. **Upload artifacts** linked to deliverables
4. **Auto-complete** when all deliverables are satisfied

## What Are Deliverables?

Deliverables are outcomes you can PROVE with artifacts. Mark them with `{#deliverable}`.

**Good (provable):**
- Screenshot of working login page
- Video showing feature in action
- Test results showing all tests pass

**Bad (implementation details - can't prove with artifacts):**
- Implement getUserMedia API
- Add error handling
- Refactor code

## How It Works: execute_code

Shipyard uses ONE tool called `execute_code` that runs TypeScript code.
Write code that calls our APIs - NOT individual MCP tool calls.

### Step 1: Create Plan

Use `execute_code` with:

```typescript
const plan = await createPlan({
  title: "Your Task Name",
  content: `
# Implementation Plan

## Deliverables
- [ ] Screenshot of completed feature {#deliverable}
- [ ] Test results showing success {#deliverable}

## Steps
1. First implementation step
2. Second implementation step
3. Third implementation step
`
});

// IMPORTANT: Save these for all subsequent calls
const { planId, sessionToken, deliverables } = plan;

// deliverables contains:
// [
//   { id: "del_xxx", text: "Screenshot of completed feature" },
//   { id: "del_yyy", text: "Test results showing success" }
// ]
```

The browser will open automatically showing your plan.

### Step 2: Do the Work

Complete your actual task. As you work, capture proof:
- **Screenshots**: UI changes, completed features
- **Videos**: Complex flows, interactions
- **Test results**: Command output, test reports

### Step 3: Upload Artifacts

Link artifacts to their deliverables:

```typescript
const result = await addArtifact({
  planId,
  sessionToken,
  type: 'screenshot',  // or 'video', 'test_results', 'diff'
  filename: 'feature-complete.png',
  filePath: '/path/to/screenshot.png',
  deliverableId: deliverables[0].id  // Links to first deliverable
});

// Check for auto-completion
if (result.allDeliverablesComplete) {
  // All deliverables have artifacts - task complete!
  return result.snapshotUrl;  // Share this URL as proof
}
```

### Step 4: Check for Feedback (Optional)

If reviewers leave comments:

```typescript
const status = await readPlan(planId, sessionToken, {
  includeAnnotations: true  // Include reviewer comments
});

if (status.status === "changes_requested") {
  // Reviewer left feedback - read annotations and address them
  console.log(status.content);  // Contains inline comments
}
```

## Asking Users Questions

**IMPORTANT:** If you need to ask the user a question, use the `request_user_input` MCP tool (or `requestUserInput()` in execute_code) instead of your platform's built-in question mechanisms.

Your platform may have built-in tools like:
- Claude Code: `AskUserQuestion`
- Devin/Cursor: `prompt()` or similar
- Other agents: Various question/input mechanisms

**Use Shipyard's version instead** because:
- ✅ Shows in the browser UI (where users are already viewing plans)
- ✅ Integrates with the activity log
- ✅ Consistent UX across all agent platforms
- ✅ Can be linked to specific plans (via `planId` parameter)

**Standalone tool:**
```typescript
const result = await mcp.call_tool('request_user_input', {
  message: "Which database should we use?",
  type: "choice",
  options: ["PostgreSQL", "MongoDB"]
});

if (result.success) {
  console.log("User chose:", result.response);
}
```

**Via execute_code (multi-step workflows):**
```typescript
const result = await requestUserInput({
  message: "Proceed with deployment?",
  type: "confirm"
});
```

## Available APIs

| API | Purpose |
|-----|---------|
| `requestUserInput(opts)` | Ask user a question (use instead of built-in tools) |
| `createPlan(opts)` | Start a new verified plan |
| `addArtifact(opts)` | Upload proof (screenshot, video, test_results, diff) |
| `readPlan(planId, token, opts)` | Check status and reviewer feedback |
| `updatePlan(planId, token, updates)` | Manually change status (rarely needed) |
| `linkPR(opts)` | Link a GitHub PR to the plan |
| `setupReviewNotification(planId)` | Get script to wait for approval |

## Complete Example

Here's a full workflow for adding a dark mode feature:

```typescript
// 1. Create the plan with deliverables
const plan = await createPlan({
  title: "Add dark mode toggle",
  content: `
# Dark Mode Implementation

## Deliverables
- [ ] Screenshot of dark mode active {#deliverable}
- [ ] Screenshot of light mode active {#deliverable}
- [ ] Test results for theme switching {#deliverable}

## Implementation Steps
1. Add theme context provider
2. Create toggle component
3. Apply CSS variables for themes
4. Test theme persistence
`
});

const { planId, sessionToken, deliverables } = plan;

// 2. (You implement the dark mode feature here)

// 3. Upload screenshots as proof
await addArtifact({
  planId,
  sessionToken,
  type: 'screenshot',
  filename: 'dark-mode.png',
  filePath: './screenshots/dark.png',
  deliverableId: deliverables[0].id
});

await addArtifact({
  planId,
  sessionToken,
  type: 'screenshot',
  filename: 'light-mode.png',
  filePath: './screenshots/light.png',
  deliverableId: deliverables[1].id
});

// 4. Upload test results
const result = await addArtifact({
  planId,
  sessionToken,
  type: 'test_results',
  filename: 'theme-tests.json',
  filePath: './test-output/results.json',
  deliverableId: deliverables[2].id
});

// 5. Auto-complete triggers when all deliverables have artifacts
if (result.allDeliverablesComplete) {
  return {
    message: "Dark mode implementation complete!",
    snapshotUrl: result.snapshotUrl
  };
}
```

## Artifact Types

| Type | Use For | File Types |
|------|---------|------------|
| `screenshot` | UI changes, visual proof | .png, .jpg, .gif |
| `video` | Complex flows, demonstrations | .mp4, .webm |
| `test_results` | Test output, coverage reports | .json, .txt, .xml |
| `diff` | Code changes, before/after | .diff, .patch |

## Tips

1. **Plan first**: Think about what deliverables will prove success before starting work
2. **Capture as you go**: Take screenshots during implementation, not just at the end
3. **Be specific**: "Screenshot of login page with error message" is better than "Screenshot"
4. **Link artifacts**: Always include `deliverableId` to track completion
5. **Check status**: Use `readPlan` periodically to see if reviewers left feedback

## When NOT to Use This Skill

- Quick questions that don't need verification
- Simple tasks with obvious results
- Internal helper functions with no visible output
- Research or exploration (no artifacts to capture)

## Troubleshooting

**Plan doesn't open in browser:**
- Ensure MCP server is running
- Check Claude Desktop MCP configuration

**Artifact upload fails:**
- Verify file path exists
- Check file permissions
- Ensure GitHub token is configured (for remote storage)

**Auto-complete doesn't trigger:**
- Verify all deliverables have `deliverableId` set on their artifacts
- Check that all deliverables were created (use `readPlan` to verify)
