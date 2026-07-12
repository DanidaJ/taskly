import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { FolderKanban, AlertTriangle, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Modal } from '@/components/ui';
import { useProjectStore } from '@/stores';
import type { Project } from '@/services/api';
import AddProjectForm from './AddProjectForm';
import ProjectCard from './ProjectCard';
import ProjectEditModal from './ProjectEditModal';

const STATUS_RANK: Record<string, number> = { active: 0, parked: 1, completed: 2, archived: 3 };
const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export default function ProjectsPanel() {
  const {
    projects,
    isLoading,
    hasLoaded,
    loadProjects,
    removeProject,
    parkProject,
    completeProject,
  } = useProjectStore();

  const [editing, setEditing] = useState<Project | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null);

  useEffect(() => {
    if (!hasLoaded) loadProjects();
  }, [hasLoaded, loadProjects]);

  const sorted = useMemo(() => {
    return [...projects].sort((a, b) => {
      const sa = STATUS_RANK[a.status] ?? 0;
      const sb = STATUS_RANK[b.status] ?? 0;
      if (sa !== sb) return sa - sb;
      const pa = PRIORITY_RANK[a.priority] ?? 1;
      const pb = PRIORITY_RANK[b.priority] ?? 1;
      if (pa !== pb) return pa - pb;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [projects]);

  const activeCount = projects.filter((p) => p.status === 'active').length;

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* Form */}
      <div className="lg:col-span-1 lg:sticky lg:top-4 lg:self-start">
        <AddProjectForm />
      </div>

      {/* List */}
      <div className="lg:col-span-2">
        {isLoading && projects.length === 0 ? (
          <div className="glass-card text-center py-12 text-gray-500">Loading projects…</div>
        ) : projects.length === 0 ? (
          <div className="glass-card text-center py-12">
            <FolderKanban className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-700 font-medium">No projects yet</p>
            <p className="text-sm text-gray-500 mt-1">
              Add a large piece of work and let the AI schedule it in realistic daily chunks.
            </p>
          </div>
        ) : (
          <>
            {activeCount > 0 && (
              <p className="text-xs text-gray-500 mb-3">
                {activeCount} active {activeCount === 1 ? 'project' : 'projects'} feeding your planner
              </p>
            )}
            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {sorted.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onEdit={setEditing}
                    onDelete={setConfirmDelete}
                    onPark={async (p) => {
                      await parkProject(p.id);
                      toast.success(p.status === 'parked' ? 'Project resumed' : 'Project parked');
                    }}
                    onComplete={async (p) => {
                      await completeProject(p.id);
                      toast.success('Project marked complete');
                    }}
                  />
                ))}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>

      {editing && <ProjectEditModal project={editing} onClose={() => setEditing(null)} />}

      {confirmDelete && (
        <Modal isOpen onClose={() => setConfirmDelete(null)} title="Delete this project?">
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-900">
                "{confirmDelete.name}" and its subtasks will be removed permanently. Any tasks already
                on your calendar are not affected.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  await removeProject(confirmDelete.id);
                  setConfirmDelete(null);
                  toast.success('Project deleted');
                }}
                leftIcon={<Trash2 className="w-4 h-4" />}
              >
                Delete
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
