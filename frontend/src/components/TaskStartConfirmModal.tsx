import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Clock, CheckCircle2, Play, X } from 'lucide-react';
import { format } from 'date-fns';
import { PlannedTask, TaskStartType } from '@/types';
import { useEffect, useCallback } from 'react';

export interface StartContext {
  type: TaskStartType;
  minutesOffset: number; // negative = early (minutes before start), positive = late (minutes after end)
}

/**
 * Returns the timing context for starting a task right now.
 *
 * Rules:
 *   - delayed: now is AFTER scheduled_end (+ 0 grace)
 *   - early:   now is more than 5 min BEFORE scheduled_start
 *   - on_time: anything else (includes the 5-min "grace" window before start)
 */
export function getStartContext(task: PlannedTask, taskDate?: string | null): StartContext {
  if (!task.scheduled_start || !task.scheduled_end) {
    return { type: 'on_time', minutesOffset: 0 };
  }

  const now = new Date();
  const dateStr = taskDate || format(now, 'yyyy-MM-dd');

  const [sH, sM] = task.scheduled_start.split(':').map(Number);
  const [eH, eM] = task.scheduled_end.split(':').map(Number);

  const scheduledStart = new Date(dateStr);
  scheduledStart.setHours(sH, sM, 0, 0);

  const scheduledEnd = new Date(dateStr);
  scheduledEnd.setHours(eH, eM, 0, 0);

  if (now > scheduledEnd) {
    const minutesLate = Math.round((now.getTime() - scheduledEnd.getTime()) / 60000);
    return { type: 'delayed', minutesOffset: minutesLate };
  }

  const minutesBeforeStart = (scheduledStart.getTime() - now.getTime()) / 60000;
  if (minutesBeforeStart > 5) {
    return { type: 'early', minutesOffset: -Math.round(minutesBeforeStart) };
  }

  return { type: 'on_time', minutesOffset: 0 };
}

function formatOffset(minutes: number): string {
  const abs = Math.abs(minutes);
  if (abs >= 60) {
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${abs}m`;
}

interface TaskStartConfirmModalProps {
  isOpen: boolean;
  task: PlannedTask;
  taskDate?: string | null;
  onConfirm: (context: StartContext) => void;
  onCancel: () => void;
}

export default function TaskStartConfirmModal({
  isOpen,
  task,
  taskDate,
  onConfirm,
  onCancel,
}: TaskStartConfirmModalProps) {
  const context = getStartContext(task, taskDate);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    },
    [onCancel]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, handleEscape]);

  const config = {
    delayed: {
      icon: <AlertTriangle className="w-7 h-7 text-orange-500" />,
      headerBg: 'bg-orange-50 border-orange-200',
      badge: (
        <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-semibold">
          Expired — {formatOffset(context.minutesOffset)} late
        </span>
      ),
      title: 'Task Window Expired',
      message: (
        <>
          The scheduled window for{' '}
          <span className="font-semibold">"{task.task_name}"</span> ended{' '}
          <span className="font-semibold text-orange-700">{formatOffset(context.minutesOffset)}</span> ago.
          Starting now will be logged as a <span className="font-semibold">delayed start</span>.
        </>
      ),
      note: '⚠ Your productivity score for this task will be reduced — it was already missed in its scheduled window.',
      noteClass: 'bg-orange-50 border border-orange-200 text-orange-800',
      confirmClass: 'bg-orange-500 hover:bg-orange-600 text-white',
      confirmLabel: 'Start Anyway',
    },
    early: {
      icon: <Clock className="w-7 h-7 text-blue-500" />,
      headerBg: 'bg-blue-50 border-blue-200',
      badge: (
        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
          {formatOffset(context.minutesOffset)} early
        </span>
      ),
      title: 'Starting Early',
      message: (
        <>
          You're starting{' '}
          <span className="font-semibold text-blue-700">{formatOffset(context.minutesOffset)}</span>{' '}
          before the scheduled time of{' '}
          <span className="font-medium">{task.scheduled_start}</span> for{' '}
          <span className="font-semibold">"{task.task_name}"</span>.
        </>
      ),
      note: '✓ Your early start time will be recorded.',
      noteClass: 'bg-blue-50 border border-blue-200 text-blue-800',
      confirmClass: 'bg-blue-500 hover:bg-blue-600 text-white',
      confirmLabel: 'Start Early',
    },
    on_time: {
      icon: <CheckCircle2 className="w-7 h-7 text-green-500" />,
      headerBg: 'bg-green-50 border-green-200',
      badge: (
        <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
          On Time
        </span>
      ),
      title: "Ready to Start?",
      message: (
        <>
          You're right on time for{' '}
          <span className="font-semibold">"{task.task_name}"</span>.
          {task.scheduled_start && task.scheduled_end && (
            <>
              {' '}Scheduled{' '}
              <span className="font-medium">{task.scheduled_start} – {task.scheduled_end}</span>
              {' '}({task.suggested_duration}).
            </>
          )}
        </>
      ),
      note: '✓ Your start time will be recorded.',
      noteClass: 'bg-green-50 border border-green-200 text-green-800',
      confirmClass: 'bg-green-500 hover:bg-green-600 text-white',
      confirmLabel: "Let's Go",
    },
  } as const;

  const c = config[context.type];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onCancel}
          />

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: 'spring', duration: 0.28 }}
            className="relative w-full max-w-sm bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
          >
            {/* Coloured top bar */}
            <div className={`px-5 py-4 border-b ${c.headerBg} flex items-start gap-3`}>
              <div className="flex-shrink-0 mt-0.5">{c.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-bold text-gray-900">{c.title}</h3>
                  {c.badge}
                </div>
                <p className="text-xs text-gray-500 truncate">
                  {task.suggested_duration}
                  {task.scheduled_start && task.scheduled_end &&
                    ` · ${task.scheduled_start} – ${task.scheduled_end}`}
                </p>
              </div>
              <button
                onClick={onCancel}
                className="flex-shrink-0 text-gray-400 hover:text-gray-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-gray-700 leading-relaxed">{c.message}</p>
              <p className={`text-xs rounded-lg px-3 py-2 ${c.noteClass}`}>{c.note}</p>
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => onConfirm(context)}
                className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${c.confirmClass}`}
              >
                <Play className="w-3.5 h-3.5" />
                {c.confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
