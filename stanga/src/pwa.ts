/** Registers the generated service worker. Failure here never breaks the game. */
import { registerSW } from 'virtual:pwa-register';

export function registerServiceWorker(): void {
  if (import.meta.env.DEV) return;
  // Builds made with STANGA_NO_PWA=1 have no service worker to register.
  if (!import.meta.env.STANGA_PWA) return;
  try {
    registerSW({ immediate: true });
  } catch (error) {
    console.warn('[STANGA] service worker registration skipped', error);
  }
}
