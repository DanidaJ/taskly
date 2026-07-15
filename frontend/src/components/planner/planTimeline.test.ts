import { describe, it, expect } from 'vitest';
import { computeTimeline, toMinutes, fmtDuration, fmtHourLabel } from './planTimeline';
import type { AIPlanResponse } from '@/types';

const base: AIPlanResponse = { tasks: [], plan: [], recommendations: [] };

const mk = (plan: AIPlanResponse['plan']): AIPlanResponse => ({ ...base, plan });

describe('toMinutes', () => {
  it('parses HH:MM', () => {
    expect(toMinutes('07:00')).toBe(420);
    expect(toMinutes('17:30')).toBe(1050);
    expect(toMinutes('00:00')).toBe(0);
  });
  it('rejects missing / malformed / out-of-range', () => {
    expect(toMinutes(undefined)).toBeNull();
    expect(toMinutes('')).toBeNull();
    expect(toMinutes('nope')).toBeNull();
    expect(toMinutes('25:00')).toBeNull();
    expect(toMinutes('12:75')).toBeNull();
  });
});

describe('fmtDuration', () => {
  it('formats hours and minutes', () => {
    expect(fmtDuration(180)).toBe('3h');
    expect(fmtDuration(90)).toBe('1h 30m');
    expect(fmtDuration(45)).toBe('45m');
  });
});

describe('computeTimeline — normal plan', () => {
  const layout = computeTimeline(
    mk([{ task_name: 'finish taskly project', suggested_duration: '180 minutes', priority: 'medium', scheduled_start: '17:30', scheduled_end: '20:30' }]),
  );

  it('produces one positioned block with correct minutes', () => {
    expect(layout.blocks).toHaveLength(1);
    expect(layout.blocks[0].startMin).toBe(1050);
    expect(layout.blocks[0].endMin).toBe(1230);
    expect(layout.blocks[0].startLabel).toBe('17:30');
  });
  it('snaps window to the half hour and totals duration', () => {
    expect(layout.windowStart).toBe(1050);
    expect(layout.span).toBe(180);
    expect(layout.totalMin).toBe(180);
  });
  it('emits hourly ticks inside the window', () => {
    expect(layout.hourTicks).toEqual([1080, 1140, 1200]); // 18:00, 19:00, 20:00
    expect(fmtHourLabel(1080)).toBe('18:00');
  });
});

describe('computeTimeline — cross-midnight block (the key regression guard)', () => {
  const layout = computeTimeline(
    mk([{ task_name: 'late night session', suggested_duration: '3 hours', priority: 'high', scheduled_start: '22:00', scheduled_end: '01:00' }]),
  );
  it('rolls the end past midnight so height stays positive', () => {
    expect(layout.blocks[0].startMin).toBe(1320);
    expect(layout.blocks[0].endMin).toBe(1500); // 01:00 next day, not 60
    expect(layout.blocks[0].endMin - layout.blocks[0].startMin).toBe(180);
  });
  it('labels the wrapped tick correctly', () => {
    expect(fmtHourLabel(1440)).toBe('00:00');
    expect(fmtHourLabel(1500)).toBe('01:00');
  });
});

describe('computeTimeline — unschedulable tasks', () => {
  it('routes missing/malformed times to the couldn\'t-fit list, not the timeline', () => {
    const layout = computeTimeline(
      mk([
        { task_name: 'placed', suggested_duration: '1 hour', priority: 'medium', scheduled_start: '09:00', scheduled_end: '10:00' },
        { task_name: 'no times', suggested_duration: '45 minutes', priority: 'low' },
        { task_name: 'bad time', suggested_duration: '30 minutes', priority: 'low', scheduled_start: '99:99', scheduled_end: '10:00' },
      ]),
    );
    expect(layout.blocks.map((b) => b.name)).toEqual(['placed']);
    expect(layout.unscheduled.map((u) => u.name).sort()).toEqual(['bad time', 'no times']);
  });
});

describe('computeTimeline — empty plan', () => {
  it('returns an empty, non-crashing layout', () => {
    const layout = computeTimeline(mk([]));
    expect(layout.blocks).toHaveLength(0);
    expect(layout.span).toBe(0);
    expect(layout.hourTicks).toHaveLength(0);
  });
});
