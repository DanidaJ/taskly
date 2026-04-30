import { CognitiveLoad, Priority } from '@/types';
import { clsx } from 'clsx';

interface BadgeProps {
  type: CognitiveLoad;
  className?: string;
}

export function CognitiveLoadBadge({ type, className }: BadgeProps) {
  const styles = {
    deep_focus: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    light_focus: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    admin: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    physical: 'bg-green-500/20 text-green-400 border-green-500/30',
    recovery: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  };

  const labels = {
    deep_focus: 'Deep Focus',
    light_focus: 'Light Focus',
    admin: 'Admin',
    physical: 'Physical',
    recovery: 'Recovery',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full border',
        styles[type],
        className
      )}
    >
      {labels[type]}
    </span>
  );
}

interface PriorityBadgeProps {
  priority: Priority;
  className?: string;
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const styles = {
    high: 'bg-red-500/20 text-red-400 border-red-500/30',
    medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    low: 'bg-green-500/20 text-green-400 border-green-500/30',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full border capitalize',
        styles[priority],
        className
      )}
    >
      {priority}
    </span>
  );
}

interface EffortIndicatorProps {
  effort: 1 | 2 | 3 | 4 | 5;
  showLabel?: boolean;
  className?: string;
}

export function EffortIndicator({
  effort,
  showLabel = false,
  className,
}: EffortIndicatorProps) {
  const colors = {
    1: 'bg-green-400',
    2: 'bg-lime-400',
    3: 'bg-amber-400',
    4: 'bg-orange-400',
    5: 'bg-red-400',
  };

  return (
    <div className={clsx('flex items-center gap-1.5', className)}>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((level) => (
          <div
            key={level}
            className={clsx(
              'w-2 h-2 rounded-full',
              level <= effort ? colors[effort] : 'bg-gray-200'
            )}
          />
        ))}
      </div>
      {showLabel && (
        <span className="text-xs text-gray-500">Effort: {effort}/5</span>
      )}
    </div>
  );
}
