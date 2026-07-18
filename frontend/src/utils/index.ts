import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${remainingMinutes}m`;
}

export function parseDuration(duration: string): number {
  if (!duration) {
    return 30;
  }

  const normalized = duration.trim().toLowerCase();
  const hhmmMatch = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmmMatch) {
    const hours = parseInt(hhmmMatch[1], 10);
    const minutes = parseInt(hhmmMatch[2], 10);
    return Math.max(1, hours * 60 + minutes);
  }

  let totalMinutes = 0;
  const hourMatches = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/g)];
  const minuteMatches = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)\b/g)];

  hourMatches.forEach((match) => {
    totalMinutes += Math.round(parseFloat(match[1]) * 60);
  });
  minuteMatches.forEach((match) => {
    totalMinutes += Math.round(parseFloat(match[1]));
  });

  if (totalMinutes > 0) {
    return Math.max(1, totalMinutes);
  }

  const plainNumberMatch = normalized.match(/\d+(?:\.\d+)?/);
  if (plainNumberMatch) {
    return Math.max(1, Math.round(parseFloat(plainNumberMatch[0])));
  }

  return 30;
}

export function buildFocusTaskUrl(
  task: { id: string; task_name?: string; suggested_duration?: string },
  options?: { autoStart?: boolean; date?: string }
): string {
  const params = new URLSearchParams();
  params.set('task', task.id);

  if (task.suggested_duration) {
    params.set('duration', task.suggested_duration);
  }

  if (task.task_name) {
    params.set('taskName', task.task_name);
  }

  if (options?.date) {
    params.set('date', options.date);
  }

  if (options?.autoStart ?? true) {
    params.set('autostart', '1');
  }

  return `/app/focus?${params.toString()}`;
}

export function generateId(prefix: string = 'id'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

export function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

export function getGreeting(): string {
  const timeOfDay = getTimeOfDay();
  const greetings = {
    morning: 'Good morning',
    afternoon: 'Good afternoon',
    evening: 'Good evening',
    night: 'Good night',
  };
  return greetings[timeOfDay];
}

export function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export type ManualTimingState = 'future' | 'ongoing' | 'past';

export interface ManualTiming {
  state: ManualTimingState;
  startDt: Date;
  endDt: Date;
}

/**
 * Classify a manually-scheduled task by its window relative to now (the device
 * clock, which is the user's real local time). Gates on the END, not the start:
 * a task whose start has passed but whose end is still ahead is legitimately
 * *ongoing*, not "in the past".
 *
 * The end is derived from start + duration (absolute ms), which is inherently
 * cross-midnight-safe — a 23:00 task + 2h ends at 01:00 the next day, and a
 * 23:30 task added at 23:40 is still 'ongoing' even though the clock rolled over.
 *
 *  - 'past'    : whole window already over (end <= now) — a pending task here is
 *                born missed; the caller should block it.
 *  - 'ongoing' : started but not finished (start <= now < end) — a real task
 *                entered late; the caller should create it in-progress.
 *  - 'future'  : hasn't started yet — normal.
 *
 * Returns null if the inputs are missing/unparseable (caller treats as no gate).
 */
export function classifyManualTiming(
  dateStr: string,
  startHHMM: string,
  durationMinutes: number,
  now: Date = new Date()
): ManualTiming | null {
  if (!dateStr || !startHHMM) return null;
  const startDt = new Date(`${dateStr}T${startHHMM}:00`);
  if (Number.isNaN(startDt.getTime())) return null;
  const dur = Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 30;
  const endDt = new Date(startDt.getTime() + dur * 60_000);

  let state: ManualTimingState;
  if (endDt.getTime() <= now.getTime()) state = 'past';
  else if (startDt.getTime() <= now.getTime()) state = 'ongoing';
  else state = 'future';

  return { state, startDt, endDt };
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural || `${singular}s`);
}
