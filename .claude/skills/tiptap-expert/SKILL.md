---
name: tiptap-expert
description: "Expert at TipTap editor and loro-prosemirror CRDT bridge. Use when working with the rich text editor, TipTap extensions, ProseMirror plugins, collaborative editing sync, markdown-to-TipTap conversion, or custom marks/nodes in Shipyard."
---

# TipTap + loro-prosemirror Expert

## Overview

Shipyard uses **TipTap 3** (ProseMirror-based rich text editor) with **loro-prosemirror** as the CRDT bridge for real-time collaborative editing. Content is stored in Loro documents and synced via WebSocket.

## Quick Reference: loro-prosemirror Setup

```ts
import { LoroSyncPlugin, LoroUndoPlugin } from "loro-prosemirror";
import type { LoroDocType } from "loro-prosemirror";

const loroDoc = doc as unknown as LoroDocType; // Cast required
const contentMap = loroDoc.getMap('content');
const containerId = contentMap.id;

// In TipTap extension:
Extension.create({
  addProseMirrorPlugins() {
    return [
      LoroSyncPlugin({ doc: loroDoc, containerId }),
      LoroUndoPlugin({ doc: loroDoc }),
    ];
  },
});
```

## Quick Reference: TipTap Extension Pattern

```ts
import { Extension } from "@tiptap/core";

const MyExtension = Extension.create({
  name: "myExtension",

  addOptions() {
    return { someOption: false };
  },

  addProseMirrorPlugins() {
    return [/* ProseMirror Plugin instances */];
  },

  addKeyboardShortcuts() {
    return {
      "Mod-z": () => { /* handler */ return true; },
    };
  },

  addCommands() {
    return {
      myCommand: () => ({ commands }) => commands.first([]),
    };
  },
});
```

## Quick Reference: Custom Mark Pattern

```ts
import { Mark as TiptapMark } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    commentMark: { setComment: (id: string) => ReturnType };
  }
}

const CommentMark = TiptapMark.create({
  name: "comment",

  addAttributes() {
    return {
      commentId: { default: null, parseHTML: (el) => el.getAttribute("data-comment-id") },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-comment-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", { ...HTMLAttributes, class: "comment-highlight" }, 0];
  },

  addCommands() {
    return {
      setComment: (id) => ({ commands }) =>
        commands.setMark(this.name, { commentId: id }),
    };
  },
});
```

## Shipyard Editor Stack

The editor uses these extensions:
- **StarterKit** — Paragraph, headings, lists, bold, italic, code, blockquote, etc.
- **Placeholder** — Shows placeholder text when empty
- **CommentMark** — Custom mark for inline comment annotations
- **LoroExtension** — Custom extension wrapping LoroSyncPlugin + LoroUndoPlugin with undo/redo keyboard shortcuts
- **DragHandle** — Block drag handle (`@tiptap/extension-drag-handle-react`)

## Key Files

- `apps/web/src/editor/task-editor.tsx` — Editor React component (useEditor)
- `apps/web/src/editor/extensions.ts` — Extension definitions (LoroExtension, CommentMark)
- `apps/server/src/mcp/tools/create-task.ts` — Server-side markdown-to-TipTap converter (lines 14-103)
- `apps/web/src/components/task/task-content.tsx` — Task content wrapper component

## Further Reading

- [reference.md](./reference.md) — Complete API reference
- [gotchas.md](./gotchas.md) — Common pitfalls and workarounds
