import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

interface UserPatternsStore {
  patterns: LearnedPattern[];
  
  // Actions
  addPattern: (pattern: Omit<LearnedPattern, 'id' | 'lastUsed' | 'usageCount'>) => void;
  updatePattern: (id: string, updates: Partial<LearnedPattern>) => void;
  getPattern: (category: string, key: string) => LearnedPattern | undefined;
  incrementUsage: (id: string) => void;
  removePattern: (id: string) => void;
  clearPatterns: () => void;
}

export const useUserPatternsStore = create<UserPatternsStore>()(
  persist(
    (set, get) => ({
      patterns: [],

      addPattern: (pattern) => {
        const id = `pattern-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const existing = get().getPattern(pattern.category, pattern.key);
        
        if (existing) {
          // Update existing pattern
          set((state) => ({
            patterns: state.patterns.map((p) =>
              p.id === existing.id
                ? {
                    ...p,
                    value: pattern.value,
                    confidence: Math.min(p.confidence + 0.1, 1),
                    lastUsed: new Date().toISOString(),
                    usageCount: p.usageCount + 1,
                  }
                : p
            ),
          }));
        } else {
          // Add new pattern
          set((state) => ({
            patterns: [
              ...state.patterns,
              {
                ...pattern,
                id,
                lastUsed: new Date().toISOString(),
                usageCount: 1,
              },
            ],
          }));
        }
      },

      updatePattern: (id, updates) => {
        set((state) => ({
          patterns: state.patterns.map((p) =>
            p.id === id ? { ...p, ...updates, lastUsed: new Date().toISOString() } : p
          ),
        }));
      },

      getPattern: (category, key) => {
        return get().patterns.find(
          (p) => p.category === category && p.key.toLowerCase() === key.toLowerCase()
        );
      },

      incrementUsage: (id) => {
        set((state) => ({
          patterns: state.patterns.map((p) =>
            p.id === id
              ? {
                  ...p,
                  usageCount: p.usageCount + 1,
                  lastUsed: new Date().toISOString(),
                  confidence: Math.min(p.confidence + 0.05, 1),
                }
              : p
          ),
        }));
      },

      removePattern: (id) => {
        set((state) => ({
          patterns: state.patterns.filter((p) => p.id !== id),
        }));
      },

      clearPatterns: () => {
        set({ patterns: [] });
      },
    }),
    {
      name: 'taskly-user-patterns',
    }
  )
);
