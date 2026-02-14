import { ChatPage } from './components/chat-page';
import { useThemeEffect } from './hooks/use-theme-effect';
import { ShipyardRepoProvider } from './providers/repo-provider';

export function App() {
  useThemeEffect();
  return (
    <ShipyardRepoProvider>
      <ChatPage />
    </ShipyardRepoProvider>
  );
}
