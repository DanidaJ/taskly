import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDays,
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  endOfMonth,
  endOfWeek,
} from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const toDateValue = (date: Date) => format(date, 'yyyy-MM-dd');

const parseDateValue = (value: string): Date | null => {
  if (!value) {
    return null;
  }

  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export default function DatePicker({ value, onChange, label, className }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const selectedDate = useMemo(() => parseDateValue(value), [value]);
  const [visibleMonth, setVisibleMonth] = useState(() => selectedDate ?? new Date());

  useEffect(() => {
    if (selectedDate) {
      setVisibleMonth(selectedDate);
    }
  }, [selectedDate]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!pickerRef.current) {
        return;
      }

      if (!pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const startDate = startOfWeek(startOfMonth(visibleMonth));
  const endDate = endOfWeek(endOfMonth(visibleMonth));

  const calendarDays: Date[] = [];
  let dayCursor = startDate;

  while (dayCursor <= endDate) {
    calendarDays.push(dayCursor);
    dayCursor = addDays(dayCursor, 1);
  }

  const quickDateOptions: { label: string; date: Date }[] = [
    { label: 'Today', date: new Date() },
    { label: 'Tomorrow', date: addDays(new Date(), 1) },
    { label: '+3 Days', date: addDays(new Date(), 3) },
    { label: 'Next Week', date: addDays(new Date(), 7) },
  ];

  const selectDate = (date: Date) => {
    onChange(toDateValue(date));
    setIsOpen(false);
  };

  const adjustDateWithKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }

    event.preventDefault();

    const baseDate = selectedDate ?? new Date();
    const amount = event.shiftKey ? 7 : 1;
    const nextDate = event.key === 'ArrowUp' ? addDays(baseDate, amount) : addDays(baseDate, -amount);
    onChange(toDateValue(nextDate));
  };

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
          onClick={() => setIsOpen((prev) => !prev)}
          onKeyDown={adjustDateWithKeyboard}
          className="w-full h-11 rounded-lg border border-gray-300 bg-white px-4 text-left text-gray-900 shadow-sm transition-all hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        >
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-blue-500" />
            {selectedDate ? format(selectedDate, 'EEE, MMM d, yyyy') : 'Select date'}
          </span>
        </button>

        {isOpen && (
          <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 rounded-xl border border-gray-200 bg-white p-3 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <div className="mb-3 flex flex-wrap gap-2">
              {quickDateOptions.map((option) => {
                const active = selectedDate && isSameDay(selectedDate, option.date);

                return (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => selectDate(option.date)}
                    className={clsx(
                      'rounded-full px-3 py-1 text-xs font-semibold transition-all',
                      active
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-500/15 dark:text-blue-300 dark:hover:bg-blue-500/25'
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setVisibleMonth((prev) => addMonths(prev, -1))}
                className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                {format(visibleMonth, 'MMMM yyyy')}
              </span>
              <button
                type="button"
                onClick={() => setVisibleMonth((prev) => addMonths(prev, 1))}
                className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {weekdayLabels.map((weekday) => (
                <div key={weekday} className="pb-1 text-center text-xs font-medium text-gray-400 dark:text-gray-500">
                  {weekday}
                </div>
              ))}

              {calendarDays.map((calendarDate) => {
                const isCurrentMonth = isSameMonth(calendarDate, visibleMonth);
                const isSelected = selectedDate ? isSameDay(calendarDate, selectedDate) : false;

                return (
                  <button
                    key={calendarDate.toISOString()}
                    type="button"
                    onClick={() => selectDate(calendarDate)}
                    className={clsx(
                      'h-9 rounded-lg text-sm transition-all',
                      isSelected && 'bg-blue-600 font-semibold text-white shadow-md',
                      !isSelected &&
                        isCurrentMonth &&
                        'text-gray-800 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-800',
                      !isSelected &&
                        !isCurrentMonth &&
                        'text-gray-300 hover:bg-gray-50 dark:text-gray-600 dark:hover:bg-gray-800',
                      !isSelected && isToday(calendarDate) && 'ring-1 ring-blue-300 dark:ring-blue-500'
                    )}
                  >
                    {format(calendarDate, 'd')}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}