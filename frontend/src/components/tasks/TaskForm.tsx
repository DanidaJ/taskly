import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { Task, CognitiveLoad, TaskFlexibility } from '@/types';
import { Button, Input, Textarea } from '@/components/ui';
import { clsx } from 'clsx';

interface TaskFormProps {
  initialData?: Partial<Task>;
  onSubmit: (data: TaskFormData) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export interface TaskFormData {
  name: string;
  description?: string;
  type: CognitiveLoad;
  estimated_effort: 1 | 2 | 3 | 4 | 5;
  flexibility: TaskFlexibility;
  tags?: string[];
  due_date?: string;
}

const cognitiveLoadOptions: { value: CognitiveLoad; label: string; color: string }[] = [
  { value: 'deep_focus', label: 'Deep Focus', color: 'bg-purple-500' },
  { value: 'light_focus', label: 'Light Focus', color: 'bg-blue-500' },
  { value: 'admin', label: 'Admin', color: 'bg-amber-500' },
  { value: 'physical', label: 'Physical', color: 'bg-green-500' },
  { value: 'recovery', label: 'Recovery', color: 'bg-cyan-500' },
];

export default function TaskForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
}: TaskFormProps) {
  const [tagsInput, setTagsInput] = useState(initialData?.tags?.join(', ') || '');

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TaskFormData>({
    defaultValues: {
      name: initialData?.name || '',
      description: initialData?.description || '',
      type: initialData?.type || 'light_focus',
      estimated_effort: initialData?.estimated_effort || 3,
      flexibility: initialData?.flexibility || 'flexible',
      due_date: initialData?.due_date || '',
    },
  });

  const selectedType = watch('type');
  const selectedEffort = watch('estimated_effort');
  const selectedFlexibility = watch('flexibility');

  const handleFormSubmit = (data: TaskFormData) => {
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    
    onSubmit({
      ...data,
      tags: tags.length > 0 ? tags : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-5">
      <Input
        label="Task Name"
        placeholder="What do you need to do?"
        error={errors.name?.message}
        {...register('name', { required: 'Task name is required' })}
      />

      <Textarea
        label="Description (optional)"
        placeholder="Add more details about this task..."
        {...register('description')}
      />

      {/* Cognitive Load Type */}
      <div>
        <label className="label">Task Type</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {cognitiveLoadOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setValue('type', option.value)}
              className={clsx(
                'flex items-center gap-2 px-3 py-2 rounded-lg border transition-all',
                selectedType === option.value
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-gray-300 hover:border-gray-400'
              )}
            >
              <div className={clsx('w-3 h-3 rounded-full', option.color)} />
              <span className="text-sm">{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Effort Level */}
      <div>
        <label className="label">Estimated Effort</label>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setValue('estimated_effort', level as 1 | 2 | 3 | 4 | 5)}
              className={clsx(
                'flex-1 py-2 rounded-lg border text-sm font-medium transition-all',
                selectedEffort === level
                  ? 'border-blue-500 bg-blue-500/10 text-blue-600'
                  : 'border-gray-300 text-gray-600 hover:border-gray-400'
              )}
            >
              {level}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-gray-500">
          1 = Quick/Easy, 5 = Complex/Time-consuming
        </p>
      </div>

      {/* Flexibility */}
      <div>
        <label className="label">Flexibility</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setValue('flexibility', 'flexible')}
            className={clsx(
              'flex-1 py-2 rounded-lg border text-sm font-medium transition-all',
              selectedFlexibility === 'flexible'
                ? 'border-blue-500 bg-blue-500/10 text-blue-600'
                : 'border-gray-300 text-gray-600 hover:border-gray-400'
            )}
          >
            Flexible
          </button>
          <button
            type="button"
            onClick={() => setValue('flexibility', 'fixed')}
            className={clsx(
              'flex-1 py-2 rounded-lg border text-sm font-medium transition-all',
              selectedFlexibility === 'fixed'
                ? 'border-blue-500 bg-blue-500/10 text-blue-600'
                : 'border-gray-300 text-gray-600 hover:border-gray-400'
            )}
          >
            Fixed Time
          </button>
        </div>
      </div>

      {/* Due Date */}
      <Input
        label="Due Date (optional)"
        type="date"
        {...register('due_date')}
      />

      {/* Tags */}
      <Input
        label="Tags (optional)"
        placeholder="work, urgent, project-x"
        value={tagsInput}
        onChange={(e) => setTagsInput(e.target.value)}
        helperText="Separate tags with commas"
      />

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          isLoading={isLoading}
          className="flex-1"
        >
          {initialData ? 'Update Task' : 'Create Task'}
        </Button>
      </div>
    </form>
  );
}
