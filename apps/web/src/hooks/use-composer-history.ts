import { useCallback, useEffect, useRef } from 'react';

interface ComposerHistory {
  undoStack: React.RefObject<string[]>;
  redoStack: React.RefObject<string[]>;
  undo: (setValue: (updater: (prev: string) => string) => void) => boolean;
  redo: (setValue: (updater: (prev: string) => string) => void) => boolean;
  snapshotBeforeReplace: (currentValue: string) => void;
  clear: () => void;
}

export function useComposerHistory(): ComposerHistory {
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);

  const snapshotBeforeReplace = useCallback((currentValue: string) => {
    if (undoStack.current.length === 0) {
      undoStack.current.push(currentValue);
      redoStack.current = [];
    }
  }, []);

  const undo = useCallback((setValue: (updater: (prev: string) => string) => void): boolean => {
    const entry = undoStack.current.pop();
    if (entry === undefined) return false;
    setValue((prev) => {
      redoStack.current.push(prev);
      return entry;
    });
    return true;
  }, []);

  const redo = useCallback((setValue: (updater: (prev: string) => string) => void): boolean => {
    const entry = redoStack.current.pop();
    if (entry === undefined) return false;
    setValue((prev) => {
      undoStack.current.push(prev);
      return entry;
    });
    return true;
  }, []);

  const clear = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
  }, []);

  return { undoStack, redoStack, undo, redo, snapshotBeforeReplace, clear };
}

export function useComposerUndoShortcut(
  history: ComposerHistory,
  setValue: React.Dispatch<React.SetStateAction<string>>,
  adjustHeight: () => void,
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
) {
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key !== 'z' || document.activeElement !== textareaRef.current) return;

      const acted = e.shiftKey
        ? history.redoStack.current.length > 0 && history.redo(setValue)
        : history.undoStack.current.length > 0 && history.undo(setValue);

      if (acted) {
        e.preventDefault();
        requestAnimationFrame(() => adjustHeight());
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [history, setValue, adjustHeight]);
}
