# Version/Commit Panel: Graphite-Inspired Change History

**Created:** 2026-02-15
**Status:** WIP / Ideas
**Scope:** Add a commit/version timeline to the side panel, similar to Graphite's PR stack view

---

## Executive Summary

The current diff panel shows a flat snapshot of changes (working tree, branch, or last turn). There's no way to browse the commit history, see how changes evolved over time, or compare specific commits. Graphite's desktop app shows a clean vertical timeline of commits with inline diffs per commit — we want something similar for Shipyard's side panel.

---

## Motivation

- **No commit history visibility**: Users can't see what happened between turns or across commits
- **Flat diff is noisy**: Working tree diff shows everything at once — no way to see "what changed in the last commit" vs "what's uncommitted"
- **Turn-based workflow**: Shipyard's agent operates in turns. Users want to see "what did the agent do in turn 3?" as a discrete unit
- **Review workflow**: Before approving a plan or merging, users need to review changes granularly, not as one blob

---

## Design Ideas

### Option A: Commit Timeline (Graphite-style)

A vertical timeline in the side panel showing commits on the current branch:

```
  [HEAD] feat: add auth middleware        ← clickable
    |    3 files changed, +47 -12
    |
  [abc123] fix: rate limiter bug          ← clickable
    |    1 file changed, +5 -3
    |
  [def456] refactor: extract validator    ← clickable
    |    4 files changed, +89 -67
    |
  ─── base (main) ───
```

- Click a commit → diff panel shows that commit's changes
- Click between two commits → shows the range diff
- Current uncommitted changes shown at the top as "Working Tree"
- Each commit shows: hash, message, file count, insertions/deletions, timestamp

### Option B: Turn Timeline (Shipyard-native)

Instead of git commits, show agent turns:

```
  [Turn 5] Working Tree                   ← current
    |    2 files changed (uncommitted)
    |
  [Turn 4] Added error handling           ← click to see turn diff
    |    Commit: abc123
    |    3 files changed, +47 -12
    |
  [Turn 3] Refactored auth module         ← click to see turn diff
    |    Commits: def456, ghi789
    |    6 files changed, +120 -45
    |
  ─── task started ───
```

- Groups commits by agent turn (using `lastTurnUpdatedAt` snapshots)
- More meaningful for the Shipyard workflow than raw commits
- Could store turn snapshots in the CRDT for offline access

### Option C: Hybrid — Scope Dropdown Expands

Extend the existing scope dropdown to include commit-level navigation:

```
Scope: [Working Tree v]
       ├── Working Tree        (current)
       ├── Last Turn           (current)
       ├── Branch Changes      (current)
       ├── ─────────────
       ├── HEAD                (new)
       ├── HEAD~1              (new)
       ├── HEAD~2              (new)
       └── Custom range...     (new)
```

Least UI change — reuses the existing diff panel with a richer scope selector.

---

## Data Requirements

### What we need from the daemon

Currently the daemon provides:
- `unstaged` / `staged` diff strings
- `branchDiff` (base..HEAD)
- `lastTurnDiff` (snapshot-based)
- `files` / `branchFiles` / `lastTurnFiles` arrays

For a commit timeline, we'd additionally need:
- **Commit list**: `git log --oneline --format='%H %s %ai' base..HEAD`
- **Per-commit diff**: `git diff <parent>..<commit>` (on demand, not all upfront)
- **Per-commit file list**: `git diff --name-status <parent>..<commit>`

### CRDT schema additions

```typescript
const CommitShape = Shape.struct({
  hash: Shape.plain.string(),
  message: Shape.plain.string(),
  timestamp: Shape.plain.number(),
  filesChanged: Shape.plain.number(),
  insertions: Shape.plain.number(),
  deletions: Shape.plain.number(),
});

// In DiffStateShape:
commits: Shape.list(CommitShape),  // ordered newest-first
```

Per-commit diffs would be fetched on demand (too large to store all in CRDT).

---

## UI Integration

### Where does it live?

**Option 1: Replace the scope dropdown with a richer selector**
- Scope dropdown becomes a popover with commit list
- Selecting a commit loads that commit's diff into the existing diff viewer
- Minimal new UI — reuses everything we have

**Option 2: New tab in side panel**
- Add a "History" tab alongside Plan and Diff
- Shows the full timeline with expandable commit details
- More space but adds another tab

**Option 3: Collapsible section above the diff**
- Timeline sits between the action bar and the diff content
- Collapsible to save space
- Always visible context for "what am I looking at"

### Recommendation

Start with **Option 1** (richer scope selector) as it requires the least new UI and builds on the existing architecture. The scope dropdown already switches between working-tree/branch/last-turn — adding commit-level granularity is a natural extension.

---

## Performance Considerations

- **Don't fetch all commit diffs upfront**: Only fetch when a specific commit is selected
- **Cache commit diffs**: Once fetched, store in a local Map (not CRDT — too large)
- **Limit commit list**: Show last N commits (20-50), with "load more" pagination
- **Use `useDeferredValue`**: Same pattern as current diff panel for non-blocking updates when switching commits
- **Virtualize the timeline**: If showing 50+ commits, use virtual scrolling

---

## Open Questions

1. Should we show commits or turns as the primary unit? (Commits are universal, turns are Shipyard-specific)
2. How do we handle merge commits? (Show them? Skip them? Flatten?)
3. Should the commit list be stored in the CRDT or fetched fresh from the daemon?
4. Range diffs (commit A to commit B) — worth the complexity?
5. How does this interact with the existing "Last Turn" scope? (Last Turn is already a version snapshot)

---

## Related Work

- **Graphite Desktop**: Shows PR stack with per-commit diffs, inline comments
- **GitHub PR Files tab**: Commit-by-commit file review
- **VS Code Timeline**: Shows file-level history in the explorer
- **GitLens**: Inline blame + commit history

---

*Last updated: 2026-02-15*
