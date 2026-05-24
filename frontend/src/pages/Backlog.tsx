import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import {
  Inbox,
  Clock,
  Trash2,
  Edit2,
  CalendarPlus,
  Plus,
  X,
  Check,
  AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useBacklogStore } from '@/stores';
import { Button, Input, Textarea, Modal, DatePicker, TimePicker } from '@/components/ui';
import { PriorityBadge } from '@/components/ui/Badge';
import { clsx } from 'clsx';
import type { BacklogItem } from '@/services/api';

const DURATION_PRESETS = [
  { label: '15m', value: 15 },
  { label: '30m', value: 30 },
  { label: '1h', value: 60 },
  { label: '1.5h', value: 90 },
  { label: '2h', value: 120 },
];

const PRIORITY_OPTIONS: Array<{ value: 'low' | 'medium' | 'high'; label: string; ring: string; bg: string }> = [
  { value: 'low', label: 'Low', ring: 'ring-green-500', bg: 'bg-green-500' },
  { value: 'medium', label: 'Medium', ring: 'ring-yellow-500', bg: 'bg-yellow-500' },
  { value: 'high', label: 'High', ring: 'ring-red-500', bg: 'bg-red-500' },
];

function formatDuration(minutes: number): string {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    if (remainingMins === 0) return `${hours}h`;
    return `${hours}h ${remainingMins}m`;
  }
  return `${minutes}m`;
}

export default function Backlog() {
  const { items, isLoading, hasLoaded, loadItems, addItem, updateItem, removeItem, scheduleItem } = useBacklogStore();

  const [editing, setEditing] = useState<BacklogItem | null>(null);
  const [scheduling, setScheduling] = useState<BacklogItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BacklogItem | null>(null);

  // Add form state
  const [newName, setNewName] = useState('');
  const [newMinutes, setNewMinutes] = useState(60);
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [newNotes, setNewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!hasLoaded) loadItems();
  }, [hasLoaded, loadItems]);

  const sortedItems = useMemo(() => {
    // Group by priority then by recency
    const priorityWeight: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return [...items].sort((a, b) => {
      const pa = priorityWeight[a.priority] ?? 1;
      const pb = priorityWeight[b.priority] ?? 1;
      if (pa !== pb) return pa - pb;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [items]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || newName.trim().length < 2) {
      toast.error('Please enter a name (at least 2 characters)');
      return;
    }
    setSubmitting(true);
    const created = await addItem({
      name: newName.trim(),
      estimated_minutes: newMinutes,
      priority: newPriority,
      notes: newNotes.trim() || undefined,
    });
    setSubmitting(false);
    if (created) {
      toast.success('Added to backlog');
      setNewName('');
      setNewMinutes(60);
      setNewPriority('medium');
      setNewNotes('');
    } else {
      toast.error('Failed to add item');
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Inbox className="w-6 h-6 text-blue-600" />
            Backlog
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Things to do "eventually" — schedule them when you find time.
          </p>
        </div>
        <div className="text-sm text-gray-500">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Add form */}
        <div className="lg:col-span-1 lg:sticky lg:top-4 lg:self-start">
          <div className="glass-card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" />
              Add to Backlog
            </h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">Name *</label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Finish personal project"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">Estimated duration</label>
                <div className="flex flex-wrap gap-2">
                  {DURATION_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setNewMinutes(p.value)}
                      className={clsx(
                        'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                        newMinutes === p.value
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                  <input
                    type="number"
                    min="1"
                    max="480"
                    value={newMinutes}
                    onChange={(e) => setNewMinutes(parseInt(e.target.value) || 0)}
                    className="w-20 h-8 bg-white border border-gray-300 rounded-lg px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">Priority</label>
                <div className="flex gap-2">
                  {PRIORITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setNewPriority(opt.value)}
                      className={clsx(
                        'flex-1 py-2 px-3 rounded-lg font-medium transition-colors',
                        newPriority === opt.value
                          ? `${opt.bg} text-white`
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">Notes (optional)</label>
                <Textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Any context, links, sub-steps…"
                  rows={3}
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full"
                disabled={submitting || !newName.trim() || newName.trim().length < 2}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                {submitting ? 'Adding…' : 'Add to Backlog'}
              </Button>
            </form>
          </div>
        </div>

        {/* List */}
        <div className="lg:col-span-2">
          {isLoading && items.length === 0 ? (
            <div className="glass-card text-center py-12 text-gray-500">Loading backlog…</div>
          ) : items.length === 0 ? (
            <div className="glass-card text-center py-12">
              <Inbox className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-700 font-medium">Your backlog is empty</p>
              <p className="text-sm text-gray-500 mt-1">
                Add tasks here when you don't yet know when you'll do them.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {sortedItems.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    className="glass-card group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-gray-900 break-words">{item.name}</h3>
                          <PriorityBadge priority={item.priority as any} />
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-sm text-gray-600">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {formatDuration(item.estimated_minutes)}
                          </span>
                          <span className="text-xs text-gray-400">
                            Added {format(new Date(item.created_at), 'MMM d')}
                          </span>
                        </div>
                        {item.notes && (
                          <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap break-words">
                            {item.notes}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 shrink-0">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => setScheduling(item)}
                          leftIcon={<CalendarPlus className="w-3.5 h-3.5" />}
                        >
                          Schedule
                        </Button>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setEditing(item)}
                            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(item)}
                            className="p-1.5 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {editing && (
        <EditModal
          item={editing}
          onClose={() => setEditing(null)}
          onSave={async (updates) => {
            await updateItem(editing.id, updates);
            setEditing(null);
            toast.success('Backlog item updated');
          }}
        />
      )}

      {/* Schedule modal */}
      {scheduling && (
        <ScheduleModal
          item={scheduling}
          onClose={() => setScheduling(null)}
          onSchedule={async (input) => {
            const ok = await scheduleItem(scheduling.id, input);
            if (ok) {
              toast.success(`Scheduled for ${format(new Date(input.date + 'T00:00:00'), 'MMM d')}`);
              setScheduling(null);
            } else {
              toast.error('Failed to schedule. Try again.');
            }
          }}
        />
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <Modal isOpen onClose={() => setConfirmDelete(null)} title="Delete this backlog item?">
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-900">
                "{confirmDelete.name}" will be removed permanently. This doesn't affect any scheduled tasks.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  await removeItem(confirmDelete.id);
                  setConfirmDelete(null);
                  toast.success('Removed from backlog');
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

// ----------------------------------------------------------------------------

function EditModal({
  item,
  onClose,
  onSave,
}: {
  item: BacklogItem;
  onClose: () => void;
  onSave: (updates: Partial<BacklogItem>) => Promise<void>;
}) {
  const [name, setName] = useState(item.name);
  const [minutes, setMinutes] = useState(item.estimated_minutes);
  const [priority, setPriority] = useState(item.priority);
  const [notes, setNotes] = useState(item.notes || '');
  const [saving, setSaving] = useState(false);

  return (
    <Modal isOpen onClose={onClose} title="Edit backlog item">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          setSaving(true);
          await onSave({
            name: name.trim(),
            estimated_minutes: minutes,
            priority,
            notes: notes.trim() || null,
          });
          setSaving(false);
        }}
        className="space-y-4"
      >
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Estimated duration</label>
          <div className="flex flex-wrap gap-2">
            {DURATION_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setMinutes(p.value)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  minutes === p.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                )}
              >
                {p.label}
              </button>
            ))}
            <input
              type="number"
              min="1"
              max="480"
              value={minutes}
              onChange={(e) => setMinutes(parseInt(e.target.value) || 0)}
              className="w-20 h-8 bg-white border border-gray-300 rounded-lg px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

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
                  priority === opt.value
                    ? `${opt.bg} text-white`
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">Notes</label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
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

// ----------------------------------------------------------------------------

function ScheduleModal({
  item,
  onClose,
  onSchedule,
}: {
  item: BacklogItem;
  onClose: () => void;
  onSchedule: (input: { date: string; scheduled_start?: string; scheduled_end?: string }) => Promise<void>;
}) {
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState<string>('');
  const [includeTime, setIncludeTime] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setScheduling(true);
    await onSchedule({
      date,
      scheduled_start: includeTime && time ? time : undefined,
    });
    setScheduling(false);
  };

  return (
    <Modal isOpen onClose={onClose} title={`Schedule: ${item.name}`}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-100 text-sm text-blue-900">
          <Clock className="w-4 h-4 shrink-0" />
          <span>
            Estimated: {formatDuration(item.estimated_minutes)} · Priority: <strong>{item.priority}</strong>
          </span>
        </div>

        <div>
          <DatePicker label="Date" value={date} onChange={setDate} />
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includeTime}
              onChange={(e) => {
                setIncludeTime(e.target.checked);
                if (e.target.checked && !time) {
                  setTime(format(new Date(), 'HH:mm'));
                }
              }}
              className="rounded"
            />
            Set a specific start time
          </label>
          {includeTime && (
            <div className="mt-3">
              <TimePicker label="Start time" value={time} onChange={setTime} />
              <p className="text-xs text-gray-500 mt-2">
                End time will auto-fill from the estimated duration.
              </p>
            </div>
          )}
          {!includeTime && (
            <p className="text-xs text-gray-500 mt-2">
              Leave time off and the planner can slot it freely on that day.
            </p>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={scheduling}
            leftIcon={<CalendarPlus className="w-4 h-4" />}
          >
            {scheduling ? 'Scheduling…' : 'Schedule'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
