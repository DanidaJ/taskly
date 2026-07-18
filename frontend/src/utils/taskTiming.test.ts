import { describe, it, expect } from 'vitest';
import { classifyManualTiming } from './index';

// Fixed "now": 2026-07-18 15:25 local.
const NOW = new Date('2026-07-18T15:25:00');

describe('classifyManualTiming', () => {
  it('future: starts later today', () => {
    expect(classifyManualTiming('2026-07-18', '18:00', 60, NOW)?.state).toBe('future');
  });

  it("ongoing: start passed but end still ahead (the user's case)", () => {
    // 14:00 + 2h = 16:00 end, now 15:25 → still running.
    expect(classifyManualTiming('2026-07-18', '14:00', 120, NOW)?.state).toBe('ongoing');
  });

  it('past: whole window already over', () => {
    // 12:00 + 1h = 13:00 end, now 15:25 → over.
    expect(classifyManualTiming('2026-07-18', '12:00', 60, NOW)?.state).toBe('past');
  });

  it('past: an earlier calendar date is always past', () => {
    expect(classifyManualTiming('2026-07-17', '20:00', 60, NOW)?.state).toBe('past');
  });

  it('cross-midnight: 23:00 + 2h ongoing just after midnight', () => {
    const now = new Date('2026-07-19T00:30:00'); // 30 min into the task
    // start 2026-07-18 23:00, end 2026-07-19 01:00 → ongoing at 00:30.
    const r = classifyManualTiming('2026-07-18', '23:00', 120, now);
    expect(r?.state).toBe('ongoing');
    expect(r?.endDt.getDate()).toBe(19); // end rolled to next day
  });

  it('cross-midnight: 23:00 + 2h is past once 01:00 has passed', () => {
    const now = new Date('2026-07-19T01:30:00');
    expect(classifyManualTiming('2026-07-18', '23:00', 120, now)?.state).toBe('past');
  });

  it('exact boundary: end == now is past (not ongoing)', () => {
    // 14:25 + 60m = 15:25 == now → the window just closed.
    expect(classifyManualTiming('2026-07-18', '14:25', 60, NOW)?.state).toBe('past');
  });

  it('returns null on bad input', () => {
    expect(classifyManualTiming('', '14:00', 60, NOW)).toBeNull();
    expect(classifyManualTiming('2026-07-18', '', 60, NOW)).toBeNull();
  });
});
