/**
 * Stand-in for `virtual:pwa-register` in builds made with STANGA_NO_PWA=1.
 *
 * Those builds ship no service worker, so the virtual module the plugin would
 * normally provide does not exist. Aliasing to this keeps `pwa.ts` free of
 * build-time conditionals.
 */
export function registerSW(_options?: { immediate?: boolean }): () => Promise<void> {
  return () => Promise.resolve();
}
