import { motion } from 'framer-motion';
import { format, subDays } from 'date-fns';
import {
  Sparkles,
  ListTodo,
  Calendar,
  TrendingUp,
  Clock,
  Zap,
  Moon,
  CheckCircle2,
  Brain,
  BarChart3,
  Flame,
  Sun,
  Coffee,
  AlertCircle,
  ArrowRight,
  Play,
} from 'lucide-react';
import { useTaskStore, useUserProfileStore } from '@/stores';
import { Button } from '@/components/ui';
import { focusSessionService, sleepEntryService } from '@/services/api';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { buildFocusTaskUrl } from '@/utils';
import { getTaskBadgeClasses, getTaskLifecycleTimeline, getTaskStartBadge, getTaskStatusBadge, getTaskTimerBadge } from '@/utils/taskLifecycle';
import TaskStartConfirmModal, { getStartContext, StartContext } from '@/components/TaskStartConfirmModal';
import { PlannedTask } from '@/types';
import toast from 'react-hot-toast';

export default function Dashboard() {
  const navigate = useNavigate();
  const { tasks, plansByDate, loadPlanFromDatabase, updatePlannedTask } = useTaskStore();
  const { energyProfile, sleepSchedule } = useUserProfileStore();

  // Get today's focus sessions
  const [focusMinutes, setFocusMinutes] = useState(0);
  const [streak, setStreak] = useState(0);
  const [lastNightSleep, setLastNightSleep] = useState<{ duration: number; quality: number } | null>(null);
  const [greeting, setGreeting] = useState('');
  const [dailyInsight, setDailyInsight] = useState('');

  useEffect(() => {
    const todayDate = format(new Date(), 'yyyy-MM-dd');
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
    const STREAK_LOOKBACK_DAYS = 90;
    const streakStart = format(subDays(new Date(), STREAK_LOOKBACK_DAYS - 1), 'yyyy-MM-dd');

    // Always hydrate today's plan from backend on dashboard load.
    loadPlanFromDatabase(todayDate).catch((error) => {
      console.log('Dashboard plan load skipped:', error?.message || 'No plan available');
    });

    // Today's focus minutes
    focusSessionService.getForDate(todayDate)
      .then((sessions: any[]) => {
        const total = (sessions || [])
          .filter((s: any) => s.mode === 'focus' && s.completed)
          .reduce((acc: number, s: any) => acc + s.duration / 60, 0);
        setFocusMinutes(Math.round(total));
      })
      .catch((error) => {
        console.error('Failed to load focus sessions:', error);
      });

    // Last night's sleep
    sleepEntryService.getAll(7)
      .then((entries: any[]) => {
        const lastSleep = (entries || []).find((e: any) => e.date === yesterday || e.date === todayDate);
        if (lastSleep) {
          setLastNightSleep({ duration: lastSleep.duration, quality: lastSleep.quality });
        }
      })
      .catch((error) => {
        console.error('Failed to load sleep entries:', error);
      });

    // Streak: count consecutive days (back from today) with at least one
    // completed focus session. Pulled from the backend in one range query.
    focusSessionService.getForDateRange(streakStart, todayDate)
      .then((sessions: any[]) => {
        const daysWithFocus = new Set<string>();
        (sessions || []).forEach((s: any) => {
          if (s.mode === 'focus' && s.completed && s.session_date) {
            daysWithFocus.add(s.session_date);
          }
        });
        let count = 0;
        for (let i = 0; i < STREAK_LOOKBACK_DAYS; i++) {
          const dateStr = format(subDays(new Date(), i), 'yyyy-MM-dd');
          if (daysWithFocus.has(dateStr)) {
            count++;
          } else if (i > 0) {
            break;
          }
        }
        setStreak(count);
      })
      .catch((error) => {
        console.error('Failed to compute streak:', error);
      });

    // Set greeting based on time of day
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 17) setGreeting('Good afternoon');
    else setGreeting('Good evening');
  }, [loadPlanFromDatabase]);

  const generateDailyInsight = () => {
    // Prioritized insights based on importance (not random)

    // Sleep is most important - affects everything
    if (lastNightSleep && lastNightSleep.quality <= 2) {
      setDailyInsight('Consider lighter tasks today - your sleep quality was low.');
      return;
    }

    // Then check for great conditions
    if (lastNightSleep && lastNightSleep.quality >= 4 && lastNightSleep.duration >= 420) {
      setDailyInsight('Great sleep! Perfect day for deep focus work.');
      return;
    }

    // Celebrate streaks
    if (streak >= 7) {
      setDailyInsight(`Amazing ${streak}-day streak! Keep the momentum going.`);
      return;
    }

    // Encourage new users
    if (streak === 0 && focusMinutes === 0) {
      setDailyInsight('Start fresh today - log a focus session to begin your streak!');
      return;
    }

    // Task overload warning
    if (pendingTasks.length > 5) {
      setDailyInsight('You have many pending tasks. Use AI Planner to prioritize.');
      return;
    }

    // Default
    setDailyInsight('Ready to make today productive?');
  };

  const todayDateKey = format(new Date(), 'yyyy-MM-dd');
  const today = format(new Date(), 'EEEE, MMMM d');
  const todayPlannedTasks = plansByDate[todayDateKey]?.tasks || [];
  const completedToday = todayPlannedTasks.filter((t) => t.status === 'completed').length;
  const totalToday = todayPlannedTasks.length;
  const pendingTasks = tasks.filter(
    (t) => !todayPlannedTasks.some((p) => p.task_id === t.id && p.status === 'completed')
  );

  // Task start confirmation modal state
  const [taskToStart, setTaskToStart] = useState<PlannedTask | null>(null);

  const handleStartTaskFocus = (task: PlannedTask) => {
    if (task.status === 'missed') {
      toast.error('This task needs to be rescheduled before it can be started again.');
      navigate('/app/schedule');
      return;
    }

    setTaskToStart(task);
  };

  const handleConfirmStart = (context: StartContext) => {
    if (!taskToStart) return;
    const task = taskToStart;
    setTaskToStart(null);

    // Re-check latest task state — the global missed-task watcher may have
    // flipped it to missed while the confirmation modal was open.
    const latest = useTaskStore.getState().plannedTasks.find((t) => t.id === task.id) || task;
    if (latest.status === 'missed') {
      toast.error('This task was just marked missed. Reschedule it before starting.');
      navigate('/app/schedule');
      return;
    }
    if (['completed', 'cancelled', 'skipped', 'in_progress'].includes(latest.status)) {
      toast.error('This task can no longer be started from its current status.');
      return;
    }

    updatePlannedTask(latest.id, {
      status: 'in_progress',
      actual_start: new Date().toISOString(),
      start_type: context.type,
      minutes_offset: context.minutesOffset,
    }).catch((error) => {
      console.error('Failed to mark task in progress:', error);
    });

    navigate(buildFocusTaskUrl(latest, { autoStart: true, date: todayDateKey }));
  };

  useEffect(() => {
    generateDailyInsight();
  }, [lastNightSleep, streak, focusMinutes, pendingTasks.length]);

  const stats = [
    {
      label: 'Today\'s Progress',
      value: totalToday > 0 ? `${completedToday}/${totalToday}` : '—',
      icon: CheckCircle2,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
    },
    {
      label: 'Focus Time',
      value: focusMinutes > 0 ? `${focusMinutes}m` : '0m',
      icon: Brain,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
    },
    {
      label: 'Current Streak',
      value: streak > 0 ? `${streak}🔥` : '0',
      icon: Flame,
      color: 'text-orange-400',
      bgColor: 'bg-orange-500/10',
    },
    {
      label: 'Peak Focus',
      value: energyProfile?.peak_focus_start || '9:00 AM',
      icon: Zap,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Morning Briefing Header */}
      <div className="glass-card bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-blue-500/10 border-gray-200">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {new Date().getHours() < 12 ? (
                <Sun className="w-5 h-5 text-yellow-500" />
              ) : new Date().getHours() < 17 ? (
                <Coffee className="w-5 h-5 text-amber-500" />
              ) : (
                <Moon className="w-5 h-5 text-indigo-500" />
              )}
              <span className="text-gray-600 text-sm">{today}</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{greeting}! 👋</h1>

            {/* Sleep Status */}
            {lastNightSleep && (
              <div className="flex items-center gap-2 mt-2">
                <Moon className="w-4 h-4 text-indigo-500" />
                <span className="text-sm text-gray-700">
                  Slept {Math.round(lastNightSleep.duration / 60 * 10) / 10}h
                  <span className={clsx(
                    'ml-2 px-2 py-0.5 rounded-full text-xs',
                    lastNightSleep.quality >= 4 ? 'bg-green-500/20 text-green-600' :
                      lastNightSleep.quality >= 3 ? 'bg-yellow-500/20 text-yellow-600' :
                        'bg-red-500/20 text-red-600'
                  )}>
                    {lastNightSleep.quality >= 4 ? 'Well rested' : lastNightSleep.quality >= 3 ? 'Okay' : 'Tired'}
                  </span>
                </span>
              </div>
            )}

            {/* Daily Insight */}
            <p className="text-gray-700 mt-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-500" />
              {dailyInsight}
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              leftIcon={<Brain className="w-4 h-4" />}
              onClick={() => navigate('/app/focus')}
            >
              Focus
            </Button>
            <Button
              variant="primary"
              leftIcon={<Sparkles className="w-4 h-4" />}
              onClick={() => navigate('/app/planner')}
            >
              Plan My Day
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="glass-card"
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-xs text-gray-600">{stat.label}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Today's Schedule */}
        <div className="lg:col-span-2 glass-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Today's Schedule</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/app/schedule')}
            >
              View All
            </Button>
          </div>

          {todayPlannedTasks.length > 0 ? (
            <div className="space-y-3">
              {todayPlannedTasks.slice(0, 5).map((task, index) => {
                const statusBadge = getTaskStatusBadge(task.status);
                const startBadge = getTaskStartBadge(task);
                const timerBadge = getTaskTimerBadge(task);
                const lifecycle = getTaskLifecycleTimeline(task);
                const lifecycleParts = [
                  lifecycle.startedAt !== 'Not started' ? `Started ${lifecycle.startedAt}` : null,
                  lifecycle.endedAt !== 'Not finished' ? `Ended ${lifecycle.endedAt}` : null,
                  lifecycle.actualDuration ?? null,
                ].filter(Boolean) as string[];

                return (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-start gap-3 p-3 rounded-apple bg-gray-50 hover:bg-gray-100 transition-colors group"
                  >
                    <div
                      className={`w-2 h-2 rounded-full mt-1.5 ${task.status === 'completed'
                        ? 'bg-green-500'
                        : task.status === 'in_progress'
                          ? 'bg-blue-500'
                          : task.status === 'missed'
                            ? 'bg-orange-500'
                            : 'bg-gray-400'
                        }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p
                          className={`text-sm font-medium truncate max-w-[220px] ${task.status === 'completed'
                            ? 'text-gray-500 line-through'
                            : 'text-gray-900'
                            }`}
                        >
                          {task.task_name}
                        </p>
                        <span
                          className={clsx(
                            'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium',
                            getTaskBadgeClasses(statusBadge.tone)
                          )}
                        >
                          {statusBadge.label}
                        </span>
                        {startBadge && (
                          <span
                            className={clsx(
                              'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium',
                              getTaskBadgeClasses(startBadge.tone)
                            )}
                          >
                            {startBadge.label}
                          </span>
                        )}
                        {timerBadge && (
                          <span
                            className={clsx(
                              'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium',
                              getTaskBadgeClasses(timerBadge.tone)
                            )}
                          >
                            {timerBadge.label}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mt-1">
                        Window {lifecycle.scheduledWindow} • Planned {task.suggested_duration}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {lifecycleParts.length > 0 ? lifecycleParts.join(' • ') : lifecycle.completionState}
                      </p>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full mt-0.5 ${task.priority === 'high'
                        ? 'bg-red-500/20 text-red-600'
                        : task.priority === 'medium'
                          ? 'bg-amber-500/20 text-amber-600'
                          : 'bg-green-500/20 text-green-600'
                        }`}
                    >
                      {task.priority}
                    </span>
                    {/* Quick Focus Button */}
                    {!['completed', 'cancelled', 'skipped', 'missed'].includes(task.status) && (
                      <button
                        onClick={() => handleStartTaskFocus(task)}
                        className="opacity-0 group-hover:opacity-100 p-2 rounded-apple bg-blue-500/20 text-blue-600 hover:bg-blue-500/30 transition-all"
                        title="Start Focus Session"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <Calendar className="w-12 h-12 mx-auto text-gray-400 mb-3" />
              <p className="text-gray-600">No tasks scheduled for today</p>
              <Button
                variant="primary"
                size="sm"
                className="mt-4"
                onClick={() => navigate('/app/planner')}
              >
                Create a Plan
              </Button>
            </div>
          )}
        </div>

        {/* Quick Actions & Tips */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="glass-card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <div className="space-y-2">
              <Button
                variant="secondary"
                className="w-full justify-start"
                leftIcon={<Brain className="w-4 h-4" />}
                onClick={() => navigate('/app/focus')}
              >
                Start Focus Session
              </Button>
              <Button
                variant="secondary"
                className="w-full justify-start"
                leftIcon={<Sparkles className="w-4 h-4" />}
                onClick={() => navigate('/app/planner')}
              >
                AI Planner
              </Button>
              <Button
                variant="secondary"
                className="w-full justify-start"
                leftIcon={<BarChart3 className="w-4 h-4" />}
                onClick={() => navigate('/app/analytics')}
              >
                View Analytics
              </Button>
              <Button
                variant="secondary"
                className="w-full justify-start"
                leftIcon={<Moon className="w-4 h-4" />}
                onClick={() => navigate('/app/sleep')}
              >
                Log Sleep
              </Button>
            </div>
          </div>

          {/* Energy Tip */}
          <div className="glass-card bg-gradient-to-br from-blue-500/10 to-blue-600/10 border-blue-200">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-apple bg-blue-500/20">
                <Zap className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Energy Tip</h3>
                <p className="text-sm text-gray-700 mt-1">
                  Schedule your most demanding tasks during your peak focus window
                  ({energyProfile?.peak_focus_start || '9:00'} - {energyProfile?.peak_focus_end || '12:00'})
                  for maximum productivity.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Task Start Confirmation Modal */}
      {taskToStart && (
        <TaskStartConfirmModal
          isOpen={!!taskToStart}
          task={taskToStart}
          taskDate={todayDateKey}
          onConfirm={handleConfirmStart}
          onCancel={() => setTaskToStart(null)}
        />
      )}
    </div>
  );
}
