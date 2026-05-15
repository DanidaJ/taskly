import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Brain, Coffee, ExternalLink } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getRemainingSeconds, useFocusCountdownStore } from '@/stores';
import { activeFocusTimerService } from '@/services/api';
import { subscribeToTimerBroadcasts } from '@/services/timerBroadcast';

const formatCountdown = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export default function MiniFocusCountdown() {
  const navigate = useNavigate();
  const location = useLocation();

  const { isRunning, mode, timeLeft, endsAt, taskName } = useFocusCountdownStore((state) => ({
    isRunning: state.isRunning,
    mode: state.mode,
    timeLeft: state.timeLeft,
    endsAt: state.endsAt,
    taskName: state.taskName,
  }));
  const syncSharedCountdown = useFocusCountdownStore((state) => state.syncSnapshot);
  const clearSharedCountdown = useFocusCountdownStore((state) => state.clearSnapshot);

  const [remainingSeconds, setRemainingSeconds] = useState(() => getRemainingSeconds(endsAt, timeLeft));
  const notificationRef = useRef<Notification | null>(null);
  const lastNotifiedMinuteRef = useRef<number | null>(null);

  // Listen for timer changes from other tabs so multi-tab usage stays in sync
  // instead of last-write-wins between concurrent saves.
  useEffect(() => {
    return subscribeToTimerBroadcasts((msg) => {
      if (msg.type === 'cleared') {
        clearSharedCountdown();
        return;
      }
      const timer = msg.timer;
      const startedAtMs = timer.started_at ? new Date(timer.started_at).getTime() : null;
      const elapsedSeconds = timer.is_running && startedAtMs
        ? Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000))
        : 0;
      const remaining = timer.is_running
        ? Math.max(0, timer.remaining_seconds - elapsedSeconds)
        : Math.max(0, timer.remaining_seconds);
      syncSharedCountdown({
        isRunning: timer.is_running,
        mode: timer.mode,
        timeLeft: remaining,
        sessionTotalSeconds: Math.max(timer.total_seconds || 0, remaining),
        taskId: timer.task_id,
        taskName: timer.task_name,
      });
    });
  }, [syncSharedCountdown, clearSharedCountdown]);

  useEffect(() => {
    if (isRunning) {
      return;
    }

    let cancelled = false;

    activeFocusTimerService.get()
      .then((serverTimer) => {
        if (cancelled || !serverTimer) {
          return;
        }

        const startedAtMs = serverTimer.started_at ? new Date(serverTimer.started_at).getTime() : null;
        const elapsedSeconds = serverTimer.is_running && startedAtMs
          ? Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000))
          : 0;
        const remaining = serverTimer.is_running
          ? Math.max(0, serverTimer.remaining_seconds - elapsedSeconds)
          : Math.max(0, serverTimer.remaining_seconds);

        if (remaining <= 0) {
          return;
        }

        syncSharedCountdown({
          isRunning: serverTimer.is_running,
          mode: serverTimer.mode,
          timeLeft: remaining,
          sessionTotalSeconds: Math.max(serverTimer.total_seconds || 0, remaining),
          taskId: serverTimer.task_id,
          taskName: serverTimer.task_name,
        });
      })
      .catch((error) => {
        console.error('Failed to hydrate mini countdown from server:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [isRunning, syncSharedCountdown]);

  const modeLabel = useMemo(() => {
    if (mode === 'shortBreak') return 'Short break';
    if (mode === 'longBreak') return 'Long break';
    return 'Focus running';
  }, [mode]);

  useEffect(() => {
    setRemainingSeconds(getRemainingSeconds(endsAt, timeLeft));
  }, [endsAt, timeLeft]);

  useEffect(() => {
    if (!isRunning) {
      setRemainingSeconds(Math.max(0, timeLeft));
      return;
    }

    const updateRemaining = () => {
      setRemainingSeconds(getRemainingSeconds(endsAt, timeLeft));
    };

    updateRemaining();
    const intervalId = window.setInterval(updateRemaining, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [endsAt, isRunning, timeLeft]);

  useEffect(() => {
    if (!isRunning || remainingSeconds <= 0 || typeof window === 'undefined' || !("Notification" in window)) {
      if (notificationRef.current) {
        notificationRef.current.close();
        notificationRef.current = null;
      }
      lastNotifiedMinuteRef.current = null;
      return;
    }

    const maybeShowNotification = () => {
      if (document.visibilityState !== 'hidden') {
        if (notificationRef.current) {
          notificationRef.current.close();
          notificationRef.current = null;
        }
        lastNotifiedMinuteRef.current = null;
        return;
      }

      if (Notification.permission !== 'granted') {
        return;
      }

      const minuteBucket = Math.floor(remainingSeconds / 60);
      if (minuteBucket === lastNotifiedMinuteRef.current) {
        return;
      }

      lastNotifiedMinuteRef.current = minuteBucket;
      if (notificationRef.current) {
        notificationRef.current.close();
      }

      notificationRef.current = new Notification('Taskly countdown', {
        body: `${taskName || modeLabel} · ${formatCountdown(remainingSeconds)} left`,
        tag: 'taskly-focus-countdown',
        requireInteraction: true,
      });
    };

    maybeShowNotification();
    document.addEventListener('visibilitychange', maybeShowNotification);
    const intervalId = window.setInterval(maybeShowNotification, 10000);

    return () => {
      document.removeEventListener('visibilitychange', maybeShowNotification);
      window.clearInterval(intervalId);
    };
  }, [isRunning, modeLabel, remainingSeconds, taskName]);

  const shouldShowMini = isRunning && remainingSeconds > 0 && location.pathname !== '/app/focus';
  if (!shouldShowMini) {
    return null;
  }

  const Icon = mode === 'focus' ? Brain : Coffee;
  const timerTone = mode === 'focus'
    ? 'from-red-500 to-orange-500'
    : mode === 'shortBreak'
      ? 'from-green-500 to-emerald-500'
      : 'from-blue-500 to-cyan-500';

  return (
    <AnimatePresence>
      <motion.button
        key="mini-focus-countdown"
        initial={{ opacity: 0, y: 20, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.95 }}
        transition={{ duration: 0.22 }}
        onClick={() => navigate('/app/focus')}
        className="fixed bottom-28 right-4 md:right-8 z-50 w-[220px] rounded-2xl border border-white/70 bg-white/90 backdrop-blur-xl shadow-[0_14px_32px_rgba(15,23,42,0.22)] p-3 text-left"
        aria-label="Open focus timer"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br ${timerTone}`}>
              <Icon className="w-4 h-4 text-white" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-gray-500">Countdown</p>
              <p className="text-xs font-semibold text-gray-800 truncate">{taskName || modeLabel}</p>
            </div>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
        </div>

        <div className="mt-2 flex items-end justify-between">
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{formatCountdown(remainingSeconds)}</p>
          <p className="text-[11px] font-medium text-gray-500">Tap to open</p>
        </div>
      </motion.button>
    </AnimatePresence>
  );
}
