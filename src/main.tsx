import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StoreProvider } from './state/store';
import { STANDALONE, isNativeShell } from './lib/config';
import './styles/global.css';

/**
 * האפליקציה קובעת בעצמה שפה וכיוון, ולא מסתמכת על המסמך המארח.
 * כך היא נשארת RTL מלא גם כשהיא מוגשת כקובץ סטטי או מוטמעת בעמוד אחר.
 */
const root = document.documentElement;
root.lang = 'he';
root.dir = 'rtl';

let savedTheme: string | null = null;
try {
  savedTheme = localStorage.getItem('theme');
} catch {
  /* אחסון חסום – נשארים בברירת המחדל הבהירה */
}
root.dataset.theme = savedTheme === 'dark' ? 'dark' : 'light';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);

/**
 * service worker נדרש רק בהגשה מהדפדפן (PWA).
 * באפליקציה מקומפלת הקבצים כבר על המכשיר, ורישום SW רק מוסיף שכבת מטמון מיותרת.
 */
if ('serviceWorker' in navigator && import.meta.env.PROD && !STANDALONE && !isNativeShell()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* עבודה ללא service worker עדיין אפשרית */
    });
  });
}
