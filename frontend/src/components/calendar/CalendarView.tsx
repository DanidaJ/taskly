import { useState, useMemo, useEffect } from 'react';
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

// Color mapping for cognitive types
const cognitiveColors: Record<string, string> = {
  deep_focus: 'bg-red-500',
  light_focus: 'bg-blue-500',
  admin: 'bg-yellow-500',
  physical: 'bg-green-500',
  recovery: 'bg-purple-500',
};

// Color mapping for priority
const priorityColors: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-orange-500',
  low: 'bg-green-500',
};

// Hours to display (All 24 hours: 0-23)
const HOURS = Array.from({ length: 24 }, (_, i) => i);

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
          const task = tasks.find((t) => t.id === plannedTask.task_id);
          const cognitiveType = task?.type || 'light_focus';

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
                color: cognitiveColors[cognitiveType] || 'bg-blue-500',
                cognitiveType,
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
        const task = tasks.find((t) => t.id === plannedTask.task_id);
        const cognitiveType = task?.type || 'light_focus';

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
              color: cognitiveColors[cognitiveType] || 'bg-blue-500',
              cognitiveType,
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
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-dark-400">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-red-500" />
          <span>Deep Focus</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-blue-500" />
          <span>Light Focus</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-yellow-500" />
          <span>Admin</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-green-500" />
          <span>Physical</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-purple-500" />
          <span>Recovery</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-gray-500" />
          <span>Commitment</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-orange-900 border border-dashed border-orange-400/60" />
          <span>Missed</span>
        </div>
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
                return (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={clsx(
                      'absolute left-0.5 right-0.5 rounded-md px-1.5 py-0.5 overflow-hidden cursor-pointer',
                      'hover:ring-2 hover:ring-white/20 transition-all',
                      event.status === 'missed' ? 'bg-orange-900/80 border border-dashed border-orange-400/60' : event.color,
                      event.status === 'completed' && 'opacity-50 line-through',
                      event.status === 'missed' && 'opacity-75'
                    )}
                    style={{
                      top: `${style.top}px`,
                      height: `${style.height}px`,
                      ...(event.status === 'missed' ? {
                        backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(251,146,60,0.15) 4px, rgba(251,146,60,0.15) 8px)',
                      } : {}),
                    }}
                    onClick={() => onEventClick?.(event)}
                  >
                    <div className="text-xs font-medium text-white truncate">
                      {event.status === 'missed' && '⚠ '}{event.title}
                    </div>
                    <div className="text-[10px] text-white/70 truncate">
                      {event.startTime}-{event.endTime}
                    </div>
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
            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className={clsx(
                  'absolute left-2 right-2 rounded-lg px-3 py-2 overflow-hidden cursor-pointer',
                  'hover:ring-2 hover:ring-white/20 transition-all shadow-lg',
                  event.status === 'missed' ? 'bg-orange-900/80 border border-dashed border-orange-400/60' : event.color,
                  event.status === 'completed' && 'opacity-50 line-through',
                  event.status === 'missed' && 'opacity-75'
                )}
                style={{
                  top: `${style.top}px`,
                  height: `${style.height}px`,
                  ...(event.status === 'missed' ? {
                    backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(251,146,60,0.15) 4px, rgba(251,146,60,0.15) 8px)',
                  } : {}),
                }}
                onClick={() => onEventClick?.(event)}
              >
                <div className="text-sm font-semibold text-white truncate">
                  {event.status === 'missed' && '⚠ '}{event.title}
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
