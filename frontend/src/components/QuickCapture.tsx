import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Send, Calendar, Inbox, AlertTriangle } from 'lucide-react';
import { DatePicker, TimePicker } from '@/components/ui';
import { useTaskStore, useBacklogStore } from '@/stores';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { planService } from '@/services/api';
import { classifyManualTiming } from '@/utils';
import { format } from 'date-fns';

interface QuickCaptureProps {
  onClose?: () => void;
  isOpen: boolean;
}

type CaptureMode = 'schedule' | 'backlog';

const DURATION_PRESETS = [
  { label: '15m', value: '15' },
  { label: '30m', value: '30' },
  { label: '1h', value: '60' },
  { label: '1.5h', value: '90' },
  { label: '2h', value: '120' },
];

export default function QuickCapture({ onClose, isOpen }: QuickCaptureProps) {
  const [mode, setMode] = useState<CaptureMode>('schedule');
  const [taskName, setTaskName] = useState('');
  const [duration, setDuration] = useState('60');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [dueDate, setDueDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [scheduledTime, setScheduledTime] = useState(() => format(new Date(), 'HH:mm'));
  const [ongoingConfirm, setOngoingConfirm] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const { currentPlan, plansByDate, loadPlanFromDatabase } = useTaskStore();
  const addBacklogItem = useBacklogStore((s) => s.addItem);

  // Reset form and refresh time whenever the modal opens
  useEffect(() => {
    if (isOpen) {
      setMode('schedule');
      setTaskName('');
      setDuration('60');
      setPriority('medium');
      setDueDate(format(new Date(), 'yyyy-MM-dd'));
      setScheduledTime(format(new Date(), 'HH:mm'));
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Build + save the scheduled task with the given status. 'in_progress' is used
  // for a task that's already underway (start passed, end still ahead).
  const createScheduledTask = async (status: 'pending' | 'in_progress') => {
    let scheduled_start: string | undefined;
    let scheduled_end: string | undefined;

    if (scheduledTime) {
      scheduled_start = scheduledTime;
      const durationMinutes = parseInt(duration) || 60;
      const [hours, mins] = scheduledTime.split(':').map(Number);
      const endTimeMinutes = hours * 60 + mins + durationMinutes;
      const endHours = Math.floor(endTimeMinutes / 60) % 24;
      const endMins = endTimeMinutes % 60;
      scheduled_end = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
    }

    const today = dueDate;
    const existingTasksForDate = plansByDate[today]?.tasks ||
      (currentPlan?.date === today ? currentPlan.tasks || [] : []);

    const plannedTaskEntry = {
      id: `planned-${Date.now()}`,
      task_id: '',
      task_name: taskName,
      suggested_duration: `${duration} minutes`,
      priority: priority as 'low' | 'medium' | 'high',
      notes: undefined,
      scheduled_start,
      scheduled_end,
      status,
      order: existingTasksForDate.length,
    };

    const planToSave = {
      date: today,
      is_ai_generated: false,
      tasks: [...existingTasksForDate, plannedTaskEntry],
    };

    const savedPlan = await planService.save(planToSave);

    if (savedPlan) {
      useTaskStore.setState((state) => {
        const updatedPlansByDate = {
          ...state.plansByDate,
          [today]: savedPlan,
        };
        const allTasks = Object.values(updatedPlansByDate).flatMap((plan) => plan.tasks || []);
        return {
          currentPlan: savedPlan,
          plansByDate: updatedPlansByDate,
          plannedTasks: allTasks,
        };
      });
    } else {
      await loadPlanFromDatabase(today);
    }

    toast.success(status === 'in_progress' ? 'Task added — marked in progress.' : 'Task added!');
    onClose?.();
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!taskName || taskName.length < 2) {
      toast.error('Please enter a task name');
      return;
    }

    try {
      if (mode === 'backlog') {
        const created = await addBacklogItem({
          name: taskName,
          estimated_minutes: parseInt(duration) || 60,
          priority,
        });
        if (created) {
          toast.success('Added to backlog');
          onClose?.();
        } else {
          toast.error('Failed to add to backlog');
        }
        return;
      }

      // Gate on the task's window (computed fresh at submit time). A slot that's
      // entirely in the past is born missed → block it. A task that's still
      // running needs an explicit "add as in-progress" confirmation.
      const t = classifyManualTiming(dueDate, scheduledTime, parseInt(duration, 10) || 60);
      if (t?.state === 'past') {
        toast.error("That time slot has already ended. Pick a time that isn't fully in the past, or add it to your backlog.");
        return;
      }
      if (t?.state === 'ongoing') {
        setOngoingConfirm(true);
        return;
      }

      await createScheduledTask('pending');
    } catch (error) {
      console.error('Failed to add task:', error);
      toast.error('Failed to add task');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Live classification for the form hint (recomputed each render).
  const liveTiming =
    mode === 'schedule'
      ? classifyManualTiming(dueDate, scheduledTime, parseInt(duration, 10) || 60)
      : null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-[12%] left-1/2 -translate-x-1/2 w-full max-w-xl z-50 px-4"
          >
            <div className="bg-dark-800/80 backdrop-blur-xl border border-dark-600/60 rounded-xl shadow-2xl overflow-visible">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-dark-700/60">
                <div className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-primary-400" />
                  <span className="font-medium text-dark-100">Quick Add Task</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-dark-400 bg-dark-700 px-2 py-1 rounded">⌘K</span>
                  <button onClick={onClose} className="p-1 rounded hover:bg-dark-700 text-dark-400">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="p-4 space-y-4">
                  {/* Mode toggle */}
                  <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setMode('schedule')}
                      className={clsx(
                        'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                        mode === 'schedule'
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      )}
                    >
                      <Calendar className="w-4 h-4" />
                      Schedule now
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('backlog')}
                      className={clsx(
                        'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                        mode === 'backlog'
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      )}
                    >
                      <Inbox className="w-4 h-4" />
                      Add to backlog
                    </button>
                  </div>

                  {/* Task Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      Task Name *
                    </label>
                    <input
                      ref={inputRef}
                      type="text"
                      value={taskName}
                      onChange={(e) => setTaskName(e.target.value)}
                      placeholder={
                        mode === 'schedule'
                          ? 'e.g. Meeting with team, Call dentist…'
                          : 'e.g. Finish personal project, Read book…'
                      }
                      className="w-full h-11 bg-white border border-gray-300 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* Schedule-only: Time + Date */}
                  {mode === 'schedule' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <TimePicker
                          label="Start Time"
                          value={scheduledTime}
                          onChange={setScheduledTime}
                        />
                        {liveTiming?.state === 'past' && (
                          <p className="text-xs text-red-600 mt-1">
                            This whole time slot has already passed.
                          </p>
                        )}
                        {liveTiming?.state === 'ongoing' && (
                          <p className="text-xs text-amber-600 mt-1">
                            Already underway — it'll be added as in-progress.
                          </p>
                        )}
                      </div>
                      <div>
                        <DatePicker
                          label="Date"
                          value={dueDate}
                          onChange={setDueDate}
                        />
                      </div>
                    </div>
                  )}

                  {/* Duration */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      {mode === 'backlog' ? 'Estimated duration' : 'Duration'}
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {DURATION_PRESETS.map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => setDuration(p.value)}
                          className={clsx(
                            'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                            duration === p.value
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          )}
                        >
                          {p.label}
                        </button>
                      ))}
                      <input
                        type="number"
                        min="1"
                        max="480"
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        className="w-20 h-8 bg-white border border-gray-300 rounded-lg px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="min"
                      />
                    </div>
                  </div>

                  {/* Priority */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      Priority
                    </label>
                    <div className="flex gap-2">
                      {(['low', 'medium', 'high'] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPriority(p)}
                          className={clsx(
                            'flex-1 py-2 px-3 rounded-lg font-medium transition-colors',
                            priority === p
                              ? p === 'high'
                                ? 'bg-red-500 text-white'
                                : p === 'medium'
                                  ? 'bg-yellow-500 text-white'
                                  : 'bg-green-500 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          )}
                        >
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Mode hint */}
                  {mode === 'backlog' && (
                    <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                      Backlog items have no date. You can schedule them later from the Backlog page.
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!taskName || taskName.length < 2}
                    className={clsx(
                      'flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors',
                      taskName && taskName.length >= 2
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    )}
                  >
                    <Send className="w-4 h-4" />
                    {mode === 'backlog' ? 'Add to Backlog' : 'Add Task'}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>

          {/* Ongoing-task confirmation — clearly warn before creating in-progress */}
          {ongoingConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60"
              onClick={() => setOngoingConfirm(false)}
            >
              <div
                className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                  <h3 className="font-semibold text-gray-900">This task is already underway</h3>
                </div>
                <p className="text-sm text-gray-700">
                  Its start time (<strong>{scheduledTime}</strong>) has already passed, but it's
                  still within its {duration}-minute window. It'll be added as{' '}
                  <strong>in&nbsp;progress</strong> (running now) so you can finish or complete it.
                </p>
                <div className="mt-4 flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setOngoingConfirm(false)}
                    className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setOngoingConfirm(false);
                      try {
                        await createScheduledTask('in_progress');
                      } catch (error) {
                        console.error('Failed to add task:', error);
                        toast.error('Failed to add task');
                      }
                    }}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  >
                    Add as in-progress
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}
