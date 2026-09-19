import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

/**
 * Content-Security-Policy applied in dev and emitted into the built index.html.
 * `connect-src` must include the Supabase project origin; it is templated from
 * VITE_SUPABASE_URL at build time so no wildcard is needed in production.
 */
function cspHeaderValue(supabaseUrl: string, pdfServiceUrl: string): string {
  const origins = [supabaseUrl, pdfServiceUrl]
    .filter(Boolean)
    .map((u) => {
      try {
        return new URL(u).origin;
      } catch {
        return '';
      }
    })
    .filter(Boolean);
  const connect = ["'self'", 'blob:', ...origins, ...origins.map((o) => o.replace(/^http/, 'ws'))];
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "worker-src 'self' blob:",
    `connect-src ${connect.join(' ')}`,
  ].join('; ');
}

export default defineConfig(({ mode }) => {
  // loadEnv קורא גם קובצי .env וגם process.env. קריאה ישירה מ-process.env
  // הייתה מתעלמת מקובצי ה-.env, וה-CSP היה נבנה בלי כתובת ה-Supabase.
  const env = loadEnv(mode, process.cwd(), '');
  const csp = cspHeaderValue(env.VITE_SUPABASE_URL ?? '', env.VITE_PDF_SERVICE_URL ?? '');
  const devCsp = csp.replace("script-src 'self'", "script-src 'self' 'unsafe-inline' 'unsafe-eval'");
  const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };

  return {
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      headers: { 'Content-Security-Policy': mode === 'development' ? devCsp : csp, ...securityHeaders },
    },
    preview: {
      port: 4173,
      // אותה מדיניות גם ב-preview, כדי שמה שנבדק יהיה מה שנפרס.
      headers: { 'Content-Security-Policy': csp, ...securityHeaders },
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules/@supabase')) return 'supabase';
            if (/node_modules\/(react|react-dom|react-router|react-router-dom)\//.test(id)) return 'vendor';
            return undefined;
          },
        },
      },
    },
    plugins: [
      react(),
      {
        // Inject the CSP as a meta tag so static hosting without header control
        // still enforces it. Real deployments SHOULD also send the HTTP header.
        name: 'inject-csp-meta',
        transformIndexHtml(html: string) {
          return html.replace(
            '<!--CSP-->',
            `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
          );
        },
      },
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
        manifest: {
          name: 'יומן ביצוע הדברה — יצחק אחזקות והדברות',
          short_name: 'יומן הדברה',
          description: 'יומן ביצוע הדברה מקוון, עובד גם ללא קליטה',
          lang: 'he',
          dir: 'rtl',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#0b0b0d',
          theme_color: '#0b0b0d',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          navigateFallback: 'index.html',
          // Never cache API/auth traffic: drafts live in IndexedDB, not in the HTTP cache.
          navigateFallbackDenylist: [/^\/api/, /^\/auth/],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/icons/'),
              handler: 'CacheFirst',
              options: { cacheName: 'icons', expiration: { maxEntries: 20 } },
            },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
  };
});
