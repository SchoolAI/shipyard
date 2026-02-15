import { beforeEach, describe, expect, it } from 'vitest';
import { useTaskStore } from './task-store';

describe('useTaskStore', () => {
  beforeEach(() => {
    useTaskStore.setState(useTaskStore.getInitialState(), true);
  });

  it('starts with null activeTaskId', () => {
    expect(useTaskStore.getState().activeTaskId).toBeNull();
  });

  it('switches the active task', () => {
    useTaskStore.getState().setActiveTask('task-3');
    expect(useTaskStore.getState().activeTaskId).toBe('task-3');
    useTaskStore.getState().setActiveTask(null);
    expect(useTaskStore.getState().activeTaskId).toBeNull();
  });
});
