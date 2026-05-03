import { create } from 'zustand';
import { userPatternsService, UserPattern } from '@/services/api';

// User learned patterns - things the AI has learned about the user
export interface LearnedPattern {
  id: string;
  category: string; // e.g., 'duration', 'time', 'preference'
  key: string; // e.g., 'dinner', 'workout', 'commute'
  value: string; // e.g., '1 hour', '30 minutes', '8:00 AM'
  confidence: number; // 0-1, how confident we are about this pattern
  lastUsed: string; // ISO date
  usageCount: number;
}

const fromBackend = (p: UserPattern): LearnedPattern => ({
  id: p.id,
  category: p.category,
  key: p.key,
  value: p.value,
  confidence: p.confidence,
  lastUsed: p.last_used,
  usageCount: p.usage_count,
});

interface UserPatternsStore {
  patterns: LearnedPattern[];
  isLoading: boolean;

  // Loading
  loadPatterns: () => Promise<void>;

  // Actions (all sync to backend; local state mirrors backend response)
  addPattern: (pattern: Omit<LearnedPattern, 'id' | 'lastUsed' | 'usageCount'>) => Promise<void>;
  getPattern: (category: string, key: string) => LearnedPattern | undefined;
  removePattern: (id: string) => Promise<void>;
  clearPatterns: () => Promise<void>;
  reset: () => void;
}

export const useUserPatternsStore = create<UserPatternsStore>()((set, get) => ({
  patterns: [],
  isLoading: false,

  loadPatterns: async () => {
    set({ isLoading: true });
    try {
      const remote = await userPatternsService.getAll();
      set({ patterns: remote.map(fromBackend), isLoading: false });
    } catch (error) {
      console.error('Failed to load user patterns:', error);
      set({ isLoading: false });
    }
  },

  addPattern: async (pattern) => {
    const existing = get().getPattern(pattern.category, pattern.key);
    const nextConfidence = existing
      ? Math.min(existing.confidence + 0.1, 1)
      : pattern.confidence;
    try {
      const saved = await userPatternsService.upsert({
        category: pattern.category,
        key: pattern.key,
        value: pattern.value,
        confidence: nextConfidence,
      });
      const mapped = fromBackend(saved);
      set((state) => {
        const others = state.patterns.filter(
          (p) => !(p.category === mapped.category && p.key.toLowerCase() === mapped.key.toLowerCase())
        );
        return { patterns: [mapped, ...others] };
      });
    } catch (error) {
      console.error('Failed to save pattern:', error);
    }
  },

  getPattern: (category, key) => {
    return get().patterns.find(
      (p) => p.category === category && p.key.toLowerCase() === key.toLowerCase()
    );
  },

  removePattern: async (id) => {
    try {
      await userPatternsService.delete(id);
      set((state) => ({ patterns: state.patterns.filter((p) => p.id !== id) }));
    } catch (error) {
      console.error('Failed to delete pattern:', error);
    }
  },

  clearPatterns: async () => {
    try {
      await userPatternsService.clear();
      set({ patterns: [] });
    } catch (error) {
      console.error('Failed to clear patterns:', error);
    }
  },

  reset: () => set({ patterns: [], isLoading: false }),
}));
