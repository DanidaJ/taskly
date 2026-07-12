import { motion } from 'framer-motion';
import { format } from 'date-fns';
import {
  Clock,
  CalendarClock,
  Target,
  Edit2,
  Trash2,
  Check,
  Pause,
  Play,
  ListChecks,
} from 'lucide-react';
import { clsx } from 'clsx';
import { PriorityBadge } from '@/components/ui/Badge';
import ProjectPacingBadge from './ProjectPacingBadge';
import {
  computePacing,
  progressPercent,
  hoursRemaining,
  hoursPerDayNeeded,
  formatHours,
} from './projectHelpers';
import type { Project } from '@/services/api';

const PROGRESS_TONE: Record<string, string> = {
  on_track: 'bg-green-500',
  behind: 'bg-amber-500',
  at_risk: 'bg-red-500',
  none: 'bg-blue-500',
  completed: 'bg-green-500',
};

export default function ProjectCard({
  project,
  onEdit,
  onDelete,
  onPark,
  onComplete,
}: {
  project: Project;
  onEdit: (p: Project) => void;
  onDelete: (p: Project) => void;
  onPark: (p: Project) => void;
  onComplete: (p: Project) => void;
}) {
  const percent = progressPercent(project);
  const pacing = computePacing(project);
  const perDay = hoursPerDayNeeded(project);
  const isCompleted = project.status === 'completed';
  const isParked = project.status === 'parked';

  const doneSubtasks = project.subtasks.filter((s) => s.status === 'completed').length;
  const totalSubtasks = project.subtasks.length;

  const barTone = isCompleted
    ? PROGRESS_TONE.completed
    : pacing
    ? PROGRESS_TONE[pacing]
    : PROGRESS_TONE.none;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16 }}
      className={clsx('glass-card group', (isCompleted || isParked) && 'opacity-75')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 break-words">{project.name}</h3>
            <PriorityBadge priority={project.priority} />
            {isParked && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-200 text-gray-600">
                <Pause className="w-3 h-3" /> Parked
              </span>
            )}
            {isCompleted && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-500/20 text-green-600 border border-green-500/30">
                <Check className="w-3 h-3" /> Completed
              </span>
            )}
            {!isCompleted && pacing && <ProjectPacingBadge pacing={pacing} />}
          </div>

          {project.description && (
            <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap break-words line-clamp-2">
              {project.description}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1 shrink-0">
          <button
            onClick={() => onEdit(project)}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            title="Edit"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          {!isCompleted && (
            <button
              onClick={() => onPark(project)}
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              title={isParked ? 'Resume' : 'Park'}
            >
              {isParked ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
          )}
          {!isCompleted && (
            <button
              onClick={() => onComplete(project)}
              className="p-1.5 rounded-lg text-gray-500 hover:bg-green-50 hover:text-green-600 transition-colors"
              title="Mark complete"
            >
              <Check className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => onDelete(project)}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {formatHours(project.hours_completed)} / {formatHours(project.total_hours)}
          </span>
          <span className="font-medium text-gray-700">{percent}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
          <div
            className={clsx('h-full rounded-full transition-all', barTone)}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Meta row */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
        {!isCompleted && hoursRemaining(project) > 0 && (
          <span>{formatHours(hoursRemaining(project))} left</span>
        )}
        {project.deadline && (
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="w-3.5 h-3.5" />
            Due {format(new Date(`${project.deadline}T00:00:00`), 'MMM d')}
            {perDay && perDay > 0 && !isCompleted ? ` · ~${perDay}h/day` : ''}
          </span>
        )}
        {!project.deadline && project.weekly_hours_target && (
          <span className="inline-flex items-center gap-1">
            <Target className="w-3.5 h-3.5" />
            Target {formatHours(project.weekly_hours_target)}/week
          </span>
        )}
        {totalSubtasks > 0 && (
          <span className="inline-flex items-center gap-1">
            <ListChecks className="w-3.5 h-3.5" />
            {doneSubtasks}/{totalSubtasks} subtasks
          </span>
        )}
      </div>
    </motion.div>
  );
}
