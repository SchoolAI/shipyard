# TipTap + loro-prosemirror — Full Reference

## loro-prosemirror Exports

| Export | Purpose |
|---|---|
| `LoroSyncPlugin` | ProseMirror plugin syncing editor ↔ Loro doc |
| `LoroUndoPlugin` | CRDT-aware undo/redo (replaces ProseMirror history) |
| `LoroEphemeralCursorPlugin` | Real-time cursor presence |
| `CursorEphemeralStore` | Manages cursor state per peer |
| `LoroDocType` | TypeScript type (cast from LoroDoc) |
| `undo(state, dispatch)` | Dispatch undo through Loro |
| `redo(state, dispatch)` | Dispatch redo through Loro |

## Plugin Setup

```ts
import { LoroSyncPlugin, LoroUndoPlugin, type LoroDocType } from "loro-prosemirror";

const typedDoc = loroDoc as unknown as LoroDocType;
const contentMap = loroDoc.getMap('content');
const containerId = contentMap.id;

LoroSyncPlugin({ doc: typedDoc, containerId });
LoroUndoPlugin({ doc: loroDoc });
```

## TipTap Extension API

```ts
Extension.create({
  name: "myExtension",
  addOptions() { return {}; },
  addProseMirrorPlugins() { return []; },
  addKeyboardShortcuts() { return { "Mod-z": () => true }; },
  addCommands() { return { myCmd: () => ({ commands }) => commands.first([])}; },
  addAttributes() { return {}; },
})
```

## Custom Mark

```ts
import { Mark as TiptapMark, mergeAttributes } from "@tiptap/core";

const MyMark = TiptapMark.create({
  name: "myMark",
  addAttributes() {
    return { myAttr: { default: null, parseHTML: (el) => el.getAttribute("data-my-attr") } };
  },
  parseHTML() { return [{ tag: "span[data-my-attr]" }]; },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },
  addCommands() {
    return {
      setMyMark: (val) => ({ commands }) => commands.setMark(this.name, { myAttr: val }),
      unsetMyMark: () => ({ commands }) => commands.unsetMark(this.name),
    };
  },
});

// Type augmentation
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    myMark: { setMyMark: (val: string) => ReturnType; unsetMyMark: () => ReturnType; };
  }
}
```

## StarterKit Includes

Document, Paragraph, Text, Bold, Italic, Strike, Code, Heading (1-6), BulletList, OrderedList, ListItem, Blockquote, CodeBlock, HardBreak, HorizontalRule, History, Dropcursor, Gapcursor

## TipTap JSON Format

```json
{
  "type": "doc",
  "content": [
    { "type": "heading", "attrs": { "level": 1 }, "content": [{ "type": "text", "text": "Title" }] },
    { "type": "paragraph", "content": [{ "type": "text", "text": "Body" }] },
    { "type": "taskItem", "attrs": { "checked": false }, "content": [
      { "type": "paragraph", "content": [{ "type": "text", "text": "Todo item" }] }
    ]}
  ]
}
```

## Markdown → TipTap (Server-Side)

Shipyard has a basic converter in `apps/server/src/mcp/tools/create-task.ts`:

| Markdown | TipTap Node |
|---|---|
| `# Title` | `{ type: "heading", attrs: { level: 1 } }` |
| `## Title` | `{ type: "heading", attrs: { level: 2 } }` |
| `- [ ] Todo` | `{ type: "taskItem", attrs: { checked: false } }` |
| `- [x] Done` | `{ type: "taskItem", attrs: { checked: true } }` |
| `- Item` | `{ type: "bulletListItem" }` |
| `Text` | `{ type: "paragraph" }` |
| (empty) | `{ type: "paragraph" }` (no content) |

**Limitations:** No bold, italic, code, links, nested lists, code blocks, or numbered lists.

## Editor Component Pattern

```tsx
const editor = useEditor({
  extensions: [...createExtensions(placeholder), createLoroExtension(loroDoc)],
  content: "",           // Empty! LoroSyncPlugin hydrates from CRDT
  editable: !readOnly,
}, [loroDoc])            // Re-create when doc changes
```

## Cursor Presence

```ts
const cursorStore = new CursorEphemeralStore(peerId);
handle.addEphemeral("cursors", cursorStore);
LoroEphemeralCursorPlugin(cursorStore, { user: { name: "Alice", color: "#ff0000" } });
```
