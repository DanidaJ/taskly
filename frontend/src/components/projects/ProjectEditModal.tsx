import { useState } from 'react';
import { Check, Plus, X, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { Button, Input, Textarea, Modal, DatePicker } from '@/components/ui';
import { useProjectStore } from '@/stores';
import type { Project } from '@/services/api';

type TimeGoal = 'none' | 'deadline' | 'weekly';

const PRIORITY_OPTIONS: Array<{ value: 'low' | 'medium' | 'high'; label: string; bg: string }> = [
  { value: 'low', label: 'Low', bg: 'bg-green-500' },
  { value: 'medium', label: 'Medium', bg: 'bg-yellow-500' },
  { value: 'high', label: 'High', bg: 'bg-red-500' },
];

export default function ProjectEditModal({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const { projects, updateProject, addSubtask, updateSubtask, removeSubtask } = useProjectStore();
  // Read the live project from the store so subtask edits reflect immediately.
  const live = projects.find((p) => p.id === project.id) || project;

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [hours, setHours] = useState<number>(project.total_hours);
  const [priority, setPriority] = useState(project.priority);

  const initialGoal: TimeGoal = project.deadline ? 'deadline' : project.weekly_hours_target ? 'weekly' : 'none';
  const [timeGoal, setTimeGoal] = useState<TimeGoal>(initialGoal);
  const [deadline, setDeadline] = useState(project.deadline || '');
  const [weeklyTarget, setWeeklyTarget] = useState<number>(project.weekly_hours_target || 5);

  const [newSubtask, setNewSubtask] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!hours || hours <= 0) {
      toast.error('Estimated hours are required');
      return;
    }
    setSaving(true);
    await updateProject(project.id, {
      name: name.trim(),
      description: description.trim() || null,
      total_hours: hours,
      priority,
      deadline: timeGoal === 'deadline' && deadline ? deadline : null,
      weekly_hours_target: timeGoal === 'weekly' ? weeklyTarget : null,
    });
    setSaving(false);
    toast.success('Project updated');
    onClose();
  };

  const handleAddSubtask = async () => {
    if (!newSubtask.trim()) return;
    await addSubtask(project.id, { name: newSubtask.trim() });
    setNewSubtask('');
  };

  const toggleSubtask = async (subtaskId: string, completed: boolean) => {
    await updateSubtask(project.id, subtaskId, {
      status: completed ? 'completed' : 'pending',
    });
  };

  return (
    <Modal isOpen onClose={onClose} title="Edit project">
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Description</label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Estimated work hours</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0.5"
              step="0.5"
              max="10000"
              value={hours || ''}
              onChange={(e) => setHours(parseFloat(e.target.value) || 0)}
              className="w-24 h-9 bg-white border border-gray-300 rounded-lg px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-500">
              hours · {project.hours_completed}h logged so far
            </span>
          </div>
        </div>

        {/* Time goal */}
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Time goal</label>
          <div className="flex gap-2 mb-3">
            {([
              { value: 'none', label: 'None' },
              { value: 'deadline', label: 'Deadline' },
              { value: 'weekly', label: 'Weekly hrs' },
            ] as Array<{ value: TimeGoal; label: string }>).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTimeGoal(opt.value)}
                className={clsx(
                  'flex-1 py-2 px-2 rounded-lg text-sm font-medium transition-colors',
                  timeGoal === opt.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {timeGoal === 'deadline' && (
            <DatePicker label="Deadline" value={deadline} onChange={setDeadline} />
          )}
          {timeGoal === 'weekly' && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="80"
                step="0.5"
                value={weeklyTarget}
                onChange={(e) => setWeeklyTarget(parseFloat(e.target.value) || 0)}
                className="w-24 h-9 bg-white border border-gray-300 rounded-lg px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-500">hours / week</span>
            </div>
          )}
        </div>

        {/* Priority */}
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Priority</label>
          <div className="flex gap-2">
            {PRIORITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPriority(opt.value)}
                className={clsx(
                  'flex-1 py-2 px-3 rounded-lg font-medium transition-colors',
                  priority === opt.value ? `${opt.bg} text-white` : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Subtasks */}
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Subtasks</label>
          <div className="space-y-2">
            {live.subtasks.length === 0 && (
              <p className="text-xs text-gray-500">No subtasks. Add steps to track granular progress.</p>
            )}
            {live.subtasks.map((st) => (
              <div key={st.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={st.status === 'completed'}
                  onChange={(e) => toggleSubtask(st.id, e.target.checked)}
                  className="rounded shrink-0"
                />
                <Input
                  defaultValue={st.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== st.name) updateSubtask(project.id, st.id, { name: v });
                  }}
                  className={clsx(st.status === 'completed' && 'line-through text-gray-400')}
                />
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  defaultValue={st.estimated_hours ?? ''}
                  onBlur={(e) => {
                    const v = parseFloat(e.target.value);
                    updateSubtask(project.id, st.id, {
                      estimated_hours: Number.isFinite(v) ? v : null,
                    });
                  }}
                  placeholder="h"
                  className="w-16 h-9 bg-white border border-gray-300 rounded-lg px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => removeSubtask(project.id, st.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Input
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSubtask();
                  }
                }}
                placeholder="Add a subtask…"
              />
              <button
                type="button"
                onClick={handleAddSubtask}
                className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 shrink-0"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button type="button" variant="ghost" onClick={onClose} leftIcon={<X className="w-4 h-4" />}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving || !name.trim()} leftIcon={<Check className="w-4 h-4" />}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
