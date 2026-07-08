// Skyseed KFK-Tracker · Service Worker
// - Statische Assets: cache-first
// - Apps-Script-API: network-only (nie cachen)
// - Bei Offline: letzte bekannte Daten zeigen

const CACHE_VERSION = 'skyseed-kfk-20260708-538617e';
const STATIC_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './kfk-icon-192.png',
  './kfk-icon-512.png',
  './kfk-icon-maskable-512.png'
];
const FONT_CACHE = 'kfk-fonts-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(c => c.addAll(STATIC_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_VERSION && k !== FONT_CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Apps-Script und Drive: immer direkt ans Netz
  if (url.hostname === 'script.google.com' ||
      url.hostname === 'script.googleusercontent.com' ||
      url.hostname === 'drive.google.com' ||
      url.hostname === 'docs.google.com') {
    return;
  }

  // QR-API passthrough
  if (url.hostname === 'api.qrserver.com') return;

  // Google Fonts cachen
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  // Statische Assets: cache-first + stale-while-revalidate
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) {
          fetch(event.request).then(response => {
            if (response.ok) {
              caches.open(CACHE_VERSION).then(cache => cache.put(event.request, response));
            }
          }).catch(() => {});
          return cached;
        }
        return fetch(event.request).then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(event.request, copy));
          }
          return response;
        }).catch(() => {
          if (event.request.mode === 'navigate') return caches.match('./index.html');
        });
      })
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
