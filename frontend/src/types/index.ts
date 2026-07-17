// Task cognitive load types
export type CognitiveLoad = 'deep_focus' | 'light_focus' | 'admin' | 'physical' | 'recovery';

// Task flexibility types
export type TaskFlexibility = 'fixed' | 'flexible';

// Task priority levels
export type Priority = 'high' | 'medium' | 'low';

// Task status
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'cancelled' | 'missed';

// Task start type – records timing context when a task session begins
export type TaskStartType = 'on_time' | 'early' | 'delayed';

// Energy preference
export type EnergyPreference = 'morning' | 'afternoon' | 'evening' | 'night';

// Base task interface
export interface Task {
  id: string;
  name: string;
  type: CognitiveLoad;
  estimated_effort: 1 | 2 | 3 | 4 | 5;
  flexibility: TaskFlexibility;
  description?: string;
  tags?: string[];
  due_date?: string;
  created_at: string;
  updated_at: string;
}

// Planned task with scheduling info
export interface PlannedTask {
  id: string;
  task_id: string;
  task_name: string;
  suggested_duration: string;
  priority: Priority;
  notes?: string;
  scheduled_start?: string;
  scheduled_end?: string;
  actual_start?: string;
  actual_end?: string;
  status: TaskStatus;
  order: number;
  // Start-timing context (written once on first start, never overwritten)
  start_type?: TaskStartType;
  minutes_offset?: number; // negative = started early, positive = started late
  // Manual project link. Completing a linked task logs its hours to the project
  // (and optional subtask); logged_hours is the reversible amount already applied.
  project_id?: string | null;
  project_subtask_id?: string | null;
  logged_hours?: number;
  // The AI's cognitive classification, used for energy-aware scheduling + colour.
  cognitive_load?: CognitiveLoad;
  // The task's real calendar date (YYYY-MM-DD). Manual tasks: the plan's date;
  // AI stamps past-midnight blocks. Drives reminders + missed detection.
  scheduled_date?: string;
}

// Daily plan
export interface DailyPlan {
  id: string;
  user_id: string;
  date: string;
  tasks: PlannedTask[];
  is_ai_generated: boolean;
  created_at: string;
  updated_at: string;
}

// AI-generated plan response
export interface AIPlanResponse {
  tasks: Omit<Task, 'id' | 'created_at' | 'updated_at'>[];
  plan: {
    task_name: string;
    suggested_duration: string;
    priority: Priority;
    notes?: string;
    scheduled_start?: string;
    scheduled_end?: string;
    cognitive_load?: CognitiveLoad;
    scheduled_date?: string;
  }[];
  recommendations: string[];
}

// User energy profile
export interface EnergyProfile {
  id?: string;
  user_id?: string;
  preference: EnergyPreference;
  peak_focus_start: string; // HH:mm format
  peak_focus_end: string;
  fatigue_points?: string[]; // HH:mm format
  updated_at?: string;
}

// Sleep schedule
export interface SleepSchedule {
  id?: string;
  user_id?: string;
  wake_time: string; // HH:mm format
  sleep_time: string;
  wind_down_minutes: number;
  preferred_end_time?: string | null; // HH:mm hard cap for the AI scheduler
  updated_at?: string;
}

// User preferences
export interface UserPreferences {
  id?: string;
  user_id?: string;
  manual_scheduling_allowed: boolean;
  task_clustering_enabled: boolean;
  max_daily_workload_hours: number;
  preferred_task_types?: CognitiveLoad[];
  notification_enabled: boolean;
  dark_mode: boolean;
  updated_at?: string;
}

// Fixed commitment OR daily routine — both are recurring time blocks the AI
// scheduler skips. The `type` field is purely for UX framing in Settings.
export type CommitmentType =
  | 'work' | 'school' | 'meeting' | 'appointment' | 'other'
  | 'meal' | 'exercise' | 'wind_down' | 'personal';

export const ROUTINE_TYPES: CommitmentType[] = ['meal', 'exercise', 'wind_down', 'personal'];

export interface Commitment {
  id?: string;
  user_id?: string;
  name: string;
  type: CommitmentType;
  start_time: string;
  end_time: string;
  days_of_week: number[]; // 0-6, Sunday-Saturday
  is_recurring: boolean;
  created_at?: string;
}

// Daily log entry
export interface DailyLog {
  id?: string;
  user_id?: string;
  date: string;
  completed_tasks: string[];
  skipped_tasks: string[];
  energy_level: 1 | 2 | 3 | 4 | 5;
  focus_level: 1 | 2 | 3 | 4 | 5;
  notes?: string;
  reflection?: DailyReflection;
  created_at?: string;
}

// Daily reflection
export interface DailyReflection {
  what_worked: string[];
  what_didnt_work: string[];
  energy_feedback: string;
  focus_feedback: string;
  suggestions: string[];
}

// User context for AI planning
export interface UserContext {
  commitments: Commitment[];
  energy_profile: EnergyProfile;
  sleep_schedule: SleepSchedule;
  preferences: UserPreferences;
  recent_logs: DailyLog[];
  existing_plans?: DailyPlan[];
  // Unscheduled backlog items the AI may schedule from
  backlog_items?: {
    id: string;
    name: string;
    estimated_minutes: number;
    priority: 'low' | 'medium' | 'high';
    notes?: string | null;
  }[];
  // Active multi-session projects the AI advances in realistic daily chunks
  projects?: {
    name: string;
    total_hours: number;
    hours_completed: number;
    deadline?: string | null;
    weekly_hours_target?: number | null;
    status: string;
    priority: 'low' | 'medium' | 'high';
    subtasks: { name: string; status: string }[];
  }[];
}

// AI planning request
export interface AIPlanRequest {
  raw_tasks_input: string;
  user_context: UserContext;
  target_date: string;
}

// Notification
export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: 'task_reminder' | 'break_reminder' | 'sleep_warning' | 'daily_summary';
  scheduled_time: string;
  is_sent: boolean;
  created_at: string;
}

// User profile
export interface User {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

// Auth state
export interface AuthState {
  user: User | null;
  session: {
    access_token: string;
    refresh_token: string;
  } | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

// Recurrence types
export type RecurrenceType = 'daily' | 'weekly' | 'weekdays' | 'weekends' | 'custom';

// Recurring task
export interface RecurringTask {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  estimated_minutes: number;
  cognitive_load: string;
  priority: string;
  flexibility: string;
  recurrence_type: RecurrenceType;
  days_of_week: number[];
  preferred_time?: string | null; // HH:MM or null for flexible
  is_active: boolean;
  start_date?: string;
  end_date?: string | null;
  routine_template_id?: string | null;
  created_at: string;
  updated_at: string;
}

// Routine template
export interface RoutineTemplate {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  icon: string;
  is_active: boolean;
  tasks: RecurringTask[];
  created_at: string;
  updated_at: string;
}

// Preset template info (from /presets endpoint)
export interface PresetTemplate {
  name: string;
  description: string;
  icon: string;
  task_count: number;
  tasks_preview: string[];
}
