/* eslint-disable no-undef */
// Taskly Service Worker — Web Push display + PWA cache
//
// CRITICAL: the 'push' and 'notificationclick' handlers MUST be registered
// synchronously during the INITIAL evaluation of this script. Registering them
// later — e.g. inside an async function after `await fetch(config)`, which is
// what firebase.messaging()'s onBackgroundMessage did — makes Chrome reject
// them with:
//   "Event handler of 'push' event must be added on the initial evaluation of
//    worker script"
// and background notifications then silently never display.
//
// FCM delivers standard Web Push under the hood, so we decode and show the
// payload ourselves here. No Firebase SDK is needed in the worker — the FCM
// token is still obtained on the client (see services/firebase.ts), which is
// all that's required for delivery to reach this handler.

const CACHE_NAME = 'taskly-v3';
const STATIC_ASSETS = ['/', '/index.html', '/manifest.webmanifest'];

// --------------------------- Push display (SYNC, top-level) --------------
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = {};
  }
  const n = payload.notification || {};
  const d = payload.data || {};
  const title = n.title || d.title || 'Taskly';
  const options = {
    body: n.body || d.body || '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: d.tag || n.tag || 'taskly',
    data: d,
  };
  // Must call showNotification within the event or Chrome shows a generic one.
  event.waitUntil(self.registration.showNotification(title, options));
});

// --------------------------- Notification clicks (SYNC, top-level) -------
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/app';
  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        const u = new URL(client.url);
        if (u.pathname.startsWith('/app') && 'focus' in client) {
          await client.focus();
          if ('navigate' in client) { try { await client.navigate(targetUrl); } catch (e) { /* noop */ } }
          return;
        }
      }
      if (clients.openWindow) await clients.openWindow(targetUrl);
    })()
  );
});

// --------------------------- Lifecycle -----------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try { await cache.addAll(STATIC_ASSETS); } catch (e) { console.warn('[SW] cache addAll failed', e); }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// --------------------------- Fetch cache (network-first) -----------------
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.url.includes('/api/')) return; // never cache API
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === 'navigate') return (await caches.match('/')) || new Response('Offline', { status: 503 });
        return new Response('Offline', { status: 503 });
      })
  );
});

console.log('[SW] Taskly service worker loaded (v3)');
