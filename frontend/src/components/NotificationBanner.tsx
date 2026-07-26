import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, BellOff, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { useNotificationStatus } from '@/hooks/useNotificationStatus';
import InstallPWA from './InstallPWA';

// Dismissal is session-scoped on purpose: the banner comes back on the next
// visit/session (and on every new device), so a user who ignores it once still
// gets reminded — without it being un-hideable within a single session.
const DISMISS_KEY = 'taskly:notif-banner-dismissed';

/**
 * Persistent dashboard nudge shown whenever THIS device isn't set up to receive
 * push. Handles every "off" state distinctly, because the fix differs:
 *   default → one tap enables it; denied → must use browser settings;
 *   needs-install (iOS) → install the PWA first.
 */
export default function NotificationBanner() {
  const { state, busy, enable } = useNotificationStatus();
  const [dismissed, setDismissed] = useState<boolean>(
    () => sessionStorage.getItem(DISMISS_KEY) === '1'
  );

  // Already receiving push, or the platform simply can't — nothing to nudge.
  if (state === 'granted' || state === 'unsupported') return null;
  if (dismissed) return null;

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  const handleEnable = async () => {
    const perm = await enable();
    if (perm === 'granted') toast.success('Reminders are on for this device 🔔');
    else if (perm === 'denied') {
      toast.error('Notifications are blocked — enable them in your browser settings.');
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 sm:items-center"
      >
        <div className="mt-0.5 flex-shrink-0 sm:mt-0">
          {state === 'denied' ? (
            <BellOff className="h-5 w-5 text-amber-600" />
          ) : (
            <Bell className="h-5 w-5 text-amber-600" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          {state === 'default' && (
            <p className="text-sm text-amber-900">
              <span className="font-semibold">Reminders are off on this device.</span>{' '}
              Turn them on so you never miss a task, break, or wind-down.
            </p>
          )}
          {state === 'denied' && (
            <p className="text-sm text-amber-900">
              <span className="font-semibold">Notifications are blocked.</span> To get
              reminders, allow notifications for this site in your browser&apos;s settings
              (tap the lock icon in the address bar), then reload.
            </p>
          )}
          {state === 'needs-install' && (
            <p className="text-sm text-amber-900">
              <span className="font-semibold">Add Taskly to your Home Screen</span> to get
              reminders on your iPhone or iPad.
            </p>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-1.5">
          {state === 'default' && (
            <button
              type="button"
              onClick={handleEnable}
              disabled={busy}
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-600',
                busy && 'opacity-60'
              )}
            >
              <Bell className="h-4 w-4" />
              {busy ? 'Turning on…' : 'Turn on'}
            </button>
          )}
          {state === 'needs-install' && (
            <InstallPWA label="Install" className="!px-3 !py-1.5" />
          )}
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="rounded-lg p-1.5 text-amber-500 transition-colors hover:bg-amber-100 hover:text-amber-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
