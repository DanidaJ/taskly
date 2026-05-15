import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, format, isToday } from 'date-fns';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { PlannedTask } from '@/types';
import { useTaskStore } from '@/stores';
import { scheduleService, type BusyWindow, type FreeSlotsResponse } from '@/services/api';
import { parseDuration } from '@/utils';

const DATE_TAB_COUNT = 7;
const SLOT_MINUTES = 30;

interface SlotRow {
  time: string;            // "HH:MM"
  minute: number;          // minutes since midnight (start of slot)
  occupied: boolean;
  reason?: string;         // label of the blocking window
  overflows: boolean;      // selecting here would overflow into a busy window or past sleep
}

const timeToMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

const minutesToTime = (mins: number): string => {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const formatTimeDisplay = (hhmm: string): string => {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const meridiem = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${meridiem}`;
};

const buildSlotRows = (
  data: FreeSlotsResponse,
  taskDurationMinutes: number,
  nowEpochMin: number | null,
): SlotRow[] => {
  const wakeMin = timeToMinutes(data.wake_time);
  const sleepMin = timeToMinutes(data.sleep_deadline);
  const dayEnd = sleepMin > wakeMin ? sleepMin : sleepMin + 24 * 60;

  const rows: SlotRow[] = [];
  for (let m = wakeMin; m + SLOT_MINUTES <= dayEnd; m += SLOT_MINUTES) {
    rows.push({
      time: minutesToTime(m),
      minute: m,
      occupied: false,
      overflows: false,
    });
  }

  for (const row of rows) {
    const taskStart = row.minute;
    const taskEnd = taskStart + taskDurationMinutes;

    if (nowEpochMin !== null && taskStart <= nowEpochMin) {
      row.occupied = true;
      row.reason = 'In the past';
      continue;
    }

    if (taskEnd > dayEnd) {
      row.overflows = true;
      row.reason = 'Past sleep time';
      continue;
    }

    for (const w of data.busy_windows) {
      const wStart = timeToMinutes(w.start);
      const wEnd = timeToMinutes(w.end);
      const normWEnd = wEnd <= wStart ? wEnd + 24 * 60 : wEnd;
      if (taskStart < normWEnd && taskEnd > wStart) {
        row.occupied = true;
        row.reason = w.label;
        break;
      }
    }
  }

  return rows;
};

interface ReschedulePanelProps {
  task: PlannedTask;
  onComplete: () => void;
}

export default function ReschedulePanel({
  task,
  onComplete,
}: ReschedulePanelProps) {
  const rescheduleTask = useTaskStore((s) => s.rescheduleTask);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slotsData, setSlotsData] = useState<FreeSlotsResponse | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customTime, setCustomTime] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  const taskDurationMinutes = useMemo(
    () => parseDuration(task.suggested_duration || '30 minutes'),
    [task.suggested_duration]
  );

  const dateTabs = useMemo(() => {
    const today = new Date();
    return Array.from({ length: DATE_TAB_COUNT }).map((_, i) => {
      const d = addDays(today, i);
      return {
        iso: format(d, 'yyyy-MM-dd'),
        label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : format(d, 'EEE d'),
        date: d,
      };
    });
  }, []);

  // Load slots whenever the user picks a date
  useEffect(() => {
    if (!selectedDate) {
      return;
    }
    let cancelled = false;
    setLoadingSlots(true);
    setSlotsError(null);
    setSlotsData(null);

    scheduleService.getFreeSlots(selectedDate, task.id)
      .then((data) => {
        if (cancelled) return;
        setSlotsData(data);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load free slots:', err);
        setSlotsError(err?.response?.data?.detail || 'Could not load availability.');
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDate, task.id]);

  const nowEpochMin = useMemo(() => {
    if (!selectedDate) return null;
    const now = new Date();
    if (!isToday(new Date(`${selectedDate}T00:00:00`))) return null;
    return now.getHours() * 60 + now.getMinutes();
  }, [selectedDate]);

  const slotRows = useMemo(() => {
    if (!slotsData) return [];
    return buildSlotRows(slotsData, taskDurationMinutes, nowEpochMin);
  }, [slotsData, taskDurationMinutes, nowEpochMin]);

  const handleSelectSlot = useCallback(async (time: string) => {
    if (!selectedDate || submitting) return;
    setSubmitting(true);
    try {
      await rescheduleTask(task.id, 'custom', { date: selectedDate, time });
      toast.success(`Rescheduled to ${format(new Date(`${selectedDate}T${time}`), 'EEE MMM d')} at ${formatTimeDisplay(time)}`);
      onComplete();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Failed to reschedule';
      toast.error(detail);
    } finally {
      setSubmitting(false);
    }
  }, [onComplete, rescheduleTask, selectedDate, submitting, task.id]);

  const validateCustomTime = useCallback((time: string): string | null => {
    if (!/^\d{2}:\d{2}$/.test(time)) return 'Enter time as HH:MM';
    if (!slotsData) return null;
    const startMin = timeToMinutes(time);
    const endMin = startMin + taskDurationMinutes;
    const wake = timeToMinutes(slotsData.wake_time);
    const sleep = timeToMinutes(slotsData.sleep_deadline);
    const dayEnd = sleep > wake ? sleep : sleep + 24 * 60;
    if (startMin < wake) return `Before wake time (${formatTimeDisplay(slotsData.wake_time)})`;
    if (endMin > dayEnd) return `Task would end past sleep time (${formatTimeDisplay(slotsData.sleep_deadline)})`;
    if (nowEpochMin !== null && startMin <= nowEpochMin) return 'That time has already passed';
    for (const w of slotsData.busy_windows) {
      const wStart = timeToMinutes(w.start);
      const wEnd = timeToMinutes(w.end);
      const normWEnd = wEnd <= wStart ? wEnd + 24 * 60 : wEnd;
      if (startMin < normWEnd && endMin > wStart) {
        return `Overlaps with "${w.label}" (${formatTimeDisplay(w.start)}–${formatTimeDisplay(w.end)})`;
      }
    }
    return null;
  }, [nowEpochMin, slotsData, taskDurationMinutes]);

  const handleSubmitCustom = useCallback(async () => {
    if (!selectedDate || submitting) return;
    const error = validateCustomTime(customTime);
    if (error) {
      setCustomError(error);
      return;
    }
    setCustomError(null);
    await handleSelectSlot(customTime);
  }, [customTime, handleSelectSlot, selectedDate, submitting, validateCustomTime]);

  return (
    <div className="rounded-apple border border-blue-200 bg-blue-50/50 p-3 space-y-3">
              {/* Date strip */}
              <div className="overflow-x-auto -mx-1 px-1">
                <div className="flex gap-2 min-w-max">
                  {dateTabs.map((t) => {
                    const active = selectedDate === t.iso;
                    return (
                      <button
                        key={t.iso}
                        type="button"
                        onClick={() => setSelectedDate(t.iso)}
                        className={clsx(
                          'flex-shrink-0 rounded-apple px-3 py-1.5 text-xs font-medium transition-colors',
                          active
                            ? 'bg-blue-500 text-white shadow-sm'
                            : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                        )}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Slot area */}
              {!selectedDate && (
                <p className="text-xs text-gray-500 px-1">Pick a day to see available times.</p>
              )}

              {selectedDate && loadingSlots && (
                <div className="flex items-center gap-2 text-xs text-gray-500 px-1 py-3">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Loading availability…
                </div>
              )}

              {selectedDate && slotsError && (
                <div className="flex items-center gap-2 text-xs text-red-600 px-1 py-2">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {slotsError}
                </div>
              )}

              {selectedDate && !loadingSlots && !slotsError && slotsData && (
                <SlotGrid
                  rows={slotRows}
                  durationMinutes={taskDurationMinutes}
                  busyWindows={slotsData.busy_windows}
                  disabled={submitting}
                  onPick={handleSelectSlot}
                />
              )}

              {/* Custom time row */}
              {selectedDate && !loadingSlots && !slotsError && slotsData && (
                <div className="border-t border-gray-200 pt-3">
                  {!showCustomInput ? (
                    <button
                      type="button"
                      onClick={() => setShowCustomInput(true)}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700"
                    >
                      + Enter exact time
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="flex flex-col">
                        <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500 mb-1">
                          Exact start
                        </label>
                        <input
                          type="time"
                          value={customTime}
                          onChange={(e) => {
                            setCustomTime(e.target.value);
                            setCustomError(null);
                          }}
                          className="rounded-apple border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleSubmitCustom}
                        disabled={submitting || !customTime}
                        className="flex items-center gap-1 rounded-apple bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
                      >
                        {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCustomInput(false);
                          setCustomTime('');
                          setCustomError(null);
                        }}
                        className="text-xs text-gray-500 hover:text-gray-700 px-1"
                      >
                        Cancel
                      </button>
                      {customError && (
                        <p className="basis-full flex items-center gap-1.5 text-xs text-red-600">
                          <AlertCircle className="w-3.5 h-3.5" />
                          {customError}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
    </div>
  );
}

interface SlotGridProps {
  rows: SlotRow[];
  durationMinutes: number;
  busyWindows: BusyWindow[];
  disabled: boolean;
  onPick: (time: string) => void;
}

function SlotGrid({ rows, durationMinutes, disabled, onPick }: SlotGridProps) {
  if (rows.length === 0) {
    return <p className="text-xs text-gray-500 px-1 py-2">No available slots on this day.</p>;
  }

  return (
    <div className="max-h-[260px] overflow-y-auto rounded-apple bg-white border border-gray-200">
      <div className="grid grid-cols-1 divide-y divide-gray-100">
        {rows.map((row) => {
          const blocked = row.occupied || row.overflows;
          return (
            <button
              key={row.time}
              type="button"
              disabled={blocked || disabled}
              onClick={() => onPick(row.time)}
              className={clsx(
                'flex items-center justify-between gap-3 px-3 py-2 text-left transition-colors',
                blocked
                  ? 'bg-gray-50 cursor-not-allowed'
                  : 'hover:bg-blue-50 cursor-pointer'
              )}
            >
              <span
                className={clsx(
                  'text-xs font-medium tabular-nums w-20',
                  blocked ? 'text-gray-400' : 'text-gray-900'
                )}
              >
                {formatTimeDisplay(row.time)}
              </span>

              <span
                className={clsx(
                  'flex-1 text-xs',
                  blocked ? 'text-gray-400 italic' : 'text-gray-600'
                )}
              >
                {row.reason
                  ? row.reason
                  : `Free · ${durationMinutes} min`}
              </span>

              {!blocked && (
                <span className="text-[11px] font-medium text-blue-600">
                  Pick →
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
