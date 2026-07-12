import type { Project, ProjectSize } from '@/services/api';

export type Pacing = 'on_track' | 'behind' | 'at_risk';

// Representative total-hours value for each t-shirt size. Used when the user
// taps a size chip instead of typing an exact number.
export const SIZE_HOURS: Record<ProjectSize, number> = {
  XS: 3,
  S: 10,
  M: 25,
  L: 60,
  XL: 120,
};

export const SIZE_OPTIONS: Array<{ size: ProjectSize; label: string; range: string }> = [
  { size: 'XS', label: 'XS', range: '<5h' },
  { size: 'S', label: 'S', range: '5–15h' },
  { size: 'M', label: 'M', range: '15–40h' },
  { size: 'L', label: 'L', range: '40–100h' },
  { size: 'XL', label: 'XL', range: '100h+' },
];

export function sizeFromHours(hours: number): ProjectSize {
  if (hours < 5) return 'XS';
  if (hours < 15) return 'S';
  if (hours < 40) return 'M';
  if (hours < 100) return 'L';
  return 'XL';
}

export function hoursRemaining(p: Project): number {
  return Math.max(0, p.total_hours - p.hours_completed);
}

export function progressPercent(p: Project): number {
  if (!p.total_hours) return 0;
  return Math.min(100, Math.round((p.hours_completed / p.total_hours) * 100));
}

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Pacing only applies to deadline-driven projects. Compares actual hours done
 * against the linear expectation between created_at and the deadline, and also
 * checks raw feasibility (hours left vs days left).
 */
export function computePacing(p: Project): Pacing | null {
  if (!p.deadline) return null;
  const remaining = hoursRemaining(p);
  if (remaining <= 0) return 'on_track';

  const now = new Date();
  const deadline = new Date(`${p.deadline}T23:59:59`);
  const created = new Date(p.created_at);

  const daysLeft = daysBetween(now, deadline);
  if (daysLeft <= 0) return 'at_risk'; // past deadline with work left

  // Feasibility: needing more than a heavy workday every remaining day is risky.
  const neededPerDay = remaining / daysLeft;
  if (neededPerDay > 8) return 'at_risk';

  // Expectation: how much should be done by now on a straight line.
  const totalSpanMs = deadline.getTime() - created.getTime();
  const elapsedMs = now.getTime() - created.getTime();
  const fractionElapsed = totalSpanMs > 0 ? Math.min(1, Math.max(0, elapsedMs / totalSpanMs)) : 0;
  const expectedDone = p.total_hours * fractionElapsed;

  if (p.hours_completed >= expectedDone) return 'on_track';
  if (p.hours_completed >= expectedDone * 0.7) return 'behind';
  return 'at_risk';
}

export function hoursPerDayNeeded(p: Project): number | null {
  if (!p.deadline) return null;
  const remaining = hoursRemaining(p);
  const daysLeft = Math.max(1, daysBetween(new Date(), new Date(`${p.deadline}T23:59:59`)));
  return Math.round((remaining / daysLeft) * 10) / 10;
}

export function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}h` : `${rounded.toFixed(1)}h`;
}
