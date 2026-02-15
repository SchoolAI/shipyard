import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export interface TaskStore {
  activeTaskId: string | null;
  setActiveTask: (id: string | null) => void;
}

export const useTaskStore = create<TaskStore>()(
  devtools(
    (set) => ({
      activeTaskId: null,

      setActiveTask: (id) => set({ activeTaskId: id }, undefined, 'tasks/setActiveTask'),
    }),
    { name: 'TaskStore', store: 'tasks' }
  )
);
