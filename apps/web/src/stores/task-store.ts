import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useMessageStore } from './message-store';
import type { TaskData } from './types';

export interface TaskStore {
  tasks: TaskData[];
  activeTaskId: string | null;

  setActiveTask: (id: string | null) => void;
  createTask: (title: string, id?: string) => string;
  createAndActivateTask: (title: string, id?: string) => string;
  updateTask: (id: string, updates: Partial<TaskData>) => void;
  deleteTask: (id: string) => void;
}

const now = Date.now();

const MOCK_TASKS: TaskData[] = [
  {
    id: 'task-1',
    title: 'Scaffold authentication microservice',
    status: 'active',
    agent: { name: 'claude-code', state: 'running' },
    createdAt: now - 3600000,
    updatedAt: now - 60000,
  },
  {
    id: 'task-2',
    title: 'Review PR #42 — database migration',
    status: 'active',
    agent: { name: 'claude-opus', state: 'idle' },
    createdAt: now - 7200000,
    updatedAt: now - 1800000,
  },
  {
    id: 'task-3',
    title: 'Set up CI pipeline for monorepo',
    status: 'completed',
    agent: null,
    createdAt: now - 86400000,
    updatedAt: now - 43200000,
  },
  {
    id: 'task-4',
    title: 'Design system color token audit',
    status: 'pending',
    agent: null,
    createdAt: now - 1800000,
    updatedAt: now - 1800000,
  },
  {
    id: 'task-5',
    title: 'Fix WebSocket reconnection loop',
    status: 'error',
    agent: { name: 'claude-code', state: 'error' },
    createdAt: now - 14400000,
    updatedAt: now - 7200000,
  },
];

const useMockData = import.meta.env.VITE_DATA_SOURCE !== 'loro';

export const useTaskStore = create<TaskStore>()(
  devtools(
    (set, get) => ({
      tasks: useMockData ? MOCK_TASKS : [],
      activeTaskId: useMockData ? 'task-1' : null,

      setActiveTask: (id) => set({ activeTaskId: id }, undefined, 'tasks/setActiveTask'),

      createTask: (title, existingId) => {
        const id = existingId ?? crypto.randomUUID();
        const timestamp = Date.now();
        set(
          (state) => ({
            tasks: [
              ...state.tasks,
              {
                id,
                title,
                status: 'pending',
                agent: null,
                createdAt: timestamp,
                updatedAt: timestamp,
              },
            ],
          }),
          undefined,
          'tasks/createTask'
        );
        return id;
      },

      createAndActivateTask: (title, existingId) => {
        const id = get().createTask(title, existingId);
        set({ activeTaskId: id }, undefined, 'tasks/createAndActivateTask');
        useMessageStore.getState().clearMessages(id);
        return id;
      },

      updateTask: (id, updates) =>
        set(
          (state) => ({
            tasks: state.tasks.map((task) =>
              task.id === id ? { ...task, ...updates, updatedAt: Date.now() } : task
            ),
          }),
          undefined,
          'tasks/updateTask'
        ),

      deleteTask: (id) =>
        set(
          (state) => ({
            tasks: state.tasks.filter((task) => task.id !== id),
            activeTaskId: state.activeTaskId === id ? null : state.activeTaskId,
          }),
          undefined,
          'tasks/deleteTask'
        ),
    }),
    { name: 'TaskStore', store: 'tasks' }
  )
);
