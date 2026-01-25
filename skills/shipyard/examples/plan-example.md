# Example: Add User Profile Page

This shows the full agentic loop with Shipyard.

## Plan Creation

```typescript
const plan = await createPlan({
  title: "Add user profile page",
  content: `
# User Profile Page Implementation

## Deliverables
- [ ] Screenshot of profile page with user data {#deliverable}
- [ ] Screenshot of edit mode with form validation {#deliverable}
- [ ] Test results for profile API endpoints {#deliverable}

## Implementation Steps
1. Create ProfilePage component with user data display
2. Add edit mode with form validation
3. Connect to user API endpoints
4. Write and run tests
`
});

// Save for the agentic loop
const { planId, sessionToken, deliverables, monitoringScript } = plan;

// For non-hook agents (Cursor, Devin, Windsurf):
// The monitoringScript is a bash script that polls for approval.
// Run it in background: bash <(echo "$monitoringScript") &
// It exits when human approves or requests changes.
```

## Agentic Loop

The agent iterates through work, capturing proof at each milestone:

### Iteration 1: Build Profile Display

```typescript
// Agent implements profile display...

// Capture proof
await addArtifact({
  planId,
  sessionToken,
  type: 'image',
  filename: 'profile-display.png',
  filePath: './screenshots/profile.png',
  deliverableId: deliverables[0].id
});
```

### Iteration 2: Add Edit Mode

```typescript
// Agent implements edit mode with validation...

// Capture proof
await addArtifact({
  planId,
  sessionToken,
  type: 'image',
  filename: 'edit-mode.png',
  filePath: './screenshots/edit-form.png',
  deliverableId: deliverables[1].id
});
```

### Iteration 3: Run Tests

```typescript
// Agent runs tests...

// Capture proof - triggers auto-complete
const result = await addArtifact({
  planId,
  sessionToken,
  type: 'html',
  filename: 'api-tests.json',
  filePath: './test-output/results.json',
  deliverableId: deliverables[2].id
});

// All deliverables complete!
if (result.allDeliverablesComplete) {
  return {
    message: "Profile page complete with verified proof",
    snapshotUrl: result.snapshotUrl
  };
}
```

## Handling Feedback

If reviewer requests changes:

```typescript
const status = await readPlan(planId, sessionToken, {
  includeAnnotations: true
});

if (status.status === "changes_requested") {
  // Read feedback, address issues
  // Iterate again with new artifacts
}
```

## What Makes Good Deliverables

| Good | Bad |
|------|-----|
| Screenshot of profile page (image) | Create ProfilePage component |
| Video of edit flow (video) | Implement form validation |
| Test results HTML report (html) | Write unit tests |
| Code review HTML document (html) | Refactor API handler |

**Rule**: If you can't attach a file proving it's done, it's not a deliverable.

**Artifact Types**: `html` (reports, reviews, terminal output), `image` (screenshots), `video` (recordings)
