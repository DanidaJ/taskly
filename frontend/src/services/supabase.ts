import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  console.warn('Supabase environment variables not set. Using placeholder values.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabasePublishableKey || 'placeholder-key'
);

// Database helper functions
export const db = {
  // Tasks
  async getTasks(userId: string) {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  },

  async createTask(task: any) {
    const { data, error } = await supabase
      .from('tasks')
      .insert(task)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async updateTask(id: string, updates: any) {
    const { data, error } = await supabase
      .from('tasks')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async deleteTask(id: string) {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  },

  // Daily Plans
  async getDailyPlan(userId: string, date: string) {
    const { data, error } = await supabase
      .from('daily_plans')
      .select('*, planned_tasks(*)')
      .eq('user_id', userId)
      .eq('date', date)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async saveDailyPlan(plan: any) {
    const { data, error } = await supabase
      .from('daily_plans')
      .upsert(plan)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Energy Profile
  async getEnergyProfile(userId: string) {
    const { data, error } = await supabase
      .from('energy_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async saveEnergyProfile(profile: any) {
    const { data, error } = await supabase
      .from('energy_profiles')
      .upsert(profile)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Sleep Schedule
  async getSleepSchedule(userId: string) {
    const { data, error } = await supabase
      .from('sleep_schedules')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async saveSleepSchedule(schedule: any) {
    const { data, error } = await supabase
      .from('sleep_schedules')
      .upsert(schedule)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // User Preferences
  async getUserPreferences(userId: string) {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async saveUserPreferences(preferences: any) {
    const { data, error } = await supabase
      .from('user_preferences')
      .upsert(preferences)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Commitments
  async getCommitments(userId: string) {
    const { data, error } = await supabase
      .from('commitments')
      .select('*')
      .eq('user_id', userId)
      .order('start_time', { ascending: true });
    
    if (error) throw error;
    return data;
  },

  async createCommitment(commitment: any) {
    const { data, error } = await supabase
      .from('commitments')
      .insert(commitment)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async deleteCommitment(id: string) {
    const { error } = await supabase
      .from('commitments')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  },

  // Daily Logs
  async getDailyLogs(userId: string, limit = 14) {
    const { data, error } = await supabase
      .from('daily_logs')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data;
  },

  async saveDailyLog(log: any) {
    const { data, error } = await supabase
      .from('daily_logs')
      .upsert(log)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },
};
