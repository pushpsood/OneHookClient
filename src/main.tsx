import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element #root not found');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Remove the initial splash once the app has mounted and painted a frame.
// Styles are applied by first paint (render-blocking CSS in prod; injected
// before render in dev), so revealing the app here is flash-free.
function dismissSplash() {
  const splash = document.getElementById('app-splash');
  if (!splash) return;
  splash.classList.add('app-splash--hidden');
  window.setTimeout(() => splash.remove(), 450);
}

requestAnimationFrame(() => requestAnimationFrame(dismissSplash));
