# Milestone 2: View Plans

**Status**: Not Started
**Goal**: Web UI that renders plans from URLs

---

## Overview

Build a React app that:
1. Decodes plan from URL
2. Renders plan structure nicely
3. Shows steps, status, artifact placeholders
4. Deployable to GitHub Pages

No live sync yet. Pure static rendering from URL data.

---

## Deliverables

### 2a: React App Setup

- [ ] Vite + React + TypeScript
- [ ] Install `@peer-plan/schema` from workspace
- [ ] Configure for GitHub Pages deployment
- [ ] Set up routing (single page, query param based)

### 2b: URL Decoding

- [ ] Parse `?d=` query parameter on load
- [ ] Decode using `decodePlan()` from schema package
- [ ] Handle invalid/missing data gracefully
- [ ] Show error state for corrupt URLs

### 2c: Plan Renderer

- [ ] Plan header (title, status badge, PR link)
- [ ] Steps list with checkboxes (read-only for now)
- [ ] Artifact references (placeholders, no actual images yet)
- [ ] Clean, minimal styling (Tailwind or CSS modules)

### 2d: GitHub Pages Deployment

- [ ] Configure Vite for static build
- [ ] Set up GitHub Actions for deploy
- [ ] Test URL routing works on Pages

---

## Demo Checkpoint

**Scenario**: Anyone with a plan URL can view it

```
1. Get URL from Milestone 1 demo
2. Open in browser (or share with someone)
3. See nicely rendered plan:
   - Title: "Add User Authentication"
   - Status: pending_review
   - Steps:
     [ ] Create auth middleware
     [ ] Add login endpoint
     [ ] Write tests
   - Artifacts: (placeholders)
```

---

## Success Criteria

1. URL from Milestone 1 renders correctly
2. Invalid URLs show helpful error
3. Deployed to GitHub Pages
4. Works on mobile browsers

---

## Technical Notes

### URL Parsing

```typescript
function usePlanFromUrl(): UrlEncodedPlan | null {
  const searchParams = new URLSearchParams(window.location.search);
  const encoded = searchParams.get('d');
  if (!encoded) return null;
  return decodePlan(encoded);
}
```

### Component Structure

```
<App>
  <PlanView plan={plan}>
    <PlanHeader title={plan.title} status={plan.status} />
    <StepsList steps={plan.steps} />
    <ArtifactsList artifacts={plan.artifacts} />
  </PlanView>
</App>
```

### Styling Approach

Keep it minimal:
- System fonts
- Simple card layout
- Status badges with colors
- Checkbox icons for steps

---

## Dependencies

- Milestone 0 (schemas, URL decoding)
- Milestone 1 (to have URLs to test with)

## Blocks

- Milestone 3 (Live Sync) - adds interactivity to this UI

---

*Created: 2026-01-02*
