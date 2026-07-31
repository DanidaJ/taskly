/* eslint-disable no-undef */
// Custom handlers folded into the Workbox-generated service worker (see
// `workbox.importScripts` in vite.config.ts). importScripts() runs during the
// worker's initial evaluation, which is exactly when notification/push handlers
// must be registered — adding them later makes the browser reject them.
//
// The focus countdown notification is shown by the page via
// registration.showNotification(), so its click has to be handled here in the
// worker rather than with an onclick on a Notification object.

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/app';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try { await client.navigate(targetUrl); } catch (e) { /* noop */ }
          }
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
    })()
  );
});
