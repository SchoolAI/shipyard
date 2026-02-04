import { CursorRegistry, CursorRegistryContext, RepoContext } from '@loro-extended/react';
import { Repo } from '@loro-extended/repo';
import type { ReactNode } from 'react';
import { loroAdapters } from './adapters';

const repo = new Repo({
  identity: { name: 'browser', type: 'user' as const },
  adapters: loroAdapters,
});

const cursorRegistry = new CursorRegistry();

export function ShipyardRepoProvider({ children }: { children: ReactNode }) {
  return (
    <RepoContext.Provider value={repo}>
      <CursorRegistryContext.Provider value={cursorRegistry}>
        {children}
      </CursorRegistryContext.Provider>
    </RepoContext.Provider>
  );
}
