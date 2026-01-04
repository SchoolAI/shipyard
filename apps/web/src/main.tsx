/*
 * CSS Import Order
 *
 * We import CSS files directly in JS instead of using @import in CSS.
 * This avoids the "@import must precede all other statements" warnings
 * that occur when Tailwind v4's vite plugin processes CSS files.
 */

// 1. BlockNote fonts
import '@blocknote/core/fonts/inter.css';
// 2. Mantine core styles (layer version for proper cascade)
import '@mantine/core/styles.layer.css';
// 3. BlockNote Mantine theme styles
import '@blocknote/mantine/style.css';
// 4. Tailwind + app styles (must be last for proper cascade)
import './index.css';

import { MantineProvider } from '@mantine/core';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <MantineProvider>
      <App />
    </MantineProvider>
  </React.StrictMode>
);
