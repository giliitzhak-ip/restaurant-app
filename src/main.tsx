import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StoreProvider } from './state/store';
import './styles/global.css';

const saved = localStorage.getItem('theme');
document.documentElement.dataset.theme = saved === 'dark' ? 'dark' : 'light';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* עבודה ללא service worker עדיין אפשרית */
    });
  });
}
