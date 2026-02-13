import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { SlashCommandAction } from './use-slash-commands';
import { useSlashCommands } from './use-slash-commands';

function makeKeyEvent(key: string): KeyboardEvent<HTMLTextAreaElement> {
  return { key, preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLTextAreaElement>;
}

function setup() {
  const onExecute = vi.fn<(action: SlashCommandAction) => void>();
  const onClearInput = vi.fn();
  return {
    onExecute,
    onClearInput,
    ...renderHook(() => useSlashCommands({ onExecute, onClearInput })),
  };
}

describe('useSlashCommands', () => {
  it('starts closed with empty state', () => {
    const { result } = setup();
    expect(result.current.isOpen).toBe(false);
    expect(result.current.query).toBe('');
    expect(result.current.filteredCommands).toEqual([]);
    expect(result.current.selectedIndex).toBe(0);
  });

  it('opens with all commands when "/" is typed', () => {
    const { result } = setup();
    act(() => result.current.handleInputChange('/'));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.filteredCommands).toHaveLength(9);
  });

  it('filters to Plan mode with "/pl"', () => {
    const { result } = setup();
    act(() => result.current.handleInputChange('/pl'));
    expect(result.current.filteredCommands).toHaveLength(1);
    expect(result.current.filteredCommands[0]?.id).toBe('plan');
  });

  it('filters to model sub-items with "/model"', () => {
    const { result } = setup();
    act(() => result.current.handleInputChange('/model'));
    const ids = result.current.filteredCommands.map((c) => c.id);
    expect(ids).toContain('model:claude-code');
    expect(ids).toContain('model:claude-opus');
    expect(ids).toContain('model:claude-sonnet');
    expect(result.current.filteredCommands).toHaveLength(3);
  });

  it('filters to single model with "/opus"', () => {
    const { result } = setup();
    act(() => result.current.handleInputChange('/opus'));
    expect(result.current.filteredCommands).toHaveLength(1);
    expect(result.current.filteredCommands[0]?.id).toBe('model:claude-opus');
  });

  it('matches parentLabel for sub-items', () => {
    const { result } = setup();
    act(() => result.current.handleInputChange('/switch'));
    const ids = result.current.filteredCommands.map((c) => c.id);
    expect(ids).toContain('model:claude-code');
    expect(ids).toContain('model:claude-opus');
    expect(ids).toContain('model:claude-sonnet');
  });

  it('filters reasoning sub-items with "/reason"', () => {
    const { result } = setup();
    act(() => result.current.handleInputChange('/reason'));
    const ids = result.current.filteredCommands.map((c) => c.id);
    expect(ids).toContain('reasoning:low');
    expect(ids).toContain('reasoning:medium');
    expect(ids).toContain('reasoning:high');
    expect(result.current.filteredCommands).toHaveLength(3);
  });

  it('stays closed for non-slash input', () => {
    const { result } = setup();
    act(() => result.current.handleInputChange('hello'));
    expect(result.current.isOpen).toBe(false);
  });

  it('resets state on close()', () => {
    const { result } = setup();
    act(() => result.current.handleInputChange('/'));
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.query).toBe('');
    expect(result.current.selectedIndex).toBe(0);
  });

  it('selectCommand calls onExecute with action, onClearInput, and closes', () => {
    const { result, onExecute, onClearInput } = setup();
    act(() => result.current.handleInputChange('/'));
    const cmd = result.current.filteredCommands[0]!;
    act(() => result.current.selectCommand(cmd));
    expect(onExecute).toHaveBeenCalledWith(cmd.action);
    expect(onClearInput).toHaveBeenCalled();
    expect(result.current.isOpen).toBe(false);
  });

  it('onExecute receives SlashCommandAction shape', () => {
    const { result, onExecute } = setup();
    act(() => result.current.handleInputChange('/opus'));
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('Enter'));
    });
    expect(onExecute).toHaveBeenCalledWith({ kind: 'setModel', modelId: 'claude-opus' });
  });

  it('ArrowDown cycles selectedIndex forward with wrapping', () => {
    const { result } = setup();
    act(() => result.current.handleInputChange('/'));
    const count = result.current.filteredCommands.length;

    act(() => {
      result.current.handleKeyDown(makeKeyEvent('ArrowDown'));
    });
    expect(result.current.selectedIndex).toBe(1);

    for (let i = 1; i < count; i++) {
      act(() => {
        result.current.handleKeyDown(makeKeyEvent('ArrowDown'));
      });
    }
    expect(result.current.selectedIndex).toBe(0);
  });

  it('ArrowUp cycles selectedIndex backward with wrapping', () => {
    const { result } = setup();
    act(() => result.current.handleInputChange('/'));
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('ArrowUp'));
    });
    expect(result.current.selectedIndex).toBe(result.current.filteredCommands.length - 1);
  });

  it('Enter selects current command', () => {
    const { result, onExecute } = setup();
    act(() => result.current.handleInputChange('/'));
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('Enter'));
    });
    expect(onExecute).toHaveBeenCalled();
  });

  it('Tab selects current command', () => {
    const { result, onExecute } = setup();
    act(() => result.current.handleInputChange('/'));
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('Tab'));
    });
    expect(onExecute).toHaveBeenCalled();
  });

  it('Escape closes menu', () => {
    const { result } = setup();
    act(() => result.current.handleInputChange('/'));
    act(() => {
      result.current.handleKeyDown(makeKeyEvent('Escape'));
    });
    expect(result.current.isOpen).toBe(false);
  });

  it('handleKeyDown returns false when menu is closed', () => {
    const { result } = setup();
    let returnVal = false;
    act(() => {
      returnVal = result.current.handleKeyDown(makeKeyEvent('ArrowDown'));
    });
    expect(returnVal).toBe(false);
  });

  it('setSelectedIndex updates the selected index', () => {
    const { result } = setup();
    act(() => result.current.handleInputChange('/'));
    act(() => result.current.setSelectedIndex(3));
    expect(result.current.selectedIndex).toBe(3);
  });
});
