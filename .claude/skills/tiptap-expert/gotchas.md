# TipTap + loro-prosemirror — Gotchas

1. **LoroDocType cast required.** `loro-prosemirror` exports `LoroDocType` which doesn't match `LoroDoc` at TypeScript level. Cast: `loroDoc as unknown as LoroDocType`. Safe at runtime.

2. **Disable ProseMirror history.** When using `LoroUndoPlugin`, disable built-in history. Either configure StarterKit: `StarterKit.configure({ history: false })` or override keyboard shortcuts for undo/redo (Shipyard's approach — LoroExtension overrides Mod-z/Mod-y/Mod-Shift-z).

3. **Use undo/redo from loro-prosemirror.** NOT ProseMirror's history commands. They take `(state, dispatch)` from EditorView.

4. **containerId must point to a LoroMap.** Use `loroDoc.getMap("content").id`. The key name is arbitrary but must be consistent.

5. **Shape.any() required for content.** Do NOT define a typed schema for loro-prosemirror-managed content. It manages its own internal structure.

6. **Pass `content: ""` to useEditor.** LoroSyncPlugin populates from CRDT. Passing initial content + CRDT content = conflicts.

7. **Server-side content writing.** Assign TipTap JSON directly: `doc.taskDoc.content = tiptapJson`. Works for initial population.

8. **Version compatibility.** Shipyard uses `loro-prosemirror@^0.4.2`. API may differ from older versions.

9. **Re-create editor on doc change.** Pass `[loroDoc]` as useEditor dependency array. Avoids stale plugin references but may cause brief UI flicker.

10. **Markdown converter is basic.** Server-side converter only handles headings (1-3), task items, bullet lists, and paragraphs. No inline formatting.

11. **Content is opaque in schema.** The `content` field in TaskDocumentSchema uses `Shape.any()`. You access it via `doc.taskDoc.content` but the internal structure belongs to loro-prosemirror.
