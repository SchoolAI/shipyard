import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useComposerHistory } from './use-composer-history';

describe('useComposerHistory', () => {
  it('starts with empty undo and redo stacks', () => {
    const { result } = renderHook(() => useComposerHistory());
    expect(result.current.undoStack.current).toEqual([]);
    expect(result.current.redoStack.current).toEqual([]);
  });

  it('snapshotBeforeReplace pushes to undo stack only once', () => {
    const { result } = renderHook(() => useComposerHistory());

    act(() => result.current.snapshotBeforeReplace('original'));
    expect(result.current.undoStack.current).toEqual(['original']);

    act(() => result.current.snapshotBeforeReplace('ignored'));
    expect(result.current.undoStack.current).toEqual(['original']);
  });

  it('undo pops from undo stack and pushes current to redo', () => {
    const { result } = renderHook(() => useComposerHistory());

    act(() => result.current.snapshotBeforeReplace('original'));

    let captured = '';
    const setValue = (updater: (prev: string) => string) => {
      captured = updater('replaced');
    };

    let acted = false;
    act(() => {
      acted = result.current.undo(setValue);
    });

    expect(acted).toBe(true);
    expect(captured).toBe('original');
    expect(result.current.redoStack.current).toEqual(['replaced']);
  });

  it('undo returns false when stack is empty', () => {
    const { result } = renderHook(() => useComposerHistory());
    let acted = false;
    act(() => {
      acted = result.current.undo(() => {});
    });
    expect(acted).toBe(false);
  });

  it('redo returns false when stack is empty', () => {
    const { result } = renderHook(() => useComposerHistory());
    let acted = false;
    act(() => {
      acted = result.current.redo(() => {});
    });
    expect(acted).toBe(false);
  });

  it('redo restores after undo', () => {
    const { result } = renderHook(() => useComposerHistory());

    act(() => result.current.snapshotBeforeReplace('original'));

    const values: string[] = [];
    const setValue = (updater: (prev: string) => string) => {
      values.push(updater('current'));
    };

    act(() => result.current.undo(setValue));

    const redoSetValue = (updater: (prev: string) => string) => {
      values.push(updater('original'));
    };

    let acted = false;
    act(() => {
      acted = result.current.redo(redoSetValue);
    });

    expect(acted).toBe(true);
    expect(values).toEqual(['original', 'current']);
  });

  it('clear empties both stacks', () => {
    const { result } = renderHook(() => useComposerHistory());

    act(() => result.current.snapshotBeforeReplace('value'));
    expect(result.current.undoStack.current.length).toBeGreaterThan(0);

    act(() => result.current.clear());
    expect(result.current.undoStack.current).toEqual([]);
    expect(result.current.redoStack.current).toEqual([]);
  });
});
