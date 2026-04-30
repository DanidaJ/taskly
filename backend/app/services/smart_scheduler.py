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


def categorize_tasks_by_type(tasks: List[PlannedTask]) -> dict:
    """Group tasks by cognitive load type"""
    categorized = {
        "deep_focus": [],
        "light_focus": [],
        "admin": [],
        "physical": [],
        "recovery": []
    }
    
    for task in tasks:
        # Try to infer cognitive type if not explicitly set
        # (You might need to add a cognitive_type field to PlannedTask)
        task_name_lower = task.task_name.lower()
        
        # Simple heuristic based on task name
        if any(word in task_name_lower for word in ["code", "design", "write", "create", "build"]):
            cognitive_type = "deep_focus"
        elif any(word in task_name_lower for word in ["exercise", "workout", "walk", "run", "gym"]):
            cognitive_type = "physical"
        elif any(word in task_name_lower for word in ["email", "call", "meeting", "review"]):
            cognitive_type = "light_focus"
        elif any(word in task_name_lower for word in ["break", "rest", "relax", "meal"]):
            cognitive_type = "recovery"
        elif any(word in task_name_lower for word in ["schedule", "organize", "plan"]):
            cognitive_type = "admin"
        else:
            cognitive_type = "light_focus"  # Default
        
        categorized[cognitive_type].append(task)
    
    return categorized


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
    
    # Step 0: Resolve dependencies (sort tasks respecting constraints)
    from app.services.dependency_resolver import topological_sort, CircularDependencyError
    
    try:
        tasks = topological_sort(tasks)
        logger.info("✓ Dependencies resolved",
                   dependent_tasks=len([t for t in tasks if t.depends_on]))
    except CircularDependencyError as e:
        logger.error("Circular dependency detected!", error=str(e))
        # Continue without reordering, but log the issue
    
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
    
    # Step 2: Categorize tasks by cognitive type
    tasks_by_type = categorize_tasks_by_type(tasks)
    
    # Debug: Log task categorization
    for task_type, task_list in tasks_by_type.items():
        if task_list:
            logger.info(f"📋 {task_type}: {[t.task_name for t in task_list]}")
    
    # Step 3: Sort tasks by priority within each type
    for task_type in tasks_by_type:
        tasks_by_type[task_type].sort(key=get_task_priority_score, reverse=True)
    
    # Step 4: Build an ordered allocation queue
    # Priority: deep_focus first (peak slots), then physical (good), then rest
    allocation_order = []
    
    # Deep focus tasks prefer peak energy slots
    for task in tasks_by_type["deep_focus"]:
        allocation_order.append((task, ["peak", "good", "normal", "low"]))
    
    # Physical tasks prefer good energy slots
    for task in tasks_by_type["physical"]:
        allocation_order.append((task, ["good", "normal", "peak", "low"]))
    
    # Light focus, admin, recovery fill remaining
    for task_type in ["light_focus", "admin", "recovery"]:
        for task in tasks_by_type[task_type]:
            allocation_order.append((task, ["normal", "good", "low", "peak"]))
    
    # Step 5: Allocate tasks to chunks, tracking remaining capacity
    scheduled_tasks = []
    continuous_work_minutes = 0
    
    for task, preferred_qualities in allocation_order:
        task_duration = schedule_service.parse_duration(task.suggested_duration)
        
        if task_duration <= 0:
            task_duration = 30  # Default fallback
        
        # Find the best chunk: prefer energy-matched, then any with capacity
        best_chunk = None
        best_chunk_idx = None
        
        # First pass: try to find a chunk matching preferred energy quality
        for quality in preferred_qualities:
            for idx, chunk in enumerate(time_chunks):
                if chunk["remaining"] >= task_duration and get_chunk_quality(chunk) == quality:
                    best_chunk = chunk
                    best_chunk_idx = idx
                    break
            if best_chunk:
                break
        
        # Second pass: if no energy-matched chunk, take any chunk with enough capacity
        if not best_chunk:
            for idx, chunk in enumerate(time_chunks):
                if chunk["remaining"] >= task_duration:
                    best_chunk = chunk
                    best_chunk_idx = idx
                    break
        
        # Third pass: if no chunk has full capacity, try to fit in the largest remaining chunk 
        if not best_chunk:
            largest_chunk = None
            largest_remaining = 0
            for idx, chunk in enumerate(time_chunks):
                if chunk["remaining"] > largest_remaining:
                    largest_remaining = chunk["remaining"]
                    largest_chunk = chunk
                    best_chunk_idx = idx
            if largest_chunk and largest_remaining >= 15:  # At least 15 min
                best_chunk = largest_chunk
                task_duration = min(task_duration, largest_remaining)
                logger.warning(f"Task {task.task_name} truncated to {task_duration}min to fit available time")
        
        if not best_chunk:
            logger.warning(f"No available time for task: {task.task_name}")
            scheduled_tasks.append(task)  # Add without scheduled times
            continue
        
        # Check if we need a break BEFORE this task
        if include_breaks and continuous_work_minutes >= 90:
            break_duration = 15
            if best_chunk["remaining"] >= task_duration + break_duration:
                break_start = best_chunk["cursor"]
                break_task = create_break_task(break_duration, break_start)
                scheduled_tasks.append(break_task)
                # Advance cursor for the break
                best_chunk["cursor"] = best_chunk["cursor"] + timedelta(minutes=break_duration)
                best_chunk["remaining"] -= break_duration
                continuous_work_minutes = 0
        
        # Schedule the task at the chunk's cursor position
        task_start = best_chunk["cursor"]
        task_end = task_start + timedelta(minutes=task_duration)
        
        task.scheduled_start = task_start.strftime("%H:%M")
        task.scheduled_end = task_end.strftime("%H:%M")
        
        # Advance the chunk's cursor and reduce remaining capacity
        best_chunk["cursor"] = task_end
        best_chunk["remaining"] -= task_duration
        
        # Remove chunk if fully exhausted
        if best_chunk["remaining"] <= 0:
            time_chunks.pop(best_chunk_idx)
        
        scheduled_tasks.append(task)
        
        if task.task_name and not task.task_name.startswith("Break"):
            continuous_work_minutes += task_duration
        else:
            continuous_work_minutes = 0
        
        chunk_quality = get_chunk_quality({"cursor": task_start, "start": task_start, "end": task_end, "remaining": 0})
        logger.info(f"✨ Scheduled '{task.task_name}' at {task.scheduled_start}-{task.scheduled_end} ({chunk_quality} slot)")
    
    # Sort all scheduled tasks chronologically
    scheduled_tasks.sort(key=lambda t: t.scheduled_start if t.scheduled_start else '99:99')
    
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
