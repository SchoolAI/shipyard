/*
 * CSS Import Order
 *
 * We import CSS files directly in JS instead of using @import in CSS.
 * This avoids the "@import must precede all other statements" warnings
 * that occur when Tailwind v4's vite plugin processes CSS files.
 */

// 1. BlockNote fonts
import '@blocknote/core/fonts/inter.css';
// 2. BlockNote core styles (includes thread mark highlighting for comments)
import '@blocknote/core/style.css';
// 3. Mantine core styles (layer version for proper cascade)
import '@mantine/core/styles.layer.css';
// 4. BlockNote Mantine theme styles
import '@blocknote/mantine/style.css';
// 5. HeroUI styles
import '@heroui/styles';
// 6. Tailwind + app styles (must be last for proper cascade)
import './index.css';

import { MantineProvider } from '@mantine/core';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'sonner';
import { App } from './App';
import { resetAllBrowserStorage } from './utils/resetStorage';

// Expose reset function in development for console access
// Usage: window.__resetPeerPlan() or just __resetPeerPlan()
if (import.meta.env.DEV) {
  (window as unknown as { __resetPeerPlan: typeof resetAllBrowserStorage }).__resetPeerPlan =
    resetAllBrowserStorage;
  // biome-ignore lint/suspicious/noConsole: Dev-only helpful message
  console.log(
    '%c[Peer-Plan Dev] %cReset available: window.__resetPeerPlan() or navigate to ?reset=all',
    'color: #8b5cf6; font-weight: bold',
    'color: #9ca3af'
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <MantineProvider>
      <App />
      <Toaster position="bottom-right" richColors closeButton />
    </MantineProvider>
  </React.StrictMode>
);
