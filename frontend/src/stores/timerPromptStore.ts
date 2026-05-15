import { create } from 'zustand';

export interface TimerCompletionPromptInfo {
  taskId: string;
  taskName: string;
  taskDate: string;
  durationMinutes: number;
  nextSessionCount: number;
}

interface TimerPromptStore {
  prompt: TimerCompletionPromptInfo | null;
  setPrompt: (prompt: TimerCompletionPromptInfo) => void;
  clearPrompt: () => void;
}

export const useTimerPromptStore = create<TimerPromptStore>((set) => ({
  prompt: null,
  setPrompt: (prompt) => set({ prompt }),
  clearPrompt: () => set({ prompt: null }),
}));
