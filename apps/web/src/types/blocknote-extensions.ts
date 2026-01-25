/**
 * Type definitions and guards for BlockNote/Tiptap extensions.
 *
 * NOTE: BlockNote wraps Tiptap, which returns `any` from getExtension().
 * Since the library doesn't support generics, we use type guards with
 * runtime property checks to ensure type safety.
 *
 * @see Issue #80 - Type assertion cleanup
 */

// =============================================================================
// YUndo Extension (y-prosemirror collaboration undo/redo)
// =============================================================================

/**
 * Type for yUndo extension from y-prosemirror.
 * Provides undo/redo commands for collaborative editing.
 */
export interface YUndoExtension {
  undoCommand?: (state: unknown, dispatch: unknown, view: unknown) => void;
  redoCommand?: (state: unknown, dispatch: unknown, view: unknown) => void;
}

/**
 * Type guard for yUndo extension.
 *
 * NOTE: Tiptap's getExtension() returns `any`, so we validate the expected
 * shape at runtime. The yUndo extension from y-prosemirror has undoCommand
 * and redoCommand as optional function properties.
 *
 * @example
 * ```typescript
 * const ext = editor.getExtension('yUndo');
 * if (isYUndoExtension(ext)) {
 *   ext.undoCommand?.(state, view.dispatch, view);
 * }
 * ```
 */
export function isYUndoExtension(ext: unknown): ext is YUndoExtension {
  if (ext === null || ext === undefined) {
    return false;
  }
  if (typeof ext !== 'object') {
    return false;
  }
  // Check that it has at least one of the expected commands (or could be empty object before init)
  const obj = Object.fromEntries(Object.entries(ext));
  const hasUndo = !('undoCommand' in obj) || typeof obj.undoCommand === 'function';
  const hasRedo = !('redoCommand' in obj) || typeof obj.redoCommand === 'function';
  return hasUndo && hasRedo;
}

/**
 * Safely get the yUndo extension from a BlockNote editor.
 * Returns undefined if the extension is not available or invalid.
 *
 * @example
 * ```typescript
 * const yUndo = getYUndoExtension(editor);
 * if (yUndo?.undoCommand) {
 *   yUndo.undoCommand(state, view.dispatch, view);
 * }
 * ```
 */
export function getYUndoExtension(editor: {
  getExtension: (name: string) => unknown;
}): YUndoExtension | undefined {
  const ext = editor.getExtension('yUndo');
  if (isYUndoExtension(ext)) {
    return ext;
  }
  return undefined;
}
