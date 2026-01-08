# Loro Markdown Sync Spike

Testing Loro CRDT for bidirectional markdown file synchronization.

## Goal

Validate whether Loro CRDT is a good fit for syncing markdown plan files between:
- A human editing in an editor (VS Code, Obsidian, Vim, etc.)
- An AI agent editing programmatically (Claude)
- Multiple humans collaborating (pair programming on plans)

## What This Tests

1. **Bidirectional file sync** - Changes to either file propagate to the other via CRDT
2. **`LoroText.update()` method** - Does the internal diffing work smoothly?
3. **Concurrent edit merging** - What happens when both files are edited at once?
4. **Feedback loop prevention** - Can we avoid infinite file write loops?
5. **Latency feel** - Is the sync responsive enough for real-time collaboration?

## Running the Spike

```bash
cd spikes/loro-markdown-sync
pnpm install --ignore-workspace
pnpm start
```

This creates `plan-a.md` and `plan-b.md` that sync via Loro CRDT.

---

## Findings (2026-01-05)

### What Worked ✅

- [x] **Loro `text.update()` works** - Internal Myers diff correctly identifies changes
- [x] **Basic file sync works** - Changes propagate between files
- [x] **Polling approach (20ms) is smoother** than file watchers (chokidar)
- [x] **Feedback loop prevention** - Content comparison prevents infinite loops
- [x] **Surgical edits** - `text.insert()` and `text.delete()` work for precise operations
- [x] **Agent → file sync** - Claude editing via bash reliably syncs to other file

### What Didn't Work ❌

- [x] **VSCode conflict dialogs** - When file changes externally while you're editing, VSCode prompts "The file has been changed on disk" instead of auto-merging
- [x] **macOS TextEdit same issue** - Also prompts for conflict resolution
- [x] **Rapid edits (< 100ms apart)** - Can lose intermediate changes due to write delay
- [x] **File watcher approach (chokidar)** - Too many duplicate events, feedback loop issues

### Key Insight: Editor Limitations

**The CRDT sync works fine. The problem is editors.**

| Editor | External Change Behavior |
|--------|-------------------------|
| VSCode | ❌ Prompts conflict dialog when dirty |
| TextEdit | ❌ Prompts conflict dialog |
| Obsidian | ✅ Auto-reloads (designed for sync) |
| Vim/Neovim | ✅ `:set autoread` works |
| Web app | ✅ You control the UX |

VSCode has a [7+ year old feature request](https://github.com/microsoft/vscode/issues/23107) for configurable auto-reload behavior - still unresolved.

### Architecture Learnings

**File-based sync fundamentally differs from operation-based sync:**

```
Google Docs (smooth):
  User types "a" → Operation sent → Merged → All clients update

File-based sync (jumpy):
  User saves file → Read entire file → Diff to find changes →
  Generate ops → Apply to CRDT → Write to other file
```

File sync will always be "jumpier" because we're reconstructing operations from snapshots.

### Approaches Tested

| Approach | Result |
|----------|--------|
| chokidar file watcher | ❌ Too many events, feedback loops |
| Native fs.watch + debounce | ⚠️ Works but VSCode prompts |
| Polling (20ms) | ✅ Most reliable sync |
| Surgical CRDT ops | ✅ Works well for agent edits |

### Latency Assessment

- **Polling at 20ms** - Feels responsive, changes appear within ~100ms
- **Write delay of 100-500ms** - Needed to prevent feedback loops
- **Overall feel** - Good enough for async collaboration, not quite "Google Docs smooth"

---

## Recommendations

### For Peer-Plan Architecture

1. **Primary editing: Web app (BlockNote)**
   - You control the UX, no conflict dialogs
   - Real-time operation sync via WebSocket

2. **Secondary editing: Obsidian**
   - Handles external file changes gracefully
   - Good for markdown power users

3. **Agent editing: Direct CRDT operations**
   - MCP tools write to CRDT, not files
   - Files are views, not the sync transport

4. **VSCode: View-only or needs extension**
   - Without a custom extension, VSCode isn't suitable for real-time collab
   - Could build a VSCode extension that implements CRDT client directly

### VSCode Extension Research (2026-01-07)

**Key Finding:** VSCode conflict dialogs are unsolvable for real disk files, but **FileSystemProvider API can bypass disk entirely**.

#### VSCode Extension Solutions

| Solution | Eliminates Conflict? | Complexity | Production Ready? |
|----------|---------------------|------------|-------------------|
| **FileSystemProvider** (`peerplan://` URI) | ✅ Yes | Medium | Yes |
| **y-monaco webview** (embedded Monaco) | ✅ Yes | Medium | Yes |
| Buffer applyEdit() | ❌ Race conditions | Low | No |
| Wait for VSCode fix | ❓ Unknown (7+ year wait) | N/A | No |

#### Recommended Approach: FileSystemProvider

Create VSCode extension that registers `peerplan://` URI scheme:

```typescript
class PeerPlanFS implements vscode.FileSystemProvider {
  private yDocs: Map<string, Y.Doc> = new Map();

  readFile(uri: vscode.Uri): Uint8Array {
    const doc = this.yDocs.get(uri.path);
    const content = doc.getText('content').toString();
    return new TextEncoder().encode(content);
  }

  writeFile(uri: vscode.Uri, content: Uint8Array): void {
    const doc = this.yDocs.get(uri.path);
    const text = doc.getText('content');
    const newContent = new TextDecoder().decode(content);
    text.update(newContent); // Loro diffs internally
    doc.commit();
  }
}
```

**How it works:**
1. User opens `peerplan://plan-abc123/document.md` instead of real file
2. Extension provides virtual file backed by Yjs/Loro CRDT
3. All edits go through CRDT (no disk = no conflict dialog)
4. Syncs to peers via y-websocket/y-webrtc
5. Optional: Export to disk as explicit action

**Prior art:**
- [GitHub Repositories extension](https://marketplace.visualstudio.com/items?itemName=GitHub.remotehub) uses FileSystemProvider
- [VSCode FileSystemProvider sample](https://github.com/microsoft/vscode-extension-samples/tree/main/fsprovider-sample)
- [y-monaco binding](https://github.com/yjs/y-monaco) for Monaco+Yjs

#### Alternative: y-monaco Webview

Embed Monaco editor in webview panel with Yjs binding:
- Real-time collab proven to work ([live demo](https://demos.yjs.dev/monaco/monaco.html))
- Cursor awareness included
- Works but loses native VSCode keybindings/extensions

#### Research Sources

- [VSCode Issue #23107](https://github.com/microsoft/vscode/issues/23107) - Auto-reload request (open since 2017)
- [VSCode FileSystemProvider API](https://code.visualstudio.com/api/extension-guides/virtual-documents)
- [Zed's CRDT blog](https://zed.dev/blog/crdts) - Why buffer-level sync works
- [Obsidian Relay](https://github.com/No-Instructions/Relay) - Successful Yjs plugin
- [PeerCode extension](https://github.com/PeerCodeProject/PeerCode) - Yjs-based VSCode collab

---

## Technical Reference

### Loro CRDT Setup

```typescript
import { LoroDoc } from "loro-crdt";

const doc = new LoroDoc();
const text = doc.getText("content");

// Full content update (Loro diffs internally)
text.update(newContent);
doc.commit();

// Surgical edit (more precise)
const index = content.indexOf(oldString);
text.delete(index, oldString.length);
text.insert(index, newString);
doc.commit();
```

### Polling Implementation

```typescript
const POLL_INTERVAL = 20; // ms

function pollLoop() {
  const contentA = readFile(FILE_A);
  const contentB = readFile(FILE_B);

  if (contentA !== lastContentA && contentA !== lastWrittenA) {
    text.update(contentA);
    scheduleWriteToOtherFile();
  }
  // ... same for B

  setTimeout(pollLoop, POLL_INTERVAL);
}
```

### Feedback Loop Prevention

```typescript
let lastWrittenA = "";

function writeToFile(path, content) {
  lastWrittenA = content; // Track what we wrote
  writeFileSync(path, content);
}

function onFileChange(path) {
  const content = readFile(path);
  if (content === lastWrittenA) return; // Ignore our own write
  // ... process external change
}
```

---

## Conclusion

### Spike Verdict

**Loro CRDT works excellently** for markdown sync. The `text.update()` method correctly diffs content and generates efficient operations. Polling at 20ms provides responsive sync with minimal overhead.

**The blocker is editor support, not the CRDT layer.**

### Path Forward

To enable "bring your own editor" for peer-plan:

1. **Tier 1: Web app (BlockNote)** - Primary editing experience, no compromises
2. **Tier 2: Obsidian** - Test with real Obsidian vault, handles external changes well
3. **Tier 3: VSCode via extension** - Build `peerplan://` FileSystemProvider for conflict-free editing
4. **Tier 4: Other editors** - Export-only (view in any editor, edit in Tiers 1-3)

### Next Steps

1. **Test with Obsidian** - Validate auto-reload works as expected
2. **Prototype VSCode extension** - FileSystemProvider with Yjs backing
3. **Document editor support matrix** - Set clear expectations for users
4. **Create GitHub issue** - Track VSCode extension development

---

**Created:** 2026-01-05
**Updated:** 2026-01-07
**Status:** Complete - findings documented, VSCode extension path identified
**Spike verdict:** ✅ Loro validated, VSCode requires extension for real-time collab
