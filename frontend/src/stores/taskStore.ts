import { create } from 'zustand';
import { Task, PlannedTask, DailyPlan, AIPlanResponse } from '@/types';
import { format } from 'date-fns';
import { planService, dailyStatsService, recurringTaskService } from '@/services/api';
import { useProjectStore } from './projectStore';

// Pull the latest projects so a project's progress bar / subtask states reflect
// hours the backend just logged or reversed for a linked task. Fire-and-forget.
function refreshProjects() {
  void useProjectStore.getState().loadProjects();
}

// Helper to track daily task stats for analytics
const syncDailyTaskStats = (date: string, plannedTasks: PlannedTask[]) => {
  const completed = plannedTasks.filter(t => t.status === 'completed').length;
  const missed = plannedTasks.filter(t => t.status === 'missed').length;
  const skipped = plannedTasks.filter(t => t.status === 'skipped').length;
  const total = plannedTasks.length;

  // Sync to backend (fire-and-forget). Note: focus_minutes is intentionally NOT
  // written here — real focus time lives in focus_sessions; writing 0 on every
  // status change only produced a misleading daily_stats.focus_minutes.
  dailyStatsService.save({
    date,
    tasks_completed: completed,
    tasks_missed: missed,
    tasks_skipped: skipped,
    tasks_total: total,
  }).catch(() => {});
};

interface TaskStore {
  tasks: Task[];
  currentPlan: DailyPlan | null;
  plannedTasks: PlannedTask[];
  isLoading: boolean;
  error: string | null;
  plansByDate: Record<string, DailyPlan>; // Map of date strings to plans

  // Task actions
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;

  // Plan actions
  setCurrentPlan: (plan: DailyPlan | null) => void;
  setPlannedTasks: (tasks: PlannedTask[]) => void;
  updatePlannedTask: (id: string, updates: Partial<PlannedTask>) => Promise<void>;
  linkTaskToProject: (taskId: string, projectId: string | null, subtaskId: string | null) => Promise<void>;
  deletePlannedTask: (id: string) => Promise<void>;
  reorderPlannedTasks: (tasks: PlannedTask[]) => void;

  // AI plan integration
  applyAIPlan: (response: AIPlanResponse, targetDate?: string) => void;

  // State management
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;

  // Load plan from database
  loadPlanFromDatabase: (date: string) => Promise<void>;
  loadPlansForDateRange: (startDate: string, endDate: string) => Promise<void>;

  // Missed task handling
  checkMissedTasks: () => Promise<void>;
  getMissedTasks: () => PlannedTask[];
  rescheduleTask: (
    taskId: string,
    mode: 'next_slot' | 'tomorrow' | 'skip' | 'custom',
    options?: { date?: string; time?: string },
  ) => Promise<void>;
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  currentPlan: null,
  plannedTasks: [],
  isLoading: false,
  error: null,
  plansByDate: {},

  setTasks: (tasks) => set({ tasks }),

  addTask: (task) => set((state) => ({
    tasks: [...state.tasks, task]
  })),

  updateTask: (id, updates) => set((state) => ({
    tasks: state.tasks.map((task) =>
      task.id === id ? { ...task, ...updates, updated_at: new Date().toISOString() } : task
    ),
  })),

  deleteTask: (id) => set((state) => ({
    tasks: state.tasks.filter((task) => task.id !== id),
  })),

  setCurrentPlan: (plan) => set({ currentPlan: plan }),

  setPlannedTasks: (tasks) => set({ plannedTasks: tasks }),

  updatePlannedTask: async (id, updates) => {
    const state = get();

    // Find the owning plan/date for this task
    let planId: string | undefined;
    let taskDate: string | undefined;
    let existingTask: PlannedTask | undefined;
    for (const [dateStr, plan] of Object.entries(state.plansByDate)) {
      const found = plan.tasks?.find((task) => task.id === id);
      if (found) {
        planId = plan.id;
        taskDate = dateStr;
        existingTask = found;
        break;
      }
    }

    // Fallback to current plan when plansByDate is not populated yet
    if (!planId && state.currentPlan?.tasks?.some((task) => task.id === id)) {
      planId = state.currentPlan.id;
      taskDate = state.currentPlan.date;
      existingTask = state.currentPlan.tasks.find((task) => task.id === id);
    }

    if (!planId || !taskDate) {
      throw new Error('No plan found for this task');
    }

    // Persist update to backend first
    await planService.updateTask(planId, id, {
      status: updates.status,
      actual_start: updates.actual_start,
      actual_end: updates.actual_end,
      order: updates.order,
      task_name: updates.task_name,
      suggested_duration: updates.suggested_duration,
      priority: updates.priority,
      notes: updates.notes,
      scheduled_start: updates.scheduled_start,
      scheduled_end: updates.scheduled_end,
      start_type: updates.start_type,
      minutes_offset: updates.minutes_offset,
    });

    // Update local state after backend success
    const updatedPlansByDate: Record<string, DailyPlan> = { ...state.plansByDate };

    if (updatedPlansByDate[taskDate]?.tasks) {
      updatedPlansByDate[taskDate] = {
        ...updatedPlansByDate[taskDate],
        tasks: updatedPlansByDate[taskDate].tasks.map((task) =>
          task.id === id ? { ...task, ...updates } : task
        ),
      };
    }

    const updatedCurrentPlan =
      state.currentPlan && state.currentPlan.date === taskDate
        ? {
            ...state.currentPlan,
            tasks: state.currentPlan.tasks.map((task) =>
              task.id === id ? { ...task, ...updates } : task
            ),
          }
        : state.currentPlan;

    const allTasks: PlannedTask[] = [];
    Object.values(updatedPlansByDate).forEach((plan) => {
      if (plan.tasks) allTasks.push(...plan.tasks);
    });

    set({
      plansByDate: updatedPlansByDate,
      currentPlan: updatedCurrentPlan,
      plannedTasks: allTasks.length > 0 ? allTasks : state.plannedTasks.map((task) =>
        task.id === id ? { ...task, ...updates } : task
      ),
    });

    const statsTasks = updatedPlansByDate[taskDate]?.tasks || [];
    syncDailyTaskStats(taskDate, statsTasks);

    // A completion/un-completion of a project-linked task makes the backend
    // log or reverse its hours; refresh projects so the bar/subtasks update.
    const statusChanged = updates.status && existingTask && updates.status !== existingTask.status;
    if (statusChanged && existingTask?.project_id) {
      refreshProjects();
    }
  },

  linkTaskToProject: async (taskId, projectId, subtaskId) => {
    const state = get();

    // Locate the plan that owns this task
    let planId: string | undefined;
    let taskDate: string | undefined;
    for (const [dateStr, plan] of Object.entries(state.plansByDate)) {
      if (plan.tasks?.some((t) => t.id === taskId)) {
        planId = plan.id;
        taskDate = dateStr;
        break;
      }
    }
    if (!planId && state.currentPlan?.tasks?.some((t) => t.id === taskId)) {
      planId = state.currentPlan.id;
      taskDate = state.currentPlan.date;
    }
    if (!planId) throw new Error('No plan found for this task');

    await planService.linkTask(planId, taskId, projectId, subtaskId);

    // Reflect the link locally (subtask only makes sense with a project)
    const patch: Partial<PlannedTask> = {
      project_id: projectId,
      project_subtask_id: projectId ? subtaskId : null,
    };
    const applyPatch = (t: PlannedTask) => (t.id === taskId ? { ...t, ...patch } : t);
    set((s) => {
      const plansByDate = { ...s.plansByDate };
      if (taskDate && plansByDate[taskDate]?.tasks) {
        plansByDate[taskDate] = {
          ...plansByDate[taskDate],
          tasks: plansByDate[taskDate].tasks.map(applyPatch),
        };
      }
      const currentPlan = s.currentPlan
        ? { ...s.currentPlan, tasks: s.currentPlan.tasks.map(applyPatch) }
        : s.currentPlan;
      return { plansByDate, currentPlan, plannedTasks: s.plannedTasks.map(applyPatch) };
    });

    // Linking an already-completed task logs its hours immediately (and
    // unlinking reverses), so refresh projects to reflect it.
    refreshProjects();
  },

  deletePlannedTask: async (id) => {
    const state = get();

    // Find which plan contains this task
    let planId: string | undefined;
    let taskDate: string | undefined;
    let deletedWasLinked = false;

    // First check plansByDate
    for (const [dateStr, plan] of Object.entries(state.plansByDate)) {
      const found = plan.tasks?.find(task => task.id === id);
      if (found) {
        planId = plan.id;
        taskDate = dateStr;
        deletedWasLinked = !!found.project_id;
        break;
      }
    }

    // Fallback to currentPlan if not found in plansByDate
    if (!planId && state.currentPlan) {
      planId = state.currentPlan.id;
    }

    if (!planId) {
      throw new Error('No plan found for this task');
    }

    try {
      // Delete from database first
      await planService.deleteTask(planId, id);

      // Update local state
      if (taskDate && state.plansByDate[taskDate]) {
        // Update plansByDate
        const updatedPlan = {
          ...state.plansByDate[taskDate],
          tasks: state.plansByDate[taskDate].tasks?.filter((task) => task.id !== id) || [],
        };
        set({
          plansByDate: {
            ...state.plansByDate,
            [taskDate]: updatedPlan,
          },
        });
      }

      // Also update plannedTasks if it's the current plan
      const newPlannedTasks = state.plannedTasks.filter((task) => task.id !== id);
      if (taskDate && state.plansByDate[taskDate]) {
        const statsTasks = state.plansByDate[taskDate].tasks?.filter((task) => task.id !== id) || [];
        syncDailyTaskStats(taskDate, statsTasks);
      }
      set({ plannedTasks: newPlannedTasks });

      // Deleting a linked task reverses its logged hours on the backend.
      if (deletedWasLinked) refreshProjects();
    } catch (error) {
      console.error('Failed to delete task:', error);
      throw error;
    }
  },

  reorderPlannedTasks: (tasks) => set({
    plannedTasks: tasks.map((task, index) => ({ ...task, order: index })),
  }),

  applyAIPlan: async (response, targetDate) => {
    // Defensive: never save an empty plan (AI outage). Saving would re-write the
    // day's existing tasks for no benefit. PlannerChat also guards this upstream.
    if (!response.plan || response.plan.length === 0) {
      console.warn('applyAIPlan called with an empty plan — skipping save.');
      return;
    }
    const state = get();
    const planDate = targetDate || format(new Date(), 'yyyy-MM-dd');

    try {
      console.log('🔍 AI Plan Response:', response);
      console.log('📅 Target date for plan:', planDate);

      // ALWAYS fetch the freshest plan before merging — reading the possibly
      // stale plansByDate could re-save statuses that another tab, another
      // device, or the missed-task sweep already changed. Fall back to the
      // in-memory copy only if the fetch fails.
      const currentPlan: DailyPlan | undefined =
        (await planService.getForDate(planDate).catch(() => undefined)) ||
        state.plansByDate[planDate];

      // Convert plan items to PlannedTask objects (no separate task entries needed)
      const aiTasks: PlannedTask[] = response.plan.map((item, index) => {
        // Use scheduled_start and scheduled_end from the backend if available
        // The backend's schedule service already enforces timing constraints
        const scheduled_start = item.scheduled_start;
        const scheduled_end = item.scheduled_end;

        if (scheduled_start && scheduled_end) {
          console.log(`✅ Task "${item.task_name}": ${scheduled_start} - ${scheduled_end}`);
        } else {
          console.error(
            `❌ Task "${item.task_name}" missing scheduled times!`,
            'This will not appear on calendar.',
            { item }
          );
        }

        return {
          id: `planned-${Date.now()}-${index}`,
          task_id: '', // No separate task reference needed
          task_name: item.task_name,
          suggested_duration: item.suggested_duration,
          priority: item.priority,
          notes: item.notes,
          scheduled_start: scheduled_start,
          scheduled_end: scheduled_end,
          status: 'pending' as const,
          order: index,
          // Carry the AI's cognitive type so it's saved + colours the calendar
          // (otherwise the backend defaults it to light_focus on save).
          cognitive_load: item.cognitive_load,
          // Carry the real calendar date the AI stamped (past-midnight blocks);
          // manual tasks leave this unset and default to the plan's date on save.
          scheduled_date: item.scheduled_date,
        };
      });

      // Get ALL existing tasks for this date (keep them all — both manual and previous AI tasks)
      const existingTasks = currentPlan?.tasks || [];
      console.log(`📋 Existing tasks for ${planDate}: ${existingTasks.length}`);

      // Check for duplicate task names to avoid re-adding the same task
      const existingNames = new Set(existingTasks.map(t => t.task_name.toLowerCase().trim()));
      const uniqueAiTasks = aiTasks.filter(t => !existingNames.has(t.task_name.toLowerCase().trim()));
      console.log(`🆕 New AI tasks (deduplicated): ${uniqueAiTasks.length} of ${aiTasks.length}`);

      // Combine existing tasks with new AI tasks, renumber order
      const combinedTasks = [
        ...existingTasks.map((task, idx) => ({ ...task, order: idx })),
        ...uniqueAiTasks.map((task, idx) => ({
          ...task,
          order: existingTasks.length + idx,
          notes: task.notes ? `${task.notes}\n(AI-generated)` : '(AI-generated)'
        }))
      ];

      // Save plan to database
      const planToSave = {
        date: planDate,
        is_ai_generated: true,
        tasks: combinedTasks,
      };

      // Call API to save the plan and use the RESPONSE (which has real DB IDs)
      let savedPlan: DailyPlan | undefined;
      try {
        savedPlan = await planService.save(planToSave);
      } catch (error: any) {
        if (error?.response?.status === 401) {
          return; // Will be redirected by interceptor
        }
        console.error('Failed to save plan to database:', error?.message || error);
      }

      // Use saved plan from DB response if available (it has real IDs), fallback to local
      const finalTasks = savedPlan?.tasks || combinedTasks;
      const finalPlan = savedPlan || {
        date: planDate,
        is_ai_generated: true,
        tasks: finalTasks,
      } as DailyPlan;

      // Merge into plansByDate WITHOUT wiping other dates  
      const updatedPlansByDate = {
        ...state.plansByDate,
        [planDate]: finalPlan,
      };

      // Rebuild the flat plannedTasks from all plans
      const allTasks: PlannedTask[] = [];
      Object.values(updatedPlansByDate).forEach((plan) => {
        if (plan.tasks) {
          allTasks.push(...plan.tasks);
        }
      });

      set({
        plannedTasks: allTasks,
        currentPlan: finalPlan,
        plansByDate: updatedPlansByDate,
      });

      // Track initial plan for analytics
      syncDailyTaskStats(planDate, finalTasks);
    } catch (error) {
      console.error('Error applying AI plan:', error);
    }
  },

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  loadPlanFromDatabase: async (date) => {
    set({ isLoading: true });
    try {
      const plan = await planService.getForDate(date);
      if (plan && plan.tasks) {
        const state = get();
        const updatedPlansByDate = {
          ...state.plansByDate,
          [date]: plan,
        };
        set({
          plannedTasks: plan.tasks,
          currentPlan: plan,
          plansByDate: updatedPlansByDate,
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }
    } catch (error: any) {
      if (error?.response?.status === 401) {
        set({ isLoading: false, plannedTasks: [], currentPlan: null });
        return;
      }
      if (error?.response?.status === 404) {
        // No plan for this date — show recurring tasks as preview
        try {
          const recurring = await recurringTaskService.getForDate(date);
          if (recurring && recurring.length > 0) {
            const previewTasks: PlannedTask[] = recurring.map((rt: any, idx: number) => ({
              id: `recurring-preview-${rt.recurring_task_id}-${idx}`,
              task_id: '',
              task_name: rt.task_name,
              suggested_duration: rt.suggested_duration,
              priority: rt.priority,
              notes: rt.notes || '(Recurring task)',
              scheduled_start: rt.scheduled_start,
              scheduled_end: rt.scheduled_end,
              status: 'pending' as const,
              order: idx,
            }));
            const previewPlan: DailyPlan = {
              id: `preview-${date}`,
              user_id: '',
              date,
              is_ai_generated: false,
              tasks: previewTasks,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            const state = get();
            set({
              plannedTasks: previewTasks,
              currentPlan: previewPlan,
              plansByDate: { ...state.plansByDate, [date]: previewPlan },
              isLoading: false,
            });
            return;
          }
        } catch {
          // Ignore — recurring tasks fetch is best-effort
        }
        set({ isLoading: false });
        return;
      }
      console.error('Error loading plan from database:', error?.message || error);
      set({ isLoading: false, error: 'Failed to load plan' });
    }
  },

  loadPlansForDateRange: async (startDate, endDate) => {
    set({ isLoading: true });
    try {
      const plans = await planService.getForDateRange(startDate, endDate);
      const state = get();
      
      if (plans && plans.length > 0) {
        // Merge loaded plans into existing plansByDate (don't wipe unloaded dates)
        const mergedPlansByDate: Record<string, DailyPlan> = { ...state.plansByDate };
        const allTasks: PlannedTask[] = [];

        plans.forEach((plan: DailyPlan) => {
          mergedPlansByDate[plan.date] = plan;
        });

        // Rebuild allTasks from ALL plans in the merged map
        Object.values(mergedPlansByDate).forEach((plan) => {
          if (plan.tasks) {
            allTasks.push(...plan.tasks);
          }
        });

        set({
          plannedTasks: allTasks,
          plansByDate: mergedPlansByDate,
          isLoading: false,
        });
      } else {
        // No plans for this range — DON'T wipe existing data
        set({ isLoading: false });
      }
    } catch (error: any) {
      if (error?.response?.status === 401) {
        set({ isLoading: false, plannedTasks: [], plansByDate: {} });
        return;
      }
      if (error?.response?.status === 404) {
        // No plans in range is normal
        set({ isLoading: false });
        return;
      }
      console.error('Error loading plans for date range:', error?.message || error);
      set({ isLoading: false, error: 'Failed to load plans' });
    }
  },

  checkMissedTasks: async () => {
    const state = get();
    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');
    const plan = state.plansByDate[todayStr];
    if (!plan?.tasks) return;

    const GRACE_MINUTES = 15;
    let changed = false;
    const missedTaskIds: string[] = [];
    const updatedTasks = plan.tasks.map((task) => {
      if (task.status !== 'pending' || !task.scheduled_end) return task;

      // Guard 1: if the start window hasn't opened yet, the task cannot be missed.
      // Handles late-night tasks (e.g. 23:00 start at 8 PM) without complex logic.
      if (task.scheduled_start) {
        const [sh, sm] = task.scheduled_start.split(':').map(Number);
        const startTime = new Date(now);
        startTime.setHours(sh, sm, 0, 0);
        if (startTime > now) return task;
      }

      const [endH, endM] = task.scheduled_end.split(':').map(Number);
      const endTime = new Date(now);
      endTime.setHours(endH, endM, 0, 0);
      // Guard 2: cross-midnight task (e.g. 23:00–00:30): end belongs to NEXT day.
      if (task.scheduled_start) {
        const [startH, startM] = task.scheduled_start.split(':').map(Number);
        if (endH * 60 + endM <= startH * 60 + startM) {
          endTime.setDate(endTime.getDate() + 1);
        }
      }
      endTime.setMinutes(endTime.getMinutes() + GRACE_MINUTES);
      if (now > endTime) {
        changed = true;
        missedTaskIds.push(task.id);
        return { ...task, status: 'missed' as const };
      }
      return task;
    });

    if (!changed) return;

    const planId = plan.id;
    const updatedPlan = { ...plan, tasks: updatedTasks };
    const updatedPlansByDate = { ...state.plansByDate, [todayStr]: updatedPlan };
    const allTasks: PlannedTask[] = [];
    Object.values(updatedPlansByDate).forEach((p) => {
      if (p.tasks) allTasks.push(...p.tasks);
    });

    // Optimistic local update so the UI reflects missed status immediately.
    set({
      plansByDate: updatedPlansByDate,
      plannedTasks: allTasks,
      currentPlan: updatedPlan,
    });
    syncDailyTaskStats(todayStr, updatedTasks);

    // Persist in parallel, then roll back any tasks whose write failed —
    // otherwise local state drifts from backend on the next page load.
    const results = await Promise.allSettled(
      missedTaskIds.map((taskId) =>
        planService.updateTask(planId, taskId, { status: 'missed' }),
      ),
    );

    const failedIds: string[] = [];
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error('Failed to persist missed status:', result.reason);
        failedIds.push(missedTaskIds[index]);
      }
    });

    if (failedIds.length === 0) return;

    // Roll back the failed tasks to pending locally so retries can happen.
    const latest = get();
    const currentPlan = latest.plansByDate[todayStr];
    if (!currentPlan?.tasks) return;

    const failedSet = new Set(failedIds);
    const revertedTasks = currentPlan.tasks.map((t) =>
      failedSet.has(t.id) && t.status === 'missed'
        ? { ...t, status: 'pending' as const }
        : t,
    );
    const revertedPlan = { ...currentPlan, tasks: revertedTasks };
    const revertedPlansByDate = { ...latest.plansByDate, [todayStr]: revertedPlan };
    const revertedAllTasks: PlannedTask[] = [];
    Object.values(revertedPlansByDate).forEach((p) => {
      if (p.tasks) revertedAllTasks.push(...p.tasks);
    });

    set({
      plansByDate: revertedPlansByDate,
      plannedTasks: revertedAllTasks,
      currentPlan:
        latest.currentPlan && latest.currentPlan.date === todayStr
          ? revertedPlan
          : latest.currentPlan,
    });
    syncDailyTaskStats(todayStr, revertedTasks);
  },

  getMissedTasks: () => {
    const state = get();
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const plan = state.plansByDate[todayStr];
    return plan?.tasks?.filter((t) => t.status === 'missed') || [];
  },

  rescheduleTask: async (taskId, mode, options) => {
    const state = get();

    // Find which plan contains this task
    let planId: string | undefined;
    let taskDate: string | undefined;
    for (const [dateStr, plan] of Object.entries(state.plansByDate)) {
      if (plan.tasks?.some((t) => t.id === taskId)) {
        planId = plan.id;
        taskDate = dateStr;
        break;
      }
    }
    if (!planId || !taskDate) throw new Error('Task not found in any plan');

    if (mode === 'skip') {
      // Mark as skipped
      const plan = state.plansByDate[taskDate];
      const updatedTasks = plan.tasks.map((t) =>
        t.id === taskId ? { ...t, status: 'skipped' as const } : t
      );

      await planService.updateTask(planId, taskId, { status: 'skipped' });

      const updatedPlan = { ...plan, tasks: updatedTasks };
      const updatedPlansByDate = { ...state.plansByDate, [taskDate]: updatedPlan };
      const allTasks: PlannedTask[] = [];
      Object.values(updatedPlansByDate).forEach((p) => {
        if (p.tasks) allTasks.push(...p.tasks);
      });
      set({ plansByDate: updatedPlansByDate, plannedTasks: allTasks });
      syncDailyTaskStats(taskDate, updatedTasks);
      return;
    }

    try {
      const apiMode = mode === 'tomorrow' ? 'tomorrow' : mode === 'custom' ? 'custom' : 'next_slot';
      const result = await planService.rescheduleTask(
        planId,
        taskId,
        apiMode,
        options?.date,
        options?.time,
      );

      // Treat as cross-date move whenever the backend places the task on a
      // different day than its current plan — covers 'tomorrow' AND 'custom'
      // when the user picked a future date.
      const isCrossDateMove = result.date && result.date !== taskDate;

      if (isCrossDateMove) {
        // Move task to tomorrow's plan
        const task = state.plansByDate[taskDate]?.tasks?.find((t) => t.id === taskId);
        if (!task) return;

        // Remove from today
        const todayPlan = state.plansByDate[taskDate];
        const todayTasks = todayPlan.tasks.filter((t) => t.id !== taskId);

        // Build tomorrow's task list with the rescheduled task appended.
        // The synthetic id below is only a local placeholder; we replace state
        // with the backend's response (which carries real DB ids) below.
        const existingTomorrowPlan = state.plansByDate[result.date];
        const rescheduledTaskDraft: PlannedTask = {
          ...task,
          id: `rescheduled-${Date.now()}`,
          scheduled_start: result.scheduled_start,
          scheduled_end: result.scheduled_end,
          // Moved to a new day → its real date is the new date (don't carry the
          // spread-in old scheduled_date, which would misfire reminders/missed).
          scheduled_date: result.date,
          status: 'pending' as const,
          actual_start: undefined,
          actual_end: undefined,
          start_type: undefined,
          minutes_offset: undefined,
          notes: `${task.notes || ''}\n(Rescheduled from ${taskDate})`.trim(),
        };
        const tomorrowTasksDraft = [...(existingTomorrowPlan?.tasks || []), rescheduledTaskDraft];

        // Persist both plans and use the saved responses (with real DB ids).
        let savedTomorrowPlan: DailyPlan | undefined;
        try {
          savedTomorrowPlan = await planService.save({
            date: result.date,
            is_ai_generated: existingTomorrowPlan?.is_ai_generated ?? false,
            tasks: tomorrowTasksDraft,
          });
        } catch (e) {
          console.error('Failed to save rescheduled plan:', e);
        }

        let savedTodayPlan: DailyPlan | undefined;
        try {
          savedTodayPlan = await planService.save({
            date: taskDate,
            is_ai_generated: todayPlan.is_ai_generated,
            tasks: todayTasks,
          });
        } catch (e) {
          console.error('Failed to save updated today plan:', e);
        }

        const finalTodayPlan: DailyPlan = savedTodayPlan ?? { ...todayPlan, tasks: todayTasks };
        const finalTomorrowPlan: DailyPlan =
          savedTomorrowPlan
          ?? (existingTomorrowPlan
            ? { ...existingTomorrowPlan, tasks: tomorrowTasksDraft }
            : {
                id: '',
                user_id: '',
                date: result.date,
                tasks: tomorrowTasksDraft,
                is_ai_generated: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });

        const updatedPlansByDate = {
          ...state.plansByDate,
          [taskDate]: finalTodayPlan,
          [result.date]: finalTomorrowPlan,
        };

        const allTasks: PlannedTask[] = [];
        Object.values(updatedPlansByDate).forEach((p) => {
          if (p.tasks) allTasks.push(...p.tasks);
        });

        const updatedCurrentPlan =
          state.currentPlan && state.currentPlan.date === taskDate
            ? finalTodayPlan
            : state.currentPlan && state.currentPlan.date === result.date
              ? finalTomorrowPlan
              : state.currentPlan;

        set({
          plansByDate: updatedPlansByDate,
          plannedTasks: allTasks,
          currentPlan: updatedCurrentPlan,
        });
        syncDailyTaskStats(taskDate, finalTodayPlan.tasks || todayTasks);
        syncDailyTaskStats(result.date, finalTomorrowPlan.tasks || tomorrowTasksDraft);
      } else {
        // Reschedule to next slot today
        const plan = state.plansByDate[taskDate];
        const updatedTasks = plan.tasks.map((t) =>
          t.id === taskId ? {
            ...t,
            scheduled_start: result.scheduled_start,
            scheduled_end: result.scheduled_end,
            status: 'pending' as const,
            actual_start: undefined,
            actual_end: undefined,
            start_type: undefined,
            minutes_offset: undefined,
            notes: `${t.notes || ''}\n(Rescheduled)`.trim(),
          } : t
        );

        // Persist and use the saved plan (with real DB ids) when available.
        let savedPlan: DailyPlan | undefined;
        try {
          savedPlan = await planService.save({
            date: taskDate,
            is_ai_generated: plan.is_ai_generated,
            tasks: updatedTasks,
          });
        } catch (e) {
          console.error('Failed to save rescheduled plan:', e);
        }

        const finalPlan: DailyPlan = savedPlan ?? { ...plan, tasks: updatedTasks };
        const updatedPlansByDate = { ...state.plansByDate, [taskDate]: finalPlan };

        const allTasks: PlannedTask[] = [];
        Object.values(updatedPlansByDate).forEach((p) => {
          if (p.tasks) allTasks.push(...p.tasks);
        });

        const updatedCurrentPlan =
          state.currentPlan && state.currentPlan.date === taskDate
            ? finalPlan
            : state.currentPlan;

        set({
          plansByDate: updatedPlansByDate,
          plannedTasks: allTasks,
          currentPlan: updatedCurrentPlan,
        });
        syncDailyTaskStats(taskDate, finalPlan.tasks || updatedTasks);
      }
    } catch (error: any) {
      console.error('Reschedule failed:', error?.message || error);
      throw error;
    }
  },

  reset: () => set({
    tasks: [],
    currentPlan: null,
    plannedTasks: [],
    isLoading: false,
    error: null,
    plansByDate: {},
  }),
}));
