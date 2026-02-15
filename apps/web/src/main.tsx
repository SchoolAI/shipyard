import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { initUrlSync } from './utils/url-sync';
import './app.css';

const cleanupUrlSync = initUrlSync();

if (import.meta.hot) {
  import.meta.hot.dispose(() => cleanupUrlSync());
}

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element not found');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
