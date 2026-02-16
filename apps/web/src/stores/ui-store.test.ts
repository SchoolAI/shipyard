import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from './ui-store';

describe('useUIStore', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('toggles each panel independently', () => {
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().isSidebarExpanded).toBe(false);
    expect(useUIStore.getState().isTerminalOpen).toBe(false);

    useUIStore.getState().toggleTerminal();
    expect(useUIStore.getState().isTerminalOpen).toBe(true);
    expect(useUIStore.getState().isSidebarExpanded).toBe(false);

    useUIStore.getState().toggleDiff();
    expect(useUIStore.getState().isDiffOpen).toBe(true);
    expect(useUIStore.getState().isTerminalOpen).toBe(true);
  });

  it('sets panel state directly', () => {
    useUIStore.getState().setSidebarExpanded(false);
    useUIStore.getState().setTerminalOpen(true);
    useUIStore.getState().setDiffOpen(true);

    expect(useUIStore.getState().isSidebarExpanded).toBe(false);
    expect(useUIStore.getState().isTerminalOpen).toBe(true);
    expect(useUIStore.getState().isDiffOpen).toBe(true);
  });

  it('toggles round-trip back to initial state', () => {
    useUIStore.getState().toggleSidebar();
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().isSidebarExpanded).toBe(true);

    useUIStore.getState().toggleTerminal();
    useUIStore.getState().toggleTerminal();
    expect(useUIStore.getState().isTerminalOpen).toBe(false);
  });

  it('initializes machine selection to null', () => {
    expect(useUIStore.getState().selectedMachineId).toBe(null);
    expect(useUIStore.getState().selectedEnvironmentPath).toBe(null);
  });

  it('sets selectedMachineId', () => {
    useUIStore.getState().setSelectedMachineId('machine-1');
    expect(useUIStore.getState().selectedMachineId).toBe('machine-1');
  });

  it('clears selectedMachineId', () => {
    useUIStore.getState().setSelectedMachineId('machine-1');
    useUIStore.getState().setSelectedMachineId(null);
    expect(useUIStore.getState().selectedMachineId).toBe(null);
  });

  it('sets selectedEnvironmentPath', () => {
    useUIStore.getState().setSelectedEnvironmentPath('/home/user/project');
    expect(useUIStore.getState().selectedEnvironmentPath).toBe('/home/user/project');
  });

  it('clears selectedEnvironmentPath', () => {
    useUIStore.getState().setSelectedEnvironmentPath('/home/user/project');
    useUIStore.getState().setSelectedEnvironmentPath(null);
    expect(useUIStore.getState().selectedEnvironmentPath).toBe(null);
  });

  it('machine selection does not affect other state', () => {
    useUIStore.getState().setSelectedMachineId('machine-1');
    useUIStore.getState().setSelectedEnvironmentPath('/path');
    expect(useUIStore.getState().isSidebarExpanded).toBe(true);
    expect(useUIStore.getState().isTerminalOpen).toBe(false);
    expect(useUIStore.getState().isDiffOpen).toBe(false);
  });

  it('initializes showResolvedComments to false', () => {
    expect(useUIStore.getState().showResolvedComments).toBe(false);
  });

  it('toggles resolved comments visibility', () => {
    useUIStore.getState().toggleResolvedComments();
    expect(useUIStore.getState().showResolvedComments).toBe(true);

    useUIStore.getState().toggleResolvedComments();
    expect(useUIStore.getState().showResolvedComments).toBe(false);
  });

  it('sets resolved comments visibility directly', () => {
    useUIStore.getState().setShowResolvedComments(true);
    expect(useUIStore.getState().showResolvedComments).toBe(true);

    useUIStore.getState().setShowResolvedComments(false);
    expect(useUIStore.getState().showResolvedComments).toBe(false);
  });
});
