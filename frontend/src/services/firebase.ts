// Firebase Cloud Messaging (web push) initialization
//
// Web config is fetched from the backend at runtime — no env vars on the
// frontend, no hardcoded keys in the SW. The backend is the single source
// of truth for both the SW (`/api/v1/notifications/web-config`) and this
// module.

import { initializeApp, FirebaseApp } from 'firebase/app';
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported,
  Messaging,
  MessagePayload,
} from 'firebase/messaging';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface WebConfig {
  configured: boolean;
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  vapidKey?: string;
}

let _app: FirebaseApp | null = null;
let _messaging: Messaging | null = null;
let _config: WebConfig | null = null;
let _swRegistration: ServiceWorkerRegistration | null = null;

async function fetchConfig(): Promise<WebConfig | null> {
  if (_config) return _config;
  try {
    const res = await axios.get<WebConfig>(`${API_URL}/api/v1/notifications/web-config`);
    _config = res.data;
    return _config;
  } catch (e) {
    console.warn('[FCM] Could not fetch web-config from backend', e);
    return null;
  }
}

async function ensureSw(): Promise<ServiceWorkerRegistration | null> {
  if (_swRegistration) return _swRegistration;
  if (!('serviceWorker' in navigator)) return null;
  try {
    // Pass API base via query so the SW knows where to fetch its own config.
    const swUrl = `/firebase-messaging-sw.js?api=${encodeURIComponent(API_URL)}`;
    _swRegistration = await navigator.serviceWorker.register(swUrl, { scope: '/' });
    await navigator.serviceWorker.ready;
    return _swRegistration;
  } catch (e) {
    console.warn('[FCM] Service worker registration failed', e);
    return null;
  }
}

async function ensureMessaging(): Promise<Messaging | null> {
  if (_messaging) return _messaging;
  if (!(await isSupported().catch(() => false))) {
    console.info('[FCM] Messaging not supported in this browser');
    return null;
  }
  const cfg = await fetchConfig();
  if (!cfg || !cfg.configured || !cfg.apiKey) {
    console.info('[FCM] Firebase not configured on backend; notifications disabled');
    return null;
  }
  if (!_app) {
    _app = initializeApp({
      apiKey: cfg.apiKey,
      authDomain: cfg.authDomain,
      projectId: cfg.projectId,
      storageBucket: cfg.storageBucket,
      messagingSenderId: cfg.messagingSenderId,
      appId: cfg.appId,
    });
  }
  _messaging = getMessaging(_app);
  return _messaging;
}

/** Returns 'granted' | 'denied' | 'default' (or null if unsupported). */
export async function getNotificationPermission(): Promise<NotificationPermission | null> {
  if (typeof Notification === 'undefined') return null;
  return Notification.permission;
}

/** Prompts the user, then returns the new permission value. */
export async function requestNotificationPermission(): Promise<NotificationPermission | null> {
  if (typeof Notification === 'undefined') return null;
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return await Notification.requestPermission();
}

/** Registers the FCM token for the current user. Idempotent — safe to call
 *  on every login / app start. Returns the token, or null on failure. */
export async function ensureFcmTokenRegistered(authToken?: string | null): Promise<string | null> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return null;
  const messaging = await ensureMessaging();
  if (!messaging) return null;
  const cfg = await fetchConfig();
  const swReg = await ensureSw();
  if (!cfg?.vapidKey) {
    console.warn('[FCM] VAPID key missing on backend');
    return null;
  }
  try {
    const token = await getToken(messaging, {
      vapidKey: cfg.vapidKey,
      serviceWorkerRegistration: swReg ?? undefined,
    });
    if (!token) return null;
    // Register with backend (axios instance not used to avoid circular import).
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers.Authorization = `Bearer ${authToken}`;
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      await axios.post(
        `${API_URL}/api/v1/notifications/register`,
        { token, device_hint: navigator.platform || 'web', timezone },
        { headers }
      );
    } catch (e) {
      console.warn('[FCM] Token registration with backend failed', e);
    }
    return token;
  } catch (e) {
    console.warn('[FCM] getToken failed', e);
    return null;
  }
}

/** Removes the current device's token from the backend. */
export async function unregisterFcmToken(authToken?: string | null): Promise<void> {
  const messaging = await ensureMessaging();
  if (!messaging) return;
  try {
    const token = await getToken(messaging).catch(() => null);
    if (!token) return;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    await axios.post(`${API_URL}/api/v1/notifications/unregister`, { token }, { headers });
  } catch {
    // best effort
  }
}

/** Subscribe to foreground messages. Returns an unsubscribe function. */
export function onForegroundMessage(handler: (payload: MessagePayload) => void): () => void {
  let unsub: () => void = () => {};
  ensureMessaging().then((m) => {
    if (!m) return;
    unsub = onMessage(m, handler);
  });
  return () => unsub();
}

export const isPushSupported = async (): Promise<boolean> => {
  if (typeof Notification === 'undefined') return false;
  return await isSupported().catch(() => false);
};
