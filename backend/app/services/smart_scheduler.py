"""
Smart Scheduling Module

Intelligently schedules tasks based on:
- Cognitive load vs energy profile matching
- Task clustering (group similar types)
- Automatic break insertion
- Priority and deadline awareness
"""

from datetime import datetime, timedelta
from typing import List, Tuple, Optional
import structlog

from app.models import (
    PlannedTask,
    EnergyProfile,
    CognitiveLoad,
    Priority,
    TaskStatus,
)

logger = structlog.get_logger()


class TimeSlot:
    """Represents a time slot with quality scoring"""
    def __init__(self, start: datetime, end: datetime, quality: str = "normal"):
        self.start = start
        self.end = end
        self.quality = quality  # "peak", "good", "normal", "low"
        self.duration_minutes = int((end - start).total_seconds() / 60)
    
    def __repr__(self):
        return f"TimeSlot({self.start.strftime('%H:%M')}-{self.end.strftime('%H:%M')}, {self.quality})"


def categorize_slots_by_energy(
    slots: List[Tuple[datetime, datetime]],
    energy_profile: EnergyProfile
) -> dict:
    """
    Categorize time slots based on energy profile.
    Returns dict with keys: peak, good, normal, low
    """
    from app.services.schedule_service import ScheduleService
    schedule_service = ScheduleService()
    
    peak_start = schedule_service.parse_time(energy_profile.peak_focus_start)
    peak_end = schedule_service.parse_time(energy_profile.peak_focus_end)
    fatigue_times = [schedule_service.parse_time(ft) for ft in (energy_profile.fatigue_points or [])]
    
    categorized = {
        "peak": [],
        "good": [],
        "normal": [],
        "low": []
    }
    
    for slot_start, slot_end in slots:
        slot_time = slot_start.time()
        slot_minutes = slot_time.hour * 60 + slot_time.minute
        peak_start_minutes = peak_start.hour * 60 + peak_start.minute
        peak_end_minutes = peak_end.hour * 60 + peak_end.minute
        
        # Check if this slot overlaps with peak hours (handle cross-midnight)
        if peak_end_minutes < peak_start_minutes:
            # Peak hours cross midnight (e.g., 23:00 - 02:00)
            is_peak = slot_minutes >= peak_start_minutes or slot_minutes < peak_end_minutes
        else:
            # Normal peak hours (e.g., 09:00 - 12:00)
            is_peak = peak_start_minutes <= slot_minutes < peak_end_minutes
        
        # Check if this slot overlaps with fatigue points
        is_fatigue = any(
            abs(slot_minutes - (ft.hour * 60 + ft.minute)) < 60
            for ft in fatigue_times
        )
        
        # Categorize (priority order: fatigue > peak > good > normal)
        if is_fatigue:
            quality = "low"
        elif is_peak:
            quality = "peak"
        elif 6 <= slot_time.hour < 22:  # Daytime working hours
            quality = "good"
        else:
            # Night hours (22:00-06:00) that aren't peak - mark as normal
            quality = "normal"
        
        time_slot = TimeSlot(slot_start, slot_end, quality)
        categorized[quality].append(time_slot)
    
    logger.info("Slots categorized by energy",
                peak_count=len(categorized["peak"]),
                peak_slots=[f"{s.start.strftime('%H:%M')}-{s.end.strftime('%H:%M')}" for s in categorized["peak"]],
                good_count=len(categorized["good"]),
                good_slots=[f"{s.start.strftime('%H:%M')}-{s.end.strftime('%H:%M')}" for s in categorized["good"]],
                normal_count=len(categorized["normal"]),
                low_count=len(categorized["low"]))
    
    return categorized


def get_task_priority_score(task: PlannedTask) -> int:
    """Calculate numeric priority score for sorting"""
    priority_scores = {
        Priority.HIGH: 3,
        "high": 3,
        Priority.MEDIUM: 2,
        "medium": 2,
        Priority.LOW: 1,
        "low": 1
    }
    priority = task.priority.value if hasattr(task.priority, 'value') else task.priority
    return priority_scores.get(priority, 2)


VALID_COGNITIVE_TYPES = ("deep_focus", "light_focus", "admin", "physical", "recovery")


def infer_cognitive_type(task: PlannedTask) -> str:
    """The task's cognitive type.

    Prefers the AI's own classification (carried on the task). The name-keyword
    guess is only a last resort for tasks that never went through the AI — e.g.
    recurring injections or hand-made tasks.
    """
    declared = getattr(task, "cognitive_load", None)
    declared = declared.value if hasattr(declared, "value") else declared
    if declared in VALID_COGNITIVE_TYPES:
        return declared

    name = (task.task_name or "").lower()
    if any(w in name for w in ["code", "design", "write", "create", "build"]):
        return "deep_focus"
    if any(w in name for w in ["exercise", "workout", "walk", "run", "gym"]):
        return "physical"
    if any(w in name for w in ["email", "call", "meeting", "review"]):
        return "light_focus"
    if any(w in name for w in ["break", "rest", "relax", "meal"]):
        return "recovery"
    if any(w in name for w in ["schedule", "organize", "plan"]):
        return "admin"
    return "light_focus"


def categorize_tasks_by_type(tasks: List[PlannedTask]) -> dict:
    """Group tasks by cognitive load type"""
    categorized = {t: [] for t in VALID_COGNITIVE_TYPES}
    for task in tasks:
        categorized[infer_cognitive_type(task)].append(task)
    return categorized


# Per-cognitive-type search order over slot energy quality (best first).
QUALITY_PREF = {
    "deep_focus": ["peak", "good", "normal", "low"],
    "physical": ["good", "normal", "peak", "low"],
    "light_focus": ["normal", "good", "low", "peak"],
    "admin": ["normal", "good", "low", "peak"],
    "recovery": ["low", "normal", "good", "peak"],
}
# Lower weight = allocated earlier (first pick of peak/earlier slots): deep work first.
_TYPE_WEIGHT = {"deep_focus": 0, "physical": 1, "light_focus": 2, "admin": 3, "recovery": 4}


def _dependency_order(tasks: List[PlannedTask]) -> List[PlannedTask]:
    """Order tasks so every task's prerequisites (``depends_on``, referenced by
    ``task_id``) come before it, breaking ties by energy weight (deep_focus
    first) then priority. This is the SINGLE source of ordering — the old code
    topologically sorted and then discarded it by regrouping into type buckets,
    so a deep-focus task could be scheduled before the admin task it depended on.

    Circular/unresolvable dependencies fall back to appending the remainder
    in-order rather than dropping tasks.
    """
    by_id = {t.task_id: t for t in tasks if t.task_id}
    pending = {
        id(t): ({d for d in (t.depends_on or []) if d in by_id} if t.task_id else set())
        for t in tasks
    }

    def key(t: PlannedTask):
        return (_TYPE_WEIGHT.get(infer_cognitive_type(t), 2), -get_task_priority_score(t))

    ordered: List[PlannedTask] = []
    pool = list(tasks)
    while pool:
        ready = [t for t in pool if not pending[id(t)]]
        if not ready:
            logger.warning("Circular/unresolvable task dependencies — scheduling remainder as-is")
            ordered.extend(pool)
            break
        ready.sort(key=key)
        chosen = ready[0]
        ordered.append(chosen)
        pool.remove(chosen)
        if chosen.task_id:
            for t in pool:
                pending[id(t)].discard(chosen.task_id)
    return ordered


def create_break_task(duration_minutes: int, start: datetime) -> PlannedTask:
    """Create a break task"""
    return PlannedTask(
        id=f"break-{start.strftime('%H%M')}",
        task_id="",
        task_name=f"Break ({duration_minutes} min)",
        suggested_duration=f"{duration_minutes} minutes",
        priority=Priority.MEDIUM,
        notes="Auto-generated break for recovery",
        scheduled_start=start.strftime("%H:%M"),
        scheduled_end=(start + timedelta(minutes=duration_minutes)).strftime("%H:%M"),
        scheduled_date=start.date().isoformat(),
        status=TaskStatus.PENDING,
        order=0,
        is_break=True
    )


def smart_schedule(
    tasks: List[PlannedTask],
    available_slots: List[Tuple[datetime, datetime]],
    energy_profile: EnergyProfile,
    include_breaks: bool = True
) -> List[PlannedTask]:
    """
    Intelligently schedule tasks into available slots.
    
    Algorithm:
    1. Build a unified timeline of available time from all slots
    2. Categorize tasks by cognitive type and priority
    3. Place tasks sequentially into the timeline, preferring energy-matched slots
    4. Track remaining capacity in each slot (multiple tasks per slot)
    5. Insert breaks every 90 minutes of continuous work
    """
    from app.services.schedule_service import ScheduleService
    schedule_service = ScheduleService()
    
    if not tasks:
        logger.info("No tasks to schedule")
        return []
    
    if not available_slots:
        logger.warning("No available slots for scheduling")
        return tasks  # Return unscheduled
    
    logger.info("Starting smart scheduling",
                task_count=len(tasks),
                slot_count=len(available_slots))

    # Step 1: Build a mutable list of available time chunks, sorted chronologically
    # Each chunk tracks its remaining capacity
    time_chunks = []
    for slot_start, slot_end in sorted(available_slots, key=lambda s: s[0]):
        duration = int((slot_end - slot_start).total_seconds() / 60)
        if duration > 0:
            time_chunks.append({
                "start": slot_start,
                "end": slot_end,
                "cursor": slot_start,  # Where the next task can start within this chunk
                "remaining": duration,
            })
    
    if not time_chunks:
        logger.warning("No usable time chunks")
        return tasks
    
    # Determine energy quality for each chunk based on energy profile
    peak_start = schedule_service.parse_time(energy_profile.peak_focus_start)
    peak_end = schedule_service.parse_time(energy_profile.peak_focus_end)
    fatigue_times = [schedule_service.parse_time(ft) for ft in (energy_profile.fatigue_points or [])]
    peak_start_min = peak_start.hour * 60 + peak_start.minute
    peak_end_min = peak_end.hour * 60 + peak_end.minute
    
    def get_chunk_quality(chunk):
        """Rate the energy quality of a time chunk based on its cursor position"""
        slot_min = chunk["cursor"].hour * 60 + chunk["cursor"].minute
        
        # Check for fatigue
        for ft in fatigue_times:
            ft_min = ft.hour * 60 + ft.minute
            if abs(slot_min - ft_min) < 60:
                return "low"
        
        # Check for peak
        if peak_end_min < peak_start_min:
            is_peak = slot_min >= peak_start_min or slot_min < peak_end_min
        else:
            is_peak = peak_start_min <= slot_min < peak_end_min
        
        if is_peak:
            return "peak"
        
        hour = chunk["cursor"].hour
        if 6 <= hour < 22:
            return "good"
        return "normal"
    
    # Step 2: Order tasks — prerequisites before dependents, energy weight and
    # priority as tie-breakers (a single ordering, not sort-then-discard).
    ordered_tasks = _dependency_order(tasks)
    logger.info("Allocation order",
                order=[f"{t.task_name}[{infer_cognitive_type(t)}]" for t in ordered_tasks])

    # Step 3: Allocate. Each task honors its cognitive type's energy preference
    # AND cannot start before all of its prerequisites have ended.
    scheduled_tasks = []
    continuous_work_minutes = 0
    prev_end_dt = None    # end of the previously placed task, to detect rest gaps
    start_dt: dict = {}   # id(task) -> start datetime, for correct cross-midnight ordering
    end_dt: dict = {}     # task_id -> end datetime, to gate dependents' earliest start

    def earliest_start_for(task):
        deps = [d for d in (task.depends_on or []) if d in end_dt] if task.task_id else []
        return max((end_dt[d] for d in deps), default=None)

    def placement(chunk, min_start, duration):
        """Effective start if the task fits in this chunk given its earliest
        allowed start, else None (a dependency gap starts the task later)."""
        est = max(chunk["cursor"], min_start) if min_start else chunk["cursor"]
        if est + timedelta(minutes=duration) <= chunk["end"]:
            return est
        return None

    for task in ordered_tasks:
        task_duration = schedule_service.parse_duration(task.suggested_duration)
        if task_duration <= 0:
            task_duration = 30  # Default fallback
        min_start = earliest_start_for(task)
        preferred_qualities = QUALITY_PREF.get(infer_cognitive_type(task), QUALITY_PREF["light_focus"])

        best_chunk = best_chunk_idx = best_est = None

        # Pass 1: energy-matched chunk that fits (respecting earliest start)
        for quality in preferred_qualities:
            for idx, chunk in enumerate(time_chunks):
                est = placement(chunk, min_start, task_duration)
                if est is not None and get_chunk_quality({**chunk, "cursor": est}) == quality:
                    best_chunk, best_chunk_idx, best_est = chunk, idx, est
                    break
            if best_chunk:
                break

        # Pass 2: any chunk that fits
        if not best_chunk:
            for idx, chunk in enumerate(time_chunks):
                est = placement(chunk, min_start, task_duration)
                if est is not None:
                    best_chunk, best_chunk_idx, best_est = chunk, idx, est
                    break

        # Pass 3: truncate into the largest chunk that can still start on time
        if not best_chunk:
            largest_room = 0
            for idx, chunk in enumerate(time_chunks):
                est = placement(chunk, min_start, 15)  # room for at least 15 min?
                if est is None:
                    continue
                room = int((chunk["end"] - est).total_seconds() / 60)
                if room > largest_room:
                    largest_room, best_chunk, best_chunk_idx, best_est = room, chunk, idx, est
            if best_chunk and largest_room >= 15:
                task_duration = min(task_duration, largest_room)
                logger.warning(f"Task {task.task_name} truncated to {task_duration}min to fit available time")
            else:
                best_chunk = None

        if not best_chunk:
            logger.warning(f"No available time for task: {task.task_name}")
            scheduled_tasks.append(task)  # unscheduled (no times)
            continue

        # A gap before this task (a chunk jump across a commitment, or a
        # dependency wait) means the user already rested — don't carry earlier
        # continuous work toward a break they don't need.
        if prev_end_dt is not None and best_est > prev_end_dt:
            continuous_work_minutes = 0

        # Optional break before this task
        if include_breaks and continuous_work_minutes >= 90:
            break_duration = 15
            if best_est + timedelta(minutes=break_duration + task_duration) <= best_chunk["end"]:
                break_task = create_break_task(break_duration, best_est)
                scheduled_tasks.append(break_task)
                start_dt[id(break_task)] = best_est
                best_est = best_est + timedelta(minutes=break_duration)
                continuous_work_minutes = 0

        task_start = best_est
        task_end = task_start + timedelta(minutes=task_duration)
        task.scheduled_start = task_start.strftime("%H:%M")
        task.scheduled_end = task_end.strftime("%H:%M")
        # Stamp the REAL calendar date (a night-owl slot puts this past midnight
        # on the next day) so no downstream code has to guess it.
        task.scheduled_date = task_start.date().isoformat()
        start_dt[id(task)] = task_start
        if task.task_id:
            end_dt[task.task_id] = task_end

        # Consume this chunk from its old cursor through the task end (any idle
        # gap forced by a dependency earliest-start is consumed too).
        best_chunk["remaining"] -= int((task_end - best_chunk["cursor"]).total_seconds() / 60)
        best_chunk["cursor"] = task_end
        if best_chunk["remaining"] <= 0:
            time_chunks.pop(best_chunk_idx)

        scheduled_tasks.append(task)
        continuous_work_minutes = 0 if task.is_break else continuous_work_minutes + task_duration
        prev_end_dt = task_end

        logger.info(f"✨ Scheduled '{task.task_name}' at {task.scheduled_start}-{task.scheduled_end}")

    # Step 4: order by real start instant so a 00:30 task sorts AFTER 23:00 (a
    # plain HH:MM string sort puts it first); unscheduled tasks sink to the end.
    scheduled_tasks.sort(key=lambda t: start_dt.get(id(t), datetime.max))

    scheduled_count = len([t for t in scheduled_tasks if t.scheduled_start])
    unscheduled_count = len([t for t in scheduled_tasks if not t.scheduled_start])
    logger.info("Smart scheduling complete",
                scheduled_count=scheduled_count,
                unscheduled_count=unscheduled_count)
    
    return scheduled_tasks


def schedule_task_in_slot(
    task: PlannedTask,
    slot: TimeSlot,
    schedule_service
) -> PlannedTask:
    """Assign task to a specific time slot (legacy helper, kept for compatibility)"""
    duration_minutes = schedule_service.parse_duration(task.suggested_duration)
    
    # Check if task fits in slot
    if duration_minutes > slot.duration_minutes:
        logger.warning(f"Task {task.task_name} ({duration_minutes}min) doesn't fit in slot ({slot.duration_minutes}min)")
        # Try to fit anyway, truncate if needed
        duration_minutes = slot.duration_minutes
    
    task.scheduled_start = slot.start.strftime("%H:%M")
    task.scheduled_end = (slot.start + timedelta(minutes=duration_minutes)).strftime("%H:%M")
    
    # Advance slot start so next task in same slot doesn't overlap
    slot.start = slot.start + timedelta(minutes=duration_minutes)
    slot.duration_minutes -= duration_minutes
    
    logger.info(f"Scheduled task in {slot.quality} slot",
                task=task.task_name,
                time=f"{task.scheduled_start}-{task.scheduled_end}")
    
    return task
