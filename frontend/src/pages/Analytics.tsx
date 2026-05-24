import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  Target,
  Zap,
  Brain,
  Coffee,
  ChevronLeft,
  ChevronRight,
  Flame,
  Moon,
  Sparkles,
  AlertTriangle,
  ShieldCheck,
  Timer,
  Hourglass,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { useTaskStore } from '@/stores';
import { parseDuration } from '@/utils';
import type { PlannedTask } from '@/types';
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  subDays,
  subWeeks,
  addWeeks,
  parseISO,
  differenceInMinutes,
} from 'date-fns';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';

interface DailyStats {
  date: string;
  tasksCompleted: number;
  tasksPlanned: number;
  tasksMissed: number;
  tasksSkipped: number;
  focusMinutes: number;
  sleepHours: number;
  sleepQuality: number;
  productivityScore: number;
}

interface FocusSession {
  id: string;
  duration: number;
  mode: 'focus' | 'shortBreak' | 'longBreak';
  completed: boolean;
}

interface SleepEntry {
  date: string;
  duration: number;
  quality: number;
}

export default function Analytics() {
  const navigate = useNavigate();
  const [selectedWeek, setSelectedWeek] = useState(new Date());
  const { plansByDate, loadPlansForDateRange } = useTaskStore();

  // Backend-synced data caches
  const [backendFocusData, setBackendFocusData] = useState<Record<string, FocusSession[]>>({});
  const [backendSleepData, setBackendSleepData] = useState<SleepEntry[]>([]);
  const [backendStatsData, setBackendStatsData] = useState<Record<string, { completed: number; total: number; missed: number; skipped: number; focus_minutes: number }>>({});
  const [prevWeekStatsData, setPrevWeekStatsData] = useState<Record<string, { completed: number; missed: number; skipped: number; focus_minutes: number }>>({});

  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedWeek, { weekStartsOn: 1 });
    const end = endOfWeek(selectedWeek, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [selectedWeek]);

  // Load data from backend when week changes
  useEffect(() => {
    const start = format(startOfWeek(selectedWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const end = format(endOfWeek(selectedWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd');

    // Load focus sessions from backend
    import('@/services/api').then(({ focusSessionService }) => {
      focusSessionService.getForDateRange(start, end).then((sessions: any[]) => {
        const grouped: Record<string, FocusSession[]> = {};
        for (const s of sessions) {
          const d = s.session_date;
          if (!grouped[d]) grouped[d] = [];
          grouped[d].push({ id: s.id, duration: s.duration, mode: s.mode, completed: s.completed });
        }
        setBackendFocusData(grouped);
      }).catch(() => {});
    });

    // Load sleep entries from backend
    import('@/services/api').then(({ sleepEntryService }) => {
      sleepEntryService.getForDateRange(start, end).then((entries: any[]) => {
        const mapped = entries.map((e: any) => ({ date: e.date, duration: e.duration, quality: e.quality }));
        setBackendSleepData(mapped);
      }).catch(() => {});
    });

    // Load daily stats from backend
    import('@/services/api').then(({ dailyStatsService }) => {
      dailyStatsService.getForDateRange(start, end).then((stats: any[]) => {
        const mapped: Record<string, any> = {};
        for (const s of stats) {
          mapped[s.date] = {
            completed: s.tasks_completed,
            total: s.tasks_total,
            missed: s.tasks_missed,
            skipped: s.tasks_skipped,
            focus_minutes: s.focus_minutes,
          };
        }
        setBackendStatsData(mapped);
      }).catch(() => {});
    });

    // Load planned tasks for the week so timing analytics (start delay,
    // duration accuracy) can read minutes_offset / actual_start–end.
    loadPlansForDateRange(start, end).catch(() => {});

    // Previous week's daily stats for week-over-week momentum deltas.
    const prevStart = format(startOfWeek(subWeeks(selectedWeek, 1), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const prevEnd = format(endOfWeek(subWeeks(selectedWeek, 1), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    import('@/services/api').then(({ dailyStatsService }) => {
      dailyStatsService.getForDateRange(prevStart, prevEnd).then((stats: any[]) => {
        const mapped: Record<string, { completed: number; missed: number; skipped: number; focus_minutes: number }> = {};
        for (const s of stats) {
          mapped[s.date] = {
            completed: s.tasks_completed,
            missed: s.tasks_missed,
            skipped: s.tasks_skipped ?? 0,
            focus_minutes: s.focus_minutes,
          };
        }
        setPrevWeekStatsData(mapped);
      }).catch(() => {});
    });
  }, [selectedWeek, loadPlansForDateRange]);

  // Helper: get focus sessions from backend cache only
  const getFocusSessions = (dateStr: string): FocusSession[] => {
    return backendFocusData[dateStr] || [];
  };

  // Helper: get sleep entries from backend cache only
  const getSleepEntries = (): SleepEntry[] => {
    return backendSleepData;
  };

  const weeklyData = useMemo((): DailyStats[] => {
    const sleepEntries = getSleepEntries();
    
    return weekDays.map((day) => {
      const dateStr = format(day, 'yyyy-MM-dd');
      
      // Get focus data
      const focusSessions = getFocusSessions(dateStr);
      const focusMinutes = focusSessions
        .filter(s => s.mode === 'focus' && s.completed)
        .reduce((acc, s) => acc + s.duration / 60, 0);
      
      // Get sleep data
      const sleepEntry = sleepEntries.find(e => e.date === dateStr);
      const sleepHours = sleepEntry ? sleepEntry.duration / 60 : 0;
      const sleepQuality = sleepEntry ? sleepEntry.quality : 0;
      
      // Get task stats from backend daily_stats (source of truth)
      let tasksCompleted = 0;
      let tasksPlanned = 0;
      let tasksMissed = 0;
      let tasksSkipped = 0;
      
      if (backendStatsData[dateStr]) {
        const bs = backendStatsData[dateStr];
        tasksCompleted = bs.completed;
        tasksPlanned = bs.total;
        tasksMissed = bs.missed;
        tasksSkipped = bs.skipped;
      }
      
      // Calculate productivity score based on real data (missed tasks penalize).
      // Sleep only factors in on days it was actually logged — otherwise its
      // 20% weight is redistributed to focus + completion so a missing sleep
      // log can't silently tank an otherwise productive day.
      const hasSleep = sleepQuality > 0;
      const focusScore = Math.min(100, (focusMinutes / 180) * 100); // 3 hours = 100%
      const completionScore = tasksPlanned > 0 ? (tasksCompleted / tasksPlanned) * 100 : 0;
      const missedPenalty = tasksPlanned > 0 ? (tasksMissed / tasksPlanned) * 20 : 0;
      const sleepScore = sleepQuality * 20;

      const focusWeight = hasSleep ? 0.4 : 0.5;
      const completionWeight = hasSleep ? 0.4 : 0.5;
      const sleepWeight = hasSleep ? 0.2 : 0;

      const productivityScore = Math.round(
        Math.max(
          0,
          focusScore * focusWeight +
            completionScore * completionWeight +
            sleepScore * sleepWeight -
            missedPenalty
        )
      );

      return {
        date: dateStr,
        tasksCompleted,
        tasksPlanned,
        tasksMissed,
        tasksSkipped,
        focusMinutes: Math.round(focusMinutes),
        sleepHours: Math.round(sleepHours * 10) / 10,
        sleepQuality,
        productivityScore,
      };
    });
  }, [weekDays, backendFocusData, backendSleepData, backendStatsData]);

  const weeklyTotals = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    // Only count days that have already occurred so future days don't drag
    // the average down (e.g. Thursday showing Mon–Wed avg, not Mon–Sun/7).
    const elapsedDays = Math.max(
      1,
      weekDays.filter((d) => format(d, 'yyyy-MM-dd') <= todayStr).length
    );
    const raw = weeklyData.reduce(
      (acc, day) => ({
        tasksCompleted: acc.tasksCompleted + day.tasksCompleted,
        tasksPlanned: acc.tasksPlanned + day.tasksPlanned,
        tasksMissed: acc.tasksMissed + day.tasksMissed,
        tasksSkipped: acc.tasksSkipped + day.tasksSkipped,
        focusMinutes: acc.focusMinutes + day.focusMinutes,
        avgSleep: acc.avgSleep + day.sleepHours / 7,
        productivitySum: acc.productivitySum + day.productivityScore,
      }),
      { tasksCompleted: 0, tasksPlanned: 0, tasksMissed: 0, tasksSkipped: 0, focusMinutes: 0, avgSleep: 0, productivitySum: 0 }
    );
    return { ...raw, avgProductivity: raw.productivitySum / elapsedDays };
  }, [weeklyData, weekDays]);

  // Reliability = completed / (completed + missed + skipped).
  // Skipped tasks count: they were planned and not done, whether intentional
  // or not. Returns null when there's no data (avoids fake 100% default).
  const reliabilityScore = useMemo((): number | null => {
    const denom =
      weeklyTotals.tasksCompleted +
      weeklyTotals.tasksMissed +
      weeklyTotals.tasksSkipped;
    if (denom === 0) return null;
    return Math.round((weeklyTotals.tasksCompleted / denom) * 100);
  }, [weeklyTotals]);

  // Get streaks
  const currentStreak = useMemo(() => {
    let streak = 0;
    let date = new Date();
    const sleepEntries = getSleepEntries();
    
    for (let i = 0; i < 365; i++) {
      const dateStr = format(subDays(date, i), 'yyyy-MM-dd');
      const hasData = sleepEntries.some(e => e.date === dateStr) ||
        getFocusSessions(dateStr).length > 0;
      
      if (hasData) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }
    
    return streak;
  }, [backendFocusData, backendSleepData]);

  // ---- Task-timing analytics (from planned_tasks already in the store) ----
  const weekTaskList = useMemo<PlannedTask[]>(() => {
    const list: PlannedTask[] = [];
    for (const day of weekDays) {
      const dateStr = format(day, 'yyyy-MM-dd');
      const plan = plansByDate[dateStr];
      if (plan?.tasks) list.push(...plan.tasks);
    }
    return list;
  }, [weekDays, plansByDate]);

  // Average start delay: completed tasks the user actually began late.
  const avgStartDelay = useMemo<number | null>(() => {
    const delayed = weekTaskList.filter(
      (t) =>
        t.status === 'completed' &&
        t.start_type === 'delayed' &&
        typeof t.minutes_offset === 'number' &&
        t.minutes_offset > 0
    );
    if (delayed.length === 0) return null;
    const sum = delayed.reduce((acc, t) => acc + (t.minutes_offset || 0), 0);
    return Math.round(sum / delayed.length);
  }, [weekTaskList]);

  // Duration accuracy: actual time spent vs the estimate, across completed
  // tasks. Positive % = tasks run longer than planned; negative = faster.
  const durationAccuracy = useMemo<number | null>(() => {
    const done = weekTaskList.filter(
      (t) => t.status === 'completed' && t.actual_start && t.actual_end
    );
    let estTotal = 0;
    let actTotal = 0;
    for (const t of done) {
      const est = parseDuration(t.suggested_duration || '30 minutes');
      const act = differenceInMinutes(
        parseISO(t.actual_end as string),
        parseISO(t.actual_start as string)
      );
      if (act <= 0 || est <= 0) continue;
      estTotal += est;
      actTotal += act;
    }
    if (estTotal === 0) return null;
    return Math.round((actTotal / estTotal - 1) * 100);
  }, [weekTaskList]);

  // Overplanning: avg tasks planned vs completed on days that had a plan.
  const overplanning = useMemo(() => {
    const planned = weeklyData.filter((d) => d.tasksPlanned > 0);
    if (planned.length === 0) return null;
    const avgPlanned =
      planned.reduce((a, d) => a + d.tasksPlanned, 0) / planned.length;
    const avgCompleted =
      planned.reduce((a, d) => a + d.tasksCompleted, 0) / planned.length;
    return {
      avgPlanned: Math.round(avgPlanned * 10) / 10,
      avgCompleted: Math.round(avgCompleted * 10) / 10,
      overcommitted:
        avgPlanned > avgCompleted * 1.3 && avgPlanned - avgCompleted >= 1,
    };
  }, [weeklyData]);

  // Previous-week totals (daily_stats) for week-over-week momentum.
  const prevWeekTotals = useMemo(() => {
    const vals = Object.values(prevWeekStatsData);
    if (vals.length === 0) return null;
    let completed = 0;
    let missed = 0;
    let skipped = 0;
    vals.forEach((s) => {
      completed += s.completed;
      missed += s.missed;
      skipped += s.skipped;
    });
    const denom = completed + missed + skipped;
    return {
      tasksCompleted: completed,
      reliability: denom > 0 ? Math.round((completed / denom) * 100) : null,
    };
  }, [prevWeekStatsData]);

  const completedDelta = prevWeekTotals
    ? weeklyTotals.tasksCompleted - prevWeekTotals.tasksCompleted
    : null;
  const reliabilityDelta =
    reliabilityScore !== null && prevWeekTotals?.reliability !== null && prevWeekTotals
      ? reliabilityScore - (prevWeekTotals.reliability as number)
      : null;

  const renderDelta = (delta: number | null, suffix = '') => {
    if (delta === null || delta === 0) return null;
    const up = delta > 0;
    return (
      <div
        className={clsx(
          'flex items-center gap-0.5 text-[10px] font-medium mt-1',
          up ? 'text-green-600' : 'text-red-500'
        )}
      >
        {up ? (
          <TrendingUp className="w-3 h-3" />
        ) : (
          <TrendingDown className="w-3 h-3" />
        )}
        {up ? '+' : ''}
        {delta}
        {suffix} vs last week
      </div>
    );
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    if (score >= 40) return 'text-orange-400';
    return 'text-red-400';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-green-500/20';
    if (score >= 60) return 'bg-yellow-500/20';
    if (score >= 40) return 'bg-orange-500/20';
    return 'bg-red-500/20';
  };

  const maxFocus = Math.max(...weeklyData.map(d => d.focusMinutes), 1);
  const maxTasks = Math.max(...weeklyData.map(d => d.tasksPlanned), 1);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-apple-lg bg-gradient-to-br from-emerald-500/20 to-cyan-500/20">
            <BarChart3 className="w-8 h-8 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
            <p className="text-gray-600 mt-1">Track your productivity trends</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedWeek(subWeeks(selectedWeek, 1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-gray-700 text-sm min-w-[180px] text-center">
            {format(startOfWeek(selectedWeek, { weekStartsOn: 1 }), 'MMM d')} - 
            {format(endOfWeek(selectedWeek, { weekStartsOn: 1 }), 'MMM d, yyyy')}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedWeek(addWeeks(selectedWeek, 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card"
        >
          <div className="flex items-center justify-between mb-2">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <span className={clsx(
              'text-xs font-medium',
              weeklyTotals.tasksCompleted > weeklyTotals.tasksPlanned * 0.7
                ? 'text-green-600'
                : 'text-yellow-600'
            )}>
              {weeklyTotals.tasksPlanned > 0
                ? Math.round((weeklyTotals.tasksCompleted / weeklyTotals.tasksPlanned) * 100)
                : 0}%
            </span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {weeklyTotals.tasksCompleted}/{weeklyTotals.tasksPlanned}
          </div>
          <div className="text-xs text-gray-600">Tasks Completed</div>
          {renderDelta(completedDelta)}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass-card"
        >
          <div className="flex items-center justify-between mb-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            <span className={clsx(
              'text-xs font-medium',
              weeklyTotals.tasksMissed === 0 ? 'text-green-600' :
              weeklyTotals.tasksMissed <= 3 ? 'text-yellow-600' : 'text-red-600'
            )}>
              {weeklyTotals.tasksMissed === 0 ? '✓' : `${weeklyTotals.tasksMissed}`}
            </span>
          </div>
          <div className="text-2xl font-bold text-orange-600">
            {weeklyTotals.tasksMissed}
          </div>
          <div className="text-xs text-gray-600">Tasks Missed</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card"
        >
          <div className="flex items-center justify-between mb-2">
            <Brain className="w-5 h-5 text-blue-500" />
            <TrendingUp className="w-4 h-4 text-green-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {Math.round(weeklyTotals.focusMinutes / 60 * 10) / 10}h
          </div>
          <div className="text-xs text-gray-600">Focus Time</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="glass-card"
        >
          <div className="flex items-center justify-between mb-2">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            <span className={clsx(
              'text-xs font-medium',
              reliabilityScore === null ? 'text-gray-400' :
              reliabilityScore >= 80 ? 'text-green-600' :
              reliabilityScore >= 60 ? 'text-yellow-600' : 'text-red-600'
            )}>
              {reliabilityScore === null ? '—' : reliabilityScore >= 80 ? '★' : reliabilityScore >= 60 ? '↗' : '↘'}
            </span>
          </div>
          <div className={clsx('text-2xl font-bold',
            reliabilityScore === null ? 'text-gray-400' :
            reliabilityScore >= 80 ? 'text-emerald-600' :
            reliabilityScore >= 60 ? 'text-yellow-600' : 'text-red-600'
          )}>
            {reliabilityScore === null ? '—' : `${reliabilityScore}%`}
          </div>
          <div className="text-xs text-gray-600">Reliability Score</div>
          {renderDelta(reliabilityDelta, '%')}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28 }}
          className="glass-card"
        >
          <div className="flex items-center justify-between mb-2">
            <Timer className="w-5 h-5 text-sky-500" />
          </div>
          <div
            className={clsx(
              'text-2xl font-bold',
              avgStartDelay === null
                ? 'text-gray-400'
                : avgStartDelay < 10
                ? 'text-green-600'
                : avgStartDelay <= 20
                ? 'text-yellow-600'
                : 'text-orange-600'
            )}
          >
            {avgStartDelay === null ? '—' : `${avgStartDelay}m`}
          </div>
          <div className="text-xs text-gray-600">Avg Start Delay</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card"
        >
          <div className="flex items-center justify-between mb-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            <span className={clsx('text-xs font-medium', getScoreColor(weeklyTotals.avgProductivity))}>
              {weeklyTotals.avgProductivity >= 60 ? '↑' : '↓'}
            </span>
          </div>
          <div className={clsx('text-2xl font-bold', getScoreColor(weeklyTotals.avgProductivity))}>
            {Math.round(weeklyTotals.avgProductivity)}
          </div>
          <div className="text-xs text-gray-600">Avg Productivity</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-card"
        >
          <div className="flex items-center justify-between mb-2">
            <Flame className="w-5 h-5 text-orange-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {currentStreak}
          </div>
          <div className="text-xs text-gray-600">Day Streak 🔥</div>
        </motion.div>
      </div>

      {/* Charts Row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Focus Time Chart */}
        <div className="glass-card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Focus Time</h3>
          <div className="flex items-end gap-2 h-40">
            {weeklyData.map((day, i) => (
              <div key={day.date} className="flex-1 flex flex-col items-center">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${(day.focusMinutes / maxFocus) * 100}%` }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                  className="w-full bg-gradient-to-t from-blue-500 to-cyan-500 rounded-t min-h-[4px]"
                />
                <div className="text-xs text-gray-600 mt-2">
                  {format(parseISO(day.date), 'EEE')}
                </div>
                <div className="text-xs text-gray-500">
                  {day.focusMinutes}m
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Task Completion Chart (with missed overlay) */}
        <div className="glass-card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Task Completion</h3>
          <div className="flex items-end gap-2 h-40">
            {weeklyData.map((day, i) => (
              <div key={day.date} className="flex-1 flex flex-col items-center">
                <div className="w-full relative h-full flex items-end">
                  {/* Planned (background) */}
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${(day.tasksPlanned / maxTasks) * 100}%` }}
                    transition={{ delay: i * 0.05, duration: 0.3 }}
                    className="absolute bottom-0 w-full bg-gray-300 rounded-t"
                  />
                  {/* Missed (middle layer - orange) */}
                  {day.tasksMissed > 0 && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${((day.tasksCompleted + day.tasksMissed) / maxTasks) * 100}%` }}
                      transition={{ delay: i * 0.05 + 0.05, duration: 0.3 }}
                      className="absolute bottom-0 w-full bg-gradient-to-t from-orange-400 to-orange-300 rounded-t"
                    />
                  )}
                  {/* Completed (foreground) */}
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${(day.tasksCompleted / maxTasks) * 100}%` }}
                    transition={{ delay: i * 0.05 + 0.1, duration: 0.3 }}
                    className="relative w-full bg-gradient-to-t from-green-500 to-emerald-500 rounded-t min-h-[4px]"
                  />
                </div>
                <div className="text-xs text-gray-600 mt-2">
                  {format(parseISO(day.date), 'EEE')}
                </div>
                <div className="text-xs text-gray-500">
                  {day.tasksCompleted}/{day.tasksPlanned}
                  {day.tasksMissed > 0 && <span className="text-orange-500"> ({day.tasksMissed}⚠)</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-4 mt-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> Completed</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-400 inline-block" /> Missed</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-300 inline-block" /> Planned</span>
          </div>
        </div>
      </div>

      {/* Productivity Score Heatmap */}
      <div className="glass-card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Productivity Score</h3>
        <div className="grid grid-cols-7 gap-2">
          {weeklyData.map((day) => {
            const hasData = day.tasksPlanned > 0 || day.focusMinutes > 0 || day.sleepHours > 0;
            return (
              <motion.div
                key={day.date}
                whileHover={{ scale: 1.05 }}
                className={clsx(
                  'p-4 rounded-apple text-center cursor-pointer transition-all',
                  hasData ? getScoreBg(day.productivityScore) : 'bg-gray-100'
                )}
              >
                <div className="text-xs text-gray-600 mb-1">
                  {format(parseISO(day.date), 'EEE')}
                </div>
                <div className="text-sm font-medium text-gray-700">
                  {format(parseISO(day.date), 'MMM d')}
                </div>
                <div className={clsx('text-2xl font-bold mt-2', hasData ? getScoreColor(day.productivityScore) : 'text-gray-400')}>
                  {hasData ? day.productivityScore : '—'}
                </div>
                <div className="text-xs text-gray-500 mt-1">score</div>
              </motion.div>
            );
          })}
        </div>
        
        <div className="flex items-center justify-center gap-2 mt-4">
          <span className="text-xs text-gray-600">Low</span>
          <div className="flex gap-1">
            {[20, 40, 60, 80, 100].map((score) => (
              <div
                key={score}
                className={clsx('w-6 h-4 rounded', getScoreBg(score))}
              />
            ))}
          </div>
          <span className="text-xs text-gray-600">High</span>
        </div>
      </div>

      {/* Daily Breakdown */}
      <div className="glass-card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-gray-600 text-sm border-b border-gray-200">
                <th className="pb-3">Day</th>
                <th className="pb-3">Tasks</th>
                <th className="pb-3">Missed</th>
                <th className="pb-3">Focus</th>
                <th className="pb-3">Sleep</th>
                <th className="pb-3">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {weeklyData.map((day) => (
                <tr key={day.date} className="text-sm">
                  <td className="py-3">
                    <div className="font-medium text-gray-900">
                      {format(parseISO(day.date), 'EEEE')}
                    </div>
                    <div className="text-gray-600 text-xs">
                      {format(parseISO(day.date), 'MMM d')}
                    </div>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span className="text-gray-900">
                        {day.tasksCompleted}/{day.tasksPlanned}
                      </span>
                    </div>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      {day.tasksMissed > 0 ? (
                        <>
                          <AlertTriangle className="w-4 h-4 text-orange-500" />
                          <span className="text-orange-600 font-medium">{day.tasksMissed}</span>
                        </>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <Brain className="w-4 h-4 text-blue-500" />
                      <span className="text-gray-900">
                        {Math.round(day.focusMinutes / 60 * 10) / 10}h
                      </span>
                    </div>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <Coffee className="w-4 h-4 text-indigo-500" />
                      <span className="text-gray-900">
                        {day.sleepHours > 0 ? `${day.sleepHours}h` : '-'}
                      </span>
                    </div>
                  </td>
                  <td className="py-3">
                    <span className={clsx(
                      'px-2 py-1 rounded-full text-xs font-medium',
                      getScoreBg(day.productivityScore),
                      getScoreColor(day.productivityScore)
                    )}>
                      {day.productivityScore}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Insights */}
      <div className="glass-card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Weekly Insights</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="p-4 bg-gray-50 rounded-apple">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-5 h-5 text-blue-500" />
              <span className="font-medium text-gray-900">Goal Progress</span>
            </div>
            <p className="text-gray-700 text-sm">
              {weeklyTotals.tasksPlanned > 0 ? (
                <>
                  You completed {weeklyTotals.tasksCompleted} of{' '}
                  {weeklyTotals.tasksPlanned} planned tasks this week (
                  {Math.round(
                    (weeklyTotals.tasksCompleted / weeklyTotals.tasksPlanned) *
                      100
                  )}
                  %).
                  {weeklyTotals.tasksCompleted >= weeklyTotals.tasksPlanned
                    ? ' You cleared everything you planned. 🎉'
                    : ' Keep chipping away at the rest.'}
                </>
              ) : (
                'No tasks planned this week yet — add a plan to start tracking progress.'
              )}
            </p>
          </div>
          
          <div className="p-4 bg-gray-50 rounded-apple">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-blue-500" />
              <span className="font-medium text-gray-900">Best Focus Day</span>
            </div>
            <p className="text-gray-700 text-sm">
              {(() => {
                const bestDay = weeklyData.reduce((best, day) =>
                  day.focusMinutes > best.focusMinutes ? day : best
                );
                if (bestDay.focusMinutes === 0) {
                  return 'No focus sessions recorded this week yet. Try the Focus Timer to start tracking.';
                }
                return `${format(parseISO(bestDay.date), 'EEEE')} with ${Math.round(bestDay.focusMinutes / 60 * 10) / 10} hours of focused work.`;
              })()}
            </p>
          </div>

          <div className="p-4 bg-gray-50 rounded-apple">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-green-500" />
              <span className="font-medium text-gray-900">Productivity Trend</span>
            </div>
            <p className="text-gray-700 text-sm">
              Your average productivity score is {Math.round(weeklyTotals.avgProductivity)}. 
              {weeklyTotals.avgProductivity >= 70 
                ? " You're doing great! Keep it up! 💪" 
                : " Try to focus on fewer, high-impact tasks."}
            </p>
          </div>

          <div className="p-4 bg-gray-50 rounded-apple">
            <div className="flex items-center gap-2 mb-2">
              <Flame className="w-5 h-5 text-orange-500" />
              <span className="font-medium text-gray-900">Streak Status</span>
            </div>
            <p className="text-gray-700 text-sm">
              You're on a {currentStreak}-day streak!
              {currentStreak >= 7
                ? " Amazing consistency! 🔥"
                : " Keep logging your activities daily."}
            </p>
          </div>

          {durationAccuracy !== null && (
            <div className="p-4 bg-gray-50 rounded-apple">
              <div className="flex items-center gap-2 mb-2">
                <Hourglass className="w-5 h-5 text-blue-500" />
                <span className="font-medium text-gray-900">Time Estimates</span>
              </div>
              <p className="text-gray-700 text-sm">
                {durationAccuracy === 0
                  ? 'Your tasks finish almost exactly as long as you estimate — great calibration. 🎯'
                  : durationAccuracy > 0
                  ? `Tasks take about ${durationAccuracy}% longer than estimated on average. Consider padding your time estimates so plans stay realistic.`
                  : `You finish tasks about ${Math.abs(durationAccuracy)}% faster than estimated — you have room to plan a bit more in.`}
              </p>
            </div>
          )}

          {overplanning && overplanning.overcommitted && (
            <div className="p-4 bg-amber-50 rounded-apple border border-amber-100">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <span className="font-medium text-gray-900">Overplanning</span>
              </div>
              <p className="text-gray-700 text-sm">
                You planned {overplanning.avgPlanned} tasks/day on average but
                completed {overplanning.avgCompleted}. Planning fewer,
                higher-impact tasks will make your days feel more achievable.
              </p>
            </div>
          )}

          {weeklyTotals.tasksMissed > 0 && (
            <div className="p-4 bg-orange-50 rounded-apple border border-orange-100">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                <span className="font-medium text-gray-900">Missed Tasks</span>
              </div>
              <p className="text-gray-700 text-sm">
                You missed {weeklyTotals.tasksMissed} task{weeklyTotals.tasksMissed > 1 ? 's' : ''} this week. 
                {(() => {
                  const worstDay = weeklyData.reduce((worst, day) => 
                    day.tasksMissed > worst.tasksMissed ? day : worst
                  );
                  return worstDay.tasksMissed > 0
                    ? `${format(parseISO(worstDay.date), 'EEEE')} had the most misses (${worstDay.tasksMissed}). `
                    : '';
                })()}
                {(reliabilityScore ?? 0) >= 80
                  ? 'Your reliability is still strong — keep it up! 💪'
                  : 'Try scheduling fewer tasks or adding buffer time between them.'}
              </p>
            </div>
          )}

          {weeklyTotals.tasksSkipped > 0 && (
            <div className="p-4 bg-sky-50 rounded-apple border border-sky-100">
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="w-5 h-5 text-sky-500" />
                <span className="font-medium text-gray-900">Skipped Tasks</span>
              </div>
              <p className="text-gray-700 text-sm">
                You skipped {weeklyTotals.tasksSkipped} task
                {weeklyTotals.tasksSkipped > 1 ? 's' : ''} this week. Skipped
                tasks count against your reliability score — reschedule them
                instead to keep your streak intact.
              </p>
            </div>
          )}

          <div className="p-4 bg-emerald-50 rounded-apple border border-emerald-100">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
              <span className="font-medium text-gray-900">Reliability Score</span>
            </div>
            <p className="text-gray-700 text-sm">
              {reliabilityScore === null
                ? 'No planned tasks yet this week — complete your first task to start tracking reliability.'
                : <>
                    Your task reliability is {reliabilityScore}%.{' '}
                    {reliabilityScore >= 90
                      ? 'Exceptional — you follow through on nearly everything you plan. 🏆'
                      : reliabilityScore >= 70
                      ? 'Good consistency. Rescheduling instead of skipping will push this higher.'
                      : 'Consider planning fewer tasks or rescheduling instead of skipping — quality over quantity.'}
                  </>
              }
            </p>
          </div>
        </div>
      </div>

      {/* Data Sources Info */}
      <div className="glass-card bg-gradient-to-r from-gray-50 to-blue-50">
        <h3 className="text-sm font-medium text-gray-600 mb-3">Your Analytics Are Powered By</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button
            onClick={() => navigate('/app/focus')}
            className="flex items-center gap-2 p-3 bg-white/80 rounded-apple hover:bg-white transition-colors text-left shadow-sm"
          >
            <Brain className="w-5 h-5 text-blue-500" />
            <div>
              <p className="text-sm font-medium text-gray-900">Focus Timer</p>
              <p className="text-xs text-gray-600">Track focus sessions</p>
            </div>
          </button>
          
          <button
            onClick={() => navigate('/app/sleep')}
            className="flex items-center gap-2 p-3 bg-white/80 rounded-apple hover:bg-white transition-colors text-left shadow-sm"
          >
            <Moon className="w-5 h-5 text-indigo-500" />
            <div>
              <p className="text-sm font-medium text-gray-900">Sleep</p>
              <p className="text-xs text-gray-600">Log sleep quality</p>
            </div>
          </button>
          
          <button
            onClick={() => navigate('/app/schedule')}
            className="flex items-center gap-2 p-3 bg-white/80 rounded-apple hover:bg-white transition-colors text-left shadow-sm"
          >
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <div>
              <p className="text-sm font-medium text-gray-900">Tasks</p>
              <p className="text-xs text-gray-600">Complete your plans</p>
            </div>
          </button>
          
          <button
            onClick={() => navigate('/app/reflection')}
            className="flex items-center gap-2 p-3 bg-white/80 rounded-apple hover:bg-white transition-colors text-left shadow-sm"
          >
            <Sparkles className="w-5 h-5 text-purple-500" />
            <div>
              <p className="text-sm font-medium text-gray-900">Reflection</p>
              <p className="text-xs text-gray-600">Daily reviews</p>
            </div>
          </button>
        </div>
        
        <p className="text-xs text-gray-500 mt-3 text-center">
          The more you use Taskly, the smarter your insights become ✨
        </p>
      </div>
    </div>
  );
}
