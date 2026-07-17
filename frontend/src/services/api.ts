import axios from 'axios';
import { AIPlanRequest, AIPlanResponse, UserContext } from '@/types';
import { broadcastTimerCleared, broadcastTimerSaved } from './timerBroadcast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const authData = localStorage.getItem('taskly-auth');
  if (authData) {
    try {
      const { state } = JSON.parse(authData);
      if (state?.session?.access_token) {
        config.headers.Authorization = `Bearer ${state.session.access_token}`;
        console.debug('[API] Auth token attached', { url: config.url });
      }
    } catch (e) {
      console.error('[API] Error parsing auth data:', e);
    }
  }
  return config;
});

// Handle authentication errors - redirect to landing page if logged out
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const requestUrl = error.config?.url || '';
      
      // Only clear auth and redirect for critical auth failures
      // Don't redirect on plan loading failures (could be empty plans, not auth issues)
      const isAuthCritical = requestUrl.includes('/ai/') || 
                             requestUrl.includes('/profile/') || 
                             requestUrl.includes('/tasks/');
      
      if (isAuthCritical) {
        // User is actually logged out from backend, clear auth and redirect
        localStorage.removeItem('taskly-auth');

        // Send them to the real auth page; avoid a redirect loop if already there.
        const currentPath = window.location.pathname;
        if (currentPath !== '/app/auth') {
          window.location.href = '/app/auth';
        }
      }
    }
    return Promise.reject(error);
  }
);

// AI Planning API
export const aiService = {
  /**
   * Generate an AI-powered plan from raw task input
   */
  async generatePlan(
    rawTasksInput: string,
    userContext: UserContext,
    targetDate: string
  ): Promise<AIPlanResponse> {
    const request: AIPlanRequest = {
      raw_tasks_input: rawTasksInput,
      user_context: userContext,
      target_date: targetDate,
    };

    const response = await api.post<AIPlanResponse>('/ai/plan', request);
    return response.data;
  },

  /**
   * Update an existing plan with AI suggestions
   */
  async updatePlan(
    currentPlan: AIPlanResponse,
    modifications: string,
    userContext: UserContext
  ): Promise<AIPlanResponse> {
    const response = await api.post<AIPlanResponse>('/ai/plan/update', {
      current_plan: currentPlan,
      modifications,
      user_context: userContext,
    });
    return response.data;
  },

  /**
   * Get AI-generated reflection prompts for end-of-day
   */
  async getReflectionPrompts(
    completedTasks: string[],
    skippedTasks: string[],
    energyLevel: number,
    focusLevel: number
  ): Promise<{
    prompts: string[];
    suggestions: string[];
  }> {
    const response = await api.post('/ai/reflection', {
      completed_tasks: completedTasks,
      skipped_tasks: skippedTasks,
      energy_level: energyLevel,
      focus_level: focusLevel,
    });
    return response.data;
  },

  /**
   * Classify a single task
   */
  async classifyTask(taskDescription: string): Promise<{
    name: string;
    type: string;
    estimated_effort: number;
    flexibility: string;
  }> {
    const response = await api.post('/ai/classify', {
      task_description: taskDescription,
    });
    return response.data;
  },
};

// Task API
export const taskService = {
  async getAll() {
    const response = await api.get('/tasks');
    return response.data;
  },

  async create(task: any) {
    const response = await api.post('/tasks', task);
    return response.data;
  },

  async update(id: string, updates: any) {
    const response = await api.put(`/tasks/${id}`, updates);
    return response.data;
  },

  async delete(id: string) {
    await api.delete(`/tasks/${id}`);
  },
};

// Plan API
export const planService = {
  async getForDate(date: string) {
    const response = await api.get(`/plans/${date}`);
    return response.data;
  },

  async getForDateRange(startDate: string, endDate: string) {
    const response = await api.get(`/plans/range/${startDate}/${endDate}`);
    return response.data;
  },

  async save(plan: any) {
    const response = await api.post('/plans', plan);
    return response.data;
  },

  async updateTask(planId: string, taskId: string, updates: any) {
    const response = await api.patch(`/plans/${planId}/tasks/${taskId}`, updates);
    return response.data;
  },

  async updateTaskStatus(planId: string, taskId: string, status: string) {
    return this.updateTask(planId, taskId, { status });
  },

  // Manually link a planned task to a project (+ optional subtask), or unlink
  // it by passing projectId=null. The backend logs/reverses hours immediately.
  async linkTask(
    planId: string,
    taskId: string,
    projectId: string | null,
    subtaskId: string | null,
  ) {
    const response = await api.post(`/plans/${planId}/tasks/${taskId}/link`, {
      project_id: projectId,
      project_subtask_id: subtaskId,
    });
    return response.data;
  },

  async deleteTask(planId: string, taskId: string) {
    await api.delete(`/plans/${planId}/tasks/${taskId}`);
  },

  async rescheduleTask(planId: string, taskId: string, mode: 'next_slot' | 'tomorrow' | 'custom', date?: string, time?: string) {
    const response = await api.post(`/plans/${planId}/tasks/${taskId}/reschedule`, {
      mode,
      date,
      time,
    });
    return response.data;
  },
};

// Schedule API
export interface BusyWindow {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
  label: string;
  kind: 'commitment' | 'task';
  task_id?: string;
}

export interface FreeSlotsResponse {
  date: string;
  wake_time: string;        // "HH:MM"
  sleep_deadline: string;   // "HH:MM"
  busy_windows: BusyWindow[];
}

export const scheduleService = {
  async enforceTiming(plannedTasks: any[]) {
    const response = await api.post('/schedule/enforce', {
      planned_tasks: plannedTasks,
    });
    return response.data;
  },

  async getTimeBlocks(date: string) {
    const response = await api.get(`/schedule/blocks/${date}`);
    return response.data;
  },

  async getFreeSlots(date: string, excludeTaskId?: string): Promise<FreeSlotsResponse> {
    const params = excludeTaskId ? { exclude_task_id: excludeTaskId } : undefined;
    const response = await api.get<FreeSlotsResponse>(
      `/plans/schedule/free-slots/${date}`,
      { params },
    );
    return response.data;
  },
};

// Notification API
export interface NotificationPreferences {
  enabled: boolean;
  task_reminders: boolean;
  break_reminders: boolean;
  daily_summary: boolean;
  sleep_warning: boolean;
  reflection_reminder: boolean;
  achievement_notifications: boolean;
  reminder_minutes_before: number;
  quiet_hours_start: string;
  quiet_hours_end: string;
  timezone: string;
  daily_summary_time: string;
  reflection_time: string;
}

export const notificationService = {
  async registerToken(token: string, deviceHint?: string) {
    await api.post('/notifications/register', { token, device_hint: deviceHint });
  },

  async unregisterToken(token: string) {
    await api.post('/notifications/unregister', { token });
  },

  async getPreferences(): Promise<NotificationPreferences> {
    const response = await api.get<NotificationPreferences>('/notifications/preferences');
    return response.data;
  },

  async updatePreferences(prefs: NotificationPreferences): Promise<NotificationPreferences> {
    const response = await api.put<NotificationPreferences>('/notifications/preferences', prefs);
    return response.data;
  },

  async sendTest(title?: string, body?: string) {
    const response = await api.post('/notifications/test', { title, body });
    return response.data as { success: boolean; delivered_to: number };
  },
};

// Profile/Commitment API
export const commitmentService = {
  async getAll() {
    const response = await api.get('/profile/commitments');
    return response.data;
  },

  async create(commitment: any) {
    const response = await api.post('/profile/commitments', commitment);
    return response.data;
  },

  async delete(id: string) {
    await api.delete(`/profile/commitments/${id}`);
  },
};

// First-run onboarding status
export const onboardingService = {
  async getStatus(): Promise<{ has_onboarded: boolean }> {
    const response = await api.get('/profile/onboarding');
    return response.data;
  },

  async complete(timezone?: string): Promise<{ has_onboarded: boolean }> {
    const response = await api.post('/profile/onboarding', timezone ? { timezone } : {});
    return response.data;
  },
};

export const profileService = {
  async getEnergyProfile() {
    const response = await api.get('/profile/energy');
    return response.data;
  },

  async saveEnergyProfile(profile: any) {
    const response = await api.post('/profile/energy', profile);
    return response.data;
  },

  async getSleepSchedule() {
    const response = await api.get('/profile/sleep');
    return response.data;
  },

  async saveSleepSchedule(schedule: any) {
    const response = await api.post('/profile/sleep', schedule);
    return response.data;
  },

  async getPreferences() {
    const response = await api.get('/profile/preferences');
    return response.data;
  },

  async savePreferences(preferences: any) {
    const response = await api.post('/profile/preferences', preferences);
    return response.data;
  },
};

// Focus Sessions API
export const focusSessionService = {
  async getForDate(date: string) {
    const response = await api.get(`/data/focus-sessions/${date}`);
    return response.data;
  },

  async getForDateRange(startDate: string, endDate: string) {
    const response = await api.get(`/data/focus-sessions/range/${startDate}/${endDate}`);
    return response.data;
  },

  async save(session: any) {
    const response = await api.post('/data/focus-sessions', session);
    return response.data;
  },

  async syncForDate(date: string, sessions: any[]) {
    const response = await api.post('/data/focus-sessions/sync', {
      date,
      sessions,
    });
    return response.data;
  },
};

export interface ActiveFocusTimer {
  id?: string;
  user_id?: string;
  mode: 'focus' | 'shortBreak' | 'longBreak';
  task_id: string | null;
  task_name: string | null;
  task_date: string | null;
  is_running: boolean;
  remaining_seconds: number;
  total_seconds: number;
  started_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export const activeFocusTimerService = {
  async get(): Promise<ActiveFocusTimer | null> {
    const response = await api.get('/data/active-focus-timer');
    return response.data;
  },

  async save(timer: ActiveFocusTimer): Promise<ActiveFocusTimer> {
    const response = await api.put('/data/active-focus-timer', timer);
    // Notify other tabs so they don't drift / overwrite this state.
    broadcastTimerSaved(response.data);
    return response.data;
  },

  async clear(): Promise<void> {
    await api.delete('/data/active-focus-timer');
    broadcastTimerCleared();
  },
};

// Sleep Entries API
export const sleepEntryService = {
  async getAll(limit = 90) {
    const response = await api.get(`/data/sleep-entries?limit=${limit}`);
    return response.data;
  },

  async getForDateRange(startDate: string, endDate: string) {
    const response = await api.get(`/data/sleep-entries/range/${startDate}/${endDate}`);
    return response.data;
  },

  async save(entry: any) {
    const response = await api.post('/data/sleep-entries', entry);
    return response.data;
  },

  async syncAll(entries: any[]) {
    const response = await api.post('/data/sleep-entries/sync', { entries });
    return response.data;
  },

  async delete(id: string) {
    await api.delete(`/data/sleep-entries/${id}`);
  },
};

// Daily Stats API
export const dailyStatsService = {
  async getForDate(date: string) {
    const response = await api.get(`/data/stats/${date}`);
    return response.data;
  },

  async getForDateRange(startDate: string, endDate: string) {
    const response = await api.get(`/data/stats/range/${startDate}/${endDate}`);
    return response.data;
  },

  async save(stats: any) {
    const response = await api.post('/data/stats', stats);
    return response.data;
  },
};

// ============================================
// Recurring Tasks Service
// ============================================

export const recurringTaskService = {
  async getAll(activeOnly = true) {
    const response = await api.get('/recurring/tasks', { params: { active_only: activeOnly } });
    return response.data;
  },

  async get(id: string) {
    const response = await api.get(`/recurring/tasks/${id}`);
    return response.data;
  },

  async create(task: any) {
    const response = await api.post('/recurring/tasks', task);
    return response.data;
  },

  async update(id: string, updates: any) {
    const response = await api.put(`/recurring/tasks/${id}`, updates);
    return response.data;
  },

  async delete(id: string) {
    await api.delete(`/recurring/tasks/${id}`);
  },

  async toggle(id: string) {
    const response = await api.post(`/recurring/tasks/${id}/toggle`);
    return response.data;
  },

  async getForDate(date: string) {
    const response = await api.get(`/recurring/for-date/${date}`);
    return response.data;
  },
};

// ============================================
// Focus Settings Service (Pomodoro config)
// ============================================

export interface FocusSettings {
  focus_duration: number;
  short_break_duration: number;
  long_break_duration: number;
  sessions_before_long_break: number;
  auto_start_breaks: boolean;
  auto_start_focus: boolean;
  sound_enabled: boolean;
}

export const focusSettingsService = {
  async get(): Promise<FocusSettings> {
    const response = await api.get('/data/focus-settings');
    return response.data;
  },

  async save(settings: FocusSettings): Promise<FocusSettings> {
    const response = await api.put('/data/focus-settings', settings);
    return response.data;
  },
};

// ============================================
// Sleep Goal Service (tracking targets)
// ============================================

export interface SleepGoal {
  target_bedtime: string;
  target_wake_time: string;
  target_duration_hours: number;
}

export const sleepGoalService = {
  async get(): Promise<SleepGoal> {
    const response = await api.get('/data/sleep-goal');
    return response.data;
  },

  async save(goal: SleepGoal): Promise<SleepGoal> {
    const response = await api.put('/data/sleep-goal', goal);
    return response.data;
  },
};

// ============================================
// User Patterns Service (AI learnings)
// ============================================

export interface UserPattern {
  id: string;
  user_id: string;
  category: string;
  key: string;
  value: string;
  confidence: number;
  last_used: string;
  usage_count: number;
  created_at: string;
}

export const userPatternsService = {
  async getAll(): Promise<UserPattern[]> {
    const response = await api.get('/data/user-patterns');
    return response.data;
  },

  async upsert(pattern: { category: string; key: string; value: string; confidence: number }): Promise<UserPattern> {
    const response = await api.post('/data/user-patterns', pattern);
    return response.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/data/user-patterns/${id}`);
  },

  async clear(): Promise<void> {
    await api.delete('/data/user-patterns');
  },
};

// ============================================
// Routine Templates Service
// ============================================

export const routineTemplateService = {
  async getAll() {
    const response = await api.get('/recurring/templates');
    return response.data;
  },

  async get(id: string) {
    const response = await api.get(`/recurring/templates/${id}`);
    return response.data;
  },

  async create(template: any) {
    const response = await api.post('/recurring/templates', template);
    return response.data;
  },

  async update(id: string, updates: any) {
    const response = await api.put(`/recurring/templates/${id}`, updates);
    return response.data;
  },

  async delete(id: string) {
    await api.delete(`/recurring/templates/${id}`);
  },

  async getPresets() {
    const response = await api.get('/recurring/presets');
    return response.data;
  },

  async applyPreset(presetKey: string) {
    const response = await api.post(`/recurring/templates/apply-preset/${presetKey}`);
    return response.data;
  },
};

// ============================================
// Backlog Service (unscheduled task capture)
// ============================================

export interface BacklogItem {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  estimated_minutes: number;
  priority: 'low' | 'medium' | 'high';
  cognitive_load: string;
  tags: string[];
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BacklogScheduleInput {
  date: string;             // YYYY-MM-DD
  scheduled_start?: string; // HH:MM optional
  scheduled_end?: string;   // HH:MM optional
}

export const backlogService = {
  async list(): Promise<BacklogItem[]> {
    const response = await api.get('/backlog');
    return response.data;
  },

  async create(item: Partial<BacklogItem>): Promise<BacklogItem> {
    const response = await api.post('/backlog', item);
    return response.data;
  },

  async update(id: string, updates: Partial<BacklogItem>): Promise<BacklogItem> {
    const response = await api.patch(`/backlog/${id}`, updates);
    return response.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/backlog/${id}`);
  },

  async schedule(id: string, input: BacklogScheduleInput): Promise<any> {
    const response = await api.post(`/backlog/${id}/schedule`, input);
    return response.data;
  },
};

// ============================================
// Project Service (multi-session work)
// ============================================

export type ProjectStatus = 'active' | 'parked' | 'completed' | 'archived';
export type ProjectSize = 'XS' | 'S' | 'M' | 'L' | 'XL';
export type ProjectSubtaskStatus = 'pending' | 'in_progress' | 'completed';

export interface ProjectSubtask {
  id: string;
  project_id: string;
  user_id: string;
  name: string;
  estimated_hours?: number | null;
  hours_completed: number;
  status: ProjectSubtaskStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  status: ProjectStatus;
  total_hours: number;
  hours_completed: number;
  deadline?: string | null;            // YYYY-MM-DD
  weekly_hours_target?: number | null;
  ai_size_estimate?: ProjectSize | null;
  priority: 'low' | 'medium' | 'high';
  cognitive_load: string;
  subtasks: ProjectSubtask[];
  created_at: string;
  updated_at: string;
}

export interface ProjectSubtaskInput {
  name: string;
  estimated_hours?: number;
}

export interface ProjectCreateInput {
  name: string;
  total_hours: number;
  description?: string;
  deadline?: string;
  weekly_hours_target?: number;
  ai_size_estimate?: ProjectSize;
  priority?: 'low' | 'medium' | 'high';
  cognitive_load?: string;
  subtasks?: ProjectSubtaskInput[];
}

export interface ProjectEstimate {
  hours: number;
  size: ProjectSize;
}

// A planned task linked to a project (a scheduled session advancing it).
export interface ProjectTask {
  id: string;
  name: string;
  date: string | null;             // YYYY-MM-DD
  scheduled_start: string | null;  // HH:MM
  scheduled_end: string | null;    // HH:MM
  status: string;                  // pending | in_progress | completed | missed | skipped | cancelled
  logged_hours: number;
  project_subtask_id: string | null;
}

export const projectService = {
  async list(): Promise<Project[]> {
    const response = await api.get('/projects');
    return response.data;
  },

  async create(input: ProjectCreateInput): Promise<Project> {
    const response = await api.post('/projects', input);
    return response.data;
  },

  async update(id: string, updates: Partial<Project>): Promise<Project> {
    const response = await api.patch(`/projects/${id}`, updates);
    return response.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/projects/${id}`);
  },

  async estimateHours(name: string, description?: string): Promise<ProjectEstimate> {
    const response = await api.post('/projects/estimate-hours', { name, description });
    return response.data;
  },

  async park(id: string): Promise<Project> {
    const response = await api.post(`/projects/${id}/park`);
    return response.data;
  },

  async complete(id: string): Promise<Project> {
    const response = await api.post(`/projects/${id}/complete`);
    return response.data;
  },

  async logHours(id: string, hours: number): Promise<Project> {
    const response = await api.post(`/projects/${id}/log-hours`, { hours });
    return response.data;
  },

  async getTasks(id: string): Promise<ProjectTask[]> {
    const response = await api.get(`/projects/${id}/tasks`);
    return response.data;
  },

  async addSubtask(projectId: string, subtask: ProjectSubtaskInput): Promise<ProjectSubtask> {
    const response = await api.post(`/projects/${projectId}/subtasks`, subtask);
    return response.data;
  },

  async updateSubtask(
    projectId: string,
    subtaskId: string,
    updates: Partial<ProjectSubtask>
  ): Promise<ProjectSubtask> {
    const response = await api.patch(`/projects/${projectId}/subtasks/${subtaskId}`, updates);
    return response.data;
  },

  async removeSubtask(projectId: string, subtaskId: string): Promise<void> {
    await api.delete(`/projects/${projectId}/subtasks/${subtaskId}`);
  },
};

// ============================================
// Account Service (GDPR export + deletion)
// ============================================

export const accountService = {
  /** Full JSON export of everything we store for the current user. */
  async exportData(): Promise<any> {
    const response = await api.get('/account/export');
    return response.data;
  },

  /** Permanently delete the current user's account and all their data. */
  async deleteAccount(): Promise<void> {
    await api.delete('/account');
  },
};

export default api;
