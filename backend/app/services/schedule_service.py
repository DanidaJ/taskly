from datetime import datetime, time, timedelta, date as date_type
from typing import List, Optional, Tuple
import structlog

from app.models import (
    PlannedTask,
    EnergyProfile,
    SleepSchedule,
    Commitment,
    CognitiveLoad,
    Priority,
)

logger = structlog.get_logger()


class ScheduleService:
    """
    Service for schedule enforcement and time slot calculation.
    
    Key concepts:
    - A "user day" runs from wake time to sleep time, which may cross midnight
    - For night owls (sleep time after midnight), we handle cross-midnight scheduling
    - Commitments block specific time ranges
    - Tasks are scheduled ONLY in available slots, never during commitments
    """
    
    def parse_time(self, time_str: str) -> time:
        """Parse a time string (HH:MM or HH:MM:SS) into a time object"""
        parts = time_str.replace('::', ':').split(':')
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
        return time(hour, minute)
    
    def parse_duration(self, duration_str: str) -> int:
        """Parse duration string into minutes"""
        duration_str = duration_str.lower().strip()
        total_minutes = 0
        
        # Handle hours
        if 'hour' in duration_str or 'h' in duration_str:
            import re
            hours_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:hour|hr|h)', duration_str)
            if hours_match:
                total_minutes += int(float(hours_match.group(1)) * 60)
        
        # Handle minutes
        if 'min' in duration_str or 'm' in duration_str:
            import re
            mins_match = re.search(r'(\d+)\s*(?:min|m)', duration_str)
            if mins_match:
                total_minutes += int(mins_match.group(1))
        
        # If no pattern matched, try to parse as plain number (assume minutes)
        if total_minutes == 0:
            try:
                total_minutes = int(''.join(filter(str.isdigit, duration_str)))
            except ValueError:
                total_minutes = 30  # Default
        
        return total_minutes
    
    def time_to_minutes(self, t: time) -> int:
        """Convert time to minutes from midnight"""
        return t.hour * 60 + t.minute
    
    def minutes_to_time(self, minutes: int) -> time:
        """Convert minutes from midnight to time object"""
        minutes = minutes % (24 * 60)  # Wrap around midnight
        return time(minutes // 60, minutes % 60)
    
    def is_cross_midnight_schedule(self, sleep_schedule: SleepSchedule) -> bool:
        """Check if sleep time is after midnight (cross-midnight schedule)"""
        sleep_time = self.parse_time(sleep_schedule.sleep_time)
        wake_time = self.parse_time(sleep_schedule.wake_time)
        # If sleep time is before wake time in clock terms, it's after midnight
        return sleep_time < wake_time
    
    def calculate_sleep_deadline(
        self,
        sleep_schedule: SleepSchedule,
        base_date: str
    ) -> datetime:
        """
        Calculate the actual datetime when wind-down should start.
        For cross-midnight schedules, this will be in the next calendar day.
        """
        base = datetime.strptime(base_date, '%Y-%m-%d')
        sleep_time = self.parse_time(sleep_schedule.sleep_time)
        
        if self.is_cross_midnight_schedule(sleep_schedule):
            # Sleep time is after midnight, so add a day
            sleep_datetime = datetime.combine(base.date() + timedelta(days=1), sleep_time)
        else:
            sleep_datetime = datetime.combine(base.date(), sleep_time)
        
        # Subtract wind-down time
        wind_down_datetime = sleep_datetime - timedelta(minutes=sleep_schedule.wind_down_minutes)
        return wind_down_datetime
    
    def get_available_time_slots(
        self,
        date: str,
        commitments: List[Commitment],
        sleep_schedule: SleepSchedule,
        existing_tasks: Optional[List[PlannedTask]] = None,
        energy_profile: Optional[EnergyProfile] = None,
    ) -> List[Tuple[datetime, datetime]]:
        """
        Get available time slots for a given date, excluding commitments, sleep, and existing tasks.
        
        Returns datetime tuples to properly handle cross-midnight scheduling.
        For night owls, available slots may extend past midnight into the next calendar day.
        """
        base_date = datetime.strptime(date, '%Y-%m-%d')
        day_of_week = base_date.weekday()
        # Convert Python weekday (0=Monday) to our format (0=Sunday)
        day_of_week = (day_of_week + 1) % 7
        
        wake_time = self.parse_time(sleep_schedule.wake_time)
        wake_datetime = datetime.combine(base_date.date(), wake_time)
        
        # Calculate when user should stop working (wind-down start)
        end_datetime = self.calculate_sleep_deadline(sleep_schedule, date)
        
        logger.info("Calculating available slots", 
                   date=date, 
                   day_of_week=day_of_week,
                   day_name=['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day_of_week],
                   wake_time=wake_time.strftime('%H:%M'),
                   end_time=end_datetime.strftime('%Y-%m-%d %H:%M'),
                   is_cross_midnight=self.is_cross_midnight_schedule(sleep_schedule),
                   total_commitments=len(commitments))
        
        # Get commitments for this day
        day_commitments = [
            c for c in commitments
            if day_of_week in c.days_of_week
        ]
        
        logger.info("Filtered commitments for day",
                   day_commitments_count=len(day_commitments),
                   commitments=[f"{c.name} ({c.start_time}-{c.end_time})" for c in day_commitments])
        
        # Build list of blocked time ranges as datetime objects
        blocked_times: List[Tuple[datetime, datetime]] = []
        
        for commitment in day_commitments:
            commit_start = self.parse_time(commitment.start_time)
            commit_end = self.parse_time(commitment.end_time)
            
            block_start = datetime.combine(base_date.date(), commit_start)
            block_end = datetime.combine(base_date.date(), commit_end)
            
            # Handle commitment that crosses midnight
            if commit_end < commit_start:
                block_end = datetime.combine(base_date.date() + timedelta(days=1), commit_end)
            
            blocked_times.append((block_start, block_end))
            logger.info(f"🚫 Blocked: {commitment.name} from {block_start.strftime('%H:%M')} to {block_end.strftime('%H:%M')}")
        
        # Add existing scheduled tasks to blocked times
        if existing_tasks:
            for task in existing_tasks:
                if task.scheduled_start and task.scheduled_end:
                    task_start = self.parse_time(task.scheduled_start)
                    task_end = self.parse_time(task.scheduled_end)
                    
                    task_start_dt = datetime.combine(base_date.date(), task_start)
                    task_end_dt = datetime.combine(base_date.date(), task_end)
                    
                    # Handle cross-midnight tasks
                    if task_end < task_start:
                        task_end_dt = datetime.combine(base_date.date() + timedelta(days=1), task_end)
                    
                    blocked_times.append((task_start_dt, task_end_dt))
            logger.info("Added existing tasks to blocked times", 
                       existing_task_count=len([t for t in existing_tasks if t.scheduled_start]))
        
        # Sort blocked times by start time
        blocked_times.sort(key=lambda x: x[0])
        
        # Calculate available slots
        available_slots: List[Tuple[datetime, datetime]] = []
        current_start = wake_datetime
        
        for block_start, block_end in blocked_times:
            # Only consider blocks that overlap with our available window
            if block_end <= wake_datetime or block_start >= end_datetime:
                continue
            
            # If there's a gap before this block, it's available
            if current_start < block_start:
                slot_end = min(block_start, end_datetime)
                if current_start < slot_end:
                    available_slots.append((current_start, slot_end))
                    logger.info(f"✅ Available slot: {current_start.strftime('%H:%M')} to {slot_end.strftime('%H:%M')}")
            
            # Move current start past this block
            current_start = max(current_start, block_end)
        
        # Add final slot until end of day
        if current_start < end_datetime:
            available_slots.append((current_start, end_datetime))
            logger.info(f"✅ Available slot: {current_start.strftime('%H:%M')} to {end_datetime.strftime('%H:%M')}")
        
        total_hours = sum((s[1] - s[0]).seconds / 3600 for s in available_slots)
        logger.info("Available slots calculated",
                   slot_count=len(available_slots),
                   total_available_hours=round(total_hours, 1))
        
        return available_slots
    
    def is_in_peak_focus(
        self,
        check_datetime: datetime,
        energy_profile: EnergyProfile,
        base_date: str,
    ) -> bool:
        """Check if a given datetime is within the peak focus window, handling cross-midnight"""
        peak_start = self.parse_time(energy_profile.peak_focus_start)
        peak_end = self.parse_time(energy_profile.peak_focus_end)
        
        base = datetime.strptime(base_date, '%Y-%m-%d')
        peak_start_dt = datetime.combine(base.date(), peak_start)
        peak_end_dt = datetime.combine(base.date(), peak_end)
        
        # Handle cross-midnight peak focus (e.g., 23:00 - 03:00)
        if peak_end < peak_start:
            peak_end_dt = datetime.combine(base.date() + timedelta(days=1), peak_end)
        
        return peak_start_dt <= check_datetime <= peak_end_dt
    
    def is_fatigue_point(
        self,
        check_datetime: datetime,
        energy_profile: EnergyProfile,
        tolerance_minutes: int = 30,
    ) -> bool:
        """Check if a given datetime is near a fatigue point"""
        for fatigue_time_str in energy_profile.fatigue_points:
            fatigue_time = self.parse_time(fatigue_time_str)
            fatigue_dt = datetime.combine(check_datetime.date(), fatigue_time)
            diff = abs((check_datetime - fatigue_dt).total_seconds() / 60)
            if diff <= tolerance_minutes:
                return True
        return False
    
    def calculate_priority_score(
        self,
        task: PlannedTask,
        slot_start: datetime,
        energy_profile: EnergyProfile,
        base_date: str,
    ) -> float:
        """Calculate a priority score for scheduling a task in a given slot"""
        score = 0.0
        
        # Base priority score
        priority_scores = {Priority.HIGH: 3.0, Priority.MEDIUM: 2.0, Priority.LOW: 1.0}
        score += priority_scores.get(task.priority, 2.0)
        
        # Boost for high priority tasks in peak hours
        in_peak = self.is_in_peak_focus(slot_start, energy_profile, base_date)
        if in_peak and task.priority == Priority.HIGH:
            score += 2.0
        
        # Penalty for scheduling during fatigue points
        if self.is_fatigue_point(slot_start, energy_profile):
            score -= 1.0
        
        return score
    
    def _apply_time_constraints(
        self,
        available_slots: List[Tuple[datetime, datetime]],
        base_date: datetime,
        earliest_start: Optional[time] = None,
    ) -> List[Tuple[datetime, datetime]]:
        """Trim slots to honor (a) a user-stated earliest start and (b) the
        current time when scheduling for today. Safe to call repeatedly — it
        must be re-applied whenever slots are recomputed (e.g. after blocking
        out fixed tasks) so nothing ever lands in the past."""
        slots = available_slots

        # Respect user-stated earliest start constraint (e.g. "starting past 10pm")
        if earliest_start is not None:
            earliest_dt = datetime.combine(base_date.date(), earliest_start)
            trimmed = []
            for slot_start, slot_end in slots:
                if slot_end <= earliest_dt:
                    continue
                trimmed.append((max(slot_start, earliest_dt), slot_end))
            slots = trimmed
            logger.info("Applied earliest start filter",
                        earliest=earliest_start.strftime('%H:%M'),
                        remaining_slots=len(slots))

        # Filter out past time slots if scheduling for today
        now = datetime.now()
        if base_date.date() == now.date():
            filtered_slots = []
            for slot_start, slot_end in slots:
                if slot_end <= now:
                    logger.info(f"Skipping past slot: {slot_start.strftime('%H:%M')} - {slot_end.strftime('%H:%M')}")
                    continue
                elif slot_start < now < slot_end:
                    # Round up to next 15 minutes
                    minutes = (now.minute // 15 + 1) * 15
                    if minutes >= 60:
                        adjusted = now.replace(hour=(now.hour + 1) % 24, minute=0, second=0, microsecond=0)
                    else:
                        adjusted = now.replace(minute=minutes, second=0, microsecond=0)
                    logger.info(f"Adjusting partial past slot from {slot_start.strftime('%H:%M')} to {adjusted.strftime('%H:%M')}")
                    filtered_slots.append((adjusted, slot_end))
                else:
                    filtered_slots.append((slot_start, slot_end))
            slots = filtered_slots
            logger.info("Filtered past time slots", remaining_slots=len(slots))

        return slots

    def _parse_fixed_interval(
        self, task: PlannedTask, base_date: datetime
    ) -> Optional[Tuple[datetime, datetime]]:
        """Convert a task's scheduled_start/end ('HH:MM') into concrete datetimes
        anchored on base_date. If the end is <= start, it's treated as crossing
        midnight (end is the next day). Returns None if unparseable."""
        try:
            sh, sm = map(int, task.scheduled_start.split(':'))
            eh, em = map(int, task.scheduled_end.split(':'))
        except (ValueError, AttributeError):
            return None
        start_dt = base_date.replace(hour=sh, minute=sm, second=0, microsecond=0)
        end_dt = base_date.replace(hour=eh, minute=em, second=0, microsecond=0)
        if end_dt <= start_dt:
            end_dt += timedelta(days=1)
        return (start_dt, end_dt)

    def _interval_within_slots(
        self, interval: Tuple[datetime, datetime],
        slots: List[Tuple[datetime, datetime]],
    ) -> bool:
        """True if the interval fits entirely inside one of the available slots."""
        start_dt, end_dt = interval
        for slot_start, slot_end in slots:
            if slot_start <= start_dt and end_dt <= slot_end:
                return True
        return False

    def _interval_overlaps(
        self, interval: Tuple[datetime, datetime],
        accepted: List[Tuple[datetime, datetime]],
    ) -> bool:
        """True if the interval overlaps any already-accepted interval."""
        start_dt, end_dt = interval
        for a_start, a_end in accepted:
            if start_dt < a_end and a_start < end_dt:
                return True
        return False

    def enforce_timing(
        self,
        planned_tasks: List[PlannedTask],
        date: str,
        commitments: List[Commitment],
        sleep_schedule: SleepSchedule,
        energy_profile: EnergyProfile,
        existing_tasks: Optional[List[PlannedTask]] = None,
        earliest_start: Optional[time] = None,
    ) -> List[PlannedTask]:
        """
        Assign actual time slots to planned tasks.
        
        Tasks are ONLY scheduled in available slots (never during commitments).
        Handles cross-midnight scheduling for night owls.
        Prioritizes high-priority tasks for peak focus hours.
        """
        base_date = datetime.strptime(date, '%Y-%m-%d')
        day_of_week = base_date.weekday()
        day_of_week = (day_of_week + 1) % 7  # Convert to 0=Sunday format
        
        logger.info("=" * 60)
        logger.info("ENFORCE_TIMING CALLED", 
                   task_count=len(planned_tasks),
                   date=date,
                   day_of_week=day_of_week,
                   day_name=['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day_of_week],
                   commitment_count=len(commitments),
                   existing_task_count=len(existing_tasks) if existing_tasks else 0,
                   is_cross_midnight=self.is_cross_midnight_schedule(sleep_schedule))
        
        # Log all commitments for debugging
        for c in commitments:
            logger.info(f"📋 Commitment: {c.name} | {c.start_time}-{c.end_time} | Days: {c.days_of_week}")
        
        # Get available time slots
        available_slots = self.get_available_time_slots(
            date, commitments, sleep_schedule, existing_tasks, energy_profile
        )

        if not available_slots:
            logger.warning("No available time slots for date", date=date)
            return planned_tasks

        # Honor earliest-start + current-time constraints
        available_slots = self._apply_time_constraints(available_slots, base_date, earliest_start)

        if not available_slots:
            logger.warning("No future time slots available")
            return planned_tasks
        
        # Calculate total available time
        total_available_minutes = sum(
            int((slot_end - slot_start).total_seconds() // 60)
            for slot_start, slot_end in available_slots
        )
        total_task_minutes = sum(
            self.parse_duration(t.suggested_duration) for t in planned_tasks
        )
        
        logger.info("⏱️ Time budget", 
                   total_available_minutes=total_available_minutes,
                   total_task_minutes=total_task_minutes,
                   slots=[(s[0].strftime('%H:%M'), s[1].strftime('%H:%M')) for s in available_slots])
        
        # ===================================================================
        # STEP 1: Separate tasks with fixed times from flexible tasks.
        #
        # A "fixed" time only comes from the AI's own notes — it is NOT
        # authoritative. Before trusting it we validate that it (a) fits inside
        # a real available slot and (b) doesn't overlap an already-accepted
        # fixed task. Anything that fails is demoted to flexible so the smart
        # scheduler re-places it cleanly. This prevents the AI from producing
        # overlapping blocks or times past the user's sleep window.
        # ===================================================================
        # Decide acceptance in priority order so higher-priority tasks win conflicts.
        def _priority_weight(t: PlannedTask) -> int:
            return 0 if t.priority == Priority.HIGH else 1 if t.priority == Priority.MEDIUM else 2

        accepted_intervals: List[Tuple[datetime, datetime]] = []
        accepted_fixed_ids = set()
        for task in sorted(planned_tasks, key=_priority_weight):
            if not (task.scheduled_start and task.scheduled_end):
                continue
            interval = self._parse_fixed_interval(task, base_date)
            if interval is None:
                logger.info(f"⚠️ Could not parse fixed time for '{task.task_name}' — treating as flexible")
                continue
            if not self._interval_within_slots(interval, available_slots):
                logger.info(f"⛔ Fixed time for '{task.task_name}' ({task.scheduled_start}-{task.scheduled_end}) is outside available slots — demoting to flexible")
                continue
            if self._interval_overlaps(interval, accepted_intervals):
                logger.info(f"⛔ Fixed time for '{task.task_name}' overlaps another fixed task — demoting to flexible")
                continue
            accepted_intervals.append(interval)
            accepted_fixed_ids.add(id(task))

        # Build final lists in the ORIGINAL order; clear times on demoted tasks.
        fixed_tasks = []
        flexible_tasks = []
        for task in planned_tasks:
            if id(task) in accepted_fixed_ids:
                logger.info(f"🔒 Fixed time task: {task.task_name} at {task.scheduled_start}-{task.scheduled_end}")
                fixed_tasks.append(task)
            else:
                if task.scheduled_start or task.scheduled_end:
                    task.scheduled_start = None
                    task.scheduled_end = None
                flexible_tasks.append(task)
        
        # ===================================================================
        # STEP 2: Recalculate available slots if we have fixed tasks
        # ===================================================================
        if fixed_tasks:
            logger.info("Recalculating available slots to exclude fixed-time tasks")
            # Add fixed tasks to existing tasks so their times are blocked off
            all_existing = (existing_tasks or []) + fixed_tasks
            available_slots = self.get_available_time_slots(
                date, commitments, sleep_schedule, all_existing, energy_profile
            )
            # Re-apply earliest-start + past-time filtering: get_available_time_slots
            # returns the FULL day, so without this a flexible task could be placed
            # this morning (before "now") whenever a fixed task triggered this recompute.
            available_slots = self._apply_time_constraints(available_slots, base_date, earliest_start)

            if not available_slots:
                logger.warning("No available slots after accounting for fixed tasks")
                # Return only fixed tasks if no slots remain
                return fixed_tasks
        
        # ===================================================================
        # STEP 3: USE SMART SCHEDULER for flexible tasks only
        # ===================================================================
        from app.services.smart_scheduler import smart_schedule
        
        try:
            scheduled_tasks = smart_schedule(
                flexible_tasks,
                available_slots,
                energy_profile,
                include_breaks=True
            )
            
            # Combine fixed and scheduled tasks
            all_tasks = fixed_tasks + scheduled_tasks
            
            # Sort by scheduled time
            all_tasks.sort(key=lambda t: t.scheduled_start if t.scheduled_start else '99:99')
            
            logger.info("✨ Smart scheduling completed",
                       fixed_count=len(fixed_tasks),
                       scheduled_count=len([t for t in scheduled_tasks if t.scheduled_start]),
                       break_count=len([t for t in scheduled_tasks if getattr(t, 'is_break', False)]))
            
            logger.info("=" * 60)
            return all_tasks
            
        except Exception as e:
            logger.error("Smart scheduling failed, using fallback",
                        error=str(e),
                        exc_info=True)
        
        # FALLBACK: Original priority-based scheduling
        # Sort tasks by priority (high priority first)
        sorted_tasks = sorted(
            planned_tasks, 
            key=lambda t: (
                0 if t.priority == Priority.HIGH else 
                1 if t.priority == Priority.MEDIUM else 2,
                t.order
            )
        )
        
        # Schedule tasks
        scheduled_tasks = []
        current_slot_idx = 0
        current_time = available_slots[0][0] if available_slots else None
        
        for task in sorted_tasks:
            if current_slot_idx >= len(available_slots):
                logger.warning(f"❌ No available slots for task: {task.task_name}")
                scheduled_tasks.append(task)
                continue
            
            duration_minutes = self.parse_duration(task.suggested_duration)
            scheduled = False
            
            logger.info(f"🔍 Scheduling '{task.task_name}' ({duration_minutes} min)")
            
            # Try to find a slot that fits the task
            for slot_idx in range(current_slot_idx, len(available_slots)):
                slot_start, slot_end = available_slots[slot_idx]
                
                # Use current_time if we're continuing in the same slot
                if slot_idx == current_slot_idx and current_time and current_time >= slot_start:
                    task_start = current_time
                else:
                    task_start = slot_start
                
                task_end = task_start + timedelta(minutes=duration_minutes)
                
                if task_end <= slot_end:
                    # Task fits in this slot
                    task.scheduled_start = task_start.strftime('%H:%M')
                    task.scheduled_end = task_end.strftime('%H:%M')
                    logger.info(f"✅ Scheduled '{task.task_name}' at {task.scheduled_start}-{task.scheduled_end}")
                    
                    current_time = task_end
                    current_slot_idx = slot_idx
                    scheduled = True
                    break
                else:
                    # Task doesn't fit, try next slot
                    slot_remaining = int((slot_end - task_start).total_seconds() // 60)
                    logger.info(f"   Slot {slot_start.strftime('%H:%M')}-{slot_end.strftime('%H:%M')} has {slot_remaining}min, need {duration_minutes}min")
            
            if not scheduled:
                logger.warning(f"❌ Could not schedule '{task.task_name}' - no slots with enough time")
            
            scheduled_tasks.append(task)
        
        # Re-sort by scheduled time for display
        scheduled_tasks.sort(
            key=lambda t: t.scheduled_start if t.scheduled_start else '99:99'
        )
        
        logger.info("=" * 60)
        return scheduled_tasks
    
    def check_sleep_protection(
        self,
        task_end_datetime: datetime,
        sleep_schedule: SleepSchedule,
        base_date: str,
    ) -> Tuple[bool, Optional[str]]:
        """Check if a task end time violates sleep protection rules"""
        wind_down_deadline = self.calculate_sleep_deadline(sleep_schedule, base_date)
        
        if task_end_datetime >= wind_down_deadline:
            minutes_over = int((task_end_datetime - wind_down_deadline).total_seconds() / 60)
            return False, f"Task ends {minutes_over} minutes into wind-down period"
        
        return True, None
    
    def suggest_break_times(
        self,
        scheduled_tasks: List[PlannedTask],
        break_duration_minutes: int = 10,
        max_continuous_work_minutes: int = 90,
    ) -> List[Tuple[str, str]]:
        """Suggest break times based on scheduled tasks"""
        breaks = []
        continuous_work = 0
        
        for i, task in enumerate(scheduled_tasks):
            if task.scheduled_end is None:
                continue
            
            duration = self.parse_duration(task.suggested_duration)
            continuous_work += duration
            
            if continuous_work >= max_continuous_work_minutes and i < len(scheduled_tasks) - 1:
                break_start = task.scheduled_end
                break_start_dt = datetime.strptime(break_start, '%H:%M')
                break_end_dt = break_start_dt + timedelta(minutes=break_duration_minutes)
                breaks.append((break_start, break_end_dt.strftime('%H:%M')))
                continuous_work = 0
        
        return breaks
    
    def get_scheduling_summary(
        self,
        scheduled_tasks: List[PlannedTask],
        sleep_schedule: SleepSchedule,
        base_date: str,
    ) -> dict:
        """
        Generate a smart summary of the scheduled day.
        Useful for AI to understand what was scheduled.
        """
        if not scheduled_tasks:
            return {"message": "No tasks scheduled"}
        
        scheduled = [t for t in scheduled_tasks if t.scheduled_start]
        unscheduled = [t for t in scheduled_tasks if not t.scheduled_start]
        
        last_task = max(scheduled, key=lambda t: t.scheduled_end) if scheduled else None
        wind_down_deadline = self.calculate_sleep_deadline(sleep_schedule, base_date)
        
        summary = {
            "scheduled_count": len(scheduled),
            "unscheduled_count": len(unscheduled),
            "first_task_start": scheduled[0].scheduled_start if scheduled else None,
            "last_task_end": last_task.scheduled_end if last_task else None,
            "wind_down_starts": wind_down_deadline.strftime('%H:%M'),
            "sleep_time": sleep_schedule.sleep_time,
        }
        
        if last_task and last_task.scheduled_end:
            last_end = datetime.strptime(last_task.scheduled_end, '%H:%M')
            last_end_dt = datetime.combine(datetime.strptime(base_date, '%Y-%m-%d').date(), last_end.time())
            
            # Handle cross-midnight
            if last_end.time() < datetime.strptime(scheduled[0].scheduled_start, '%H:%M').time():
                last_end_dt += timedelta(days=1)
            
            buffer_minutes = (wind_down_deadline - last_end_dt).total_seconds() / 60
            summary["buffer_before_wind_down"] = max(0, int(buffer_minutes))
        
        return summary


# Singleton instance
schedule_service = ScheduleService()
