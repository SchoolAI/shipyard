import { beforeEach, describe, expect, it } from 'vitest';
import { useMessageStore } from './message-store';

describe('useMessageStore', () => {
  beforeEach(() => {
    useMessageStore.setState(useMessageStore.getInitialState(), true);
  });

  it('adds a message to an existing task and returns its id', () => {
    const countBefore = useMessageStore.getState().messagesByTask['task-1']!.length;
    const id = useMessageStore
      .getState()
      .addMessage('task-1', { taskId: 'task-1', role: 'user', content: 'Hello' });
    expect(typeof id).toBe('string');
    expect(useMessageStore.getState().messagesByTask['task-1']!.length).toBe(countBefore + 1);
  });

  it('creates a message array for a new task', () => {
    useMessageStore
      .getState()
      .addMessage('task-new', { taskId: 'task-new', role: 'agent', content: 'First message' });
    const messages = useMessageStore.getState().messagesByTask['task-new'];
    expect(messages).toBeDefined();
    expect(messages![0]!.content).toBe('First message');
  });

  it('updates a message by id', () => {
    useMessageStore.getState().updateMessage('task-1', 'msg-1b', {
      isThinking: false,
      content: 'Done thinking',
    });
    const msg = useMessageStore.getState().messagesByTask['task-1']!.find((m) => m.id === 'msg-1b');
    expect(msg!.content).toBe('Done thinking');
    expect(msg!.isThinking).toBe(false);
  });

  it('clears all messages for a task', () => {
    useMessageStore.getState().clearMessages('task-1');
    expect(useMessageStore.getState().messagesByTask['task-1']).toEqual([]);
  });
});
