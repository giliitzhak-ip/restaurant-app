/** Registers the generated service worker. Failure here never breaks the game. */
import { registerSW } from 'virtual:pwa-register';

export function registerServiceWorker(): void {
  if (import.meta.env.DEV) return;
  try {
    registerSW({ immediate: true });
  } catch (error) {
    console.warn('[STANGA] service worker registration skipped', error);
  }
}
