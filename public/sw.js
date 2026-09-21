/**
 * Service Worker – מאפשר עבודה גם ברשת חלשה או ללא רשת.
 * אסטרטגיה: מטמון מעטפת האפליקציה, רשת-תחילה לבקשות API.
 */
const CACHE = 'yizhak-pest-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // בקשות API: רשת תחילה, בלי מטמון (הנתונים נשמרים מקומית ב-IndexedDB)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request).catch(() => new Response('{"offline":true}', {
      status: 503, headers: { 'Content-Type': 'application/json' },
    })));
    return;
  }

  // ניווט: מחזיר את מעטפת האפליקציה גם ללא רשת
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html').then((r) => r ?? Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached ?? Response.error());
      return cached ?? network;
    }),
  );
});
