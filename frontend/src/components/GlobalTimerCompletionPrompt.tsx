import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { Button, Modal, Textarea } from '@/components/ui';
import {
  useFocusCountdownStore,
  useTaskStore,
  useTimerPromptStore,
} from '@/stores';
import { activeFocusTimerService, focusSessionService } from '@/services/api';

const TIMER_NOTE_PREFIX = 'Timer note:';

function stripTimerNotes(notes?: string | null): string {
  if (!notes) return '';
  return notes
    .split('\n')
    .filter((line) => !line.trim().toLowerCase().startsWith(TIMER_NOTE_PREFIX.toLowerCase()))
    .join('\n')
    .trim();
}

function buildIncompleteTimerNote(existingNotes?: string, reason?: string): string {
  const base = stripTimerNotes(existingNotes);
  const trimmedReason = reason?.trim();
  const timerLine = trimmedReason
    ? `${TIMER_NOTE_PREFIX} Timer ended; task marked incomplete. Reason: ${trimmedReason}`
    : `${TIMER_NOTE_PREFIX} Timer ended; task marked incomplete and needs rescheduling.`;
  return [base, timerLine].filter(Boolean).join('\n');
}

/**
 * App-global handler for the "did you complete this task?" prompt that
 * fires when a focus timer expires. Lives in Layout so it can surface the
 * prompt regardless of which route the user is on (Dashboard, Schedule, etc.)
 * and so the mandatory yes/no decision cannot be skipped.
 */
export default function GlobalTimerCompletionPrompt() {
  const location = useLocation();
  const isOnFocusTimerPage = location.pathname === '/app/focus';

  const prompt = useTimerPromptStore((s) => s.prompt);
  const setPrompt = useTimerPromptStore((s) => s.setPrompt);
  const clearPrompt = useTimerPromptStore((s) => s.clearPrompt);
  const clearSharedCountdown = useFocusCountdownStore((s) => s.clearSnapshot);
  const updatePlannedTask = useTaskStore((s) => s.updatePlannedTask);
  const loadPlanFromDatabase = useTaskStore((s) => s.loadPlanFromDatabase);

  const [incompleteReason, setIncompleteReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [recordedSessionKeys, setRecordedSessionKeys] = useState<Set<string>>(new Set());

  // Detect an already-expired focus timer on the backend when the user is
  // away from FocusTimer. FocusTimer's own tick handles in-page expiry.
  useEffect(() => {
    if (isOnFocusTimerPage) return;
    let cancelled = false;

    const check = async () => {
      if (cancelled) return;
      if (useTimerPromptStore.getState().prompt) return;
      try {
        const serverTimer = await activeFocusTimerService.get();
        if (cancelled || !serverTimer) return;
        if (useTimerPromptStore.getState().prompt) return;
        if (serverTimer.mode !== 'focus' || !serverTimer.task_id) return;

        const startedAtMs = serverTimer.started_at ? new Date(serverTimer.started_at).getTime() : null;
        const elapsedSeconds = serverTimer.is_running && startedAtMs
          ? Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000))
          : 0;
        const remaining = serverTimer.is_running
          ? Math.max(0, serverTimer.remaining_seconds - elapsedSeconds)
          : Math.max(0, serverTimer.remaining_seconds);
        if (remaining > 0) return;

        const taskDate = serverTimer.task_date || format(new Date(), 'yyyy-MM-dd');
        await loadPlanFromDatabase(taskDate).catch(() => undefined);

        const task = useTaskStore.getState().plannedTasks.find((t) => t.id === serverTimer.task_id);
        if (task && ['completed', 'cancelled', 'skipped', 'missed'].includes(task.status)) {
          // Already resolved — drop the stale timer record so we don't keep prompting.
          await activeFocusTimerService.clear().catch(() => undefined);
          clearSharedCountdown();
          return;
        }

        const totalSeconds = serverTimer.total_seconds > 0 ? serverTimer.total_seconds : 25 * 60;
        const durationMinutes = Math.max(1, Math.round(totalSeconds / 60));

        // Best-effort: record the focus session so analytics aren't lost when
        // expiry happens while the user is away from the FocusTimer page.
        const sessionKey = `${serverTimer.task_id}|${serverTimer.started_at || ''}|${totalSeconds}`;
        if (!recordedSessionKeys.has(sessionKey)) {
          setRecordedSessionKeys((prev) => {
            const next = new Set(prev);
            next.add(sessionKey);
            return next;
          });
          const startTime = startedAtMs
            ? new Date(startedAtMs)
            : new Date(Date.now() - totalSeconds * 1000);
          focusSessionService.save({
            task_id: serverTimer.task_id,
            task_name: serverTimer.task_name || task?.task_name || null,
            start_time: startTime.toISOString(),
            end_time: new Date().toISOString(),
            duration: totalSeconds,
            mode: 'focus',
            completed: true,
            session_date: format(new Date(), 'yyyy-MM-dd'),
          }).catch((error) => {
            console.error('Failed to record focus session globally:', error);
          });
        }

        setPrompt({
          taskId: serverTimer.task_id,
          taskName: serverTimer.task_name || task?.task_name || 'Task',
          taskDate,
          durationMinutes,
          nextSessionCount: 1,
        });
      } catch (e) {
        // Silently retry on next interval / visibility change.
      }
    };

    check();
    const interval = window.setInterval(check, 15000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [
    isOnFocusTimerPage,
    setPrompt,
    loadPlanFromDatabase,
    clearSharedCountdown,
    recordedSessionKeys,
  ]);

  const handleDecision = useCallback(async (didComplete: boolean) => {
    const current = useTimerPromptStore.getState().prompt;
    if (!current) return;
    setSaving(true);

    const nowIso = new Date().toISOString();

    // Make sure the plan is loaded so we can read existing notes / actual_start.
    // If load fails we still attempt the update — the requirement is that the
    // user's yes/no answer cannot be silently dropped.
    try {
      await loadPlanFromDatabase(current.taskDate);
    } catch {
      // ignore
    }
    const task = useTaskStore.getState().plannedTasks.find((t) => t.id === current.taskId);

    try {
      if (didComplete) {
        await updatePlannedTask(current.taskId, {
          status: 'completed',
          actual_start: task?.actual_start || nowIso,
          actual_end: nowIso,
        });
        toast.success('Task marked as completed. Great work.');
      } else {
        await updatePlannedTask(current.taskId, {
          status: 'missed',
          actual_end: nowIso,
          notes: buildIncompleteTimerNote(task?.notes, incompleteReason),
        });
        toast('Task kept incomplete. Reschedule it before starting again.');
      }
    } catch (error) {
      console.error('Failed to save timer completion decision:', error);
      toast.error('Failed to save your answer. Please try again.');
      setSaving(false);
      return; // Keep the modal open so the user can retry — mandatory decision.
    }

    try {
      await activeFocusTimerService.clear();
    } catch (error) {
      console.error('Failed to clear active focus timer:', error);
    }
    clearSharedCountdown();

    clearPrompt();
    setIncompleteReason('');
    setSaving(false);
  }, [
    incompleteReason,
    updatePlannedTask,
    loadPlanFromDatabase,
    clearSharedCountdown,
    clearPrompt,
  ]);

  if (!prompt) return null;

  return (
    <Modal isOpen onClose={() => undefined}>
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Timer went off</h2>
          <p className="text-sm text-gray-700 mt-1">
            {prompt.taskName} finished its {prompt.durationMinutes}-minute focus block.
          </p>
          <p className="text-sm text-gray-700 mt-1">Did you complete this task?</p>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2">
            If not completed, add a reason (optional)
          </label>
          <Textarea
            value={incompleteReason}
            onChange={(e) => setIncompleteReason(e.target.value)}
            placeholder="What blocked this task? (optional)"
            className="bg-white border-gray-300 text-gray-900 min-h-20"
            disabled={saving}
          />
        </div>

        <div className="rounded-apple border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-800">
            If you choose "No", this task will stay incomplete and cannot be started again until you reschedule it.
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            variant="ghost"
            className="flex-1"
            onClick={() => handleDecision(false)}
            disabled={saving}
          >
            No, keep incomplete
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => handleDecision(true)}
            disabled={saving}
          >
            Yes, completed
          </Button>
        </div>
      </div>
    </Modal>
  );
}
