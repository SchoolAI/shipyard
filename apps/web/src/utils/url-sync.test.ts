import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskStore } from '../stores/task-store';
import { initUrlSync } from './url-sync';

describe('url-sync', () => {
  let cleanup: () => void;

  beforeEach(() => {
    useTaskStore.setState(useTaskStore.getInitialState(), true);
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup?.();
  });

  it('hydrates store from /tasks/{id} on init', () => {
    window.history.replaceState(null, '', '/tasks/abc-123');
    cleanup = initUrlSync();
    expect(useTaskStore.getState().activeTaskId).toBe('abc-123');
  });

  it('keeps store null when initialized on /', () => {
    cleanup = initUrlSync();
    expect(useTaskStore.getState().activeTaskId).toBeNull();
  });

  it('normalizes unrecognized paths to /', () => {
    window.history.replaceState(null, '', '/foo/bar');
    cleanup = initUrlSync();
    expect(window.location.pathname).toBe('/');
    expect(useTaskStore.getState().activeTaskId).toBeNull();
  });

  it('pushes URL when store activeTaskId changes', () => {
    cleanup = initUrlSync();
    const pushSpy = vi.spyOn(window.history, 'pushState');

    useTaskStore.getState().setActiveTask('task-1');
    expect(pushSpy).toHaveBeenCalledWith(null, '', '/tasks/task-1');

    useTaskStore.getState().setActiveTask(null);
    expect(pushSpy).toHaveBeenCalledWith(null, '', '/');
  });

  it('skips pushState when URL already matches', () => {
    cleanup = initUrlSync();

    // Externally set URL to /tasks/task-1 without going through the store
    window.history.replaceState(null, '', '/tasks/task-1');

    const pushSpy = vi.spyOn(window.history, 'pushState');

    // Store changes null → task-1, but URL is already /tasks/task-1
    useTaskStore.getState().setActiveTask('task-1');
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('rejects task IDs with invalid characters', () => {
    window.history.replaceState(null, '', '/tasks/<script>alert(1)</script>');
    cleanup = initUrlSync();
    expect(useTaskStore.getState().activeTaskId).toBeNull();
    expect(window.location.pathname).toBe('/');
  });

  it('updates store on popstate', () => {
    cleanup = initUrlSync();
    useTaskStore.getState().setActiveTask('task-1');

    window.history.replaceState(null, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(useTaskStore.getState().activeTaskId).toBeNull();

    window.history.replaceState(null, '', '/tasks/task-2');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(useTaskStore.getState().activeTaskId).toBe('task-2');
  });

  it('does not loop: popstate → store update does not trigger pushState', () => {
    cleanup = initUrlSync();
    const pushSpy = vi.spyOn(window.history, 'pushState');

    window.history.replaceState(null, '', '/tasks/task-5');
    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(useTaskStore.getState().activeTaskId).toBe('task-5');
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('produces exactly N pushState calls for N distinct changes', () => {
    cleanup = initUrlSync();
    const pushSpy = vi.spyOn(window.history, 'pushState');

    useTaskStore.getState().setActiveTask('a');
    useTaskStore.getState().setActiveTask('b');
    useTaskStore.getState().setActiveTask('c');

    expect(pushSpy).toHaveBeenCalledTimes(3);
    expect(pushSpy).toHaveBeenNthCalledWith(1, null, '', '/tasks/a');
    expect(pushSpy).toHaveBeenNthCalledWith(2, null, '', '/tasks/b');
    expect(pushSpy).toHaveBeenNthCalledWith(3, null, '', '/tasks/c');
  });

  it('ignores popstate for paths this module does not own', () => {
    cleanup = initUrlSync();
    useTaskStore.getState().setActiveTask('task-1');

    window.history.replaceState(null, '', '/about');
    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(useTaskStore.getState().activeTaskId).toBe('task-1');
  });

  it('stops syncing after cleanup', () => {
    cleanup = initUrlSync();
    cleanup();

    const pushSpy = vi.spyOn(window.history, 'pushState');
    useTaskStore.getState().setActiveTask('after-cleanup');
    expect(pushSpy).not.toHaveBeenCalled();

    window.history.replaceState(null, '', '/tasks/after-cleanup');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(useTaskStore.getState().activeTaskId).toBe('after-cleanup');
  });
});
