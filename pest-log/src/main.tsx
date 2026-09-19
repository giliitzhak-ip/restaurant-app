import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import './styles/theme.css';

const container = document.getElementById('root');
if (!container) throw new Error('לא נמצא אלמנט השורש');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

// עדכון האפליקציה: לא דורסים גרסה שרצה באמצע מילוי יומן —
// המשתמש מחליט מתי לרענן.
const updateSW = registerSW({
  onNeedRefresh() {
    if (globalThis.confirm('קיימת גרסה חדשה של המערכת. לרענן עכשיו? טיוטות שנשמרו לא ייאבדו.')) {
      void updateSW(true);
    }
  },
});
