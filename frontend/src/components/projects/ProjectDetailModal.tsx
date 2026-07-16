import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Clock, Check, Circle, Link2, CalendarClock, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { Modal } from '@/components/ui';
import { PriorityBadge } from '@/components/ui/Badge';
import { projectService } from '@/services/api';
import type { Project, ProjectTask } from '@/services/api';
import { progressPercent, formatHours } from './projectHelpers';

// Each linked task shows its calendar state (upcoming / ongoing / past) rather
// than being split into separate sections.
const TASK_STATE: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Upcoming', cls: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'Ongoing', cls: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Completed', cls: 'bg-green-100 text-green-700' },
  missed: { label: 'Missed', cls: 'bg-red-100 text-red-700' },
  skipped: { label: 'Skipped', cls: 'bg-gray-100 text-gray-600' },
  cancelled: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-500' },
};

const stateOf = (s: string) => TASK_STATE[s] ?? { label: s, cls: 'bg-gray-100 text-gray-600' };

function formatDate(date: string | null): string {
  if (!date) return 'Unscheduled';
  try {
    return format(new Date(`${date}T00:00:00`), 'EEE, MMM d');
  } catch {
    return date;
  }
}

export default function ProjectDetailModal({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    projectService
      .getTasks(project.id)
      .then((data) => {
        if (active) setTasks(data);
      })
      .catch(() => {
        if (active) setTasks([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [project.id]);

  const percent = progressPercent(project);
  const doneSubtasks = project.subtasks.filter((s) => s.status === 'completed').length;

  return (
    <Modal isOpen onClose={onClose} size="lg" title={project.name}>
      <div className="max-h-[78vh] overflow-y-auto pr-1 space-y-5">
        <div className="flex items-center gap-2">
          <PriorityBadge priority={project.priority} />
          <span className="text-xs text-gray-500 capitalize">{project.status}</span>
        </div>

        {/* Progress */}
        <div>
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {formatHours(project.hours_completed)} / {formatHours(project.total_hours)}
            </span>
            <span className="font-medium text-gray-700">{percent}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
            <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${percent}%` }} />
          </div>
        </div>

        {/* Subtasks */}
        {project.subtasks.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">
              Subtasks <span className="text-gray-400 font-normal">({doneSubtasks}/{project.subtasks.length})</span>
            </h3>
            <ul className="space-y-1.5">
              {project.subtasks.map((s) => {
                const done = s.status === 'completed';
                return (
                  <li key={s.id} className="flex items-center gap-2 text-sm">
                    {done ? (
                      <Check className="w-4 h-4 text-green-500 shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 text-gray-300 shrink-0" />
                    )}
                    <span className={clsx('truncate', done ? 'text-gray-400 line-through' : 'text-gray-700')}>
                      {s.name}
                    </span>
                    {s.status === 'in_progress' && (
                      <span className="text-[10px] font-medium text-amber-600 shrink-0">in progress</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Linked tasks (scheduled sessions) */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2 inline-flex items-center gap-1.5">
            <Link2 className="w-4 h-4 text-blue-500" />
            Linked tasks
            {!loading && <span className="text-gray-400 font-normal">({tasks.length})</span>}
          </h3>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : tasks.length === 0 ? (
            <p className="text-sm text-gray-500 py-2">
              No tasks linked yet. Open a task on the Schedule page and pick this project under “Project”.
            </p>
          ) : (
            <ul className="space-y-2">
              {tasks.map((t) => {
                const st = stateOf(t.status);
                return (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{t.name}</p>
                      <p className="text-xs text-gray-500 inline-flex items-center gap-1">
                        <CalendarClock className="w-3 h-3" />
                        {formatDate(t.date)}
                        {t.scheduled_start && t.scheduled_end ? ` · ${t.scheduled_start}–${t.scheduled_end}` : ''}
                        {t.logged_hours > 0 ? ` · ${formatHours(t.logged_hours)} logged` : ''}
                      </p>
                    </div>
                    <span
                      className={clsx(
                        'shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                        st.cls,
                      )}
                    >
                      {st.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
