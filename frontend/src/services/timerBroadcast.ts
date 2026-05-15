import type { ActiveFocusTimer } from './api';

const CHANNEL_NAME = 'taskly-focus-timer-sync';
const TAB_ID_STORAGE_KEY = 'taskly-tab-id';

export type TimerBroadcastMessage =
  | { type: 'saved'; tabId: string; timer: ActiveFocusTimer }
  | { type: 'cleared'; tabId: string };

let cachedChannel: BroadcastChannel | null = null;
let cachedTabId = '';

function ensure(): { channel: BroadcastChannel | null; tabId: string } {
  if (typeof window === 'undefined') return { channel: null, tabId: '' };
  if (typeof BroadcastChannel === 'undefined') return { channel: null, tabId: '' };

  if (!cachedTabId) {
    try {
      const existing = sessionStorage.getItem(TAB_ID_STORAGE_KEY);
      if (existing) {
        cachedTabId = existing;
      } else {
        cachedTabId = typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        sessionStorage.setItem(TAB_ID_STORAGE_KEY, cachedTabId);
      }
    } catch {
      cachedTabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  }

  if (!cachedChannel) {
    try {
      cachedChannel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      cachedChannel = null;
    }
  }

  return { channel: cachedChannel, tabId: cachedTabId };
}

export function getTabId(): string {
  return ensure().tabId;
}

export function broadcastTimerSaved(timer: ActiveFocusTimer): void {
  const { channel, tabId } = ensure();
  if (!channel) return;
  try {
    channel.postMessage({ type: 'saved', tabId, timer } satisfies TimerBroadcastMessage);
  } catch {
    // ignore — postMessage can throw for non-cloneable payloads or closed channels
  }
}

export function broadcastTimerCleared(): void {
  const { channel, tabId } = ensure();
  if (!channel) return;
  try {
    channel.postMessage({ type: 'cleared', tabId } satisfies TimerBroadcastMessage);
  } catch {
    // ignore
  }
}

/**
 * Subscribe to broadcasts from other tabs. Messages from the current tab
 * are filtered out so the caller never sees its own events.
 */
export function subscribeToTimerBroadcasts(
  handler: (message: TimerBroadcastMessage) => void,
): () => void {
  const { channel, tabId } = ensure();
  if (!channel) return () => undefined;

  const listener = (event: MessageEvent<TimerBroadcastMessage>) => {
    const msg = event.data;
    if (!msg || !msg.tabId || msg.tabId === tabId) return;
    handler(msg);
  };

  channel.addEventListener('message', listener);
  return () => {
    try {
      channel.removeEventListener('message', listener);
    } catch {
      // ignore
    }
  };
}
