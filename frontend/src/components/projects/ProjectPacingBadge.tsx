import { clsx } from 'clsx';
import { CheckCircle2, AlertTriangle, TrendingDown } from 'lucide-react';
import type { Pacing } from './projectHelpers';

const CONFIG: Record<Pacing, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  on_track: {
    label: 'On track',
    className: 'bg-green-500/20 text-green-600 border-green-500/30',
    Icon: CheckCircle2,
  },
  behind: {
    label: 'Behind',
    className: 'bg-amber-500/20 text-amber-600 border-amber-500/30',
    Icon: TrendingDown,
  },
  at_risk: {
    label: 'At risk',
    className: 'bg-red-500/20 text-red-600 border-red-500/30',
    Icon: AlertTriangle,
  },
};

export default function ProjectPacingBadge({
  pacing,
  className,
}: {
  pacing: Pacing;
  className?: string;
}) {
  const { label, className: tone, Icon } = CONFIG[pacing];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full border',
        tone,
        className
      )}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}
