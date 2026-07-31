import { useCallback, useEffect, useState } from 'react';

// The Document Picture-in-Picture API opens a real always-on-top OS window that
// hosts arbitrary DOM (unlike video PiP, which can only show a <video>). It is
// Chromium-only and desktop-only today, so every caller must feature-detect via
// `supported` and simply render nothing elsewhere.
interface DocumentPiPOptions {
  width?: number;
  height?: number;
}

interface DocumentPiPApi {
  requestWindow: (options?: DocumentPiPOptions) => Promise<Window>;
}

function getApi(): DocumentPiPApi | null {
  if (typeof window === 'undefined') return null;
  const api = (window as unknown as { documentPictureInPicture?: DocumentPiPApi })
    .documentPictureInPicture;
  return api ?? null;
}

// One window, shared by every mount point. The pop-out control renders both on
// the Focus page and inside the floating mini widget, and exactly one of those
// is mounted at a time — so per-component state would tear the window down on
// every navigation between them. The browser closes a PiP window automatically
// when its opener document goes away, so there is nothing to clean up on unmount.
let sharedWindow: Window | null = null;
const listeners = new Set<(win: Window | null) => void>();

function publish(win: Window | null) {
  sharedWindow = win;
  listeners.forEach((notify) => notify(win));
}

export function useDocumentPiP() {
  const [pipWindow, setPipWindow] = useState<Window | null>(sharedWindow);
  const supported = getApi() !== null;

  useEffect(() => {
    listeners.add(setPipWindow);
    setPipWindow(sharedWindow); // adopt a window opened before this mount
    return () => {
      listeners.delete(setPipWindow);
    };
  }, []);

  const close = useCallback(() => {
    try {
      sharedWindow?.close();
    } catch {
      /* already gone */
    }
    publish(null);
  }, []);

  const open = useCallback(async (options?: DocumentPiPOptions): Promise<Window | null> => {
    const api = getApi();
    if (!api) return null;
    if (sharedWindow) return sharedWindow;
    try {
      // Requires transient user activation — the browser rejects this outside
      // the ~5s window after a real interaction.
      const win = await api.requestWindow({
        width: options?.width ?? 320,
        height: options?.height ?? 188,
      });
      // Fires when the user closes the PiP window with its own control.
      win.addEventListener('pagehide', () => publish(null));
      publish(win);
      return win;
    } catch {
      return null;
    }
  }, []);

  return { supported, pipWindow, open, close };
}
