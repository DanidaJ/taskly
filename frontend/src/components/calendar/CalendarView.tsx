import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  format,
  eachDayOfInterval,
  isSameDay,
  isToday,
  addDays,
  subDays,
  addWeeks,
  subWeeks,
  parseISO,
} from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  LayoutGrid,
  List,
} from 'lucide-react';
import { PlannedTask, Task, Commitment, DailyPlan } from '@/types';
import { Button } from '@/components/ui';
import { clsx } from 'clsx';

interface CalendarEvent {
  id: string;
  title: string;
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
  date: Date;
  type: 'task' | 'commitment';
  color: string;
  cognitiveType?: string;
  priority?: string;
  status?: string;
  plannedTask?: PlannedTask;
}

interface CalendarViewProps {
  selectedDate: Date;
  onSelectedDateChange: (date: Date) => void;
  plannedTasks: PlannedTask[];
  tasks: Task[];
  commitments: Commitment[];
  plansByDate?: Record<string, DailyPlan>;
  onTaskClick?: (taskId: string) => void;
  onEventClick?: (event: CalendarEvent) => void;
}

// Status colour palette — hues spread across the full wheel for max legibility.
// Scheduled   blue-500   (#3b82f6)  0°→ blue
// In Progress  amber-500  (#f59e0b)  ~45° warm amber — clearly "active/hot"
// Rescheduled  violet-500 (#8b5cf6)  ~270° purple — "moved"
// Completed    green-500  (#22c55e)  ~120° green — universally "done"
// Missed       red-500    (#ef4444)  ~0° red — universally "error"
// Skipped      sky-400    (#38bdf8)  ~200° light cyan — "skipped past"
// Cancelled    stone-500  (#78716c)  warm brown-gray — "dead"
// Commitment   slate-700  (#334155)  cool dark gray — "fixed/external"
function getEventColor(event: CalendarEvent): string {
  if (event.type === 'commitment') return 'bg-slate-700';
  const status = event.status;
  if (status === 'in_progress') return 'bg-amber-500';
  if (status === 'completed')   return 'bg-green-500';
  if (status === 'missed')      return 'bg-red-500';
  if (status === 'skipped')     return 'bg-sky-400';
  if (status === 'cancelled')   return 'bg-stone-500';
  if (
    status === 'pending' &&
    event.plannedTask?.notes?.includes('(Rescheduled')
  ) return 'bg-violet-500';
  return 'bg-blue-500'; // scheduled / default pending
}

function getEventInlineStyle(event: CalendarEvent): React.CSSProperties {
  if (event.status === 'missed') {
    return {
      backgroundImage:
        'repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(255,80,80,0.22) 4px, rgba(255,80,80,0.22) 8px)',
    };
  }
  if (event.status === 'skipped') {
    return {
      backgroundImage:
        'repeating-linear-gradient(135deg, transparent, transparent 6px, rgba(0,0,0,0.15) 6px, rgba(0,0,0,0.15) 12px)',
    };
  }
  if (event.status === 'cancelled') {
    return {
      backgroundImage:
        'repeating-linear-gradient(90deg, transparent, transparent 6px, rgba(0,0,0,0.2) 6px, rgba(0,0,0,0.2) 7px)',
    };
  }
  return {};
}

function getEventStatusClasses(event: CalendarEvent): string {
  if (event.status === 'completed')   return 'opacity-60';
  if (event.status === 'missed')      return 'border-2 border-dashed border-red-300/80';
  if (event.status === 'skipped')     return 'opacity-65';
  if (event.status === 'cancelled')   return 'opacity-40';
  if (event.status === 'in_progress') return 'ring-2 ring-amber-300/70 ring-offset-1 ring-offset-transparent';
  return '';
}

// Hours to display (All 24 hours: 0-23)
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getEventPrefix(event: CalendarEvent): string {
  if (event.status === 'missed')    return '⚠ ';
  if (event.status === 'completed') return '✓ ';
  if (event.status === 'in_progress') return '▶ ';
  if (event.status === 'skipped')   return '⊘ ';
  if (event.status === 'cancelled') return '✕ ';
  if (
    event.status === 'pending' &&
    event.plannedTask?.notes?.includes('(Rescheduled')
  ) return '→ ';

  if (event.type === 'task') {
    if (event.plannedTask?.start_type === 'delayed') return '⏰ ';
    if (event.plannedTask?.start_type === 'early') return '↗ ';
    if (event.plannedTask?.start_type === 'on_time') return '• ';
  }

  return '';
}

function getEventStartContextLabel(event: CalendarEvent): string | null {
  if (event.type !== 'task' || !event.plannedTask?.actual_start) {
    return null;
  }

  const offset = typeof event.plannedTask.minutes_offset === 'number'
    ? event.plannedTask.minutes_offset
    : 0;

  if (event.plannedTask.start_type === 'delayed') {
    return offset > 0 ? `Expired start (${offset}m late)` : 'Expired start';
  }

  if (event.plannedTask.start_type === 'early') {
    return offset < 0 ? `Early start (${Math.abs(offset)}m)` : 'Early start';
  }

  if (event.plannedTask.start_type === 'on_time') {
    return 'On-time start';
  }

  return 'Started';
}

const addSplitEvent = (
  events: CalendarEvent[],
  baseEvent: Omit<CalendarEvent, 'startTime' | 'endTime' | 'date' | 'id'> & { id: string },
  startDate: Date,
  endDate: Date
) => {
  const normalizedEnd = new Date(endDate);
  if (normalizedEnd <= startDate) {
    normalizedEnd.setDate(normalizedEnd.getDate() + 1);
  }

  if (isSameDay(startDate, normalizedEnd)) {
    events.push({
      ...baseEvent,
      id: baseEvent.id,
      startTime: format(startDate, 'HH:mm'),
      endTime: format(normalizedEnd, 'HH:mm'),
      date: startDate,
    });
    return;
  }

  events.push({
    ...baseEvent,
    id: `${baseEvent.id}-part1`,
    startTime: format(startDate, 'HH:mm'),
    endTime: '24:00',
    date: startDate,
  });

  const endTimeStr = format(normalizedEnd, 'HH:mm');
  if (endTimeStr !== '00:00') {
    const nextDay = new Date(normalizedEnd);
    nextDay.setHours(0, 0, 0, 0);
    events.push({
      ...baseEvent,
      id: `${baseEvent.id}-part2`,
      startTime: '00:00',
      endTime: endTimeStr,
      date: nextDay,
    });
  }
};

export default function CalendarView({
  selectedDate,
  onSelectedDateChange,
  plannedTasks,
  tasks,
  commitments,
  plansByDate = {},
  onTaskClick,
  onEventClick,
}: CalendarViewProps) {
  const [viewMode, setViewMode] = useState<'day' | 'week'>('week');
  const [now, setNow] = useState(new Date());

  // Get week days (Centered on selected date)
  const weekStart = subDays(selectedDate, 3);
  const weekEnd = addDays(selectedDate, 3);
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Navigation handlers
  const goToPrevious = () => {
    if (viewMode === 'week') {
      onSelectedDateChange(subWeeks(selectedDate, 1));
    } else {
      onSelectedDateChange(addDays(selectedDate, -1));
    }
  };

  const goToNext = () => {
    if (viewMode === 'week') {
      onSelectedDateChange(addWeeks(selectedDate, 1));
    } else {
      onSelectedDateChange(addDays(selectedDate, 1));
    }
  };

  const goToToday = () => {
    onSelectedDateChange(new Date());
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  // Convert commitments to events
  const commitmentEvents = useMemo(() => {
    const events: CalendarEvent[] = [];

    commitments.forEach((commitment) => {
      // Check if commitment applies to days in current view
      const daysToCheck = viewMode === 'week' ? weekDays : [selectedDate];

      daysToCheck.forEach((day) => {
        if (commitment.days_of_week.includes(day.getDay())) {
          const [startHour, startMin] = commitment.start_time.split(':').map(Number);
          const [endHour, endMin] = commitment.end_time.split(':').map(Number);

          const startDate = new Date(day);
          startDate.setHours(startHour, startMin, 0, 0);

          const endDate = new Date(day);
          endDate.setHours(endHour, endMin, 0, 0);

          addSplitEvent(
            events,
            {
              id: `${commitment.id}-${format(day, 'yyyy-MM-dd')}`,
              title: commitment.name,
              type: 'commitment',
              color: 'bg-gray-500',
            },
            startDate,
            endDate
          );
        }
      });
    });

    return events;
  }, [commitments, weekDays, selectedDate, viewMode]);

  // Convert planned tasks to events
  const taskEvents = useMemo(() => {
    const events: CalendarEvent[] = [];

    // If plansByDate is provided, use it to get the correct date for each task
    if (Object.keys(plansByDate).length > 0) {
      Object.entries(plansByDate).forEach(([dateStr, plan]) => {
        const planDate = parseISO(dateStr);

        plan.tasks?.forEach((plannedTask) => {
          // Only display tasks that have been properly scheduled by the backend
          if (plannedTask.scheduled_start && plannedTask.scheduled_end) {
            const [startHour, startMin] = plannedTask.scheduled_start.split(':').map(Number);
            const [endHour, endMin] = plannedTask.scheduled_end.split(':').map(Number);

            const startDate = new Date(planDate);
            startDate.setHours(startHour, startMin, 0, 0);

            const endDate = new Date(planDate);
            endDate.setHours(endHour, endMin, 0, 0);

            addSplitEvent(
              events,
              {
                id: plannedTask.id,
                title: plannedTask.task_name,
                type: 'task',
                color: 'bg-blue-500', // overridden by getEventColor at render time
                priority: plannedTask.priority,
                status: plannedTask.status,
                plannedTask,
              },
              startDate,
              endDate
            );
          } else {
            // Task not scheduled by backend - log warning
            console.warn(
              `⚠️ Task "${plannedTask.task_name}" missing scheduled times. ` +
              `Backend should assign times. Task will not appear on calendar.`,
              { task: plannedTask }
            );
          }
        });
      });
    } else {
      // Fallback: use plannedTasks directly (for backward compatibility)
      plannedTasks.forEach((plannedTask) => {
        if (plannedTask.scheduled_start && plannedTask.scheduled_end) {
          const today = new Date();
          const [startHour, startMin] = plannedTask.scheduled_start.split(':').map(Number);
          const [endHour, endMin] = plannedTask.scheduled_end.split(':').map(Number);

          const startDate = new Date(today);
          startDate.setHours(startHour, startMin, 0, 0);

          const endDate = new Date(today);
          endDate.setHours(endHour, endMin, 0, 0);

          addSplitEvent(
            events,
            {
              id: plannedTask.id,
              title: plannedTask.task_name,
              type: 'task',
              color: 'bg-blue-500', // overridden by getEventColor at render time
              priority: plannedTask.priority,
              status: plannedTask.status,
              plannedTask,
            },
            startDate,
            endDate
          );
        } else {
          // Task not scheduled - log warning
          console.warn(
            `⚠️ Task "${plannedTask.task_name}" missing scheduled times. ` +
            `Backend should assign times. Task will not appear on calendar.`,
            { task: plannedTask }
          );
        }
      });
    }

    return events;
  }, [plannedTasks, tasks, plansByDate]);

  // Combine all events
  const allEvents = [...commitmentEvents, ...taskEvents];

  // Get events for a specific day
  const getEventsForDay = (day: Date) => {
    return allEvents.filter((event) => isSameDay(event.date, day));
  };

  // Calculate event position and height based on time
  const getEventStyle = (event: CalendarEvent) => {
    const [startHour, startMin] = event.startTime.split(':').map(Number);
    const [endHour, endMin] = event.endTime.split(':').map(Number);

    const startOffset = startHour * 60 + startMin; // Minutes from midnight
    let endOffset = endHour * 60 + endMin;
    
    // Handle cross-midnight events (end time < start time)
    if (endOffset <= startOffset) {
      endOffset += 24 * 60; // Add 24 hours worth of minutes
    }
    const duration = endOffset - startOffset;

    const top = (startOffset / 60) * 64; // 64px per hour
    const height = Math.max((duration / 60) * 64, 24); // Min 24px height

    return { top, height };
  };

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowTop = (nowMinutes / 60) * 64;
  const nowLabel = format(now, 'HH:mm');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={goToPrevious}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={goToToday}>
            Today
          </Button>
          <Button variant="ghost" size="sm" onClick={goToNext}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <span className="ml-4 text-lg font-semibold text-dark-100">
            {viewMode === 'week'
              ? `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`
              : format(selectedDate, 'EEEE, MMMM d, yyyy')}
          </span>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-1 bg-dark-700 rounded-lg p-1">
          <button
            onClick={() => setViewMode('day')}
            className={clsx(
              'flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              viewMode === 'day'
                ? 'bg-primary-500 text-white'
                : 'text-dark-300 hover:text-dark-100'
            )}
          >
            <List className="w-4 h-4" />
            Day
          </button>
          <button
            onClick={() => setViewMode('week')}
            className={clsx(
              'flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              viewMode === 'week'
                ? 'bg-primary-500 text-white'
                : 'text-dark-300 hover:text-dark-100'
            )}
          >
            <LayoutGrid className="w-4 h-4" />
            Week
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-auto border border-dark-700 rounded-lg bg-dark-800">
        {viewMode === 'week' ? (
          <WeekView
            weekDays={weekDays}
            hours={HOURS}
            events={allEvents}
            getEventsForDay={getEventsForDay}
            getEventStyle={getEventStyle}
            nowTop={nowTop}
            nowLabel={nowLabel}
            onEventClick={onEventClick}
          />
        ) : (
          <DayView
            selectedDate={selectedDate}
            hours={HOURS}
            events={getEventsForDay(selectedDate)}
            getEventStyle={getEventStyle}
            nowTop={nowTop}
            nowLabel={nowLabel}
            onEventClick={onEventClick}
          />
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-dark-400">
        {[
          { color: 'bg-blue-500',   label: 'Scheduled',   extra: '' },
          { color: 'bg-amber-500',  label: 'In Progress', extra: 'ring-2 ring-amber-300/70' },
          { color: 'bg-violet-500', label: 'Rescheduled', extra: '' },
          { color: 'bg-green-500',  label: 'Completed',   extra: 'opacity-60' },
          { color: 'bg-red-500',    label: 'Missed',      extra: 'border-2 border-dashed border-red-300/80' },
          { color: 'bg-sky-400',    label: 'Skipped',     extra: 'opacity-65' },
          { color: 'bg-stone-500',  label: 'Cancelled',   extra: 'opacity-40' },
          { color: 'bg-slate-700',  label: 'Commitment',  extra: '' },
        ].map(({ color, label, extra }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-3.5 h-3.5 rounded ${color} ${extra} flex-shrink-0`} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Week View Component
function WeekView({
  weekDays,
  hours,
  events,
  getEventsForDay,
  getEventStyle,
  nowTop,
  nowLabel,
  onEventClick,
}: {
  weekDays: Date[];
  hours: number[];
  events: CalendarEvent[];
  getEventsForDay: (day: Date) => CalendarEvent[];
  getEventStyle: (event: CalendarEvent) => { top: number; height: number };
  nowTop: number;
  nowLabel: string;
  onEventClick?: (event: CalendarEvent) => void;
}) {
  return (
    <div className="min-w-[800px]">
      {/* Day Headers */}
      <div className="flex border-b border-dark-700 sticky top-0 bg-dark-800 z-10">
        <div className="w-16 flex-shrink-0 border-r border-dark-700" />
        {weekDays.map((day) => (
          <div
            key={day.toISOString()}
            className={clsx(
              'flex-1 py-3 text-center border-r border-dark-700 last:border-r-0',
              isToday(day) && 'bg-primary-500/10'
            )}
          >
            <div className="text-xs text-dark-400 uppercase">
              {format(day, 'EEE')}
            </div>
            <div
              className={clsx(
                'text-lg font-semibold mt-1',
                isToday(day) ? 'text-primary-400' : 'text-dark-100'
              )}
            >
              {format(day, 'd')}
            </div>
          </div>
        ))}
      </div>

      {/* Time Grid */}
      <div className="flex">
        {/* Time Labels */}
        <div className="w-16 flex-shrink-0 border-r border-dark-700">
          {hours.map((hour) => (
            <div
              key={hour}
              className="h-16 border-b border-dark-700 pr-2 text-right relative"
            >
              <span className="text-xs text-dark-400 absolute top-1 right-2">
                {hour === 0 ? '12 AM' : hour === 12 ? '12 PM' : hour < 12 ? `${hour} AM` : `${hour - 12} PM`}
              </span>
            </div>
          ))}
        </div>

        {/* Day Columns */}
        {weekDays.map((day) => (
          <div
            key={day.toISOString()}
            className={clsx(
              'flex-1 relative border-r border-dark-700 last:border-r-0 transition-colors duration-200',
              isToday(day) && 'bg-primary-500/10'
            )}
          >
            {/* Hour lines */}
            {hours.map((hour) => (
              <div
                key={hour}
                className="h-16 border-b border-dark-700/50"
              />
            ))}

            {isToday(day) && (
              <div
                className="absolute left-0 right-0 z-30"
                style={{ top: `${nowTop}px` }}
                title={`Current time: ${nowLabel}`}
              >
                <div className="relative h-0">
                  <div className="absolute left-0 right-0 h-px bg-red-400/90" />
                  <div className="absolute -left-1 top-[-3px] h-2 w-2 rounded-full bg-red-400 shadow" />
                </div>
              </div>
            )}

            {/* Events */}
            <div className="absolute inset-0 p-0.5">
              {getEventsForDay(day).map((event) => {
                const style = getEventStyle(event);
                const startContextLabel = getEventStartContextLabel(event);
                return (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={clsx(
                      'absolute left-0.5 right-0.5 rounded-md px-1.5 py-0.5 overflow-hidden cursor-pointer',
                      'hover:brightness-110 transition-all',
                      getEventColor(event),
                      getEventStatusClasses(event),
                    )}
                    style={{
                      top: `${style.top}px`,
                      height: `${style.height}px`,
                      ...getEventInlineStyle(event),
                    }}
                    onClick={() => onEventClick?.(event)}
                  >
                    <div className="text-xs font-medium text-white truncate">
                      {getEventPrefix(event)}{event.title}
                    </div>
                    <div className="text-[10px] text-white/70 truncate">
                      {event.startTime}-{event.endTime}
                    </div>
                    {style.height > 38 && startContextLabel && (
                      <div className="text-[10px] text-white/70 truncate">
                        {startContextLabel}
                      </div>
                    )}
                    {style.height > 50 && (() => {
                      const totalMinutes = Math.round(style.height / 64 * 60);
                      const hours = Math.floor(totalMinutes / 60);
                      const minutes = totalMinutes % 60;
                      return (
                        <div className="text-[10px] text-white/60">
                          ({hours > 0 ? `${hours}h ` : ''}{minutes > 0 ? `${minutes}min` : ''})
                        </div>
                      );
                    })()}
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Day View Component
function DayView({
  selectedDate,
  hours,
  events,
  getEventStyle,
  nowTop,
  nowLabel,
  onEventClick,
}: {
  selectedDate: Date;
  hours: number[];
  events: CalendarEvent[];
  getEventStyle: (event: CalendarEvent) => { top: number; height: number };
  nowTop: number;
  nowLabel: string;
  onEventClick?: (event: CalendarEvent) => void;
}) {
  return (
    <div className="flex">
      {/* Time Labels */}
      <div className="w-20 flex-shrink-0 border-r border-dark-700">
        {hours.map((hour) => (
          <div
            key={hour}
            className="h-16 border-b border-dark-700 pr-3 text-right relative"
          >
            <span className="text-xs text-dark-400 absolute top-1 right-3">
              {hour === 0 ? '12 AM' : hour === 12 ? '12 PM' : hour < 12 ? `${hour} AM` : `${hour - 12} PM`}
            </span>
          </div>
        ))}
      </div>

      {/* Day Column */}
      <div
        className={clsx(
          'flex-1 relative',
          isToday(selectedDate) && 'bg-primary-500/5'
        )}
      >
        {/* Hour lines */}
        {hours.map((hour) => (
          <div
            key={hour}
            className="h-16 border-b border-dark-700/50"
          />
        ))}

        {isToday(selectedDate) && (
          <div
            className="absolute left-0 right-0 z-30"
            style={{ top: `${nowTop}px` }}
            title={`Current time: ${nowLabel}`}
          >
            <div className="relative h-0">
              <div className="absolute left-0 right-0 h-px bg-red-400/90" />
              <div className="absolute -left-1 top-[-3px] h-2 w-2 rounded-full bg-red-400 shadow" />
            </div>
          </div>
        )}

        {/* Events */}
        <div className="absolute inset-0 p-1">
          {events.map((event) => {
            const style = getEventStyle(event);
            const startContextLabel = getEventStartContextLabel(event);
            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className={clsx(
                  'absolute left-2 right-2 rounded-lg px-3 py-2 overflow-hidden cursor-pointer',
                  'hover:brightness-110 transition-all shadow-lg',
                  getEventColor(event),
                  getEventStatusClasses(event),
                )}
                style={{
                  top: `${style.top}px`,
                  height: `${style.height}px`,
                  ...getEventInlineStyle(event),
                }}
                onClick={() => onEventClick?.(event)}
              >
                <div className="text-sm font-semibold text-white truncate">
                  {getEventPrefix(event)}{event.title}
                </div>
                <div className="text-xs text-white/80 mt-0.5">
                  {(() => {
                    const totalMinutes = Math.round(style.height / 64 * 60);
                    const hours = Math.floor(totalMinutes / 60);
                    const minutes = totalMinutes % 60;
                    const durationStr = hours > 0 ? `${hours}h${minutes > 0 ? ` ${minutes}min` : ''}` : `${minutes}min`;
                    return `${event.startTime} - ${event.endTime} (${durationStr})`;
                  })()}
                </div>
                {style.height > 60 && startContextLabel && (
                  <div className="text-xs text-white/75 mt-0.5 truncate">
                    {startContextLabel}
                  </div>
                )}
                {style.height > 60 && event.priority && (
                  <div className="mt-1">
                    <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded">
                      {event.priority}
                    </span>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Helper function to parse duration string to minutes
function parseDuration(duration: string): number {
  const lower = duration.toLowerCase();

  // Check for hours
  const hourMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr|h)/);
  if (hourMatch) {
    return parseFloat(hourMatch[1]) * 60;
  }

  // Check for minutes
  const minMatch = lower.match(/(\d+)\s*(?:minute|min|m)/);
  if (minMatch) {
    return parseInt(minMatch[1], 10);
  }

  // Default to 30 minutes
  return 30;
}
