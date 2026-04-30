import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Filter, ListTodo } from 'lucide-react';
import { useTaskStore } from '@/stores';
import { Task, CognitiveLoad } from '@/types';
import { Button, Input, Modal } from '@/components/ui';
import { TaskCard, TaskForm, TaskFormData } from '@/components/tasks';
import toast from 'react-hot-toast';

export default function Tasks() {
  const { tasks, addTask, updateTask, deleteTask, setLoading, isLoading } = useTaskStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<CognitiveLoad | 'all'>('all');

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch = task.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterType === 'all' || task.type === filterType;
    return matchesSearch && matchesFilter;
  });

  const handleCreateTask = (data: TaskFormData) => {
    const newTask: Task = {
      id: `task-${Date.now()}`,
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    addTask(newTask);
    setIsModalOpen(false);
    toast.success('Task created successfully!');
  };

  const handleUpdateTask = (data: TaskFormData) => {
    if (!editingTask) return;
    
    updateTask(editingTask.id, data);
    setEditingTask(null);
    toast.success('Task updated successfully!');
  };

  const handleDeleteTask = (taskId: string) => {
    if (confirm('Are you sure you want to delete this task?')) {
      deleteTask(taskId);
      toast.success('Task deleted');
    }
  };

  const filterOptions: { value: CognitiveLoad | 'all'; label: string }[] = [
    { value: 'all', label: 'All Types' },
    { value: 'deep_focus', label: 'Deep Focus' },
    { value: 'light_focus', label: 'Light Focus' },
    { value: 'admin', label: 'Admin' },
    { value: 'physical', label: 'Physical' },
    { value: 'recovery', label: 'Recovery' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-gray-600 mt-1">
            Manage your task library • {tasks.length} tasks
          </p>
        </div>
        <Button
          variant="primary"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => setIsModalOpen(true)}
        >
          Add Task
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Input
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
          {filterOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setFilterType(option.value)}
              className={`px-3 py-2 rounded-apple text-sm font-medium whitespace-nowrap transition-colors ${
                filterType === option.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Task List */}
      {filteredTasks.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filteredTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onEdit={() => setEditingTask(task)}
                onDelete={() => handleDeleteTask(task.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16"
        >
          <ListTodo className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-700 mb-2">
            {searchQuery || filterType !== 'all'
              ? 'No tasks found'
              : 'No tasks yet'}
          </h3>
          <p className="text-gray-600 mb-6">
            {searchQuery || filterType !== 'all'
              ? 'Try adjusting your search or filters'
              : 'Create your first task to get started'}
          </p>
          {!searchQuery && filterType === 'all' && (
            <Button
              variant="primary"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setIsModalOpen(true)}
            >
              Add Task
            </Button>
          )}
        </motion.div>
      )}

      {/* Create Task Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create New Task"
        size="lg"
      >
        <TaskForm
          onSubmit={handleCreateTask}
          onCancel={() => setIsModalOpen(false)}
          isLoading={isLoading}
        />
      </Modal>

      {/* Edit Task Modal */}
      <Modal
        isOpen={!!editingTask}
        onClose={() => setEditingTask(null)}
        title="Edit Task"
        size="lg"
      >
        {editingTask && (
          <TaskForm
            initialData={editingTask}
            onSubmit={handleUpdateTask}
            onCancel={() => setEditingTask(null)}
            isLoading={isLoading}
          />
        )}
      </Modal>
    </div>
  );
}
