import { useState, useEffect, useCallback } from 'react';
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  GripVertical,
  Play,
  Pause,
  CheckCircle2,
  LayoutGrid,
  List,
  Trash2,
  Edit,
  X,
  AlertTriangle,
  SkipForward,
  CalendarPlus,
  RefreshCw,
} from 'lucide-react';
import { useTaskStore, useUserProfileStore } from '@/stores';
import { PlannedTask } from '@/types';
import { Button, Input, Modal, Textarea } from '@/components/ui';
import { CognitiveLoadBadge, PriorityBadge } from '@/components/ui/Badge';
import { CalendarView } from '@/components/calendar';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';

type ViewMode = 'list' | 'calendar';

// Color mapping for cognitive types (matching CalendarView)
const cognitiveColors: Record<string, string> = {
  deep_focus: 'border-red-500',
  light_focus: 'border-blue-500',
  admin: 'border-yellow-500',
  physical: 'border-green-500',
  recovery: 'border-purple-500',
};

const cognitiveBgColors: Record<string, string> = {
  deep_focus: 'bg-red-500/10',
  light_focus: 'bg-blue-500/10',
  admin: 'bg-yellow-500/10',
  physical: 'bg-green-500/10',
  recovery: 'bg-purple-500/10',
};

export default function Schedule() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [selectedTask, setSelectedTask] = useState<PlannedTask | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editedTask, setEditedTask] = useState<PlannedTask | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  
  const { plannedTasks, updatePlannedTask, deletePlannedTask, tasks, loadPlanFromDatabase, loadPlansForDateRange, plansByDate, checkMissedTasks, getMissedTasks, rescheduleTask } = useTaskStore();
  const { commitments } = useUserProfileStore();
  const [rescheduleLoading, setRescheduleLoading] = useState<string | null>(null);

  // Periodically check for missed tasks (every 60s)
  useEffect(() => {
    checkMissedTasks();
    const interval = setInterval(checkMissedTasks, 60000);
    return () => clearInterval(interval);
  }, [checkMissedTasks]);

  const missedTasks = getMissedTasks();

  const handleReschedule = useCallback(async (taskId: string, mode: 'next_slot' | 'tomorrow' | 'skip') => {
    setRescheduleLoading(taskId);
    try {
      await rescheduleTask(taskId, mode);
      toast.success(
        mode === 'skip' ? 'Task skipped' :
        mode === 'tomorrow' ? 'Task moved to tomorrow' :
        'Task rescheduled to next available slot'
      );
    } catch (error: any) {
      toast.error(error?.message || 'Failed to reschedule');
    } finally {
      setRescheduleLoading(null);
    }
  }, [rescheduleTask]);

  // Load plan from database when date changes
  React.useEffect(() => {
    if (viewMode === 'calendar') {
      // In calendar mode, preload a larger historical window for past/missed tasks.
      const startDate = format(subMonths(selectedDate, 3), 'yyyy-MM-dd');
      const endDate = format(addMonths(selectedDate, 3), 'yyyy-MM-dd');
      loadPlansForDateRange(startDate, endDate).catch((error) => {
        console.log('Plans loading skipped:', error.message || 'No plans available');
      });
    } else {
      // In list mode, load only the selected date
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      loadPlanFromDatabase(dateStr).catch((error) => {
        console.log('Plan loading skipped:', error.message || 'No plan available');
      });
    }
  }, [selectedDate, viewMode, loadPlanFromDatabase, loadPlansForDateRange]);

  const formattedDate = format(selectedDate, 'EEEE, MMMM d, yyyy');

  const goToPreviousDay = () => {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() - 1);
      return next;
    });
  };

  const goToNextDay = () => {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + 1);
      return next;
    });
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  const handleStatusChange = async (taskId: string, newStatus: PlannedTask['status']) => {
    try {
      await updatePlannedTask(taskId, { status: newStatus });
    } catch (error) {
      console.error('Failed to update task status:', error);
      toast.error('Failed to update task status');
    }
  };

  const handleStartTask = async (taskId: string) => {
    try {
      await updatePlannedTask(taskId, {
        status: 'in_progress',
        actual_start: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to start task:', error);
      toast.error('Failed to start task');
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      await updatePlannedTask(taskId, {
        status: 'completed',
        actual_end: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to complete task:', error);
      toast.error('Failed to complete task');
    }
  };

  const handleViewTask = (task: PlannedTask) => {
    setSelectedTask(task);
    setEditedTask({ ...task });
  };

  const handleSaveTask = async () => {
    if (!editedTask) return;
    try {
      await updatePlannedTask(editedTask.id, {
        task_name: editedTask.task_name,
        notes: editedTask.notes,
        priority: editedTask.priority,
        suggested_duration: editedTask.suggested_duration,
      });
      setIsEditModalOpen(false);
      setSelectedTask(null);
      setEditedTask(null);
      toast.success('Task updated!');
    } catch (error) {
      toast.error('Failed to update task');
      console.error(error);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    setTaskToDelete(taskId);
  };

  const confirmDeleteTask = async () => {
    if (!taskToDelete) return;
    try {
      await deletePlannedTask(taskToDelete);
      setTaskToDelete(null);
      setIsEditModalOpen(false);
      setSelectedTask(null);
      setEditedTask(null);
      toast.success('Task deleted!');
    } catch (error) {
      toast.error('Failed to delete task');
      console.error(error);
    }
  };

  const getTaskDetails = (plannedTask: PlannedTask) => {
    return tasks.find((t) => t.id === plannedTask.task_id);
  };

  const completedCount = plannedTasks.filter((t) => t.status === 'completed').length;
  const progressPercent = plannedTasks.length > 0 
    ? Math.round((completedCount / plannedTasks.length) * 100)
    : 0;

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
          <p className="text-gray-600 mt-1">View and manage your daily plan</p>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-gray-100 rounded-apple p-1">
            <button
              onClick={() => setViewMode('list')}
              className={clsx(
                'flex items-center gap-1 px-3 py-1.5 rounded-apple text-sm font-medium transition-colors',
                viewMode === 'list'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              <List className="w-4 h-4" />
              List
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={clsx(
                'flex items-center gap-1 px-3 py-1.5 rounded-apple text-sm font-medium transition-colors',
                viewMode === 'calendar'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              <LayoutGrid className="w-4 h-4" />
              Calendar
            </button>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      {plannedTasks.length > 0 && (
        <div className="glass-card flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-blue-500" />
            <span className="text-lg font-medium text-gray-900">
              {viewMode === 'list' ? formattedDate : 'Weekly Overview'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-600">
              {completedCount}/{plannedTasks.length} completed
            </div>
            <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-blue-500 to-green-500"
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Missed Tasks Banner */}
      <AnimatePresence>
        {missedTasks.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-orange-50 border border-orange-200 rounded-apple-lg p-4 shadow-sm"
          >
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              <h3 className="text-sm font-semibold text-orange-800">
                {missedTasks.length} missed task{missedTasks.length > 1 ? 's' : ''}
              </h3>
            </div>
            <div className="space-y-2">
              {missedTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between gap-3 bg-white/70 rounded-apple px-3 py-2 border border-orange-100"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{task.task_name}</p>
                    <p className="text-xs text-gray-500">
                      Was scheduled: {task.scheduled_start} – {task.scheduled_end}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => handleReschedule(task.id, 'next_slot')}
                      disabled={rescheduleLoading === task.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-apple bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
                      title="Reschedule to next available slot today"
                    >
                      <RefreshCw className={clsx('w-3 h-3', rescheduleLoading === task.id && 'animate-spin')} />
                      Now
                    </button>
                    <button
                      onClick={() => handleReschedule(task.id, 'tomorrow')}
                      disabled={rescheduleLoading === task.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-apple bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 transition-colors"
                      title="Move to tomorrow"
                    >
                      <CalendarPlus className="w-3 h-3" />
                      Tomorrow
                    </button>
                    <button
                      onClick={() => handleReschedule(task.id, 'skip')}
                      disabled={rescheduleLoading === task.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-apple bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50 transition-colors"
                      title="Skip this task"
                    >
                      <SkipForward className="w-3 h-3" />
                      Skip
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      {viewMode === 'calendar' ? (
        <div className="flex-1 min-h-[600px]">
          <CalendarView
            selectedDate={selectedDate}
            onSelectedDateChange={setSelectedDate}
            plannedTasks={plannedTasks}
            tasks={tasks}
            commitments={commitments}
            plansByDate={plansByDate}
            onEventClick={(event) => {
              // Handle task click - open details modal
              if (event.type === 'task' && event.plannedTask) {
                handleViewTask(event.plannedTask);
              }
            }}
          />
        </div>
      ) : (
        /* List View */
        <>
          {/* Date Navigation for List View */}
          <div className="glass-card flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-blue-500" />
              <span className="text-lg font-medium text-gray-900">{formattedDate}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={goToPreviousDay}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="secondary" size="sm" onClick={goToToday}>
                Today
              </Button>
              <Button variant="ghost" size="sm" onClick={goToNextDay}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        <div className="space-y-4">
          {plannedTasks
            .sort((a, b) => a.order - b.order)
            .map((plannedTask, index) => {
              const taskDetails = getTaskDetails(plannedTask);
              const isCompleted = plannedTask.status === 'completed';
              const isInProgress = plannedTask.status === 'in_progress';
              const isMissed = plannedTask.status === 'missed';
              const cognitiveType = taskDetails?.type || 'light_focus';
              const borderColor = isMissed ? 'border-orange-400' : cognitiveColors[cognitiveType] || 'border-blue-500';
              const bgColor = cognitiveBgColors[cognitiveType] || 'bg-blue-500/10';

              return (
                <motion.div
                  key={plannedTask.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={clsx(
                    'glass-card hover:shadow-md transition-shadow border-l-4',
                    borderColor,
                    isCompleted && 'opacity-60',
                    isMissed && 'border-dashed opacity-75',
                    isInProgress && `ring-2 ring-${cognitiveType === 'deep_focus' ? 'red' : cognitiveType === 'physical' ? 'green' : cognitiveType === 'admin' ? 'yellow' : cognitiveType === 'recovery' ? 'purple' : 'blue'}-500/20`
                  )}
                  style={{
                    backgroundColor: isMissed ? 'rgba(251, 146, 60, 0.08)' : isInProgress ? bgColor : undefined
                  }}
                >
                  <div className="flex items-start gap-4">
                    {/* Drag Handle */}
                    <div className="flex-shrink-0 pt-1 cursor-grab text-gray-400 hover:text-gray-600">
                      <GripVertical className="w-5 h-5" />
                    </div>

                    {/* Status */}
                    <button
                      onClick={() =>
                        handleStatusChange(
                          plannedTask.id,
                          isCompleted ? 'pending' : 'completed'
                        )
                      }
                      className={clsx(
                        'flex-shrink-0 mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors',
                        isCompleted
                          ? 'bg-green-500 border-green-500'
                          : isInProgress
                          ? 'border-blue-500'
                          : 'border-gray-400 hover:border-blue-500'
                      )}
                    >
                      {isCompleted && <CheckCircle2 className="w-4 h-4 text-white" />}
                      {isInProgress && (
                        <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
                      )}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div 
                          className="flex-1 cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => handleViewTask(plannedTask)}
                        >
                          <h3
                            className={clsx(
                              'text-base font-medium',
                              isCompleted
                                ? 'text-gray-500 line-through'
                                : isMissed
                                ? 'text-orange-700'
                                : 'text-gray-900'
                            )}
                          >
                            {isMissed && <AlertTriangle className="w-4 h-4 inline mr-1 text-orange-500" />}
                            {plannedTask.task_name}
                          </h3>
                          {plannedTask.notes && (
                            <p className="text-sm text-gray-600 mt-1">
                              💡 {plannedTask.notes}
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewTask(plannedTask)}
                            title="Edit task"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          {!isCompleted && !isInProgress && !isMissed && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleStartTask(plannedTask.id)}
                            >
                              <Play className="w-4 h-4" />
                            </Button>
                          )}
                          {isInProgress && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleCompleteTask(plannedTask.id)}
                            >
                              <CheckCircle2 className="w-4 h-4 mr-1" />
                              Done
                            </Button>
                          )}
                          {isMissed && (
                            <>
                              <button
                                onClick={() => handleReschedule(plannedTask.id, 'next_slot')}
                                disabled={rescheduleLoading === plannedTask.id}
                                className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-apple bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
                                title="Reschedule now"
                              >
                                <RefreshCw className={clsx('w-3 h-3', rescheduleLoading === plannedTask.id && 'animate-spin')} />
                              </button>
                              <button
                                onClick={() => handleReschedule(plannedTask.id, 'tomorrow')}
                                disabled={rescheduleLoading === plannedTask.id}
                                className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-apple bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 transition-colors"
                                title="Move to tomorrow"
                              >
                                <CalendarPlus className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => handleReschedule(plannedTask.id, 'skip')}
                                disabled={rescheduleLoading === plannedTask.id}
                                className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-apple bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50 transition-colors"
                                title="Skip"
                              >
                                <SkipForward className="w-3 h-3" />
                              </button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteTask(plannedTask.id)}
                            className="text-red-500 hover:bg-red-500/10"
                            title="Delete task"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Metadata */}
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        {taskDetails && (
                          <CognitiveLoadBadge type={taskDetails.type} />
                        )}
                        <PriorityBadge priority={plannedTask.priority} />
                        <div className="flex items-center gap-1 text-xs text-dark-400">
                          <Clock className="w-3.5 h-3.5" />
                          {plannedTask.suggested_duration}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
        </div>

          {plannedTasks.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16"
            >
              <Calendar className="w-16 h-16 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-700 mb-2">
                No tasks scheduled
              </h3>
              <p className="text-gray-600 mb-6">
                Use the AI Planner to create a schedule for today
              </p>
              <Button variant="primary" onClick={() => window.location.href = '/planner'}>
                Go to Planner
              </Button>
            </motion.div>
          )}
        </>
      )}

      {/* Edit Task Modal */}
      {isEditModalOpen && editedTask && (
        <Modal isOpen={isEditModalOpen} onClose={() => { setIsEditModalOpen(false); setEditedTask(null); }}>
          <div className="bg-white rounded-apple-lg p-6 max-w-md w-full shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Edit Task</h2>
              <button
                onClick={() => { setIsEditModalOpen(false); setEditedTask(null); }}
                className="text-gray-500 hover:text-gray-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Task Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Task Name
                </label>
                <Input
                  value={editedTask.task_name}
                  onChange={(e) => setEditedTask({ ...editedTask, task_name: e.target.value })}
                  placeholder="Enter task name"
                  className="bg-white border-gray-300 text-gray-900"
                />
              </div>

              {/* Duration */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Duration
                </label>
                <Input
                  value={editedTask.suggested_duration}
                  onChange={(e) => setEditedTask({ ...editedTask, suggested_duration: e.target.value })}
                  placeholder="e.g., 1 hour"
                  className="bg-white border-gray-300 text-gray-900"
                />
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Priority
                </label>
                <select
                  value={editedTask.priority}
                  onChange={(e) => setEditedTask({ ...editedTask, priority: e.target.value as PlannedTask['priority'] })}
                  className="w-full bg-white border border-gray-300 rounded-apple px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes
                </label>
                <Textarea
                  value={editedTask.notes || ''}
                  onChange={(e) => setEditedTask({ ...editedTask, notes: e.target.value })}
                  placeholder="Add notes about this task..."
                  className="bg-white border-gray-300 text-gray-900 min-h-24"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <Button
                variant="ghost"
                onClick={() => { setIsEditModalOpen(false); setEditedTask(null); }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSaveTask}
                className="flex-1"
              >
                Save Changes
              </Button>
            </div>

            {/* Delete Button */}
            <button
              onClick={() => {
                if (editedTask.id) {
                  handleDeleteTask(editedTask.id);
                }
              }}
              className="w-full mt-4 px-4 py-2 rounded-apple bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-colors text-sm font-medium"
            >
              Delete Task
            </button>
          </div>
        </Modal>
      )}

      {/* Task Details View Modal */}
      {selectedTask && !isEditModalOpen && (
        <Modal 
          isOpen={!!selectedTask} 
          onClose={() => setSelectedTask(null)}
        >
          <div className="bg-white rounded-apple-lg p-6 max-w-md w-full shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Task Details</h2>
              <button
                onClick={() => setSelectedTask(null)}
                className="text-gray-500 hover:text-gray-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Task Name */}
              <div>
                <label className="text-sm font-medium text-gray-600">Task Name</label>
                <p className="text-gray-900 text-lg font-medium mt-1">{selectedTask.task_name}</p>
              </div>

              {/* Status */}
              <div>
                <label className="text-sm font-medium text-gray-600">Status</label>
                <div className="mt-1">
                  <span className={clsx(
                    'inline-block px-3 py-1 rounded-full text-sm font-medium',
                    selectedTask.status === 'completed' ? 'bg-green-500/20 text-green-600' :
                    selectedTask.status === 'in_progress' ? 'bg-blue-500/20 text-blue-600' :
                    selectedTask.status === 'missed' ? 'bg-orange-500/20 text-orange-600' :
                    'bg-gray-200 text-gray-700'
                  )}>
                    {selectedTask.status === 'missed' ? '⚠ Missed' : selectedTask.status}
                  </span>
                </div>
              </div>

              {/* Reschedule Actions for Missed Tasks */}
              {selectedTask.status === 'missed' && (
                <div>
                  <label className="text-sm font-medium text-gray-600 mb-2 block">Reschedule</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { handleReschedule(selectedTask.id, 'next_slot'); setSelectedTask(null); }}
                      disabled={rescheduleLoading === selectedTask.id}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-apple bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
                    >
                      <RefreshCw className={clsx('w-3.5 h-3.5', rescheduleLoading === selectedTask.id && 'animate-spin')} />
                      Next Slot
                    </button>
                    <button
                      onClick={() => { handleReschedule(selectedTask.id, 'tomorrow'); setSelectedTask(null); }}
                      disabled={rescheduleLoading === selectedTask.id}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-apple bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 transition-colors"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" />
                      Tomorrow
                    </button>
                    <button
                      onClick={() => { handleReschedule(selectedTask.id, 'skip'); setSelectedTask(null); }}
                      disabled={rescheduleLoading === selectedTask.id}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-apple bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50 transition-colors"
                    >
                      <SkipForward className="w-3.5 h-3.5" />
                      Skip
                    </button>
                  </div>
                </div>
              )}

              {/* Priority */}
              <div>
                <label className="text-sm font-medium text-gray-600">Priority</label>
                <div className="mt-1">
                  <PriorityBadge priority={selectedTask.priority} />
                </div>
              </div>

              {/* Duration */}
              <div>
                <label className="text-sm font-medium text-gray-600">Duration</label>
                <p className="text-gray-900 mt-1">{selectedTask.suggested_duration}</p>
              </div>

              {/* Notes */}
              {selectedTask.notes && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Notes</label>
                  <p className="text-gray-900 mt-1">{selectedTask.notes}</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <Button
                variant="ghost"
                onClick={() => setSelectedTask(null)}
                className="flex-1"
              >
                Close
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setIsEditModalOpen(true);
                  setEditedTask({ ...selectedTask });
                }}
                className="flex-1 flex items-center justify-center gap-2"
              >
                <Edit className="w-4 h-4" />
                Edit
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {taskToDelete && (
        <Modal 
          isOpen={!!taskToDelete} 
          onClose={() => setTaskToDelete(null)}
        >
          <div className="bg-white rounded-apple-lg p-6 max-w-md w-full shadow-xl">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              
              <h2 className="text-xl font-bold text-gray-900 mb-2">Delete Task</h2>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete this task? This action cannot be undone.
              </p>

              <div className="flex gap-3 w-full">
                <Button
                  variant="ghost"
                  onClick={() => setTaskToDelete(null)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmDeleteTask}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
