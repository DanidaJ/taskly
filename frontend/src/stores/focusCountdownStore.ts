import { create } from 'zustand';

export type FocusTimerMode = 'focus' | 'shortBreak' | 'longBreak';

interface FocusCountdownSnapshotInput {
  isRunning: boolean;
  mode: FocusTimerMode;
  timeLeft: number;
  sessionTotalSeconds: number;
  taskId: string | null;
  taskName: string | null;
}

interface FocusCountdownStore extends FocusCountdownSnapshotInput {
  endsAt: number | null;
  syncSnapshot: (snapshot: FocusCountdownSnapshotInput) => void;
  clearSnapshot: () => void;
}

const DEFAULT_STATE: Omit<FocusCountdownStore, 'syncSnapshot' | 'clearSnapshot'> = {
  isRunning: false,
  mode: 'focus',
  timeLeft: 0,
  sessionTotalSeconds: 0,
  taskId: null,
  taskName: null,
  endsAt: null,
};

export const getRemainingSeconds = (endsAt: number | null, fallbackSeconds: number): number => {
  if (!endsAt) return Math.max(0, fallbackSeconds);
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
};

export const useFocusCountdownStore = create<FocusCountdownStore>((set) => ({
  ...DEFAULT_STATE,

  syncSnapshot: (snapshot) => {
    set({
      ...snapshot,
      endsAt: snapshot.isRunning
        ? Date.now() + Math.max(0, snapshot.timeLeft) * 1000
        : null,
    });
  },

  clearSnapshot: () => {
    set(DEFAULT_STATE);
  },
}));
