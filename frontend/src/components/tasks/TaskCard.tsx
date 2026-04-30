import { motion } from 'framer-motion';
import { GripVertical, Trash2, Edit2, Clock, CheckCircle2 } from 'lucide-react';
import { Task, PlannedTask } from '@/types';
import { CognitiveLoadBadge, PriorityBadge, EffortIndicator } from '@/components/ui';
import { clsx } from 'clsx';

interface TaskCardProps {
  task: Task;
  plannedInfo?: PlannedTask;
  onEdit?: () => void;
  onDelete?: () => void;
  onStatusChange?: (status: PlannedTask['status']) => void;
  isDraggable?: boolean;
  className?: string;
}

export default function TaskCard({
  task,
  plannedInfo,
  onEdit,
  onDelete,
  onStatusChange,
  isDraggable = false,
  className,
}: TaskCardProps) {
  const isCompleted = plannedInfo?.status === 'completed';
  const isInProgress = plannedInfo?.status === 'in_progress';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={clsx(
        'card-hover group',
        isCompleted && 'opacity-60',
        className
      )}
    >
      <div className="flex items-start gap-3">
        {isDraggable && (
          <div className="flex-shrink-0 pt-1 cursor-grab text-gray-400 hover:text-gray-600">
            <GripVertical className="w-5 h-5" />
          </div>
        )}

        {/* Status checkbox */}
        {plannedInfo && onStatusChange && (
          <button
            onClick={() =>
              onStatusChange(isCompleted ? 'pending' : 'completed')
            }
            className={clsx(
              'flex-shrink-0 mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors',
              isCompleted
                ? 'bg-green-500 border-green-500'
                : 'border-gray-400 hover:border-blue-500'
            )}
          >
            {isCompleted && <CheckCircle2 className="w-4 h-4 text-white" />}
          </button>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <h3
                className={clsx(
                  'text-base font-medium text-gray-900',
                  isCompleted && 'line-through text-gray-500'
                )}
              >
                {task.name}
              </h3>
              {task.description && (
                <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                  {task.description}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {onEdit && (
                <button
                  onClick={onEdit}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={onDelete}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-gray-100"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <CognitiveLoadBadge type={task.type} />
            {plannedInfo && <PriorityBadge priority={plannedInfo.priority} />}
            <EffortIndicator effort={task.estimated_effort} />
            
            {plannedInfo?.suggested_duration && (
              <div className="flex items-center gap-1 text-xs text-gray-600">
                <Clock className="w-3.5 h-3.5" />
                {plannedInfo.suggested_duration}
              </div>
            )}

            {task.flexibility === 'fixed' && (
              <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                Fixed
              </span>
            )}
          </div>

          {/* Notes */}
          {plannedInfo?.notes && (
            <p className="mt-2 text-xs text-gray-600 italic">
              💡 {plannedInfo.notes}
            </p>
          )}

          {/* Tags */}
          {task.tags && task.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {task.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
