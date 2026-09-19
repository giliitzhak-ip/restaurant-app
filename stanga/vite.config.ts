import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4096,
    sourcemap: false,
  },
  // The Havok WASM glue must not be pre-bundled; it resolves its binary at runtime.
  optimizeDeps: { exclude: ['@babylonjs/havok'] },
  plugins: [
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
  ],
});
