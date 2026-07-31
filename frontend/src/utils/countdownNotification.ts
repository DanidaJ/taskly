// The persistent focus-countdown notification.
//
// Shown through the service worker rather than `new Notification()` for two
// reasons: the page-scoped constructor is an *illegal constructor* on Android
// Chrome (so the countdown never worked there at all), and only a service-worker
// notification can be replaced in place. Re-showing with the same tag plus
// `silent` + `renotify: false` swaps the text quietly, so a long session updates
// one notification instead of re-alerting every minute.

const COUNTDOWN_TAG = 'taskly-focus-countdown';

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    // Resolves for the page-controlling worker (workbox at '/'), which is also
    // where the notificationclick handler lives (public/sw-custom.js).
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/** Creates or silently updates the single countdown notification. */
export async function showCountdownNotification(title: string, body: string): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const registration = await getRegistration();
  if (!registration) return;
  try {
    await registration.showNotification(title, {
      body,
      tag: COUNTDOWN_TAG,
      renotify: false, // replace quietly instead of re-alerting
      silent: true, // no sound/vibration on each tick
      requireInteraction: true, // keep it on screen for the whole session
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      data: { url: '/app/focus' },
    } as NotificationOptions);
  } catch {
    /* non-fatal — the in-app widget still shows the countdown */
  }
}

/** Dismisses the countdown notification if one is on screen. */
export async function closeCountdownNotification(): Promise<void> {
  const registration = await getRegistration();
  if (!registration) return;
  try {
    const open = await registration.getNotifications({ tag: COUNTDOWN_TAG });
    open.forEach((notification) => notification.close());
  } catch {
    /* non-fatal */
  }
}
