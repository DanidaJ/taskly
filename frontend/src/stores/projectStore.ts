import { create } from 'zustand';
import { projectService } from '@/services/api';
import type {
  Project,
  ProjectCreateInput,
  ProjectEstimate,
  ProjectSubtask,
  ProjectSubtaskInput,
} from '@/services/api';

interface ProjectStore {
  projects: Project[];
  isLoading: boolean;
  hasLoaded: boolean;

  loadProjects: () => Promise<void>;
  addProject: (input: ProjectCreateInput) => Promise<Project | null>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  parkProject: (id: string) => Promise<void>;
  completeProject: (id: string) => Promise<void>;
  estimateHours: (name: string, description?: string) => Promise<ProjectEstimate | null>;

  addSubtask: (projectId: string, subtask: ProjectSubtaskInput) => Promise<ProjectSubtask | null>;
  updateSubtask: (
    projectId: string,
    subtaskId: string,
    updates: Partial<ProjectSubtask>
  ) => Promise<void>;
  removeSubtask: (projectId: string, subtaskId: string) => Promise<void>;

  reset: () => void;
}

function replaceProject(projects: Project[], updated: Project): Project[] {
  return projects.map((p) => (p.id === updated.id ? updated : p));
}

export const useProjectStore = create<ProjectStore>()((set, get) => ({
  projects: [],
  isLoading: false,
  hasLoaded: false,

  loadProjects: async () => {
    set({ isLoading: true });
    try {
      const remote = await projectService.list();
      set({ projects: remote, isLoading: false, hasLoaded: true });
    } catch (error) {
      console.error('Failed to load projects:', error);
      set({ isLoading: false });
    }
  },

  addProject: async (input) => {
    try {
      const created = await projectService.create(input);
      set((state) => ({ projects: [created, ...state.projects] }));
      return created;
    } catch (error) {
      console.error('Failed to add project:', error);
      return null;
    }
  },

  updateProject: async (id, updates) => {
    try {
      const updated = await projectService.update(id, updates);
      set((state) => ({ projects: replaceProject(state.projects, updated) }));
    } catch (error) {
      console.error('Failed to update project:', error);
    }
  },

  removeProject: async (id) => {
    const previous = get().projects;
    set({ projects: previous.filter((p) => p.id !== id) });
    try {
      await projectService.remove(id);
    } catch (error) {
      console.error('Failed to delete project:', error);
      set({ projects: previous });
    }
  },

  parkProject: async (id) => {
    try {
      const updated = await projectService.park(id);
      set((state) => ({ projects: replaceProject(state.projects, updated) }));
    } catch (error) {
      console.error('Failed to park project:', error);
    }
  },

  completeProject: async (id) => {
    try {
      const updated = await projectService.complete(id);
      set((state) => ({ projects: replaceProject(state.projects, updated) }));
    } catch (error) {
      console.error('Failed to complete project:', error);
    }
  },

  estimateHours: async (name, description) => {
    try {
      return await projectService.estimateHours(name, description);
    } catch (error) {
      console.error('Failed to estimate hours:', error);
      return null;
    }
  },

  addSubtask: async (projectId, subtask) => {
    try {
      const created = await projectService.addSubtask(projectId, subtask);
      set((state) => ({
        projects: state.projects.map((p) =>
          p.id === projectId ? { ...p, subtasks: [...p.subtasks, created] } : p
        ),
      }));
      return created;
    } catch (error) {
      console.error('Failed to add subtask:', error);
      return null;
    }
  },

  updateSubtask: async (projectId, subtaskId, updates) => {
    try {
      const updated = await projectService.updateSubtask(projectId, subtaskId, updates);
      set((state) => ({
        projects: state.projects.map((p) =>
          p.id === projectId
            ? { ...p, subtasks: p.subtasks.map((s) => (s.id === subtaskId ? updated : s)) }
            : p
        ),
      }));
    } catch (error) {
      console.error('Failed to update subtask:', error);
    }
  },

  removeSubtask: async (projectId, subtaskId) => {
    const previous = get().projects;
    set({
      projects: previous.map((p) =>
        p.id === projectId
          ? { ...p, subtasks: p.subtasks.filter((s) => s.id !== subtaskId) }
          : p
      ),
    });
    try {
      await projectService.removeSubtask(projectId, subtaskId);
    } catch (error) {
      console.error('Failed to delete subtask:', error);
      set({ projects: previous });
    }
  },

  reset: () => set({ projects: [], isLoading: false, hasLoaded: false }),
}));
