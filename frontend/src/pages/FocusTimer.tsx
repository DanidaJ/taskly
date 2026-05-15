import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Pause,
  RotateCcw,
  Coffee,
  Brain,
  Settings,
  Volume2,
  VolumeX,
  CheckCircle2,
  Clock,
  Zap,
  ArrowRight,
  Moon,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { getRemainingSeconds, useFocusCountdownStore, useTaskStore, useTimerPromptStore } from '@/stores';
import { activeFocusTimerService, focusSessionService, focusSettingsService, FocusSettings } from '@/services/api';
import { subscribeToTimerBroadcasts } from '@/services/timerBroadcast';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { parseDuration } from '@/utils';
import TaskStartConfirmModal, { StartContext } from '@/components/TaskStartConfirmModal';

type TimerMode = 'focus' | 'shortBreak' | 'longBreak';

interface FocusSession {
  id: string;
  taskId?: string;
  taskName?: string;
  startTime: Date;
  endTime?: Date;
  duration: number; // in seconds
  mode: TimerMode;
  completed: boolean;
}

interface TimerSettings {
  focusDuration: number; // minutes
  shortBreakDuration: number;
  longBreakDuration: number;
  sessionsBeforeLongBreak: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  soundEnabled: boolean;
}

const DEFAULT_SETTINGS: TimerSettings = {
  focusDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  sessionsBeforeLongBreak: 4,
  autoStartBreaks: false,
  autoStartFocus: false,
  soundEnabled: true,
};

const settingsToBackend = (s: TimerSettings): FocusSettings => ({
  focus_duration: s.focusDuration,
  short_break_duration: s.shortBreakDuration,
  long_break_duration: s.longBreakDuration,
  sessions_before_long_break: s.sessionsBeforeLongBreak,
  auto_start_breaks: s.autoStartBreaks,
  auto_start_focus: s.autoStartFocus,
  sound_enabled: s.soundEnabled,
});

const settingsFromBackend = (s: FocusSettings): TimerSettings => ({
  focusDuration: s.focus_duration,
  shortBreakDuration: s.short_break_duration,
  longBreakDuration: s.long_break_duration,
  sessionsBeforeLongBreak: s.sessions_before_long_break,
  autoStartBreaks: s.auto_start_breaks,
  autoStartFocus: s.auto_start_focus,
  soundEnabled: s.sound_enabled,
});

export default function FocusTimer() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [settings, setSettings] = useState<TimerSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const [mode, setMode] = useState<TimerMode>('focus');
  const [timeLeft, setTimeLeft] = useState(DEFAULT_SETTINGS.focusDuration * 60);
  const [sessionTotalSeconds, setSessionTotalSeconds] = useState(DEFAULT_SETTINGS.focusDuration * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionsCompleted, setSessionsCompleted] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskName, setSelectedTaskName] = useState<string | null>(null);
  const [taskDurationMinutes, setTaskDurationMinutes] = useState<number | null>(null);
  const [taskDate, setTaskDate] = useState<string | null>(null);
  const [autoStartRequested, setAutoStartRequested] = useState(false);
  const [todaySessions, setTodaySessions] = useState<FocusSession[]>([]);
  // Track whether the current session has been confirmed (no double-modal)
  const [sessionConfirmed, setSessionConfirmed] = useState(false);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [hydratedFromSharedSnapshot, setHydratedFromSharedSnapshot] = useState(false);
  const [serverTimerHydrated, setServerTimerHydrated] = useState(false);

  const { plannedTasks, loadPlanFromDatabase, updatePlannedTask } = useTaskStore();
  const syncSharedCountdown = useFocusCountdownStore((state) => state.syncSnapshot);
  // Completion prompt lives in a global store so it can be surfaced from Layout
  // (mandatory yes/no even when the user has navigated away from FocusTimer).
  const globalPrompt = useTimerPromptStore((state) => state.prompt);
  const setGlobalPrompt = useTimerPromptStore((state) => state.setPrompt);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownEndsAtRef = useRef<number | null>(null);
  const timerSyncSignatureRef = useRef<string | null>(null);
  // Set true right before state setters that originate from a cross-tab
  // broadcast, so the save effect skips re-saving and we don't ping-pong.
  const applyingRemoteTimerRef = useRef(false);
  // Remember the next focus session count so we can transition into a break
  // once the global prompt is answered while the user is still on this page.
  const pendingBreakSessionRef = useRef<number | null>(null);
  const lastPromptTaskIdRef = useRef<string | null>(null);

  const activeFocusDuration = taskDurationMinutes ?? settings.focusDuration;
  const selectedTask = selectedTaskId
    ? plannedTasks.find((task) => task.id === selectedTaskId) || null
    : null;
  const selectedTaskRequiresReschedule = selectedTask?.status === 'missed';

  // Load task context from URL parameters
  useEffect(() => {
    const taskId = searchParams.get('task');
    const taskNameParam = searchParams.get('taskName');
    const durationParam = searchParams.get('duration');
    const dateParam = searchParams.get('date');
    const sharedSnapshot = useFocusCountdownStore.getState();
    const hasRunningSharedTimer = sharedSnapshot.isRunning;

    const resolvedTaskId = taskId || (hasRunningSharedTimer ? sharedSnapshot.taskId : null);
    const resolvedTaskName = taskNameParam || (hasRunningSharedTimer ? sharedSnapshot.taskName : null);

    setSelectedTaskId(resolvedTaskId);
    setSelectedTaskName(resolvedTaskName);
    setTaskDurationMinutes(durationParam ? parseDuration(durationParam) : null);
    setTaskDate(dateParam || null);
    setAutoStartRequested(searchParams.get('autostart') === '1');

    if (hasRunningSharedTimer) {
      const remainingSeconds = getRemainingSeconds(sharedSnapshot.endsAt, sharedSnapshot.timeLeft);
      setMode(sharedSnapshot.mode);
      setTimeLeft(remainingSeconds);
      setSessionTotalSeconds(Math.max(sharedSnapshot.sessionTotalSeconds || 0, remainingSeconds));
      setIsRunning(remainingSeconds > 0);
      setSessionConfirmed(true);
    }

    setHydratedFromSharedSnapshot(true);
  }, [searchParams]);

  // Keep the app-wide mini popup in sync with the timer state.
  useEffect(() => {
    if (!hydratedFromSharedSnapshot) return;

    syncSharedCountdown({
      isRunning,
      mode,
      timeLeft,
      sessionTotalSeconds,
      taskId: selectedTaskId,
      taskName: selectedTaskName,
    });
  }, [
    hydratedFromSharedSnapshot,
    isRunning,
    mode,
    sessionTotalSeconds,
    selectedTaskId,
    selectedTaskName,
    syncSharedCountdown,
    timeLeft,
  ]);

  // Hydrate from backend so timer survives app close, browser close, and device restart.
  useEffect(() => {
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
        const remainingSeconds = serverTimer.is_running
          ? Math.max(0, serverTimer.remaining_seconds - elapsedSeconds)
          : Math.max(0, serverTimer.remaining_seconds);

        timerSyncSignatureRef.current = null;
        setMode(serverTimer.mode);
        setSelectedTaskId(serverTimer.task_id || null);
        setSelectedTaskName(serverTimer.task_name || null);
        setTaskDate(serverTimer.task_date || null);
        setSessionTotalSeconds(Math.max(serverTimer.total_seconds || 0, remainingSeconds));
        setTimeLeft(remainingSeconds);
        setIsRunning(serverTimer.is_running);
        setSessionConfirmed(true);
        setAutoStartRequested(false);

        if (serverTimer.mode === 'focus' && serverTimer.total_seconds > 0) {
          setTaskDurationMinutes(Math.max(1, Math.round(serverTimer.total_seconds / 60)));
        }
      })
      .catch((error) => {
        console.error('Failed to load active focus timer:', error);
      })
      .finally(() => {
        if (!cancelled) {
          setServerTimerHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist timer state changes to backend (without syncing every second while running).
  useEffect(() => {
    if (!hydratedFromSharedSnapshot || !serverTimerHydrated) return;

    const signature = isRunning
      ? `running|${mode}|${selectedTaskId || ''}|${selectedTaskName || ''}|${taskDate || ''}|${sessionTotalSeconds}`
      : `paused|${mode}|${selectedTaskId || ''}|${selectedTaskName || ''}|${taskDate || ''}|${sessionTotalSeconds}|${timeLeft}`;

    if (timerSyncSignatureRef.current === signature) {
      return;
    }

    // If the state change came from another tab's broadcast, skip the save —
    // otherwise the two tabs would ping-pong saves and the BroadcastChannel
    // loop would echo back into a feedback cycle.
    if (applyingRemoteTimerRef.current) {
      applyingRemoteTimerRef.current = false;
      timerSyncSignatureRef.current = signature;
      return;
    }

    timerSyncSignatureRef.current = signature;
    activeFocusTimerService.save({
      mode,
      task_id: selectedTaskId,
      task_name: selectedTaskName,
      task_date: taskDate,
      is_running: isRunning,
      remaining_seconds: Math.max(0, timeLeft),
      total_seconds: Math.max(0, sessionTotalSeconds),
      started_at: isRunning ? new Date().toISOString() : null,
    }).catch((error) => {
      console.error('Failed to save active focus timer:', error);
    });
  }, [
    hydratedFromSharedSnapshot,
    isRunning,
    mode,
    selectedTaskId,
    selectedTaskName,
    taskDate,
    serverTimerHydrated,
    sessionTotalSeconds,
    timeLeft,
  ]);

  // Apply timer changes broadcast from another tab so concurrent FocusTimer
  // instances stay in lockstep instead of overwriting each other.
  useEffect(() => {
    return subscribeToTimerBroadcasts((msg) => {
      applyingRemoteTimerRef.current = true;

      if (msg.type === 'cleared') {
        setIsRunning(false);
        setSelectedTaskId(null);
        setSelectedTaskName(null);
        setTaskDate(null);
        setTimeLeft(0);
        setSessionTotalSeconds(0);
        setSessionConfirmed(false);
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

      setMode(timer.mode);
      setSelectedTaskId(timer.task_id || null);
      setSelectedTaskName(timer.task_name || null);
      setTaskDate(timer.task_date || null);
      setSessionTotalSeconds(Math.max(timer.total_seconds || 0, remaining));
      setTimeLeft(remaining);
      setIsRunning(timer.is_running);
      setSessionConfirmed(true);
      if (timer.mode === 'focus' && timer.total_seconds > 0) {
        setTaskDurationMinutes(Math.max(1, Math.round(timer.total_seconds / 60)));
      }
    });
  }, []);

  // If timer ended while user was away (or on first load with an expired timer),
  // hand the mandatory decision off to the global prompt store.
  useEffect(() => {
    if (!serverTimerHydrated) return;
    if (globalPrompt) return;
    if (mode !== 'focus' || timeLeft !== 0 || !selectedTaskId) return;

    const task = plannedTasks.find((t) => t.id === selectedTaskId);
    if (task && ['completed', 'cancelled', 'skipped', 'missed'].includes(task.status)) {
      return;
    }

    const completedFocusSessions = todaySessions.filter((s) => s.mode === 'focus' && s.completed).length;
    const completedSessionCount = Math.max(1, sessionsCompleted, completedFocusSessions);
    const durationMinutes = Math.max(
      1,
      Math.round(((sessionTotalSeconds > 0 ? sessionTotalSeconds : activeFocusDuration * 60) / 60)),
    );

    pendingBreakSessionRef.current = completedSessionCount;
    setGlobalPrompt({
      taskId: selectedTaskId,
      taskName: task?.task_name || selectedTaskName || 'Task',
      taskDate: taskDate || format(new Date(), 'yyyy-MM-dd'),
      durationMinutes,
      nextSessionCount: completedSessionCount,
    });
  }, [
    activeFocusDuration,
    globalPrompt,
    mode,
    plannedTasks,
    selectedTaskId,
    selectedTaskName,
    serverTimerHydrated,
    sessionTotalSeconds,
    sessionsCompleted,
    setGlobalPrompt,
    taskDate,
    timeLeft,
    todaySessions,
  ]);

  // If a task date was provided, ensure that plan is loaded so task metadata/status can be resolved.
  useEffect(() => {
    if (!taskDate) return;
    loadPlanFromDatabase(taskDate).catch((error) => {
      console.log('Task date plan load skipped:', error?.message || 'No plan available');
    });
  }, [taskDate, loadPlanFromDatabase]);

  // Keep selected task name and duration in sync with latest plan data.
  useEffect(() => {
    if (!selectedTaskId) return;
    const selectedTask = plannedTasks.find((task) => task.id === selectedTaskId);
    if (!selectedTask) return;

    setSelectedTaskName(selectedTask.task_name);
    setTaskDurationMinutes(parseDuration(selectedTask.suggested_duration));
  }, [selectedTaskId, plannedTasks]);

  // Load settings from backend
  useEffect(() => {
    focusSettingsService.get()
      .then((remote) => {
        const mapped = settingsFromBackend(remote);
        setSettings(mapped);
      })
      .catch((error) => {
        console.error('Failed to load focus settings:', error);
      })
      .finally(() => setSettingsLoaded(true));
  }, []);

  // Load today's sessions from backend (single source of truth)
  useEffect(() => {
    const todayDate = format(new Date(), 'yyyy-MM-dd');

    focusSessionService.getForDate(todayDate)
      .then((backendSessions: any[]) => {
        const mapped = (backendSessions || []).map((s: any) => ({
          id: s.id,
          taskId: s.task_id || undefined,
          taskName: s.task_name || undefined,
          startTime: new Date(s.start_time),
          endTime: s.end_time ? new Date(s.end_time) : undefined,
          duration: s.duration,
          mode: s.mode as TimerMode,
          completed: s.completed,
        }));
        setTodaySessions(mapped);
        const focusDone = mapped.filter((s) => s.mode === 'focus' && s.completed).length;
        setSessionsCompleted(focusDone);
      })
      .catch((error) => {
        console.error('Failed to load focus sessions:', error);
      });
  }, []);

  // Persist settings to backend whenever they change (after initial load).
  useEffect(() => {
    if (!settingsLoaded) return;
    focusSettingsService.save(settingsToBackend(settings)).catch((error) => {
      console.error('Failed to save focus settings:', error);
    });
  }, [settings, settingsLoaded]);

  // When a task-specific duration changes, sync timer display while not running.
  useEffect(() => {
    if (!hydratedFromSharedSnapshot) return;
    if (mode !== 'focus' || isRunning) return;

    // If the timer is paused mid-session, keep its remaining seconds unchanged.
    if (sessionTotalSeconds > 0 && timeLeft !== sessionTotalSeconds) {
      return;
    }

    const nextSeconds = activeFocusDuration * 60;
    setSessionTotalSeconds(nextSeconds);
    setTimeLeft(nextSeconds);
  }, [
    activeFocusDuration,
    hydratedFromSharedSnapshot,
    isRunning,
    mode,
    sessionTotalSeconds,
    timeLeft,
  ]);

  // Support one-click task start flow from dashboard/schedule.
  // When autostart is requested we bypass the confirm modal — user already confirmed.
  useEffect(() => {
    if (!serverTimerHydrated) return;
    if (!autoStartRequested || mode !== 'focus' || isRunning) return;

    // Wait until the planned task is hydrated before deciding whether autostart is allowed.
    // Without this, a 'missed' task can autostart in the race between URL parsing and plan load.
    if (selectedTaskId && !selectedTask) return;

    if (selectedTaskRequiresReschedule) {
      toast.error('This task must be rescheduled before it can be started again.');
      setAutoStartRequested(false);
      return;
    }

    setSessionConfirmed(true); // pre-confirm so manual play won't re-ask
    // Persist the in-progress lifecycle even though the caller normally does it.
    // Direct/bookmarked autostart URLs and failed caller updates would otherwise
    // leave the task as 'pending' while timing actively runs.
    if (
      selectedTaskId
      && selectedTask
      && !['in_progress', 'completed', 'skipped', 'cancelled', 'missed'].includes(selectedTask.status)
    ) {
      updatePlannedTask(selectedTaskId, {
        status: 'in_progress',
        actual_start: selectedTask.actual_start || new Date().toISOString(),
      }).catch((error) => {
        console.error('Failed to mark autostart task in progress:', error);
      });
    }
    if (sessionTotalSeconds <= 0) {
      setSessionTotalSeconds(Math.max(timeLeft, activeFocusDuration * 60));
    }
    setIsRunning(true);
    setAutoStartRequested(false);
  }, [
    activeFocusDuration,
    autoStartRequested,
    isRunning,
    mode,
    selectedTask,
    selectedTaskId,
    selectedTaskRequiresReschedule,
    serverTimerHydrated,
    sessionTotalSeconds,
    timeLeft,
    updatePlannedTask,
  ]);

  // Timer loop based on absolute end timestamp (survives sleep/throttling accurately).
  useEffect(() => {
    if (!isRunning) {
      countdownEndsAtRef.current = null;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      return;
    }

    countdownEndsAtRef.current = Date.now() + Math.max(0, timeLeft) * 1000;

    const tick = () => {
      if (!countdownEndsAtRef.current) return;
      const remaining = Math.max(0, Math.ceil((countdownEndsAtRef.current - Date.now()) / 1000));
      setTimeLeft((prev) => (prev === remaining ? prev : remaining));
    };

    tick();
    intervalRef.current = setInterval(tick, 250);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning || timeLeft !== 0) return;
    countdownEndsAtRef.current = null;
    handleTimerComplete();
  }, [isRunning, timeLeft]);

  const transitionToBreakAfterFocus = useCallback((completedSessionCount: number) => {
    const nextMode = completedSessionCount % settings.sessionsBeforeLongBreak === 0
      ? 'longBreak'
      : 'shortBreak';
    const nextDurationSeconds = nextMode === 'longBreak'
      ? settings.longBreakDuration * 60
      : settings.shortBreakDuration * 60;

    setMode(nextMode);
    setSessionTotalSeconds(nextDurationSeconds);
    setTimeLeft(nextDurationSeconds);

    if (settings.autoStartBreaks) {
      setTimeout(() => setIsRunning(true), 1000);
    }
  }, [settings.autoStartBreaks, settings.longBreakDuration, settings.sessionsBeforeLongBreak, settings.shortBreakDuration]);

  const requestNotificationPermission = useCallback(() => {
    if (typeof window === 'undefined' || !("Notification" in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => undefined);
    }
  }, []);

  const handleTimerComplete = () => {
    setIsRunning(false);
    
    // Play sound
    if (settings.soundEnabled) {
      playNotificationSound();
    }

    // Record session
    if (mode === 'focus') {
      const effectiveSessionSeconds = sessionTotalSeconds > 0
        ? sessionTotalSeconds
        : activeFocusDuration * 60;
      const completedFocusDuration = Math.max(1, Math.round(effectiveSessionSeconds / 60));
      const startTime = new Date(Date.now() - effectiveSessionSeconds * 1000);
      const endTime = new Date();
      const nextSessionCount = sessionsCompleted + 1;
      const taskName = selectedTaskId
        ? plannedTasks.find(t => t.id === selectedTaskId)?.task_name || selectedTaskName || undefined
        : undefined;
      const tempId = `tmp-${Date.now()}`;
      const optimistic: FocusSession = {
        id: tempId,
        taskId: selectedTaskId || undefined,
        taskName,
        startTime,
        endTime,
        duration: effectiveSessionSeconds,
        mode: 'focus',
        completed: true,
      };
      setTodaySessions(prev => [...prev, optimistic]);
      setSessionsCompleted(nextSessionCount);

      // Persist to backend; replace temp id with the real one once saved.
      focusSessionService.save({
        task_id: selectedTaskId || null,
        task_name: taskName || null,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        duration: effectiveSessionSeconds,
        mode: 'focus',
        completed: true,
        session_date: format(new Date(), 'yyyy-MM-dd'),
      })
        .then((saved: any) => {
          setTodaySessions(prev => prev.map(s => (s.id === tempId ? { ...s, id: saved.id } : s)));
        })
        .catch((error) => {
          console.error('Failed to save focus session:', error);
          toast.error('Failed to save your session. Please try again.');
          setTodaySessions(prev => prev.filter(s => s.id !== tempId));
          setSessionsCompleted(prev => Math.max(0, prev - 1));
        });

      if (selectedTaskId) {
        const task = plannedTasks.find((t) => t.id === selectedTaskId);
        if (task && !['completed', 'cancelled', 'skipped'].includes(task.status)) {
          pendingBreakSessionRef.current = nextSessionCount;
          setGlobalPrompt({
            taskId: task.id,
            taskName: task.task_name,
            taskDate: taskDate || format(new Date(), 'yyyy-MM-dd'),
            durationMinutes: completedFocusDuration,
            nextSessionCount,
          });
          toast('Timer went off for this task. Please mark it complete or incomplete.');
          return;
        }
      }

      toast.success(`Focus session complete! ${nextSessionCount} sessions today.`);
      transitionToBreakAfterFocus(nextSessionCount);
    } else {
      toast.success('Break complete! Ready to focus again?');
      const nextFocusSeconds = activeFocusDuration * 60;
      setMode('focus');
      setSessionTotalSeconds(nextFocusSeconds);
      setTimeLeft(nextFocusSeconds);

      if (settings.autoStartFocus) {
        setTimeout(() => setIsRunning(true), 1000);
      }
    }
  };

  const playNotificationSound = () => {
    // Create a simple beep sound using Web Audio API
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    gainNode.gain.value = 0.3;
    
    oscillator.start();
    setTimeout(() => {
      oscillator.stop();
      audioContext.close();
    }, 200);
  };

  // When the global prompt is answered, transition into the appropriate break
  // here if the user is still on FocusTimer. (Global cleanup handles backend state.)
  useEffect(() => {
    const currentTaskId = globalPrompt?.taskId || null;

    if (currentTaskId) {
      lastPromptTaskIdRef.current = currentTaskId;
      return;
    }

    if (!lastPromptTaskIdRef.current) return;

    lastPromptTaskIdRef.current = null;
    const pendingCount = pendingBreakSessionRef.current;
    pendingBreakSessionRef.current = null;
    setSessionConfirmed(false);
    if (pendingCount !== null) {
      transitionToBreakAfterFocus(pendingCount);
    }
  }, [globalPrompt, transitionToBreakAfterFocus]);

  const markTaskInProgressWithContext = useCallback((context?: StartContext) => {
    if (!selectedTaskId || mode !== 'focus') return;

    const selectedTask = plannedTasks.find((task) => task.id === selectedTaskId);
    if (
      !selectedTask
      || selectedTask.status === 'completed'
      || selectedTask.status === 'in_progress'
      || selectedTask.status === 'skipped'
      || selectedTask.status === 'cancelled'
      || selectedTask.status === 'missed'
    ) {
      return;
    }

    updatePlannedTask(selectedTaskId, {
      status: 'in_progress',
      actual_start: new Date().toISOString(),
      start_type: context?.type,
      minutes_offset: context?.minutesOffset,
    }).catch((error) => {
      console.error('Failed to mark selected task in progress:', error);
    });
  }, [mode, plannedTasks, selectedTaskId, updatePlannedTask]);

  const markTaskInProgress = useCallback(() => {
    markTaskInProgressWithContext(undefined);
  }, [markTaskInProgressWithContext]);

  const handleManualStartConfirmed = useCallback((context: StartContext) => {
    if (selectedTaskRequiresReschedule) {
      setShowStartConfirm(false);
      toast.error('This task needs rescheduling before it can be started.');
      return;
    }

    setShowStartConfirm(false);
    setSessionConfirmed(true);
    markTaskInProgressWithContext(context);
    if (sessionTotalSeconds <= 0) {
      setSessionTotalSeconds(Math.max(timeLeft, activeFocusDuration * 60));
    }
    requestNotificationPermission();
    setIsRunning(true);
  }, [activeFocusDuration, markTaskInProgressWithContext, requestNotificationPermission, selectedTaskRequiresReschedule, sessionTotalSeconds, timeLeft]);

  const toggleTimer = () => {
    if (globalPrompt) {
      return;
    }

    // Pausing — always allow
    if (isRunning) {
      setIsRunning(false);
      return;
    }

    if (selectedTaskId && mode === 'focus' && selectedTaskRequiresReschedule) {
      toast.error('This task needs rescheduling before you can start it again.');
      return;
    }

    // Starting: if there's a selected task and this is a fresh session, show confirm modal
    if (selectedTaskId && mode === 'focus' && !sessionConfirmed) {
      setShowStartConfirm(true);
      return;
    }

    // No task selected or already confirmed: start directly
    if (!sessionConfirmed) {
      markTaskInProgress();
    }

    if (sessionTotalSeconds <= 0) {
      setSessionTotalSeconds(Math.max(timeLeft, activeFocusDuration * 60));
    }
    requestNotificationPermission();
    setIsRunning(true);
  };

  const selectTask = useCallback((taskId: string | null) => {
    setSelectedTaskId(taskId);
    setSessionConfirmed(false); // new task selection resets confirmation

    if (!taskId) {
      setSelectedTaskName(null);
      setTaskDurationMinutes(null);
      return;
    }

    const selectedTask = plannedTasks.find((task) => task.id === taskId);
    if (selectedTask) {
      setSelectedTaskName(selectedTask.task_name);
      setTaskDurationMinutes(parseDuration(selectedTask.suggested_duration));
    }
  }, [plannedTasks]);

  const resetTimer = () => {
    // Reset/Switch must NOT clear the global completion prompt — the user
    // has to answer yes/no first, that's the whole point of the gate.
    if (globalPrompt) {
      toast('Answer the completion prompt first before resetting.');
      return;
    }
    setIsRunning(false);
    setSessionConfirmed(false); // reset allows re-confirm on next start
    const duration = mode === 'focus'
      ? activeFocusDuration
      : mode === 'shortBreak'
        ? settings.shortBreakDuration
        : settings.longBreakDuration;
    setSessionTotalSeconds(duration * 60);
    setTimeLeft(duration * 60);
  };

  const switchMode = (newMode: TimerMode) => {
    if (globalPrompt) {
      toast('Answer the completion prompt first before switching modes.');
      return;
    }
    setIsRunning(false);
    if (newMode !== 'focus') {
      setSessionConfirmed(false);
    }
    setMode(newMode);
    const duration = newMode === 'focus' 
      ? activeFocusDuration 
      : newMode === 'shortBreak' 
        ? settings.shortBreakDuration 
        : settings.longBreakDuration;
    setSessionTotalSeconds(duration * 60);
    setTimeLeft(duration * 60);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = () => {
    const fallbackTotal = mode === 'focus'
      ? activeFocusDuration * 60
      : mode === 'shortBreak'
        ? settings.shortBreakDuration * 60
        : settings.longBreakDuration * 60;
    const total = sessionTotalSeconds > 0 ? sessionTotalSeconds : fallbackTotal;
    if (total <= 0) return 0;
    return ((total - timeLeft) / total) * 100;
  };

  const totalFocusMinutes = todaySessions
    .filter(s => s.mode === 'focus' && s.completed)
    .reduce((acc, s) => acc + s.duration / 60, 0);

  const modeColors = {
    focus: 'from-red-500 to-orange-500',
    shortBreak: 'from-green-500 to-emerald-500',
    longBreak: 'from-blue-500 to-cyan-500',
  };

  const modeIcons = {
    focus: Brain,
    shortBreak: Coffee,
    longBreak: Coffee,
  };

  const ModeIcon = modeIcons[mode];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={clsx(
            'p-3 rounded-apple-lg bg-gradient-to-br',
            mode === 'focus' ? 'from-red-500/20 to-orange-500/20' : 'from-green-500/20 to-emerald-500/20'
          )}>
            <ModeIcon className={clsx(
              'w-8 h-8',
              mode === 'focus' ? 'text-red-600' : 'text-green-600'
            )} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Focus Timer</h1>
            <p className="text-gray-600 mt-1">
              {mode === 'focus' ? 'Time to concentrate' : 'Take a break'}
            </p>
            {mode === 'focus' && selectedTaskName && (
              <p className="text-sm text-blue-600 mt-1">
                {selectedTaskName} | {activeFocusDuration} min
              </p>
            )}
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowSettings(!showSettings)}
        >
          <Settings className="w-5 h-5" />
        </Button>
      </div>

      {/* Mode Selector */}
      <div className="flex gap-2 p-1 bg-gray-100 rounded-apple">
        {(['focus', 'shortBreak', 'longBreak'] as TimerMode[]).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className={clsx(
              'flex-1 py-2 px-4 rounded-apple text-sm font-medium transition-all',
              mode === m
                ? `bg-gradient-to-r ${modeColors[m]} text-white shadow-apple`
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
            )}
          >
            {m === 'focus' ? 'Focus' : m === 'shortBreak' ? 'Short Break' : 'Long Break'}
          </button>
        ))}
      </div>

      {/* Timer Display */}
      <motion.div
        layout
        className="glass-card text-center py-12"
      >
        {/* Progress Ring */}
        <div className="relative w-64 h-64 mx-auto mb-8">
          <svg className="w-full h-full transform -rotate-90">
            {/* Background circle */}
            <circle
              cx="128"
              cy="128"
              r="120"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              className="text-gray-200"
            />
            {/* Progress circle */}
            <motion.circle
              cx="128"
              cy="128"
              r="120"
              stroke="url(#gradient)"
              strokeWidth="8"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 120}
              initial={{ strokeDashoffset: 2 * Math.PI * 120 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 120 * (1 - progress() / 100) }}
              transition={{ duration: 0.5 }}
            />
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={mode === 'focus' ? '#ef4444' : '#22c55e'} />
                <stop offset="100%" stopColor={mode === 'focus' ? '#f97316' : '#10b981'} />
              </linearGradient>
            </defs>
          </svg>
          
          {/* Time Display */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-6xl font-bold text-gray-900 font-mono">
              {formatTime(timeLeft)}
            </span>
            <span className="text-gray-600 mt-2 capitalize">
              {mode === 'focus' ? 'Focus Time' : mode === 'shortBreak' ? 'Short Break' : 'Long Break'}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="ghost"
            size="lg"
            onClick={resetTimer}
            className="rounded-full w-14 h-14"
          >
            <RotateCcw className="w-6 h-6" />
          </Button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleTimer}
            className={clsx(
              'w-20 h-20 rounded-full flex items-center justify-center text-white shadow-lg',
              `bg-gradient-to-r ${modeColors[mode]}`
            )}
          >
            {isRunning ? (
              <Pause className="w-8 h-8" />
            ) : (
              <Play className="w-8 h-8 ml-1" />
            )}
          </motion.button>

          <Button
            variant="ghost"
            size="lg"
            onClick={() => setSettings(s => ({ ...s, soundEnabled: !s.soundEnabled }))}
            className="rounded-full w-14 h-14"
          >
            {settings.soundEnabled ? (
              <Volume2 className="w-6 h-6" />
            ) : (
              <VolumeX className="w-6 h-6" />
            )}
          </Button>
        </div>

        {/* Task Selection */}
        {mode === 'focus' && plannedTasks.length > 0 && (
          <div className="mt-8">
            <label className="text-sm text-gray-700 block mb-2">Working on:</label>
            <select
              value={selectedTaskId || ''}
              onChange={(e) => selectTask(e.target.value || null)}
              className="bg-white border border-gray-300 rounded-apple px-4 py-2 text-gray-900 w-full max-w-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select a task (optional)</option>
              {plannedTasks.map((task) => {
                const isBlocked = ['completed', 'cancelled', 'skipped', 'missed'].includes(task.status);
                const blockedLabel = task.status === 'missed'
                  ? ' - reschedule required'
                  : task.status === 'completed'
                    ? ' - completed'
                    : task.status === 'cancelled'
                      ? ' - cancelled'
                      : task.status === 'skipped'
                        ? ' - skipped'
                        : '';

                return (
                  <option key={task.id} value={task.id} disabled={isBlocked}>
                    {task.task_name} ({parseDuration(task.suggested_duration)} min){blockedLabel}
                  </option>
                );
              })}
            </select>
            {selectedTaskRequiresReschedule && (
              <p className="text-xs text-amber-700 mt-2">
                Timer already ended for this task and it is still incomplete. Reschedule it from Schedule before starting again.
              </p>
            )}
          </div>
        )}
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-card text-center">
          <Zap className="w-6 h-6 text-yellow-600 mx-auto mb-2" />
          <div className="text-2xl font-bold text-gray-900">{sessionsCompleted}</div>
          <div className="text-xs text-gray-600">Sessions Today</div>
        </div>
        <div className="glass-card text-center">
          <Clock className="w-6 h-6 text-blue-600 mx-auto mb-2" />
          <div className="text-2xl font-bold text-gray-900">{Math.round(totalFocusMinutes)}</div>
          <div className="text-xs text-gray-600">Focus Minutes</div>
        </div>
        <div className="glass-card text-center">
          <CheckCircle2 className="w-6 h-6 text-green-600 mx-auto mb-2" />
          <div className="text-2xl font-bold text-gray-900">
            {Math.round(totalFocusMinutes / 60 * 10) / 10}
          </div>
          <div className="text-xs text-gray-600">Hours Focused</div>
        </div>
      </div>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="card overflow-hidden"
          >
            <h3 className="text-lg font-semibold text-dark-100 mb-4">Timer Settings</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-700 block mb-1">Focus Duration (min)</label>
                <input
                  type="number"
                  value={settings.focusDuration}
                  onChange={(e) => setSettings(s => ({ ...s, focusDuration: parseInt(e.target.value) || 25 }))}
                  className="w-full bg-white border border-gray-300 rounded-apple px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  min="1"
                  max="120"
                />
              </div>
              <div>
                <label className="text-sm text-gray-700 block mb-1">Short Break (min)</label>
                <input
                  type="number"
                  value={settings.shortBreakDuration}
                  onChange={(e) => setSettings(s => ({ ...s, shortBreakDuration: parseInt(e.target.value) || 5 }))}
                  className="w-full bg-white border border-gray-300 rounded-apple px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  min="1"
                  max="30"
                />
              </div>
              <div>
                <label className="text-sm text-gray-700 block mb-1">Long Break (min)</label>
                <input
                  type="number"
                  value={settings.longBreakDuration}
                  onChange={(e) => setSettings(s => ({ ...s, longBreakDuration: parseInt(e.target.value) || 15 }))}
                  className="w-full bg-white border border-gray-300 rounded-apple px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  min="1"
                  max="60"
                />
              </div>
              <div>
                <label className="text-sm text-gray-700 block mb-1">Sessions before long break</label>
                <input
                  type="number"
                  value={settings.sessionsBeforeLongBreak}
                  onChange={(e) => setSettings(s => ({ ...s, sessionsBeforeLongBreak: parseInt(e.target.value) || 4 }))}
                  className="w-full bg-white border border-gray-300 rounded-apple px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  min="1"
                  max="10"
                />
              </div>
            </div>
            <div className="flex gap-4 mt-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={settings.autoStartBreaks}
                  onChange={(e) => setSettings(s => ({ ...s, autoStartBreaks: e.target.checked }))}
                  className="rounded bg-white border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Auto-start breaks
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={settings.autoStartFocus}
                  onChange={(e) => setSettings(s => ({ ...s, autoStartFocus: e.target.checked }))}
                  className="rounded bg-white border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Auto-start focus
              </label>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Today's Sessions */}
      {todaySessions.length > 0 && (
        <div className="glass-card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Today's Sessions</h3>
          <div className="space-y-2">
            {todaySessions.filter(s => s.mode === 'focus').map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-apple border border-gray-200"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-gray-800">
                    {session.taskName || 'Focus Session'}
                  </span>
                </div>
                <span className="text-gray-600 text-sm">
                  {Math.round(session.duration / 60)} min
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Connected Flow Navigation */}
      <div className="glass-card bg-gradient-to-r from-gray-50 to-blue-50/30">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Continue Your Flow</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<BarChart3 className="w-4 h-4" />}
            onClick={() => navigate('/app/analytics')}
          >
            View Progress
          </Button>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<CheckCircle2 className="w-4 h-4" />}
            onClick={() => navigate('/app/schedule')}
          >
            Back to Schedule
          </Button>
          {new Date().getHours() >= 20 && (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Moon className="w-4 h-4" />}
              onClick={() => navigate('/app/reflection')}
            >
              Daily Reflection
            </Button>
          )}
        </div>
      </div>

      {/* Timer-completion prompt now renders globally in Layout via
          <GlobalTimerCompletionPrompt /> so the mandatory yes/no surfaces
          regardless of which page the user is on after expiry. */}

      {/* Task Start Confirmation Modal (manual play with a selected task) */}
      {showStartConfirm && selectedTaskId && (() => {
        const task = plannedTasks.find((t) => t.id === selectedTaskId);
        if (!task) return null;
        return (
          <TaskStartConfirmModal
            isOpen={showStartConfirm}
            task={task}
            taskDate={taskDate || format(new Date(), 'yyyy-MM-dd')}
            onConfirm={handleManualStartConfirmed}
            onCancel={() => setShowStartConfirm(false)}
          />
        );
      })()}
    </div>
  );
}
