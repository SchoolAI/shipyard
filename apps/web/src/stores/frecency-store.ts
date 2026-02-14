import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { FrecencyEntry } from '../utils/frecency';
import { frecencyScore, pruneStaleEntries, recordAccess } from '../utils/frecency';

export interface FrecencyStore {
  entries: Record<string, FrecencyEntry>;
  record: (id: string) => void;
  getScore: (id: string) => number;
  prune: () => void;
}

export const useFrecencyStore = create<FrecencyStore>()(
  devtools(
    persist(
      (set, get) => ({
        entries: {},

        record: (id) =>
          set(
            (state) => ({
              entries: {
                ...state.entries,
                [id]: recordAccess(state.entries[id], id, Date.now()),
              },
            }),
            undefined,
            'frecency/record'
          ),

        getScore: (id) => {
          const entry = get().entries[id];
          if (!entry) return 0;
          return frecencyScore(entry, Date.now());
        },

        prune: () =>
          set(
            (state) => ({
              entries: pruneStaleEntries(state.entries, Date.now()),
            }),
            undefined,
            'frecency/prune'
          ),
      }),
      { name: 'shipyard-frecency' }
    ),
    { name: 'FrecencyStore', store: 'frecency' }
  )
);
