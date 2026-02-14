import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { MessageData } from './types';

export interface MessageStore {
  messagesByTask: Record<string, MessageData[]>;

  addMessage: (taskId: string, message: Omit<MessageData, 'id' | 'createdAt'>) => string;
  updateMessage: (taskId: string, messageId: string, updates: Partial<MessageData>) => void;
  clearMessages: (taskId: string) => void;
}

const now = Date.now();

const MOCK_MESSAGES: Record<string, MessageData[]> = {
  'task-1': [
    {
      id: 'msg-1a',
      taskId: 'task-1',
      role: 'user',
      content: 'Scaffold a new authentication microservice with JWT support and test coverage.',
      createdAt: now - 3600000,
    },
    {
      id: 'msg-1b',
      taskId: 'task-1',
      role: 'agent',
      content:
        "I'll create the auth service with Express, Passport.js for JWT, and Vitest for tests. Let me start by setting up the project structure.",
      createdAt: now - 3540000,
    },
    {
      id: 'msg-1c',
      taskId: 'task-1',
      role: 'user',
      content: 'Make sure to include refresh token rotation.',
      createdAt: now - 3000000,
    },
    {
      id: 'msg-1d',
      taskId: 'task-1',
      role: 'agent',
      content:
        "Good call. I'll implement refresh token rotation with a `token_family` column to detect reuse. Each refresh grants a new access + refresh pair, and reuse of an old token invalidates the entire family.",
      createdAt: now - 2940000,
    },
  ],
  'task-2': [
    {
      id: 'msg-2a',
      taskId: 'task-2',
      role: 'user',
      content: 'Review PR #42 for the database migration. Focus on backwards compatibility.',
      createdAt: now - 7200000,
    },
    {
      id: 'msg-2b',
      taskId: 'task-2',
      role: 'agent',
      content:
        "I've reviewed the migration. Two concerns:\n\n1. The `ALTER TABLE users DROP COLUMN legacy_id` is not backwards compatible — the old app version still reads this column.\n2. The index on `email` should be `CONCURRENTLY` to avoid locking in production.\n\nWant me to suggest fixes?",
      createdAt: now - 7140000,
    },
    {
      id: 'msg-2c',
      taskId: 'task-2',
      role: 'user',
      content: 'Yes, suggest fixes and add them as review comments.',
      createdAt: now - 6600000,
    },
  ],
};

export const useMessageStore = create<MessageStore>()(
  devtools(
    (set) => ({
      messagesByTask: MOCK_MESSAGES,

      addMessage: (taskId, message) => {
        const id = crypto.randomUUID();
        set(
          (state) => {
            const existing = state.messagesByTask[taskId] ?? [];
            return {
              messagesByTask: {
                ...state.messagesByTask,
                [taskId]: [...existing, { ...message, id, createdAt: Date.now() }],
              },
            };
          },
          undefined,
          'messages/addMessage'
        );
        return id;
      },

      updateMessage: (taskId, messageId, updates) =>
        set(
          (state) => {
            const existing = state.messagesByTask[taskId];
            if (!existing) return state;
            return {
              messagesByTask: {
                ...state.messagesByTask,
                [taskId]: existing.map((msg) =>
                  msg.id === messageId ? { ...msg, ...updates } : msg
                ),
              },
            };
          },
          undefined,
          'messages/updateMessage'
        ),

      clearMessages: (taskId) =>
        set(
          (state) => ({
            messagesByTask: {
              ...state.messagesByTask,
              [taskId]: [],
            },
          }),
          undefined,
          'messages/clearMessages'
        ),
    }),
    { name: 'MessageStore', store: 'messages' }
  )
);
