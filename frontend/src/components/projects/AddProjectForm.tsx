import { useState } from 'react';
import { Sparkles, Plus, X, FolderPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { Button, Input, Textarea, DatePicker } from '@/components/ui';
import { useProjectStore } from '@/stores';
import type { ProjectSize, ProjectSubtaskInput } from '@/services/api';
import { SIZE_HOURS, SIZE_OPTIONS, sizeFromHours } from './projectHelpers';

type TimeGoal = 'none' | 'deadline' | 'weekly';

const PRIORITY_OPTIONS: Array<{ value: 'low' | 'medium' | 'high'; label: string; bg: string }> = [
  { value: 'low', label: 'Low', bg: 'bg-green-500' },
  { value: 'medium', label: 'Medium', bg: 'bg-yellow-500' },
  { value: 'high', label: 'High', bg: 'bg-red-500' },
];

export default function AddProjectForm() {
  const { addProject, estimateHours } = useProjectStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [hours, setHours] = useState<number>(0);
  const [size, setSize] = useState<ProjectSize | null>(null);
  const [hoursTouched, setHoursTouched] = useState(false);

  const [timeGoal, setTimeGoal] = useState<TimeGoal>('none');
  const [deadline, setDeadline] = useState('');
  const [weeklyTarget, setWeeklyTarget] = useState<number>(5);

  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');

  const [subtasks, setSubtasks] = useState<ProjectSubtaskInput[]>([]);
  const [showSubtasks, setShowSubtasks] = useState(false);

  const [estimating, setEstimating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const runEstimate = async () => {
    if (!name.trim() || name.trim().length < 2) {
      toast.error('Enter a project name first');
      return;
    }
    setEstimating(true);
    const result = await estimateHours(name.trim(), description.trim() || undefined);
    setEstimating(false);
    if (result) {
      setHours(result.hours);
      setSize(result.size);
      setHoursTouched(true);
      toast.success(`AI estimate: ~${result.hours}h (${result.size})`);
    } else {
      toast.error('Could not estimate — set hours manually');
    }
  };

  // Auto-estimate when the user leaves the name field without setting hours yet.
  const handleNameBlur = () => {
    if (name.trim().length >= 2 && !hoursTouched && hours === 0) {
      runEstimate();
    }
  };

  const pickSize = (s: ProjectSize) => {
    setSize(s);
    setHours(SIZE_HOURS[s]);
    setHoursTouched(true);
  };

  const setHoursValue = (value: number) => {
    setHours(value);
    setHoursTouched(true);
    if (value > 0) setSize(sizeFromHours(value));
  };

  const subtaskTotal = subtasks.reduce((sum, s) => sum + (s.estimated_hours || 0), 0);

  const reset = () => {
    setName('');
    setDescription('');
    setHours(0);
    setSize(null);
    setHoursTouched(false);
    setTimeGoal('none');
    setDeadline('');
    setWeeklyTarget(5);
    setPriority('medium');
    setSubtasks([]);
    setShowSubtasks(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || name.trim().length < 2) {
      toast.error('Please enter a project name');
      return;
    }
    if (!hours || hours <= 0) {
      toast.error('Estimated work hours are required');
      return;
    }
    const cleanSubtasks = subtasks
      .filter((s) => s.name.trim())
      .map((s) => ({ name: s.name.trim(), estimated_hours: s.estimated_hours || undefined }));

    setSubmitting(true);
    const created = await addProject({
      name: name.trim(),
      description: description.trim() || undefined,
      total_hours: hours,
      ai_size_estimate: size || undefined,
      deadline: timeGoal === 'deadline' && deadline ? deadline : undefined,
      weekly_hours_target: timeGoal === 'weekly' ? weeklyTarget : undefined,
      priority,
      subtasks: cleanSubtasks.length ? cleanSubtasks : undefined,
    });
    setSubmitting(false);

    if (created) {
      toast.success('Project created');
      reset();
    } else {
      toast.error('Failed to create project');
    }
  };

  return (
    <div className="glass-card">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <FolderPlus className="w-5 h-5 text-blue-600" />
        New Project
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Name *</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleNameBlur}
            placeholder="e.g. Build portfolio website"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Description (optional)</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A line or two helps the AI estimate better…"
            rows={2}
          />
        </div>

        {/* Hours + AI estimate */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-600">Estimated work hours *</label>
            <button
              type="button"
              onClick={runEstimate}
              disabled={estimating}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {estimating ? 'Estimating…' : 'Estimate with AI'}
            </button>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="number"
              min="0.5"
              step="0.5"
              max="10000"
              value={hours || ''}
              onChange={(e) => setHoursValue(parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="w-24 h-9 bg-white border border-gray-300 rounded-lg px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-500">hours total</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {SIZE_OPTIONS.map((opt) => (
              <button
                key={opt.size}
                type="button"
                onClick={() => pickSize(opt.size)}
                title={opt.range}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  size === opt.size
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                )}
              >
                {opt.label}
                <span className="ml-1 text-xs opacity-70">{opt.range}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Time goal */}
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Time goal (optional)</label>
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
                  timeGoal === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
          {timeGoal === 'none' && (
            <p className="text-xs text-gray-500">
              No time pressure — the AI just fills idle time when you have it.
            </p>
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

        {/* Optional subtasks */}
        <div>
          {!showSubtasks ? (
            <button
              type="button"
              onClick={() => {
                setShowSubtasks(true);
                if (subtasks.length === 0) setSubtasks([{ name: '' }]);
              }}
              className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              <Plus className="w-4 h-4" />
              Break into subtasks (optional)
            </button>
          ) : (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-600">Subtasks</label>
              {subtasks.map((st, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={st.name}
                    onChange={(e) =>
                      setSubtasks((prev) =>
                        prev.map((s, idx) => (idx === i ? { ...s, name: e.target.value } : s))
                      )
                    }
                    placeholder={`Subtask ${i + 1}`}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={st.estimated_hours ?? ''}
                    onChange={(e) =>
                      setSubtasks((prev) =>
                        prev.map((s, idx) =>
                          idx === i ? { ...s, estimated_hours: parseFloat(e.target.value) || undefined } : s
                        )
                      )
                    }
                    placeholder="h"
                    className="w-16 h-9 bg-white border border-gray-300 rounded-lg px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setSubtasks((prev) => prev.filter((_, idx) => idx !== i))}
                    className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setSubtasks((prev) => [...prev, { name: '' }])}
                  className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  <Plus className="w-4 h-4" />
                  Add subtask
                </button>
                {subtaskTotal > 0 && (
                  <button
                    type="button"
                    onClick={() => setHoursValue(subtaskTotal)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Use subtask total ({subtaskTotal}h)
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <Button
          type="submit"
          variant="primary"
          className="w-full"
          disabled={submitting || !name.trim() || name.trim().length < 2 || !hours}
          leftIcon={<FolderPlus className="w-4 h-4" />}
        >
          {submitting ? 'Creating…' : 'Create Project'}
        </Button>
      </form>
    </div>
  );
}
