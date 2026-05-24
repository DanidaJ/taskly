import { create } from 'zustand';
import { backlogService } from '@/services/api';
import type { BacklogItem, BacklogScheduleInput } from '@/services/api';
import { useTaskStore } from './taskStore';

interface BacklogStore {
  items: BacklogItem[];
  isLoading: boolean;
  hasLoaded: boolean;

  loadItems: () => Promise<void>;
  addItem: (item: {
    name: string;
    estimated_minutes: number;
    priority: 'low' | 'medium' | 'high';
    notes?: string;
  }) => Promise<BacklogItem | null>;
  updateItem: (id: string, updates: Partial<BacklogItem>) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  scheduleItem: (id: string, input: BacklogScheduleInput) => Promise<boolean>;
  reset: () => void;
}

export const useBacklogStore = create<BacklogStore>()((set, get) => ({
  items: [],
  isLoading: false,
  hasLoaded: false,

  loadItems: async () => {
    set({ isLoading: true });
    try {
      const remote = await backlogService.list();
      set({ items: remote, isLoading: false, hasLoaded: true });
    } catch (error) {
      console.error('Failed to load backlog items:', error);
      set({ isLoading: false });
    }
  },

  addItem: async (item) => {
    try {
      const created = await backlogService.create(item);
      set((state) => ({ items: [created, ...state.items] }));
      return created;
    } catch (error) {
      console.error('Failed to add backlog item:', error);
      return null;
    }
  },

  updateItem: async (id, updates) => {
    try {
      const updated = await backlogService.update(id, updates);
      set((state) => ({
        items: state.items.map((it) => (it.id === id ? updated : it)),
      }));
    } catch (error) {
      console.error('Failed to update backlog item:', error);
    }
  },

  removeItem: async (id) => {
    // Optimistic remove
    const previous = get().items;
    set({ items: previous.filter((it) => it.id !== id) });
    try {
      await backlogService.remove(id);
    } catch (error) {
      console.error('Failed to delete backlog item:', error);
      set({ items: previous });
    }
  },

  scheduleItem: async (id, input) => {
    try {
      await backlogService.schedule(id, input);
      // Backend deletes the backlog item on success — mirror locally
      set((state) => ({ items: state.items.filter((it) => it.id !== id) }));
      // Refresh the day's plan so the new task shows up in Schedule/Dashboard
      try {
        await useTaskStore.getState().loadPlanFromDatabase(input.date);
      } catch {
        // Non-fatal; the user can refresh manually
      }
      return true;
    } catch (error) {
      console.error('Failed to schedule backlog item:', error);
      return false;
    }
  },

  reset: () => set({ items: [], isLoading: false, hasLoaded: false }),
}));
