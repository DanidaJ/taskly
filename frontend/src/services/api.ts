import axios from 'axios';
import { AIPlanRequest, AIPlanResponse, UserContext } from '@/types';

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
        
        // Only redirect if not already on landing/auth pages
        const currentPath = window.location.pathname;
        if (!currentPath.startsWith('/landing') && currentPath !== '/auth') {
          window.location.href = '/landing';
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
};

// Notification API
export const notificationService = {
  async registerToken(token: string) {
    await api.post('/notifications/register', { token });
  },

  async getScheduled() {
    const response = await api.get('/notifications/scheduled');
    return response.data;
  },

  async cancel(id: string) {
    await api.delete(`/notifications/${id}`);
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

export default api;
