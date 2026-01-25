# Milestone 2: View Tasks

**Status**: In Progress
**Goal**: Upgrade web UI to use BlockNote editor and shadcn/ui components

---

## Overview

Upgrade the basic React app to:
1. Render BlockNote blocks with the actual BlockNote editor (read-only mode)
2. Use shadcn/ui for clean, accessible components
3. Add proper styling and layout
4. Deploy to GitHub Pages

No live sync yet. Pure static rendering from URL data with professional UI.

---

## Deliverables

### 2a: shadcn/ui Setup

- [ ] Initialize shadcn/ui in web package
- [ ] Install Tailwind CSS
- [ ] Add shadcn/ui components: Card, Badge, Button, Separator
- [ ] Set up theme (light/dark mode support for future)

### 2b: URL Decoding

- [ ] Parse `?d=` query parameter on load
- [ ] Decode using `decodePlan()` from schema package
- [ ] Handle invalid/missing data gracefully
- [ ] Show error state for corrupt URLs

### 2c: Task Renderer with BlockNote

- [ ] Replace JSON rendering with BlockNote editor (read-only mode)
- [ ] Task header using shadcn Card (title, status Badge, PR link)
- [ ] BlockNote editor for content display
- [ ] Artifact references using shadcn components
- [ ] Professional layout and spacing

### 2d: GitHub Pages Deployment

- [ ] Configure Vite for static build
- [ ] Set up GitHub Actions for deploy
- [ ] Test URL routing works on Pages

---

## Demo Checkpoint

**Scenario**: Anyone with a task URL can view it

```
1. Get URL from Milestone 1 demo
2. Open in browser (or share with someone)
3. See nicely rendered task:
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
  <TaskView task={task}>
    <TaskHeader title={task.title} status={task.status} />
    <StepsList steps={task.steps} />
    <ArtifactsList artifacts={task.artifacts} />
  </TaskView>
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
