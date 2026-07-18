import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Moon,
  Sun,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  Clock,
  Zap,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Brain,
  BarChart3,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { sleepEntryService, sleepGoalService, SleepGoal as SleepGoalDTO, profileService } from '@/services/api';
import { useUserProfileStore } from '@/stores';
import { format, parseISO, startOfWeek, endOfWeek, eachDayOfInterval, subDays, addDays, isSameDay } from 'date-fns';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

interface SleepEntry {
  id: string;
  date: string; // YYYY-MM-DD
  bedtime: string; // HH:MM
  wakeTime: string; // HH:MM
  quality: 1 | 2 | 3 | 4 | 5;
  notes?: string;
  duration: number; // in minutes
}

interface SleepGoal {
  targetBedtime: string;
  targetWakeTime: string;
  targetDuration: number; // in hours
}

const DEFAULT_GOAL: SleepGoal = {
  targetBedtime: '22:30',
  targetWakeTime: '06:30',
  targetDuration: 8,
};

const QUALITY_LABELS = ['', 'Terrible', 'Poor', 'Fair', 'Good', 'Excellent'];
const QUALITY_COLORS = ['', 'text-red-400', 'text-orange-400', 'text-yellow-400', 'text-green-400', 'text-emerald-400'];
const QUALITY_BG = ['', 'bg-red-500/20', 'bg-orange-500/20', 'bg-yellow-500/20', 'bg-green-500/20', 'bg-emerald-500/20'];

export default function SleepTracker() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<SleepEntry[]>([]);
  const [goal, setGoal] = useState<SleepGoal>(DEFAULT_GOAL);
  // The sleep SCHEDULE is the single source of truth (also drives the AI planner).
  // Managed here so all sleep config lives in one place (was split with Settings).
  const setSleepScheduleStore = useUserProfileStore((s) => s.setSleepSchedule);
  const [schedule, setSchedule] = useState({
    wakeTime: '07:00',
    sleepTime: '23:00',
    windDownMinutes: 30,
    preferredEndTime: '',
  });
  const [savingSleep, setSavingSleep] = useState(false);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [editingEntry, setEditingEntry] = useState<SleepEntry | null>(null);
  const [isSavingEntry, setIsSavingEntry] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [newEntry, setNewEntry] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    bedtime: '22:30',
    wakeTime: '06:30',
    quality: 4 as 1 | 2 | 3 | 4 | 5,
    notes: '',
  });


  // Load entries + goal + schedule from backend (single source of truth)
  useEffect(() => {
    sleepGoalService.get()
      .then((g) => {
        setGoal({
          targetBedtime: g.target_bedtime,
          targetWakeTime: g.target_wake_time,
          targetDuration: g.target_duration_hours,
        });
      })
      .catch((error) => {
        console.error('Failed to load sleep goal:', error);
      });

    profileService.getSleepSchedule()
      .then((s: any) => {
        if (s) {
          setSchedule({
            wakeTime: s.wake_time || '07:00',
            sleepTime: s.sleep_time || '23:00',
            windDownMinutes: s.wind_down_minutes ?? 30,
            preferredEndTime: s.preferred_end_time || '',
          });
        }
      })
      .catch((error) => {
        console.error('Failed to load sleep schedule:', error);
      });

    sleepEntryService.getAll()
      .then((backendEntries: any[]) => {
        const mapped: SleepEntry[] = (backendEntries || []).map((e: any) => ({
          id: e.id,
          date: e.date,
          bedtime: e.bedtime,
          wakeTime: e.wake_time,
          quality: e.quality,
          notes: e.notes || undefined,
          duration: e.duration,
        }));
        setEntries(mapped);
      })
      .catch((error) => {
        console.error('Failed to load sleep entries:', error);
      });
  }, []);

  // Save the whole sleep config from one editor. The wake/sleep times entered
  // here are the ONLY place they live — they drive the AI planner (sleep
  // schedule) and are mirrored into the goal so its charts can never drift.
  const saveSleepConfig = async () => {
    setSavingSleep(true);
    try {
      const savedSchedule = await profileService.saveSleepSchedule({
        wake_time: schedule.wakeTime,
        sleep_time: schedule.sleepTime,
        wind_down_minutes: schedule.windDownMinutes,
        preferred_end_time: schedule.preferredEndTime || null,
      });
      // Keep the app-wide store in sync so the AI planner uses the new times.
      setSleepScheduleStore(savedSchedule);

      const goalPayload: SleepGoalDTO = {
        target_bedtime: schedule.sleepTime,
        target_wake_time: schedule.wakeTime,
        target_duration_hours: goal.targetDuration,
      };
      await sleepGoalService.save(goalPayload);
      setGoal((prev) => ({
        ...prev,
        targetBedtime: schedule.sleepTime,
        targetWakeTime: schedule.wakeTime,
      }));

      toast.success('Sleep settings saved!');
    } catch (error) {
      console.error('Failed to save sleep settings:', error);
      toast.error('Failed to save sleep settings');
    } finally {
      setSavingSleep(false);
    }
  };

  const calculateDuration = (bedtime: string, wakeTime: string): number => {
    const [bedHour, bedMin] = bedtime.split(':').map(Number);
    const [wakeHour, wakeMin] = wakeTime.split(':').map(Number);
    
    let duration = (wakeHour * 60 + wakeMin) - (bedHour * 60 + bedMin);
    if (duration < 0) duration += 24 * 60; // Handle crossing midnight
    
    return duration;
  };

  const resetNewEntry = () => {
    setNewEntry({
      date: format(new Date(), 'yyyy-MM-dd'),
      bedtime: '22:30',
      wakeTime: '06:30',
      quality: 4,
      notes: '',
    });
  };

  const openAddEntry = (date?: string) => {
    setEditingEntry(null);
    setNewEntry({
      date: date || format(new Date(), 'yyyy-MM-dd'),
      bedtime: '22:30',
      wakeTime: '06:30',
      quality: 4,
      notes: '',
    });
    setShowAddEntry(true);
  };

  const openEditEntry = (entry: SleepEntry) => {
    setEditingEntry(entry);
    setNewEntry({
      date: entry.date,
      bedtime: entry.bedtime,
      wakeTime: entry.wakeTime,
      quality: entry.quality,
      notes: entry.notes || '',
    });
    setShowAddEntry(true);
  };

  const closeEntryModal = () => {
    setShowAddEntry(false);
    setEditingEntry(null);
    resetNewEntry();
  };

  const handleSaveEntry = async () => {
    const duration = calculateDuration(newEntry.bedtime, newEntry.wakeTime);
    setIsSavingEntry(true);

    try {
      const saved: any = await sleepEntryService.save({
        date: newEntry.date,
        bedtime: newEntry.bedtime,
        wake_time: newEntry.wakeTime,
        quality: newEntry.quality,
        notes: newEntry.notes || null,
        duration,
      });

      const entry: SleepEntry = {
        id: saved.id,
        date: saved.date,
        bedtime: saved.bedtime,
        wakeTime: saved.wake_time,
        quality: saved.quality,
        notes: saved.notes || undefined,
        duration: saved.duration,
      };

      // When editing and the date was changed, the upsert created an entry at the
      // new date — remove the stale one left behind at the original date.
      if (editingEntry && editingEntry.date !== entry.date) {
        await sleepEntryService.delete(editingEntry.id).catch((error) => {
          console.error('Failed to remove stale sleep entry:', error);
        });
      }

      setEntries(prev => [
        ...prev.filter(e => e.date !== entry.date && e.id !== editingEntry?.id),
        entry,
      ]);

      toast.success(editingEntry ? 'Sleep entry updated!' : 'Sleep entry logged!');
      closeEntryModal();
    } catch (error) {
      console.error('Failed to save sleep entry:', error);
      toast.error('Failed to save sleep entry. Please try again.');
    } finally {
      setIsSavingEntry(false);
    }
  };

  const handleDeleteEntry = async () => {
    if (!editingEntry) return;
    setIsSavingEntry(true);
    try {
      await sleepEntryService.delete(editingEntry.id);
      setEntries(prev => prev.filter(e => e.id !== editingEntry.id));
      toast.success('Sleep entry deleted');
      closeEntryModal();
    } catch (error) {
      console.error('Failed to delete sleep entry:', error);
      toast.error('Failed to delete entry. Please try again.');
    } finally {
      setIsSavingEntry(false);
    }
  };

  const getWeekDays = () => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const end = endOfWeek(selectedDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  };

  const getEntryForDate = (date: Date): SleepEntry | undefined => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return entries.find(e => e.date === dateStr);
  };

  const getLast7DaysEntries = (): SleepEntry[] => {
    const last7Days = Array.from({ length: 7 }, (_, i) => 
      format(subDays(new Date(), i), 'yyyy-MM-dd')
    );
    return entries.filter(e => last7Days.includes(e.date));
  };

  const getWeeklyStats = () => {
    const weekEntries = getLast7DaysEntries();
    
    if (weekEntries.length === 0) {
      return {
        avgDuration: 0,
        avgQuality: 0,
        avgBedtime: '--:--',
        avgWakeTime: '--:--',
        consistency: 0,
        trend: 'stable' as const,
      };
    }

    const avgDuration = weekEntries.reduce((acc, e) => acc + e.duration, 0) / weekEntries.length;
    const avgQuality = weekEntries.reduce((acc, e) => acc + e.quality, 0) / weekEntries.length;
    
    // Calculate average times
    const avgBedMinutes = weekEntries.reduce((acc, e) => {
      const [h, m] = e.bedtime.split(':').map(Number);
      let mins = h * 60 + m;
      if (h < 12) mins += 24 * 60; // Normalize late night times
      return acc + mins;
    }, 0) / weekEntries.length;
    
    const avgWakeMinutes = weekEntries.reduce((acc, e) => {
      const [h, m] = e.wakeTime.split(':').map(Number);
      return acc + h * 60 + m;
    }, 0) / weekEntries.length;

    const normBedMins = avgBedMinutes > 24 * 60 ? avgBedMinutes - 24 * 60 : avgBedMinutes;
    const avgBedtime = `${Math.floor(normBedMins / 60).toString().padStart(2, '0')}:${Math.floor(normBedMins % 60).toString().padStart(2, '0')}`;
    const avgWakeTime = `${Math.floor(avgWakeMinutes / 60).toString().padStart(2, '0')}:${Math.floor(avgWakeMinutes % 60).toString().padStart(2, '0')}`;

    // Calculate trend (compare last 3 days to previous 3)
    const recent = weekEntries.slice(0, 3);
    const previous = weekEntries.slice(3, 6);
    let trend: 'up' | 'down' | 'stable' = 'stable';
    
    if (recent.length > 0 && previous.length > 0) {
      const recentAvg = recent.reduce((a, e) => a + e.quality, 0) / recent.length;
      const prevAvg = previous.reduce((a, e) => a + e.quality, 0) / previous.length;
      if (recentAvg > prevAvg + 0.3) trend = 'up';
      else if (recentAvg < prevAvg - 0.3) trend = 'down';
    }

    // Consistency score (how close to target)
    const consistency = Math.min(100, weekEntries.length / 7 * 100);

    return { avgDuration, avgQuality, avgBedtime, avgWakeTime, consistency, trend };
  };

  const stats = getWeeklyStats();
  const weekDays = getWeekDays();
  const todayEntry = getEntryForDate(new Date());

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const getDurationColor = (duration: number) => {
    const target = goal.targetDuration * 60;
    if (duration >= target - 30 && duration <= target + 60) return 'text-green-400';
    if (duration >= target - 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-apple-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20">
            <Moon className="w-8 h-8 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sleep Tracker</h1>
            <p className="text-gray-600 mt-1">Monitor your sleep patterns</p>
          </div>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => openAddEntry()}
        >
          Log Sleep
        </Button>
      </div>

      {/* Sleep schedule — the single source of truth (also drives the AI planner) */}
      <div className="glass-card">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-gray-900">Sleep schedule</h2>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Your wake/sleep window — the AI planner uses this to know when you're awake.
        </p>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-700 block mb-1">Wake up time</label>
              <input
                type="time"
                value={schedule.wakeTime}
                onChange={(e) => setSchedule((p) => ({ ...p, wakeTime: e.target.value }))}
                className="w-full bg-white border border-gray-300 rounded-apple px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-sm text-gray-700 block mb-1">Sleep time</label>
              <input
                type="time"
                value={schedule.sleepTime}
                onChange={(e) => setSchedule((p) => ({ ...p, sleepTime: e.target.value }))}
                className="w-full bg-white border border-gray-300 rounded-apple px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-700 block mb-1">
              Wind-down before sleep (minutes)
            </label>
            <div className="flex gap-2">
              {[15, 30, 45, 60, 90].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setSchedule((p) => ({ ...p, windDownMinutes: mins }))}
                  className={clsx(
                    'flex-1 py-2 rounded-apple border text-sm font-medium transition-all',
                    schedule.windDownMinutes === mins
                      ? 'border-blue-500 bg-blue-500/10 text-blue-600'
                      : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  )}
                >
                  {mins}m
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-700 block mb-1">Done-by time (optional)</label>
            <p className="text-xs text-gray-500 mb-2">
              Latest the AI may schedule a task to end. Leave empty to use sleep − wind-down.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="time"
                value={schedule.preferredEndTime}
                onChange={(e) => setSchedule((p) => ({ ...p, preferredEndTime: e.target.value }))}
                className="flex-1 bg-white border border-gray-300 rounded-apple px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {schedule.preferredEndTime && (
                <button
                  type="button"
                  onClick={() => setSchedule((p) => ({ ...p, preferredEndTime: '' }))}
                  className="text-sm text-gray-500 hover:text-gray-700 underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-gray-200">
            <label className="text-sm text-gray-700 block mb-1">
              Target sleep duration (hours)
            </label>
            <p className="text-xs text-gray-500 mb-2">
              For your sleep tracking charts — how much sleep you're aiming for.
            </p>
            <input
              type="number"
              value={goal.targetDuration}
              onChange={(e) => setGoal((prev) => ({ ...prev, targetDuration: parseFloat(e.target.value) || 8 }))}
              className="w-full sm:w-40 bg-white border border-gray-300 rounded-apple px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              min="4"
              max="12"
              step="0.5"
            />
          </div>

          <Button variant="primary" onClick={saveSleepConfig} isLoading={savingSleep}>
            Save schedule
          </Button>
        </div>
      </div>

      {/* Today's Status */}
      <div className={clsx(
        'glass-card p-6',
        todayEntry ? QUALITY_BG[todayEntry.quality] : 'bg-gray-50'
      )}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {todayEntry ? "Last Night's Sleep" : "No Sleep Logged Today"}
            </h3>
            {todayEntry ? (
              <div className="mt-2 space-y-1">
                <p className={clsx('text-2xl font-bold', getDurationColor(todayEntry.duration))}>
                  {formatDuration(todayEntry.duration)}
                </p>
                <p className={clsx('text-sm', QUALITY_COLORS[todayEntry.quality])}>
                  Quality: {QUALITY_LABELS[todayEntry.quality]}
                </p>
                <p className="text-gray-600 text-sm">
                  {todayEntry.bedtime} → {todayEntry.wakeTime}
                </p>
              </div>
            ) : (
              <p className="text-gray-600 mt-2">
                Log your sleep to track your patterns
              </p>
            )}
          </div>
          
          {todayEntry && (
            <div className="flex flex-col items-end gap-2">
              <div className={clsx(
                'text-4xl font-bold',
                QUALITY_COLORS[todayEntry.quality]
              )}>
                {todayEntry.quality}/5
              </div>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Pencil className="w-4 h-4" />}
                onClick={() => openEditEntry(todayEntry)}
              >
                Edit
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Weekly Overview */}
      <div className="glass-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Weekly Overview</h3>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedDate(subDays(selectedDate, 7))}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-gray-700 text-sm">
              {format(startOfWeek(selectedDate, { weekStartsOn: 1 }), 'MMM d')} - 
              {format(endOfWeek(selectedDate, { weekStartsOn: 1 }), 'MMM d')}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedDate(addDays(selectedDate, 7))}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((day) => {
            const entry = getEntryForDate(day);
            const isToday = isSameDay(day, new Date());
            
            return (
              <button
                type="button"
                key={day.toISOString()}
                onClick={() => entry ? openEditEntry(entry) : openAddEntry(format(day, 'yyyy-MM-dd'))}
                title={entry ? 'Edit sleep entry' : 'Log sleep for this day'}
                className={clsx(
                  'p-3 rounded-apple text-center transition-all cursor-pointer hover:ring-2 hover:ring-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-400',
                  isToday && 'ring-2 ring-blue-500',
                  entry ? QUALITY_BG[entry.quality] : 'bg-gray-100 border border-gray-200'
                )}
              >
                <div className="text-xs text-gray-600">{format(day, 'EEE')}</div>
                <div className="text-sm font-semibold text-gray-800">{format(day, 'd')}</div>

                {entry ? (
                  <div className="mt-2">
                    <div className={clsx('text-xs font-medium', QUALITY_COLORS[entry.quality])}>
                      {formatDuration(entry.duration)}
                    </div>
                    <div className="flex justify-center gap-0.5 mt-1">
                      {[1, 2, 3, 4, 5].map((q) => (
                        <div
                          key={q}
                          className={clsx(
                            'w-1.5 h-1.5 rounded-full',
                            q <= entry.quality ? 'bg-current' : 'bg-gray-300',
                            QUALITY_COLORS[entry.quality]
                          )}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-gray-500">-</div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card text-center">
          <Clock className="w-5 h-5 text-blue-600 mx-auto mb-2" />
          <div className={clsx('text-xl font-bold', getDurationColor(stats.avgDuration))}>
            {stats.avgDuration > 0 ? formatDuration(Math.round(stats.avgDuration)) : '--'}
          </div>
          <div className="text-xs text-gray-600">Avg Duration</div>
        </div>
        
        <div className="glass-card text-center">
          <Zap className="w-5 h-5 text-yellow-600 mx-auto mb-2" />
          <div className={clsx('text-xl font-bold', QUALITY_COLORS[Math.round(stats.avgQuality)] || 'text-gray-700')}>
            {stats.avgQuality > 0 ? stats.avgQuality.toFixed(1) : '--'}/5
          </div>
          <div className="text-xs text-gray-600">Avg Quality</div>
        </div>
        
        <div className="glass-card text-center">
          <Moon className="w-5 h-5 text-indigo-600 mx-auto mb-2" />
          <div className="text-xl font-bold text-gray-900">{stats.avgBedtime}</div>
          <div className="text-xs text-gray-600">Avg Bedtime</div>
        </div>
        
        <div className="glass-card text-center">
          <Sun className="w-5 h-5 text-orange-600 mx-auto mb-2" />
          <div className="text-xl font-bold text-gray-900">{stats.avgWakeTime}</div>
          <div className="text-xs text-gray-600">Avg Wake Time</div>
        </div>
      </div>

      {/* Trend & Recommendations */}
      <div className="glass-card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Insights</h3>
        
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-apple border border-gray-200">
            {stats.trend === 'up' ? (
              <TrendingUp className="w-5 h-5 text-green-600" />
            ) : stats.trend === 'down' ? (
              <TrendingDown className="w-5 h-5 text-red-600" />
            ) : (
              <Minus className="w-5 h-5 text-gray-500" />
            )}
            <div>
              <p className="text-gray-800 text-sm font-medium">
                {stats.trend === 'up' && 'Your sleep quality is improving! 🎉'}
                {stats.trend === 'down' && 'Your sleep quality has decreased recently'}
                {stats.trend === 'stable' && 'Your sleep quality is consistent'}
              </p>
              <p className="text-gray-600 text-xs">Based on the last 7 days</p>
            </div>
          </div>

          {stats.avgDuration > 0 && stats.avgDuration < goal.targetDuration * 60 - 30 && (
            <div className="flex items-center gap-3 p-3 bg-orange-500/10 rounded-apple border border-orange-200">
              <AlertCircle className="w-5 h-5 text-orange-600" />
              <div>
                <p className="text-gray-800 text-sm font-medium">
                  You're getting {Math.round((goal.targetDuration * 60 - stats.avgDuration) / 60 * 10) / 10}h less than your goal
                </p>
                <p className="text-gray-600 text-xs">
                  Try going to bed 30 minutes earlier
                </p>
              </div>
            </div>
          )}

          {stats.consistency < 70 && (
            <div className="flex items-center gap-3 p-3 bg-blue-500/10 rounded-apple border border-blue-200">
              <Calendar className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-gray-800 text-sm font-medium">
                  Log your sleep more consistently
                </p>
                <p className="text-gray-600 text-xs">
                  You've logged {Math.round(stats.consistency)}% of days this week
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Entry Modal */}
      <AnimatePresence>
        {showAddEntry && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={closeEntryModal}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="glass-card w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-semibold text-gray-900 mb-4">
                {editingEntry ? 'Edit Sleep' : 'Log Sleep'}
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-700 block mb-1">Date</label>
                  <input
                    type="date"
                    value={newEntry.date}
                    onChange={(e) => setNewEntry(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full bg-white border border-gray-300 rounded-apple px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-700 block mb-1">Bedtime</label>
                    <input
                      type="time"
                      value={newEntry.bedtime}
                      onChange={(e) => setNewEntry(prev => ({ ...prev, bedtime: e.target.value }))}
                      className="w-full bg-white border border-gray-300 rounded-apple px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-700 block mb-1">Wake Time</label>
                    <input
                      type="time"
                      value={newEntry.wakeTime}
                      onChange={(e) => setNewEntry(prev => ({ ...prev, wakeTime: e.target.value }))}
                      className="w-full bg-white border border-gray-300 rounded-apple px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm text-gray-700 block mb-2">Sleep Quality</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((q) => (
                      <button
                        key={q}
                        onClick={() => setNewEntry(prev => ({ ...prev, quality: q as 1 | 2 | 3 | 4 | 5 }))}
                        className={clsx(
                          'flex-1 py-2 rounded-apple text-sm font-medium transition-all',
                          newEntry.quality === q
                            ? `${QUALITY_BG[q]} ${QUALITY_COLORS[q]} ring-2 ring-current font-semibold`
                            : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-300'
                        )}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                  <p className={clsx('text-center text-sm mt-1', QUALITY_COLORS[newEntry.quality])}>
                    {QUALITY_LABELS[newEntry.quality]}
                  </p>
                </div>

                <div>
                  <label className="text-sm text-gray-700 block mb-1">Notes (optional)</label>
                  <textarea
                    value={newEntry.notes}
                    onChange={(e) => setNewEntry(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="How did you sleep? Any dreams?"
                    className="w-full bg-white border border-gray-300 rounded-apple px-3 py-2 text-gray-900 h-20 resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="flex gap-3">
                  {editingEntry && (
                    <Button
                      variant="ghost"
                      isLoading={isSavingEntry}
                      leftIcon={<Trash2 className="w-4 h-4" />}
                      className="text-red-600 hover:bg-red-50"
                      onClick={handleDeleteEntry}
                    >
                      Delete
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    className="flex-1"
                    onClick={closeEntryModal}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1"
                    isLoading={isSavingEntry}
                    onClick={handleSaveEntry}
                  >
                    {editingEntry ? 'Update Entry' : 'Save Entry'}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Connection to AI Planner */}
      <div className="glass-card bg-gradient-to-r from-indigo-600/10 to-purple-600/10 border-indigo-500/20">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-apple bg-indigo-500/20">
            <Sparkles className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-gray-900">Sleep-Aware Planning</h3>
            <p className="text-sm text-gray-700 mt-1">
              Your sleep data helps the AI Planner optimize your schedule. 
              {todayEntry && todayEntry.quality <= 2 && (
                <span className="text-orange-700"> Today: Consider lighter tasks due to low sleep quality.</span>
              )}
              {todayEntry && todayEntry.quality >= 4 && (
                <span className="text-green-700"> Today: Great sleep! Schedule demanding tasks in the morning.</span>
              )}
            </p>
            <div className="flex gap-2 mt-3">
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Sparkles className="w-4 h-4" />}
                onClick={() => navigate('/app/planner')}
              >
                Plan My Day
              </Button>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<BarChart3 className="w-4 h-4" />}
                onClick={() => navigate('/app/analytics')}
              >
                See Impact on Productivity
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
