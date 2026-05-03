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
import { useTaskStore } from '@/stores';
import { focusSessionService, focusSettingsService, FocusSettings } from '@/services/api';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

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
  const [isRunning, setIsRunning] = useState(false);
  const [sessionsCompleted, setSessionsCompleted] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [todaySessions, setTodaySessions] = useState<FocusSession[]>([]);

  const { plannedTasks } = useTaskStore();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load task from URL parameter
  useEffect(() => {
    const taskId = searchParams.get('task');
    if (taskId) {
      setSelectedTaskId(taskId);
    }
  }, [searchParams]);

  // Load settings from backend
  useEffect(() => {
    focusSettingsService.get()
      .then((remote) => {
        const mapped = settingsFromBackend(remote);
        setSettings(mapped);
        // Only refresh timeLeft for the focus mode if the timer hasn't started.
        setTimeLeft((prev) => (isRunning ? prev : mapped.focusDuration * 60));
      })
      .catch((error) => {
        console.error('Failed to load focus settings:', error);
      })
      .finally(() => setSettingsLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Timer logic
  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      handleTimerComplete();
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, timeLeft]);

  const handleTimerComplete = () => {
    setIsRunning(false);
    
    // Play sound
    if (settings.soundEnabled) {
      playNotificationSound();
    }

    // Record session
    if (mode === 'focus') {
      const startTime = new Date(Date.now() - settings.focusDuration * 60 * 1000);
      const endTime = new Date();
      const taskName = selectedTaskId
        ? plannedTasks.find(t => t.id === selectedTaskId)?.task_name
        : undefined;
      const tempId = `tmp-${Date.now()}`;
      const optimistic: FocusSession = {
        id: tempId,
        taskId: selectedTaskId || undefined,
        taskName,
        startTime,
        endTime,
        duration: settings.focusDuration * 60,
        mode: 'focus',
        completed: true,
      };
      setTodaySessions(prev => [...prev, optimistic]);
      setSessionsCompleted(prev => prev + 1);

      // Persist to backend; replace temp id with the real one once saved.
      focusSessionService.save({
        task_id: selectedTaskId || null,
        task_name: taskName || null,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        duration: settings.focusDuration * 60,
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
      
      toast.success(`🎉 Focus session complete! ${sessionsCompleted + 1} sessions today.`);

      // Determine next break type
      const nextMode = (sessionsCompleted + 1) % settings.sessionsBeforeLongBreak === 0
        ? 'longBreak'
        : 'shortBreak';
      
      setMode(nextMode);
      setTimeLeft(nextMode === 'longBreak' 
        ? settings.longBreakDuration * 60 
        : settings.shortBreakDuration * 60
      );

      if (settings.autoStartBreaks) {
        setTimeout(() => setIsRunning(true), 1000);
      }
    } else {
      toast.success('Break complete! Ready to focus again?');
      setMode('focus');
      setTimeLeft(settings.focusDuration * 60);

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

  const toggleTimer = () => {
    setIsRunning(!isRunning);
  };

  const resetTimer = () => {
    setIsRunning(false);
    const duration = mode === 'focus' 
      ? settings.focusDuration 
      : mode === 'shortBreak' 
        ? settings.shortBreakDuration 
        : settings.longBreakDuration;
    setTimeLeft(duration * 60);
  };

  const switchMode = (newMode: TimerMode) => {
    setIsRunning(false);
    setMode(newMode);
    const duration = newMode === 'focus' 
      ? settings.focusDuration 
      : newMode === 'shortBreak' 
        ? settings.shortBreakDuration 
        : settings.longBreakDuration;
    setTimeLeft(duration * 60);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = () => {
    const total = mode === 'focus' 
      ? settings.focusDuration * 60 
      : mode === 'shortBreak' 
        ? settings.shortBreakDuration * 60 
        : settings.longBreakDuration * 60;
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
              onChange={(e) => setSelectedTaskId(e.target.value || null)}
              className="bg-white border border-gray-300 rounded-apple px-4 py-2 text-gray-900 w-full max-w-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select a task (optional)</option>
              {plannedTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.task_name}
                </option>
              ))}
            </select>
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
    </div>
  );
}
