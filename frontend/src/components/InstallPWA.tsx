import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Share, Plus, X } from 'lucide-react';
import { clsx } from 'clsx';
import { usePwaInstall } from '@/hooks/usePwaInstall';

interface InstallPWAProps {
  /** Extra classes for the trigger button (e.g. `w-full justify-center` in a menu). */
  className?: string;
  label?: string;
}

/**
 * "Get the App" button. Renders nothing unless the app is actually installable
 * and not already installed. On Chromium it fires the native install prompt; on
 * iOS (which has no prompt) it opens Add-to-Home-Screen instructions.
 */
export default function InstallPWA({ className, label = 'Get the App' }: InstallPWAProps) {
  const { canInstall, canPrompt, isIOS, promptInstall } = usePwaInstall();
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  if (!canInstall) return null;

  const handleClick = async () => {
    if (canPrompt) {
      await promptInstall();
    } else if (isIOS) {
      setShowIOSHelp(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={clsx(
          'inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-apple',
          'bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600',
          'transition-all shadow-apple hover:shadow-glow-blue',
          className
        )}
      >
        <Download className="w-4 h-4" />
        {label}
      </button>

      <AnimatePresence>
        {showIOSHelp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowIOSHelp(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.96 }}
              className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <img src="/logo.svg" alt="" className="w-7 h-7" />
                  <h3 className="font-semibold text-gray-900">Install Taskly</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSHelp(false)}
                  className="p-1 rounded-lg text-gray-400 hover:bg-gray-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <p className="text-sm text-gray-600">
                  Add Taskly to your Home Screen for a full-screen app and reminders. In{' '}
                  <strong>Safari</strong>:
                </p>
                <ol className="space-y-3">
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center">
                      1
                    </span>
                    <span className="text-sm text-gray-700 flex items-center gap-1.5 flex-wrap">
                      Tap the <Share className="w-4 h-4 text-blue-500 inline" />
                      <strong>Share</strong> button
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center">
                      2
                    </span>
                    <span className="text-sm text-gray-700 flex items-center gap-1.5 flex-wrap">
                      Choose <strong>Add to Home Screen</strong>
                      <Plus className="w-4 h-4 text-gray-500 inline" />
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center">
                      3
                    </span>
                    <span className="text-sm text-gray-700">
                      Open <strong>Taskly</strong> from your Home Screen — done!
                    </span>
                  </li>
                </ol>
                <p className="text-xs text-gray-400 pt-1">
                  Notifications on iPhone/iPad need iOS 16.4+ and only work from the installed app.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
