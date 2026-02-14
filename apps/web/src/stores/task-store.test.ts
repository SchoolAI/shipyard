import { beforeEach, describe, expect, it } from 'vitest';
import { useTaskStore } from './task-store';

describe('useTaskStore', () => {
  beforeEach(() => {
    useTaskStore.setState(useTaskStore.getInitialState(), true);
  });

  it('creates a task with pending status and returns its id', () => {
    const id = useTaskStore.getState().createTask('New task');
    const task = useTaskStore.getState().tasks.find((t) => t.id === id);
    expect(task).toBeDefined();
    expect(task?.title).toBe('New task');
    expect(task?.status).toBe('pending');
    expect(task?.agent).toBeNull();
  });

  it('updates a task by id', () => {
    useTaskStore.getState().updateTask('task-4', { status: 'active', title: 'Updated' });
    const task = useTaskStore.getState().tasks.find((t) => t.id === 'task-4');
    expect(task?.status).toBe('active');
    expect(task?.title).toBe('Updated');
  });

  it('removes a task and clears selection if it was active', () => {
    useTaskStore.getState().setActiveTask('task-2');
    useTaskStore.getState().deleteTask('task-2');
    expect(useTaskStore.getState().tasks.find((t) => t.id === 'task-2')).toBeUndefined();
    expect(useTaskStore.getState().activeTaskId).toBeNull();
  });

  it('switches the active task', () => {
    useTaskStore.getState().setActiveTask('task-3');
    expect(useTaskStore.getState().activeTaskId).toBe('task-3');
    useTaskStore.getState().setActiveTask(null);
    expect(useTaskStore.getState().activeTaskId).toBeNull();
  });
});
