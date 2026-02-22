import { useMemo } from 'react';
import { AuthGate } from './components/auth-gate';
import { ChatPage } from './components/chat-page';
import { useThemeEffect } from './hooks/use-theme-effect';
import { ShipyardRepoProvider } from './providers/repo-provider';

export function App() {
  useThemeEffect();
  const collabOnly = useMemo(() => /^\/collab\//.test(window.location.pathname), []);
  return (
    <AuthGate>
      <ShipyardRepoProvider collabOnly={collabOnly}>
        <ChatPage />
      </ShipyardRepoProvider>
    </AuthGate>
  );
}
