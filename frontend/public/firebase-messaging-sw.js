/* eslint-disable no-undef */
// Taskly Service Worker — Firebase Cloud Messaging + PWA cache
//
// Firebase web config is fetched at install time from the backend
// (/api/v1/notifications/web-config) so we never need to hardcode keys here.

importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

const CACHE_NAME = 'taskly-v2';
const CONFIG_CACHE = 'taskly-config-v1';
const STATIC_ASSETS = ['/', '/index.html', '/manifest.webmanifest'];

// Read API base from query param (?api=...) appended at SW registration time.
// Falls back to current origin (assumes backend served behind same host/proxy).
function getApiBase() {
  try {
    const url = new URL(self.location.href);
    const fromQuery = url.searchParams.get('api');
    return (fromQuery || self.location.origin).replace(/\/$/, '');
  } catch (e) {
    return self.location.origin;
  }
}

async function fetchAndCacheConfig() {
  const apiBase = getApiBase();
  try {
    const res = await fetch(`${apiBase}/api/v1/notifications/web-config`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const cfg = await res.json();
    const cache = await caches.open(CONFIG_CACHE);
    await cache.put('firebase-config', new Response(JSON.stringify(cfg)));
    return cfg;
  } catch (err) {
    console.warn('[SW] Could not fetch firebase web-config:', err);
    return null;
  }
}

async function getConfig() {
  const cache = await caches.open(CONFIG_CACHE);
  const cached = await cache.match('firebase-config');
  if (cached) {
    try { return await cached.json(); } catch { /* fallthrough */ }
  }
  return await fetchAndCacheConfig();
}

async function ensureMessaging() {
  const cfg = await getConfig();
  if (!cfg || !cfg.configured || !cfg.apiKey) return null;
  if (!firebase.apps.length) {
    firebase.initializeApp({
      apiKey: cfg.apiKey,
      authDomain: cfg.authDomain,
      projectId: cfg.projectId,
      storageBucket: cfg.storageBucket,
      messagingSenderId: cfg.messagingSenderId,
      appId: cfg.appId,
    });
  }
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || payload.data?.title || 'Taskly';
    const options = {
      body: payload.notification?.body || payload.data?.body || '',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag: payload.data?.tag || payload.notification?.tag || 'taskly',
      data: payload.data || {},
    };
    self.registration.showNotification(title, options);
  });
  return messaging;
}

// --------------------------- Lifecycle -----------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try { await cache.addAll(STATIC_ASSETS); } catch (e) { console.warn('[SW] cache addAll failed', e); }
      await fetchAndCacheConfig();
      await ensureMessaging();
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME && k !== CONFIG_CACHE).map((k) => caches.delete(k))
      );
      await ensureMessaging();
      await self.clients.claim();
    })()
  );
});

// Re-init messaging on any background event (some browsers terminate the SW)
self.addEventListener('push', (event) => {
  event.waitUntil(ensureMessaging());
});

// --------------------------- Notification clicks -------------------------
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/app';
  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of allClients) {
        const u = new URL(client.url);
        if (u.pathname.startsWith('/app') && 'focus' in client) {
          await client.focus();
          if ('navigate' in client) { try { await client.navigate(targetUrl); } catch {} }
          return;
        }
      }
      if (clients.openWindow) await clients.openWindow(targetUrl);
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
        if (req.mode === 'navigate') return caches.match('/') || new Response('Offline', { status: 503 });
        return new Response('Offline', { status: 503 });
      })
  );
});

console.log('[SW] Taskly service worker loaded');
