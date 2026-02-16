import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { SidePanelToolbarProvider, useSidePanelToolbar } from './side-panel-toolbar-context';

describe('useSidePanelToolbar', () => {
  it('throws when used outside SidePanelToolbarProvider', () => {
    expect(() => renderHook(() => useSidePanelToolbar())).toThrow(
      'useSidePanelToolbar must be used within a <SidePanelToolbarProvider>'
    );
  });

  it('returns context values when inside SidePanelToolbarProvider', () => {
    function wrapper({ children }: { children: ReactNode }) {
      return <SidePanelToolbarProvider>{children}</SidePanelToolbarProvider>;
    }

    const { result } = renderHook(() => useSidePanelToolbar(), { wrapper });

    expect(result.current.toolbar).toBe(null);
    expect(typeof result.current.setToolbar).toBe('function');
  });
});
