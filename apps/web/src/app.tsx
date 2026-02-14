import { ChatPage } from './components/chat-page';
import { useThemeEffect } from './hooks/use-theme-effect';

export function App() {
  useThemeEffect();
  return <ChatPage />;
}
