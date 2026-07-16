import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { format, subDays } from 'date-fns';
import {
  BookOpen,
  Smile,
  Meh,
  Frown,
  Zap,
  Brain,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  Sparkles,
  Loader2,
  Moon,
  BarChart3,
  Clock,
} from 'lucide-react';
import { useTaskStore, useUserProfileStore, useAuthStore } from '@/stores';
import { DailyLog, DailyReflection } from '@/types';
import { Button, Textarea } from '@/components/ui';
import { aiService } from '@/services';
import { focusSessionService, sleepEntryService } from '@/services/api';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';

export default function Reflection() {
  const navigate = useNavigate();
  const [energyLevel, setEnergyLevel] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [focusLevel, setFocusLevel] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [notes, setNotes] = useState('');
  const [aiReflection, setAiReflection] = useState<DailyReflection | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [todayFocusMinutes, setTodayFocusMinutes] = useState(0);
  const [lastNightSleep, setLastNightSleep] = useState<{ duration: number; quality: number } | null>(null);

  const { plansByDate, loadPlanFromDatabase } = useTaskStore();
  const { addDailyLog } = useUserProfileStore();
  const { user } = useAuthStore();

  const today = format(new Date(), 'yyyy-MM-dd');

  // Ensure TODAY's plan is loaded. The shared store's flat `plannedTasks` list
  // can hold a whole date range (the calendar loads a week), so we read today's
  // tasks from plansByDate[today] instead — otherwise the summary counts past
  // days and only looks right after a reload clears the range.
  useEffect(() => {
    loadPlanFromDatabase(today);
  }, [today, loadPlanFromDatabase]);

  // Load today's data for context (backend only)
  useEffect(() => {
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');

    focusSessionService.getForDate(today)
      .then((sessions: any[]) => {
        const total = (sessions || [])
          .filter((s: any) => s.mode === 'focus' && s.completed)
          .reduce((acc: number, s: any) => acc + s.duration / 60, 0);
        setTodayFocusMinutes(Math.round(total));
      })
      .catch((error) => {
        console.error('Failed to load focus sessions:', error);
      });

    sleepEntryService.getAll(7)
      .then((entries: any[]) => {
        const lastSleep = (entries || []).find(
          (e: any) => e.date === yesterday || e.date === today
        );
        if (lastSleep) {
          setLastNightSleep({ duration: lastSleep.duration, quality: lastSleep.quality });
        }
      })
      .catch((error) => {
        console.error('Failed to load sleep entries:', error);
      });
  }, [today]);

  const todaysTasks = plansByDate[today]?.tasks ?? [];
  const completedTasks = todaysTasks.filter((t) => t.status === 'completed');
  const skippedTasks = todaysTasks.filter(
    (t) => t.status === 'skipped' || t.status === 'cancelled'
  );

  const handleGenerateReflection = async () => {
    setIsGenerating(true);
    try {
      const response = await aiService.getReflectionPrompts(
        completedTasks.map((t) => t.task_name),
        skippedTasks.map((t) => t.task_name),
        energyLevel,
        focusLevel
      );

      // The reflection endpoint returns { prompts, suggestions } only; the
      // what-worked / feedback lines are derived locally from today's actual data.
      const reflection: DailyReflection = {
        what_worked:
          completedTasks.length > 0
            ? [`Completed ${completedTasks.length} task${completedTasks.length > 1 ? 's' : ''}: ${completedTasks.slice(0, 3).map(t => t.task_name).join(', ')}`]
            : ['No tasks completed yet - tomorrow is a fresh start!'],
        what_didnt_work:
          skippedTasks.length > 0
            ? [`${skippedTasks.length} task${skippedTasks.length > 1 ? 's were' : ' was'} skipped: ${skippedTasks.slice(0, 2).map(t => t.task_name).join(', ')}`]
            : [],
        energy_feedback:
          energyLevel >= 4
            ? 'Great energy management today!'
            : energyLevel <= 2
              ? 'Low energy today. Consider more sleep or breaks tomorrow.'
              : 'Moderate energy. Try aligning demanding tasks with your peak hours.',
        focus_feedback:
          focusLevel >= 4
            ? `Excellent focus! You logged ${todayFocusMinutes} minutes of focused work.`
            : focusLevel <= 2
              ? 'Focus was challenging today. Try the Focus Timer for structured sessions.'
              : 'Decent focus. Consider blocking distractions during deep work.',
        suggestions: response?.suggestions?.length
          ? response.suggestions
          : [
              completedTasks.length < 3 ? 'Start with your most important task tomorrow' : 'Keep up the great momentum!',
              energyLevel <= 3 ? 'Try going to bed 30 minutes earlier' : 'Your energy patterns are working well',
            ].filter(Boolean),
      };

      setAiReflection(reflection);
      toast.success('Reflection generated!');
    } catch (error) {
      console.error('Error generating reflection:', error);
      // Generate reflection based on actual data when API fails
      setAiReflection({
        what_worked: completedTasks.length > 0 
          ? [`Completed ${completedTasks.length} task${completedTasks.length > 1 ? 's' : ''}`]
          : [],
        what_didnt_work: skippedTasks.length > 0 
          ? [`${skippedTasks.length} task${skippedTasks.length > 1 ? 's' : ''} not completed`]
          : [],
        energy_feedback: energyLevel >= 3 
          ? 'Your energy levels were adequate today.' 
          : 'Consider adjusting your sleep or break schedule.',
        focus_feedback: focusLevel >= 3 
          ? 'You maintained reasonable focus today.' 
          : 'Try using the Focus Timer for structured work sessions.',
        suggestions: [
          focusLevel < 4 ? 'Use the Focus Timer for better concentration' : null,
          energyLevel < 4 ? 'Log your sleep to track energy patterns' : null,
          'Check Analytics to see your productivity trends',
        ].filter(Boolean) as string[],
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveReflection = () => {
    const log: DailyLog = {
      id: `log-${Date.now()}`,
      user_id: user?.id || '',
      date: today,
      completed_tasks: completedTasks.map((t) => t.task_id),
      skipped_tasks: skippedTasks.map((t) => t.task_id),
      energy_level: energyLevel,
      focus_level: focusLevel,
      notes,
      reflection: aiReflection || undefined,
      created_at: new Date().toISOString(),
    };

    addDailyLog(log);
    toast.success('Daily reflection saved!');
    setNotes('');
    setAiReflection(null);
  };

  const getLevelIcon = (level: number) => {
    if (level <= 2) return Frown;
    if (level <= 3) return Meh;
    return Smile;
  };

  const EnergyIcon = getLevelIcon(energyLevel);
  const FocusIcon = getLevelIcon(focusLevel);

  // Sleep duration is stored in minutes. Round to whole hours turned 5h30m into
  // "6h"; show one decimal so a half-hour reads honestly (e.g. "5.5h").
  const formatSleepHours = (minutes: number) => {
    const h = minutes / 60;
    return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-apple-lg bg-gradient-to-br from-amber-500/20 to-orange-600/20">
          <BookOpen className="w-8 h-8 text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Daily Reflection</h1>
          <p className="text-gray-600 mt-1">
            Review your day and learn from your patterns
          </p>
        </div>
      </div>

      {/* Today's Summary */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card"
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Today's Summary
        </h2>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="flex items-center gap-3 p-4 rounded-apple bg-green-500/10 border border-green-500/20">
            <CheckCircle2 className="w-6 h-6 text-green-600" />
            <div>
              <p className="text-2xl font-bold text-green-600">
                {completedTasks.length}
              </p>
              <p className="text-sm text-gray-600">Completed</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 rounded-apple bg-red-500/10 border border-red-500/20">
            <XCircle className="w-6 h-6 text-red-600" />
            <div>
              <p className="text-2xl font-bold text-red-600">
                {skippedTasks.length}
              </p>
              <p className="text-sm text-gray-600">Skipped</p>
            </div>
          </div>

          {/* Connected Focus Data */}
          <div className="flex items-center gap-3 p-4 rounded-apple bg-blue-500/10 border border-blue-500/20">
            <Brain className="w-6 h-6 text-blue-600" />
            <div>
              <p className="text-2xl font-bold text-blue-600">
                {todayFocusMinutes > 0 ? `${Math.round(todayFocusMinutes)}m` : '0m'}
              </p>
              <p className="text-sm text-gray-600">Focus Time</p>
            </div>
          </div>

          {/* Connected Sleep Data */}
          <div className="flex items-center gap-3 p-4 rounded-apple bg-indigo-500/10 border border-indigo-500/20">
            <Moon className="w-6 h-6 text-indigo-600" />
            <div>
              <p className="text-2xl font-bold text-indigo-600">
                {lastNightSleep ? formatSleepHours(lastNightSleep.duration) : '—'}
              </p>
              <p className="text-sm text-gray-600">Last Sleep</p>
            </div>
          </div>
        </div>

        {/* Completed Tasks List */}
        {completedTasks.length > 0 && (
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Completed:</p>
            <div className="flex flex-wrap gap-2">
              {completedTasks.map((task) => (
                <span
                  key={task.id}
                  className="px-3 py-1 text-sm bg-green-500/10 text-green-700 rounded-full border border-green-200"
                >
                  {task.task_name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Skipped Tasks List */}
        {skippedTasks.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Skipped:</p>
            <div className="flex flex-wrap gap-2">
              {skippedTasks.map((task) => (
                <span
                  key={task.id}
                  className="px-3 py-1 text-sm bg-red-500/10 text-red-700 rounded-full border border-red-200"
                >
                  {task.task_name}
                </span>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* Energy & Focus Rating */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-card"
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          How did you feel today?
        </h2>

        {/* Energy Level */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-5 h-5 text-amber-600" />
            <span className="text-sm font-medium text-gray-700">Energy Level</span>
            <EnergyIcon className="w-5 h-5 text-gray-500 ml-auto" />
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((level) => (
              <button
                key={level}
                onClick={() => setEnergyLevel(level as 1 | 2 | 3 | 4 | 5)}
                className={clsx(
                  'flex-1 py-3 rounded-lg border text-sm font-medium transition-all',
                  energyLevel === level
                    ? 'border-amber-500 bg-amber-500/10 text-amber-700 font-semibold'
                    : 'border-gray-300 text-gray-600 hover:border-gray-400 bg-white/50'
                )}
              >
                {level}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Exhausted</span>
            <span>Energized</span>
          </div>
        </div>

        {/* Focus Level */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Brain className="w-5 h-5 text-purple-600" />
            <span className="text-sm font-medium text-gray-700">Focus Level</span>
            <FocusIcon className="w-5 h-5 text-gray-500 ml-auto" />
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((level) => (
              <button
                key={level}
                onClick={() => setFocusLevel(level as 1 | 2 | 3 | 4 | 5)}
                className={clsx(
                  'flex-1 py-3 rounded-lg border text-sm font-medium transition-all',
                  focusLevel === level
                    ? 'border-purple-500 bg-purple-500/10 text-purple-700 font-semibold'
                    : 'border-gray-300 text-gray-600 hover:border-gray-400 bg-white/50'
                )}
              >
                {level}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Distracted</span>
            <span>Laser Focused</span>
          </div>
        </div>
      </motion.div>

      {/* Notes */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass-card"
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Additional Notes
        </h2>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any thoughts about today? What could you improve tomorrow?"
          className="min-h-[100px]"
        />
      </motion.div>

      {/* AI Reflection */}
      {!aiReflection ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Button
            variant="primary"
            className="w-full"
            leftIcon={
              isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )
            }
            onClick={handleGenerateReflection}
            disabled={isGenerating}
          >
            {isGenerating ? 'Generating Insights...' : 'Generate AI Reflection'}
          </Button>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card bg-gradient-to-br from-blue-500/5 to-blue-700/5 border-blue-500/20"
        >
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            AI Insights
          </h2>

          {/* What Worked */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-700">What Worked</span>
            </div>
            <ul className="space-y-1">
              {aiReflection.what_worked.map((item, i) => (
                <li key={i} className="text-sm text-gray-700 pl-6">• {item}</li>
              ))}
            </ul>
          </div>

          {/* What Didn't Work */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-4 h-4 text-red-600" />
              <span className="text-sm font-medium text-red-700">Areas to Improve</span>
            </div>
            <ul className="space-y-1">
              {aiReflection.what_didnt_work.map((item, i) => (
                <li key={i} className="text-sm text-gray-700 pl-6">• {item}</li>
              ))}
            </ul>
          </div>

          {/* Feedback */}
          <div className="mb-4 p-3 rounded-lg bg-gray-50 border border-gray-200">
            <p className="text-sm text-gray-700">
              <strong className="text-amber-700">Energy:</strong> {aiReflection.energy_feedback}
            </p>
            <p className="text-sm text-gray-700 mt-2">
              <strong className="text-purple-700">Focus:</strong> {aiReflection.focus_feedback}
            </p>
          </div>

          {/* Suggestions */}
          <div>
            <p className="text-sm font-medium text-blue-700 mb-2">Suggestions for Tomorrow:</p>
            <ul className="space-y-1">
              {aiReflection.suggestions.map((item, i) => (
                <li key={i} className="text-sm text-gray-700 pl-6">• {item}</li>
              ))}
            </ul>
          </div>
        </motion.div>
      )}

      {/* Save Button */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Button
          variant="secondary"
          className="w-full"
          onClick={handleSaveReflection}
        >
          Save Daily Reflection
        </Button>
      </motion.div>
    </div>
  );
}
