/**
 * sw.js — service worker: makes SKYLINE installable and fully playable
 * offline. The whole game is a handful of static files with no runtime
 * assets, so the shell precache IS the game.
 *
 * Updates are atomic on purpose. Every shell file is served cache-only from
 * one versioned cache, so a page can never end up running a new index.html
 * against stale modules. A new build lands by bumping CACHE: the new worker
 * precaches the new shell, activates, drops the old cache and tells open
 * pages to reload.
 *
 *   ⚠ Bump CACHE whenever any file in SHELL changes.
 */
'use strict';

const CACHE = 'skyline-v1';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './src/main.js',
  './src/ui.js',
  './src/hud.js',
  './src/renderer.js',
  './src/props.js',
  './src/camera.js',
  './src/drone.js',
  './src/world.js',
  './src/terrain.js',
  './src/biomes.js',
  './src/atmosphere.js',
  './src/scoring.js',
  './src/input.js',
  './src/touch.js',
  './src/pwa.js',
  './src/noise.js',
  './src/math.js',
  './src/storage.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './screenshots/flight-wide.jpg',
];

/** Absolute URLs of the shell, for O(1) lookup in fetch. */
const SHELL_URLS = new Set(SHELL.map((p) => new URL(p, self.location).href));
const INDEX_URL = new URL('./index.html', self.location).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Fetch each explicitly so one 404 cannot abort the whole install, and
    // bypass the HTTP cache so a rebuild is really picked up.
    await Promise.all(SHELL.map(async (url) => {
      try {
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (res && res.ok) await cache.put(url, res);
      } catch (e) { /* missing file — the rest of the shell still installs */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // The restaurant API is never cached.
  if (url.pathname.startsWith('/api/')) return;

  // Navigations always resolve to the cached index for this build. start_url
  // carries a query string, so match the document explicitly.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(INDEX_URL);
      if (cached) return cached;
      try {
        return await fetch(req);
      } catch (e) {
        return new Response('Offline and not yet installed.', {
          status: 503, headers: { 'Content-Type': 'text/plain' },
        });
      }
    })());
    return;
  }

  // Shell files: cache-only, so the running build stays internally consistent.
  const key = url.origin + url.pathname;
  if (SHELL_URLS.has(key)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(url.pathname.endsWith('/') ? INDEX_URL : key);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(key, res.clone());
        return res;
      } catch (e) {
        return Response.error();
      }
    })());
    return;
  }

  // Anything else on this origin: network first, cache as a fallback.
  event.respondWith((async () => {
    try {
      return await fetch(req);
    } catch (e) {
      const cached = await caches.match(req, { ignoreSearch: true });
      return cached || Response.error();
    }
  })());
});
