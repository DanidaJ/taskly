export type TaskVisualTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface TaskLifecycleLike {
  status?: string;
  scheduled_start?: string;
  scheduled_end?: string;
  actual_start?: string;
  actual_end?: string;
  notes?: string;
  start_type?: string;
  minutes_offset?: number;
}

export interface TaskBadge {
  label: string;
  tone: TaskVisualTone;
}

export interface TaskLifecycleTimeline {
  scheduledWindow: string;
  startedAt: string;
  endedAt: string;
  completionState: string;
  actualDuration?: string;
}

const HH_MM_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;

const STATUS_BADGES: Record<string, TaskBadge> = {
  pending: { label: 'Pending', tone: 'neutral' },
  in_progress: { label: 'In Progress', tone: 'info' },
  completed: { label: 'Completed', tone: 'success' },
  missed: { label: 'Missed', tone: 'warning' },
  skipped: { label: 'Skipped', tone: 'warning' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};

function parseDateish(value?: string): Date | null {
  if (!value) return null;

  if (HH_MM_PATTERN.test(value)) {
    const [hours, minutes] = value.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function formatDateTime(date: Date, includeDate: boolean): string {
  if (includeDate) {
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatTaskTime(
  value?: string,
  options?: { includeDate?: boolean; fallback?: string }
): string {
  const fallback = options?.fallback ?? 'Not set';
  const parsed = parseDateish(value);
  if (!parsed) {
    return fallback;
  }

  return formatDateTime(parsed, options?.includeDate ?? false);
}

function getOffsetMinutes(task: TaskLifecycleLike): number {
  return typeof task.minutes_offset === 'number' ? task.minutes_offset : 0;
}

export function getTaskStatusBadge(status?: string): TaskBadge {
  if (!status) {
    return { label: 'Unknown', tone: 'neutral' };
  }

  return STATUS_BADGES[status] ?? {
    label: status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
    tone: 'neutral',
  };
}

export function getTaskStartBadge(task: TaskLifecycleLike): TaskBadge | null {
  const offset = getOffsetMinutes(task);

  if (task.start_type === 'early') {
    const minutes = offset < 0 ? Math.abs(offset) : Math.abs(offset);
    return {
      label: minutes > 0 ? `Early Start (${minutes}m)` : 'Early Start',
      tone: 'info',
    };
  }

  if (task.start_type === 'delayed') {
    const minutes = offset > 0 ? offset : Math.abs(offset);
    return {
      label: minutes > 0 ? `Expired Start (${minutes}m late)` : 'Expired Start',
      tone: 'warning',
    };
  }

  if (task.start_type === 'on_time') {
    return {
      label: 'On-time Start',
      tone: 'success',
    };
  }

  if (offset < 0) {
    return {
      label: `Early Start (${Math.abs(offset)}m)`,
      tone: 'info',
    };
  }

  if (offset > 0) {
    return {
      label: `Late Start (${offset}m)`,
      tone: 'warning',
    };
  }

  if (task.actual_start) {
    return {
      label: 'Started',
      tone: 'info',
    };
  }

  return null;
}

function getCompletionState(task: TaskLifecycleLike): string {
  switch (task.status) {
    case 'completed':
      if (parseTimerNote(task)) {
        return 'Completed after timer expiry and reschedule';
      }
      if (task.start_type === 'delayed') {
        return 'Completed after an expired start';
      }
      if (task.start_type === 'early') {
        return 'Completed after an early start';
      }
      return 'Completed';
    case 'in_progress':
      return 'Currently in progress';
    case 'missed':
      if (task.actual_start && task.actual_end) {
        return 'Timer went off - incomplete, reschedule required';
      }
      return 'Missed scheduled window';
    case 'skipped':
      return 'Skipped';
    case 'cancelled':
      return 'Cancelled';
    case 'pending':
    default:
      return 'Awaiting start';
  }
}

function parseTimerNote(task: TaskLifecycleLike): string | null {
  if (!task.notes) return null;

  const timerLine = task.notes
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.toLowerCase().startsWith('timer note:'));

  if (!timerLine) return null;

  const reasonMatch = timerLine.match(/reason:\s*(.+)$/i);
  if (!reasonMatch) return null;

  const reason = reasonMatch[1]?.trim();
  return reason || null;
}

export function getTaskUserNotes(task: TaskLifecycleLike): string | null {
  if (!task.notes) return null;

  const cleaned = task.notes
    .split('\n')
    .filter((line) => !line.trim().toLowerCase().startsWith('timer note:'))
    .join('\n')
    .trim();

  return cleaned || null;
}

export function getTaskTimerBadge(task: TaskLifecycleLike): TaskBadge | null {
  if (task.status === 'missed' && task.actual_start && task.actual_end) {
    return {
      label: 'Timer Went Off',
      tone: 'warning',
    };
  }

  if (task.status === 'completed' && task.actual_start && task.actual_end) {
    const timerReason = parseTimerNote(task);
    if (timerReason) {
      return {
        label: 'Completed After Timer',
        tone: 'success',
      };
    }
  }

  return null;
}

export function getTaskTimerReason(task: TaskLifecycleLike): string | null {
  return parseTimerNote(task);
}

function getActualDuration(task: TaskLifecycleLike): string | undefined {
  const started = parseDateish(task.actual_start);
  const ended = parseDateish(task.actual_end);

  if (!started || !ended) {
    return undefined;
  }

  const diffMs = ended.getTime() - started.getTime();
  if (diffMs <= 0) {
    return undefined;
  }

  const totalMinutes = Math.round(diffMs / 60000);
  if (totalMinutes < 60) {
    return `${totalMinutes}m actual`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m actual` : `${hours}h actual`;
}

export function getTaskLifecycleTimeline(
  task: TaskLifecycleLike,
  options?: { includeDateTime?: boolean }
): TaskLifecycleTimeline {
  let scheduledWindow = 'Not scheduled yet';

  if (task.scheduled_start && task.scheduled_end) {
    scheduledWindow = `${formatTaskTime(task.scheduled_start)} - ${formatTaskTime(task.scheduled_end)}`;
  } else if (task.scheduled_start) {
    scheduledWindow = `Starts ${formatTaskTime(task.scheduled_start)}`;
  } else if (task.scheduled_end) {
    scheduledWindow = `Ends ${formatTaskTime(task.scheduled_end)}`;
  }

  const includeDateTime = options?.includeDateTime ?? false;

  return {
    scheduledWindow,
    startedAt: task.actual_start ? formatTaskTime(task.actual_start, { includeDate: includeDateTime }) : 'Not started',
    endedAt: task.actual_end ? formatTaskTime(task.actual_end, { includeDate: includeDateTime }) : 'Not finished',
    completionState: getCompletionState(task),
    actualDuration: getActualDuration(task),
  };
}

export function getTaskBadgeClasses(tone: TaskVisualTone): string {
  switch (tone) {
    case 'success':
      return 'bg-green-100 text-green-700 border border-green-200';
    case 'info':
      return 'bg-blue-100 text-blue-700 border border-blue-200';
    case 'warning':
      return 'bg-amber-100 text-amber-700 border border-amber-200';
    case 'danger':
      return 'bg-red-100 text-red-700 border border-red-200';
    case 'neutral':
    default:
      return 'bg-gray-100 text-gray-700 border border-gray-200';
  }
}
