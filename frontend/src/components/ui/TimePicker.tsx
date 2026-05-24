import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Clock3, X } from 'lucide-react';
import { clsx } from 'clsx';

interface TimePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}

type Meridiem = 'AM' | 'PM';

const quarterMinuteSteps = [0, 15, 30, 45];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const pad2 = (value: number) => String(value).padStart(2, '0');

const parseTimeValue = (value: string): { hour24: number; minute: number } => {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) {
    const now = new Date();
    return { hour24: now.getHours(), minute: now.getMinutes() };
  }

  const [hourPart, minutePart] = value.split(':').map(Number);
  return {
    hour24: Number.isNaN(hourPart) ? 0 : clamp(hourPart, 0, 23),
    minute: Number.isNaN(minutePart) ? 0 : clamp(minutePart, 0, 59),
  };
};

const to12HourState = (hour24: number, minute: number): { hour12: number; minute: number; meridiem: Meridiem } => {
  const meridiem: Meridiem = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, minute, meridiem };
};

const to24Hour = (hour12: number, meridiem: Meridiem): number => {
  const safeHour = clamp(hour12, 1, 12);
  if (meridiem === 'AM') {
    return safeHour === 12 ? 0 : safeHour;
  }

  return safeHour === 12 ? 12 : safeHour + 12;
};

const toTimeString = (hour24: number, minute: number) => `${pad2(clamp(hour24, 0, 23))}:${pad2(clamp(minute, 0, 59))}`;

const getNearestQuarterIndex = (minute: number) => {
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  quarterMinuteSteps.forEach((step, index) => {
    const distance = Math.abs(step - minute);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
};

export default function TimePicker({ value, onChange, label, className }: TimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftHour, setDraftHour] = useState('12');
  const [draftMinute, setDraftMinute] = useState('00');
  const [draftMeridiem, setDraftMeridiem] = useState<Meridiem>('AM');
  const pickerRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => parseTimeValue(value), [value]);
  const selected12 = useMemo(
    () => to12HourState(selected.hour24, selected.minute),
    [selected.hour24, selected.minute]
  );

  const syncDraftFromValue = () => {
    setDraftHour(pad2(selected12.hour12));
    setDraftMinute(pad2(selected12.minute));
    setDraftMeridiem(selected12.meridiem);
  };

  useEffect(() => {
    if (!isOpen) {
      syncDraftFromValue();
    }
  }, [selected12.hour12, selected12.minute, selected12.meridiem, isOpen]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!pickerRef.current) return;
      if (!pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const getResolvedHour = () => {
    const parsedHour = Number.parseInt(draftHour, 10);
    if (Number.isNaN(parsedHour)) return selected12.hour12;
    return clamp(parsedHour, 1, 12);
  };

  const getResolvedMinute = () => {
    const parsedMinute = Number.parseInt(draftMinute, 10);
    if (Number.isNaN(parsedMinute)) return selected12.minute;
    return clamp(parsedMinute, 0, 59);
  };

  const commitDraftToParent = () => {
    const resolvedHour = getResolvedHour();
    const resolvedMinute = getResolvedMinute();
    const hour24 = to24Hour(resolvedHour, draftMeridiem);
    setDraftHour(pad2(resolvedHour));
    setDraftMinute(pad2(resolvedMinute));
    onChange(toTimeString(hour24, resolvedMinute));
  };

  const openPicker = () => {
    syncDraftFromValue();
    setIsOpen(true);
  };

  const cancelPicker = () => {
    syncDraftFromValue();
    setIsOpen(false);
  };

  const confirmPicker = () => {
    commitDraftToParent();
    setIsOpen(false);
  };

  const incrementHour = (delta: 1 | -1) => {
    const current = getResolvedHour();
    const next = ((current - 1 + delta + 12) % 12) + 1;
    setDraftHour(pad2(next));
  };

  const incrementMinuteByQuarter = (delta: 1 | -1) => {
    const current = getResolvedMinute();
    const currentIndex = getNearestQuarterIndex(current);
    const nextIndex = (currentIndex + delta + quarterMinuteSteps.length) % quarterMinuteSteps.length;
    setDraftMinute(pad2(quarterMinuteSteps[nextIndex]));
  };

  const setNowDraft = () => {
    const now = new Date();
    const now12 = to12HourState(now.getHours(), now.getMinutes());
    setDraftHour(pad2(now12.hour12));
    setDraftMinute(pad2(now12.minute));
    setDraftMeridiem(now12.meridiem);
  };

  const handleHourInputChange = (nextValue: string) => {
    if (/^\d{0,2}$/.test(nextValue)) setDraftHour(nextValue);
  };

  const handleMinuteInputChange = (nextValue: string) => {
    if (/^\d{0,2}$/.test(nextValue)) setDraftMinute(nextValue);
  };

  const handleHourKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp') { event.preventDefault(); incrementHour(1); }
    if (event.key === 'ArrowDown') { event.preventDefault(); incrementHour(-1); }
  };

  const handleMinuteKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp') { event.preventDefault(); incrementMinuteByQuarter(1); }
    if (event.key === 'ArrowDown') { event.preventDefault(); incrementMinuteByQuarter(-1); }
  };

  const displayTime = `${pad2(selected12.hour12)}:${pad2(selected12.minute)} ${selected12.meridiem}`;

  return (
    <div className={clsx('w-full', className)} ref={pickerRef}>
      {label && (
        <label className="block text-sm font-medium text-gray-600 mb-2 dark:text-gray-300">
          {label}
        </label>
      )}

      <div className="relative">
        <button
          type="button"
          onClick={() => (isOpen ? setIsOpen(false) : openPicker())}
          className="w-full h-11 rounded-lg border border-gray-300 bg-white px-4 text-left text-gray-900 shadow-sm transition-all hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        >
          <span className="inline-flex w-full items-center justify-between">
            <span className="inline-flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-blue-500" />
              {displayTime}
            </span>
            {isOpen ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
          </span>
        </button>

        {isOpen && (
          <div className="absolute left-0 top-[calc(100%+6px)] z-[200] w-[272px] rounded-xl border border-gray-200 bg-white p-3 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            {/* Header */}
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Enter Time
              </p>
              <button
                type="button"
                onClick={cancelPicker}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Compact horizontal time picker */}
            <div className="flex items-center justify-center gap-1">
              {/* Hour column */}
              <div className="flex flex-col items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => incrementHour(1)}
                  className="flex h-6 w-10 items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <ChevronUp className="h-4 w-4 text-gray-500" />
                </button>
                <input
                  value={draftHour}
                  onChange={(e) => handleHourInputChange(e.target.value)}
                  onBlur={() => setDraftHour(pad2(getResolvedHour()))}
                  onKeyDown={handleHourKeyDown}
                  className="h-11 w-14 rounded-lg border border-gray-200 bg-gray-50 text-center text-2xl font-bold text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  inputMode="numeric"
                  aria-label="Hour"
                  placeholder="hh"
                />
                <button
                  type="button"
                  onClick={() => incrementHour(-1)}
                  className="flex h-6 w-10 items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <ChevronDown className="h-4 w-4 text-gray-500" />
                </button>
                <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">Hour</p>
              </div>

              {/* Colon */}
              <span className="mb-5 text-2xl font-bold text-gray-400 select-none">:</span>

              {/* Minute column */}
              <div className="flex flex-col items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => incrementMinuteByQuarter(1)}
                  className="flex h-6 w-10 items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <ChevronUp className="h-4 w-4 text-gray-500" />
                </button>
                <input
                  value={draftMinute}
                  onChange={(e) => handleMinuteInputChange(e.target.value)}
                  onBlur={() => setDraftMinute(pad2(getResolvedMinute()))}
                  onKeyDown={handleMinuteKeyDown}
                  className="h-11 w-14 rounded-lg border border-gray-200 bg-gray-50 text-center text-2xl font-bold text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  inputMode="numeric"
                  aria-label="Minute"
                  placeholder="mm"
                />
                <button
                  type="button"
                  onClick={() => incrementMinuteByQuarter(-1)}
                  className="flex h-6 w-10 items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <ChevronDown className="h-4 w-4 text-gray-500" />
                </button>
                <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">Min</p>
              </div>

              {/* AM / PM */}
              <div className="ml-2 flex flex-col gap-1.5">
                {(['AM', 'PM'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDraftMeridiem(m)}
                    className={clsx(
                      'h-9 w-12 rounded-lg text-sm font-semibold transition-all',
                      draftMeridiem === m
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Minute hint */}
            <p className="mt-2 text-center text-[10px] text-gray-400 dark:text-gray-500">
              ↑↓ arrows snap to 15-min steps · type any value directly
            </p>

            {/* Actions */}
            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={setNowDraft}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <Clock3 className="h-3.5 w-3.5" />
                Now
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cancelPicker}
                  className="rounded-md px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmPicker}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
