import { create } from 'zustand';
import { EnergyProfile, SleepSchedule, UserPreferences, Commitment, DailyLog } from '@/types';
import { commitmentService, profileService } from '@/services/api';

interface UserProfileStore {
  energyProfile: EnergyProfile | null;
  sleepSchedule: SleepSchedule | null;
  preferences: UserPreferences | null;
  commitments: Commitment[];
  recentLogs: DailyLog[];

  // Setters
  setEnergyProfile: (profile: EnergyProfile) => void;
  setSleepSchedule: (schedule: SleepSchedule) => void;
  setPreferences: (preferences: UserPreferences) => void;
  setCommitments: (commitments: Commitment[]) => void;
  setRecentLogs: (logs: DailyLog[]) => void;

  // Commitment actions
  addCommitment: (commitment: Commitment) => void;
  updateCommitment: (id: string, updates: Partial<Commitment>) => void;
  deleteCommitment: (id: string) => void;
  loadCommitments: () => Promise<void>;

  // Profile loading
  loadEnergyProfile: () => Promise<void>;
  loadSleepSchedule: () => Promise<void>;
  loadPreferences: () => Promise<void>;
  loadAllProfile: () => Promise<void>;

  // Log actions
  addDailyLog: (log: DailyLog) => void;

  // Reset
  reset: () => void;
}

const defaultEnergyProfile: Omit<EnergyProfile, 'id' | 'user_id' | 'updated_at'> = {
  preference: 'morning',
  peak_focus_start: '09:00',
  peak_focus_end: '12:00',
  fatigue_points: ['14:00', '16:00'],
};

const defaultSleepSchedule: Omit<SleepSchedule, 'id' | 'user_id' | 'updated_at'> = {
  wake_time: '07:00',
  sleep_time: '23:00',
  wind_down_minutes: 30,
  preferred_end_time: null,
};

const defaultPreferences: Omit<UserPreferences, 'id' | 'user_id' | 'updated_at'> = {
  manual_scheduling_allowed: true,
  task_clustering_enabled: true,
  max_daily_workload_hours: 8,
  preferred_task_types: ['deep_focus', 'light_focus', 'admin'],
  notification_enabled: true,
  dark_mode: true,
};

export const useUserProfileStore = create<UserProfileStore>()((set) => ({
  energyProfile: null,
  sleepSchedule: null,
  preferences: null,
  commitments: [],
  recentLogs: [],

  setEnergyProfile: (profile) => set({ energyProfile: profile }),
  setSleepSchedule: (schedule) => set({ sleepSchedule: schedule }),
  setPreferences: (preferences) => set({ preferences }),
  setCommitments: (commitments) => set({ commitments }),
  setRecentLogs: (logs) => set({ recentLogs: logs }),

  addCommitment: (commitment) =>
    set((state) => ({
      commitments: [...state.commitments, commitment],
    })),

  updateCommitment: (id, updates) =>
    set((state) => ({
      commitments: state.commitments.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),

  deleteCommitment: (id) =>
    set((state) => ({
      commitments: state.commitments.filter((c) => c.id !== id),
    })),

  loadCommitments: async () => {
    try {
      const commitments = await commitmentService.getAll();
      set({ commitments });
    } catch (error) {
      console.error('Failed to load commitments:', error);
    }
  },

  loadEnergyProfile: async () => {
    try {
      const profile = await profileService.getEnergyProfile();
      set({ energyProfile: profile });
    } catch (error) {
      console.log('Energy profile not set, using defaults');
    }
  },

  loadSleepSchedule: async () => {
    try {
      const schedule = await profileService.getSleepSchedule();
      set({ sleepSchedule: schedule });
    } catch (error) {
      console.log('Sleep schedule not set, using defaults');
    }
  },

  loadPreferences: async () => {
    try {
      const prefs = await profileService.getPreferences();
      set({ preferences: prefs });
    } catch (error) {
      console.log('Preferences not set, using defaults');
    }
  },

  loadAllProfile: async () => {
    try {
      await Promise.allSettled([
        commitmentService.getAll().then(commitments => set({ commitments })),
        profileService.getEnergyProfile().then(profile => set({ energyProfile: profile })),
        profileService.getSleepSchedule().then(schedule => set({ sleepSchedule: schedule })),
        profileService.getPreferences().then(prefs => set({ preferences: prefs })),
      ]);
    } catch (error) {
      console.log('Some profile data unavailable, using defaults');
    }
  },

  addDailyLog: (log) =>
    set((state) => ({
      recentLogs: [log, ...state.recentLogs].slice(0, 14),
    })),

  reset: () =>
    set({
      energyProfile: null,
      sleepSchedule: null,
      preferences: null,
      commitments: [],
      recentLogs: [],
    }),
}));

export { defaultEnergyProfile, defaultSleepSchedule, defaultPreferences };
