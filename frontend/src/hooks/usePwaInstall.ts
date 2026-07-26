import { useCallback, useEffect, useState } from 'react';

// The `beforeinstallprompt` event isn't in the standard lib DOM types.
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt: () => Promise<void>;
}

export function detectIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOSDevice = /iphone|ipad|ipod/i.test(ua);
  // iPadOS 13+ masquerades as desktop Safari — detect it via touch support.
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return isIOSDevice || isIPadOS;
}

export function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const displayMode = window.matchMedia?.('(display-mode: standalone)').matches;
  // iOS Safari exposes standalone on navigator instead of matchMedia.
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return Boolean(displayMode || iosStandalone);
}

/**
 * Tracks PWA installability across platforms.
 *
 * - Chromium (Android / desktop): fires `beforeinstallprompt`, which we stash so
 *   a button can trigger the native install dialog on demand.
 * - iOS: has no install event — the user must use Safari's Share → Add to Home
 *   Screen. We surface `isIOS` so the UI can show those instructions instead.
 * - Already installed: `isStandalone` is true; hide the install affordance.
 */
export function usePwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(detectStandalone);
  const isIOS = detectIOS();

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault(); // stop Chrome's mini-infobar; we drive the prompt ourselves
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setIsStandalone(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    const mq = window.matchMedia?.('(display-mode: standalone)');
    const onDisplayChange = () => setIsStandalone(detectStandalone());
    mq?.addEventListener?.('change', onDisplayChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      mq?.removeEventListener?.('change', onDisplayChange);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferred) return 'unavailable';
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    return choice.outcome;
  }, [deferred]);

  const canPrompt = deferred !== null;
  // Show an install affordance only when it leads somewhere: a real Chromium
  // prompt, or iOS manual instructions. Hide once the app runs standalone.
  const canInstall = !isStandalone && (canPrompt || isIOS);

  return { canInstall, canPrompt, isIOS, isStandalone, promptInstall };
}
