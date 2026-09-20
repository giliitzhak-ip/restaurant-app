import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Set STANGA_NO_PWA=1 to build without the service worker.
 * Needed when the build is hosted inside a sandboxed frame, where service
 * worker registration is blocked and would only produce a console error.
 */
const withPwa = process.env.STANGA_NO_PWA !== '1';

/**
 * Where the authoritative server lives. Empty means "work it out at runtime":
 * same origin in a build, and port 2567 on the dev host while developing.
 * It is a URL, never a credential — there are no keys in this project.
 */
const serverUrl = process.env.STANGA_SERVER_URL ?? '';

/**
 * Set STANGA_TEST_HOOKS=1 to expose a read-only `window.__stanga` with the
 * current MatchState. The end-to-end tests read it to check that two browsers
 * agree about where everything is. Off by default, so a shipped build has no
 * debug surface at all.
 */
const withTestHooks = process.env.STANGA_TEST_HOOKS === '1';

export default defineConfig({
  base: './',
  define: {
    'import.meta.env.STANGA_PWA': JSON.stringify(withPwa),
    'import.meta.env.STANGA_SERVER_URL': JSON.stringify(serverUrl),
    'import.meta.env.STANGA_TEST_HOOKS': JSON.stringify(withTestHooks),
  },
  resolve: {
    // Without the plugin there is no `virtual:pwa-register` module to import.
    alias: withPwa ? {} : { 'virtual:pwa-register': '/src/pwa-register-stub.ts' },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4096,
    sourcemap: false,
  },
  // The Havok WASM glue must not be pre-bundled; it resolves its binary at runtime.
  optimizeDeps: { exclude: ['@babylonjs/havok'] },
  plugins: [
    ...(withPwa
      ? [
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['icons/favicon.png'],
            workbox: {
              globPatterns: ['**/*.{js,css,html,png,svg,wasm}'],
              maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
            },
            manifest: {
              id: '/',
              name: 'STANGA - כדורגל רחוב',
              short_name: 'STANGA',
              description: 'משחק כדורגל רחוב ישראלי תלת־ממדי',
              lang: 'he',
              dir: 'rtl',
              theme_color: '#0d0d0f',
              background_color: '#0d0d0f',
              display: 'fullscreen',
              orientation: 'landscape',
              start_url: './',
              scope: './',
              icons: [
                { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
                {
                  src: 'icons/icon-maskable-512.png',
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'maskable',
                },
              ],
            },
          }),
        ]
      : []),
  ],
});
