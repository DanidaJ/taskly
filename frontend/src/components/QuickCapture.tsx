import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Send, Clock, Flag } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { useTaskStore } from '@/stores';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { planService } from '@/services/api';
import { format } from 'date-fns';

interface QuickCaptureProps {
  onClose?: () => void;
  isOpen: boolean;
}

export default function QuickCapture({ onClose, isOpen }: QuickCaptureProps) {
  const [taskName, setTaskName] = useState('');
  const [duration, setDuration] = useState('30');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [dueDate, setDueDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [scheduledTime, setScheduledTime] = useState(() => format(new Date(), 'HH:mm'));

  const inputRef = useRef<HTMLInputElement>(null);
  const { addTask, setPlannedTasks, plannedTasks, currentPlan, loadPlanFromDatabase, plansByDate } = useTaskStore();

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!taskName || taskName.length < 2) {
      toast.error('Please enter a task name');
      return;
    }

    try {
      const taskDescription = scheduledTime ? `Scheduled for ${scheduledTime}` : '';

      // Validate scheduled time is not in the past
      if (scheduledTime && dueDate) {
        const selectedDateTime = new Date(`${dueDate}T${scheduledTime}`);
        const now = new Date();

        if (selectedDateTime < now) {
          toast.error('Cannot schedule tasks in the past. Please select a future time.');
          return;
        }
      }

      // Parse scheduled time to start and end
      let scheduled_start: string | undefined;
      let scheduled_end: string | undefined;

      if (scheduledTime) {
        scheduled_start = scheduledTime;
        // Add duration to get end time
        const durationMinutes = parseInt(duration);
        const [hours, mins] = scheduledTime.split(':').map(Number);
        const endTimeMinutes = hours * 60 + mins + durationMinutes;
        const endHours = Math.floor(endTimeMinutes / 60) % 24;
        const endMins = endTimeMinutes % 60;
        scheduled_end = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
      }

      // Create a planned task directly (no separate task entry needed)
      const today = dueDate; // Use selected due date

      // Get existing tasks for THIS date only (not all tasks in store)
      const existingTasksForDate = currentPlan?.date === today ? plannedTasks : [];

      const plannedTaskEntry = {
        id: `planned-${Date.now()}`,
        task_id: '', // No separate task reference needed
        task_name: taskName,
        suggested_duration: `${duration} minutes`,
        priority: priority as 'low' | 'medium' | 'high',
        notes: taskDescription || undefined,
        scheduled_start,
        scheduled_end,
        status: 'pending' as const,
        order: existingTasksForDate.length,
      };

      // Create or update today's daily plan with only tasks for this date
      const planToSave = {
        date: today,
        is_ai_generated: false,
        tasks: [...existingTasksForDate, plannedTaskEntry],
      };

      const savedPlan = await planService.save(planToSave);

      // Update state immediately with the saved plan for instant UI update
      if (savedPlan) {
        // Update the main plannedTasks state
        setPlannedTasks(savedPlan.tasks);

        // Also update plansByDate for calendar view
        useTaskStore.setState((state) => ({
          currentPlan: savedPlan,
          plansByDate: {
            ...state.plansByDate,
            [today]: savedPlan,
          },
        }));
      } else {
        // Fallback: reload from database if save didn't return the plan
        await loadPlanFromDatabase(today);
      }

      toast.success('Task added!');
      setTaskName('');
      setDuration('30');
      setPriority('medium');
      setDueDate(format(new Date(), 'yyyy-MM-dd'));
      setScheduledTime(format(new Date(), 'HH:mm'));
      onClose?.();
    } catch (error) {
      console.error('Failed to add task:', error);
      toast.error('Failed to add task');
    }
  };

  // Keyboard shortcut to open (Cmd/Ctrl + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose?.();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Add Task Modal */}
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-xl z-50 px-4"
          >
            <div className="bg-dark-800 border border-dark-600 rounded-xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-dark-700">
                <div className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-primary-400" />
                  <span className="font-medium text-dark-100">Add Task</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-dark-400 bg-dark-700 px-2 py-1 rounded">
                    ⌘K
                  </span>
                  <button
                    onClick={onClose}
                    className="p-1 rounded hover:bg-dark-700 text-dark-400"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit}>
                <div className="p-4 space-y-4">
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
                      placeholder="Enter task name..."
                      className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* Duration */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      Estimated Duration (minutes)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="480"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
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

                  {/* Due Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      Due Date (Optional)
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* Scheduled Time */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Scheduled Time (Optional)
                      </div>
                    </label>
                    <input
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-500 mt-1">Set a specific time to schedule when this task should be done</p>
                  </div>
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
                    Add Task
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
