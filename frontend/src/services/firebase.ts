import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, Messaging } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

let messaging: Messaging | null = null;

// Initialize Firebase only if config is available
const initializeFirebase = () => {
  if (!firebaseConfig.apiKey) {
    console.warn('Firebase config not set. Notifications will be disabled.');
    return null;
  }

  try {
    const app = initializeApp(firebaseConfig);
    messaging = getMessaging(app);
    return messaging;
  } catch (error) {
    console.error('Error initializing Firebase:', error);
    return null;
  }
};

export const requestNotificationPermission = async (): Promise<string | null> => {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return null;
  }

  const permission = await Notification.requestPermission();
  
  if (permission !== 'granted') {
    console.warn('Notification permission denied');
    return null;
  }

  const fcm = messaging || initializeFirebase();
  if (!fcm) return null;

  try {
    const token = await getToken(fcm, { vapidKey });
    return token;
  } catch (error) {
    console.error('Error getting FCM token:', error);
    return null;
  }
};

export const onMessageListener = (): Promise<any> => {
  const fcm = messaging || initializeFirebase();
  if (!fcm) return Promise.reject('Firebase not initialized');

  return new Promise((resolve) => {
    onMessage(fcm, (payload) => {
      resolve(payload);
    });
  });
};

// Show local notification
export const showLocalNotification = (title: string, options?: NotificationOptions) => {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      ...options,
    });
  }
};

// Schedule a local notification (for when backend is not available)
export const scheduleLocalNotification = (
  title: string,
  body: string,
  scheduledTime: Date
): number => {
  const now = Date.now();
  const delay = scheduledTime.getTime() - now;

  if (delay <= 0) {
    console.warn('Scheduled time is in the past');
    return -1;
  }

  const timeoutId = window.setTimeout(() => {
    showLocalNotification(title, { body });
  }, delay);

  return timeoutId;
};

export const cancelScheduledNotification = (timeoutId: number) => {
  window.clearTimeout(timeoutId);
};

export { initializeFirebase };
