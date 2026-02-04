/*
 * CSS Import Order
 *
 * We import CSS files directly in JS instead of using @import in CSS.
 * This avoids the "@import must precede all other statements" warnings
 * that occur when Tailwind v4's vite plugin processes CSS files.
 */

/** 1. BlockNote fonts */
import '@blocknote/core/fonts/inter.css';
/** 2. BlockNote core styles (includes thread mark highlighting for comments) */
import '@blocknote/core/style.css';
/** 3. Mantine core styles (layer version for proper cascade) */
import '@mantine/core/styles.layer.css';
/** 4. BlockNote Mantine theme styles */
import '@blocknote/mantine/style.css';
/** 5. HeroUI styles */
import '@heroui/styles';
/** 6. Tailwind + app styles (must be last for proper cascade) */
import './index.css';

import { MantineProvider } from '@mantine/core';
import { DEFAULT_REGISTRY_PORTS } from '@shipyard/shared/registry-config';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ThemedToaster } from './components/ThemedToaster';
import { resetAllBrowserStorage } from './utils/resetStorage';
import { trpc } from './utils/trpc';

/*
 * Expose reset function in development for console access
 * Usage: window.__resetShipyard() or just __resetShipyard()
 */
if (import.meta.env.DEV) {
  window.__resetShipyard = resetAllBrowserStorage;
  // biome-ignore lint/suspicious/noConsole: Dev-only helpful message
  console.log(
    '%c[Shipyard Dev] %cReset available: window.__resetShipyard() or navigate to ?reset=all',
    'color: #8b5cf6; font-weight: bold',
    'color: #9ca3af'
  );
}

/** React Query client with sensible defaults */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 1,
    },
  },
});

/** Dynamically determine the registry URL */
function getRegistryUrl() {
  /*
   * Use env var if provided, otherwise use first default port
   * The actual connection will handle discovery/fallback as needed
   */
  const envPort = import.meta.env.VITE_REGISTRY_PORT;
  const port = envPort ? Number.parseInt(envPort, 10) : DEFAULT_REGISTRY_PORTS[0];
  return `http://localhost:${port}`;
}

/** tRPC client with HTTP batch link */
const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${getRegistryUrl()}/trpc`,
      fetch: (url, options) => {
        return fetch(url, {
          ...options,
          signal: AbortSignal.timeout(10000),
        });
      },
    }),
  ],
});

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <MantineProvider>
          <App />
          <ThemedToaster />
        </MantineProvider>
      </QueryClientProvider>
    </trpc.Provider>
  </React.StrictMode>
);
/** Cache bust 1768971752 */
