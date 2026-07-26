import { useCallback, useEffect, useState } from 'react';
import {
  getNotificationPermission,
  requestNotificationPermission,
  ensureFcmTokenRegistered,
  isPushSupported,
  isDeviceMuted,
  setDeviceMuted,
} from '@/services/firebase';
import { useAuthStore } from '@/stores/authStore';
import { detectIOS, detectStandalone } from './usePwaInstall';

/**
 * Coarse, per-device notification state used to decide what to nudge the user to do.
 * Push permission is per-browser/per-device, so this reflects THIS device only —
 * which is exactly why a user on a second device still needs to opt in there.
 */
export type NotifState =
  | 'granted'       // this device receives push — nothing to do
  | 'default'       // never asked — a click can trigger the prompt
  | 'denied'        // blocked — only recoverable from browser settings
  | 'unsupported'   // browser has no web push at all
  | 'needs-install'; // iOS in a tab — must install the PWA first

function readPermission(): NotificationPermission | null {
  return typeof Notification !== 'undefined' ? Notification.permission : null;
}

export function useNotificationStatus() {
  const [permission, setPermission] = useState<NotificationPermission | null>(readPermission);
  const [supported, setSupported] = useState<boolean | null>(null);
  // Local "turned off on this device" intent — permission can't be revoked, so a
  // granted-but-muted device is still "off" and should be nudged like an unset one.
  const [muted, setMuted] = useState<boolean>(isDeviceMuted);
  const [busy, setBusy] = useState(false);
  const isIOS = detectIOS();
  const isStandalone = detectStandalone();

  const refresh = useCallback(async () => {
    setPermission(await getNotificationPermission());
    setSupported(await isPushSupported());
    setMuted(isDeviceMuted());
  }, []);

  useEffect(() => {
    refresh();
    // Re-check when the user returns — they may have flipped the permission in
    // browser settings, or installed the PWA, while the tab was backgrounded.
    const onFocus = () => refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  /**
   * Requests permission (must be called from a user gesture) and, if granted,
   * registers this device's push token with the backend. Returns the outcome.
   */
  const enable = useCallback(async (): Promise<NotificationPermission | null> => {
    setBusy(true);
    try {
      const perm = await requestNotificationPermission();
      setPermission(perm);
      if (perm === 'granted') {
        // Enabling from any surface clears a prior "off on this device" intent.
        setDeviceMuted(false);
        setMuted(false);
        const session = useAuthStore.getState().session;
        await ensureFcmTokenRegistered(session?.access_token);
      }
      return perm;
    } finally {
      setBusy(false);
    }
  }, []);

  let state: NotifState;
  if (permission === 'granted' && !muted) state = 'granted';
  else if (isIOS && !isStandalone) state = 'needs-install';
  else if (supported === false) state = 'unsupported';
  else if (permission === 'denied') state = 'denied';
  // 'default' also covers granted-but-muted: a click re-enables without a prompt.
  else state = 'default';

  return { state, permission, supported, muted, isIOS, isStandalone, busy, enable, refresh };
}
