/** Entry point: mounts the game and reports any fatal boot error in Hebrew. */
import './styles/main.css';
import { Game } from './core/Game';
import { registerServiceWorker } from './pwa';

async function bootstrap(): Promise<void> {
  const canvas = document.getElementById('render-canvas');
  const touchRoot = document.getElementById('touch-root');
  if (!(canvas instanceof HTMLCanvasElement) || !touchRoot) {
    throw new Error('חסרים רכיבי בסיס בעמוד');
  }

  const game = new Game(canvas, touchRoot);
  await game.initialize();
  window.addEventListener('pagehide', () => game.dispose());
}

function showFatal(message: string): void {
  const fatal = document.getElementById('fatal-error');
  const text = document.getElementById('fatal-message');
  const loading = document.getElementById('screen-loading');
  if (text) text.textContent = message;
  loading?.classList.add('is-hidden');
  fatal?.classList.remove('is-hidden');
  document.getElementById('btn-reload')?.addEventListener('click', () => {
    window.location.reload();
  });
}

bootstrap()
  .then(() => registerServiceWorker())
  .catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[STANGA] boot failed', error);
    showFatal(`${detail}. ודא שהדפדפן תומך ב־WebGL וב־WebAssembly, ונסה לרענן את הדף.`);
  });
