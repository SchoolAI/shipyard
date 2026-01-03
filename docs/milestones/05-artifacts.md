# Milestone 5: Artifacts

**Status**: Not Started
**Goal**: GitHub blob storage for screenshots, videos, test results

---

## Overview

Add artifact support:
1. Agent can upload binary artifacts (screenshots, videos)
2. Artifacts stored in GitHub orphan branch
3. UI renders actual images/videos

Note: This comes AFTER the core flow works. Artifacts are additive proof, not critical path.

---

## Deliverables

### 5a: GitHub Storage Functions

- [ ] `ensureOrphanBranch(repo, pat)` - create if not exists
- [ ] `uploadArtifact(repo, pat, planId, filename, content)` - push file
- [ ] `getArtifactUrl(repo, planId, filename)` - construct raw URL

**Storage path:** `plan-artifacts/pr-{pr}/{plan-id}/{filename}`

### 5b: MCP `add_artifact` Tool

- [ ] Accept: planId, type, filename, base64Content
- [ ] Upload to GitHub
- [ ] Update plan's artifact list in CRDT
- [ ] Return artifact URL

```typescript
server.tool(
  "add_artifact",
  {
    planId: z.string(),
    stepId: z.string().optional(),
    type: z.enum(['screenshot', 'video', 'test_results', 'diff']),
    filename: z.string(),
    content: z.string().describe("Base64 encoded file content"),
  },
  async (args) => {
    const url = await uploadArtifact(args);
    // Update CRDT to include artifact reference
    return { url };
  }
);
```

### 5c: Artifact Renderer in UI

- [ ] Detect artifact type from extension/metadata
- [ ] Render images inline
- [ ] Render videos with player
- [ ] Render JSON as formatted code block
- [ ] Render diffs with syntax highlighting
- [ ] Handle missing artifacts gracefully

### 5d: Artifact in URL Snapshots

- [ ] Include artifact references in URL encoding
- [ ] Only filename, not content (content is in GitHub)
- [ ] URL can reconstruct what artifacts should exist

---

## Demo Checkpoint

**Scenario**: Agent attaches proof to plan

```
1. Agent creates plan
2. Agent takes screenshot of UI work
3. Agent calls add_artifact with screenshot
4. Browser shows actual screenshot inline
5. Reviewer can verify work was done
```

---

## Success Criteria

1. Agent can upload screenshots/videos
2. UI renders artifacts correctly
3. Artifacts survive page refresh (stored in GitHub)
4. Missing artifacts show placeholder, not crash

---

## Technical Notes

### GitHub API for File Upload

```typescript
async function uploadArtifact(
  repo: string,
  pat: string,
  planId: string,
  filename: string,
  content: string // base64
): Promise<string> {
  const path = `pr-${prNumber}/${planId}/${filename}`;

  await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${pat}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `Add artifact: ${filename}`,
      content, // base64
      branch: 'plan-artifacts',
    }),
  });

  return `https://raw.githubusercontent.com/${repo}/plan-artifacts/${path}`;
}
```

### Orphan Branch Creation

Must be done via git commands (API doesn't support orphan branches):

```bash
git checkout --orphan plan-artifacts
git rm -rf .
git commit --allow-empty -m "Initialize plan artifacts branch"
git push -u origin plan-artifacts
```

MCP server could shell out to do this, or document as setup step.

### Artifact Type Detection

```typescript
function getArtifactRenderer(artifact: Artifact) {
  switch (artifact.type) {
    case 'screenshot':
      return <img src={artifact.url} alt={artifact.filename} />;
    case 'video':
      return <video src={artifact.url} controls />;
    case 'test_results':
      return <JsonViewer url={artifact.url} />;
    case 'diff':
      return <DiffViewer url={artifact.url} />;
  }
}
```

---

## Dependencies

- Milestone 4 (Review Flow) - artifacts complement annotations

## Blocks

- Nothing (this is additive)

---

*Created: 2026-01-02*
