import type { AIPlanResponse } from '@/types';

/**
 * Pure layout math for the AI plan timeline. Kept separate from the React
 * component so the tricky bits — cross-midnight blocks, unparseable/missing
 * times, window scaling — can be unit-tested without a DOM.
 */

// Timeline sizing. pxPerMin is clamped so a 30-min plan doesn't collapse and a
// full-day plan doesn't produce a giant scrolling wall.
export const TARGET_HEIGHT = 260;
export const MIN_PX_PER_MIN = 0.5;
export const MAX_PX_PER_MIN = 1.4;
export const MIN_BLOCK_H = 30; // keep a label readable even for a 15-min block

export interface TimelineBlock {
  name: string;
  priority: string;
  startMin: number; // minutes since window's day-start (end rolled past 1440 if cross-midnight)
  endMin: number;
  startLabel: string; // "HH:MM"
  endLabel: string;
  notes?: string;
}

export interface UnscheduledItem {
  name: string;
  duration: string;
  priority: string;
}

export interface TimelineLayout {
  blocks: TimelineBlock[];
  unscheduled: UnscheduledItem[];
  windowStart: number;
  span: number;
  pxPerMin: number;
  hourTicks: number[];
  totalMin: number;
}

/** "HH:MM" → minutes since midnight, or null if missing/unparseable. */
export function toMinutes(hhmm?: string): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function fmtHourLabel(min: number): string {
  const h = Math.floor((((min % 1440) + 1440) % 1440) / 60);
  return `${String(h).padStart(2, '0')}:00`;
}

export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function computeTimeline(plan: AIPlanResponse): TimelineLayout {
  const blocks: TimelineBlock[] = [];
  const unscheduled: UnscheduledItem[] = [];

  for (const p of plan.plan || []) {
    const s = toMinutes(p.scheduled_start);
    let e = toMinutes(p.scheduled_end);
    if (s === null || e === null) {
      unscheduled.push({ name: p.task_name, duration: p.suggested_duration, priority: p.priority });
      continue;
    }
    // Cross-midnight block (e.g. 22:00 → 01:00): roll the end into the next day
    // so height math stays positive.
    if (e <= s) e += 1440;
    blocks.push({
      name: p.task_name,
      priority: p.priority,
      startMin: s,
      endMin: e,
      startLabel: (p.scheduled_start as string).slice(0, 5),
      endLabel: (p.scheduled_end as string).slice(0, 5),
      notes: p.notes || undefined,
    });
  }

  if (blocks.length === 0) {
    return { blocks, unscheduled, windowStart: 0, span: 0, pxPerMin: 1, hourTicks: [], totalMin: 0 };
  }

  // Snap the visible window to the half-hour around the plan so ticks land clean.
  const minStart = Math.min(...blocks.map((b) => b.startMin));
  const maxEnd = Math.max(...blocks.map((b) => b.endMin));
  const windowStart = Math.floor(minStart / 30) * 30;
  const windowEnd = Math.ceil(maxEnd / 30) * 30;
  const span = Math.max(30, windowEnd - windowStart);
  const pxPerMin = clamp(TARGET_HEIGHT / span, MIN_PX_PER_MIN, MAX_PX_PER_MIN);

  // Hourly tick lines within the window.
  const hourTicks: number[] = [];
  for (let t = Math.ceil(windowStart / 60) * 60; t <= windowEnd; t += 60) hourTicks.push(t);

  const totalMin = blocks.reduce((acc, b) => acc + (b.endMin - b.startMin), 0);

  return { blocks, unscheduled, windowStart, span, pxPerMin, hourTicks, totalMin };
}
