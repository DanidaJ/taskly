"""
Task History Service

Tracks and analyzes task completion patterns to improve AI scheduling intelligence.

Features:
- Track actual vs estimated task durations
- Calculate user's duration multiplier
- Identify peak productivity hours
- Analyze task type preferences by time of day
- Generate insights for AI prompts
"""

from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
import structlog
from collections import defaultdict

logger = structlog.get_logger()


class TaskHistoryService:
    """Service for tracking and analyzing task completion history"""
    
    def __init__(self):
        # In-memory storage for now (TODO: move to database)
        self.history: List[Dict] = []
    
    def record_completion(
        self,
        user_id: str,
        task_name: str,
        cognitive_type: str,
        estimated_duration_minutes: int,
        actual_duration_minutes: int,
        scheduled_start: Optional[str] = None,
        actual_start: Optional[str] = None,
        actual_end: Optional[str] = None,
        completed: bool = True,
        energy_level: Optional[int] = None,
        scheduled_date: Optional[str] = None
    ):
        """Record a task completion event"""
        
        entry = {
            "id": f"history-{len(self.history)}",
            "user_id": user_id,
            "task_name": task_name,
            "cognitive_type": cognitive_type,
            "estimated_duration_minutes": estimated_duration_minutes,
            "actual_duration_minutes": actual_duration_minutes,
            "scheduled_start": scheduled_start,
            "actual_start": actual_start,
            "actual_end": actual_end,
            "completed": completed,
            "energy_level": energy_level,
            "scheduled_date": scheduled_date or datetime.now().strftime("%Y-%m-%d"),
            "created_at": datetime.now().isoformat()
        }
        
        self.history.append(entry)
        
        logger.info("Task completion recorded",
                   user_id=user_id,
                   task_name=task_name,
                   estimated=estimated_duration_minutes,
                   actual=actual_duration_minutes,
                   multiplier=round(actual_duration_minutes / estimated_duration_minutes, 2) if estimated_duration_minutes > 0 else None)
        
        return entry
    
    def get_duration_multiplier(self, user_id: str, days: int = 30) -> float:
        """
        Calculate user's typical duration multiplier.
        
        Returns average ratio of actual/estimated duration.
        Example: 1.5 means tasks typically take 50% longer than estimated
        """
        cutoff_date = datetime.now() - timedelta(days=days)
        
        recent_tasks = [
            h for h in self.history
            if h["user_id"] == user_id
            and h["completed"]
            and h["estimated_duration_minutes"] > 0
            and datetime.fromisoformat(h["created_at"]) >= cutoff_date
        ]
        
        if not recent_tasks:
            logger.info("No task history found, using default multiplier",
                       user_id=user_id)
            return 1.0  # Default: tasks take as long as estimated
        
        multipliers = [
            h["actual_duration_minutes"] / h["estimated_duration_minutes"]
            for h in recent_tasks
        ]
        
        avg_multiplier = sum(multipliers) / len(multipliers)
        
        logger.info("Duration multiplier calculated",
                   user_id=user_id,
                   task_count=len(recent_tasks),
                   multiplier=round(avg_multiplier, 2))
        
        return round(avg_multiplier, 2)
    
    def get_peak_productivity_hours(self, user_id: str, days: int = 30) -> List[Tuple[str, str]]:
        """
        Identify hours when user is most productive.
        
        Returns list of (start_hour, end_hour) tuples.
        """
        cutoff_date = datetime.now() - timedelta(days=days)
        
        recent_tasks = [
            h for h in self.history
            if h["user_id"] == user_id
            and h["completed"]
            and h["actual_start"]
            and datetime.fromisoformat(h["created_at"]) >= cutoff_date
        ]
        
        if not recent_tasks:
            return [("09:00", "12:00")]  # Default morning peak
        
        # Group completions by hour
        hour_counts = defaultdict(int)
        for task in recent_tasks:
            try:
                start_hour = task["actual_start"].split(":")[0]
                hour_counts[int(start_hour)] += 1
            except (ValueError, IndexError):
                continue
        
        if not hour_counts:
            return [("09:00", "12:00")]
        
        # Find top 3 hours
        top_hours = sorted(hour_counts.items(), key=lambda x: x[1], reverse=True)[:3]
        
        # Group consecutive hours
        peak_periods = []
        if top_hours:
            main_hour = top_hours[0][0]
            peak_periods.append((f"{main_hour:02d}:00", f"{(main_hour + 3) % 24:02d}:00"))
        
        logger.info("Peak productivity hours identified",
                   user_id=user_id,
                   periods=peak_periods)
        
        return peak_periods
    
    def get_preferred_task_types_by_time(
        self,
        user_id: str,
        time_slot: str,  # "morning", "afternoon", "evening", "night"
        days: int = 30
    ) -> List[str]:
        """
        Get task types user typically completes during specific time slot.
        """
        cutoff_date = datetime.now() - timedelta(days=days)
        
        # Define time ranges
        time_ranges = {
            "morning": (6, 12),
            "afternoon": (12, 17),
            "evening": (17, 22),
            "night": (22, 6)
        }
        
        start_hour, end_hour = time_ranges.get(time_slot, (9, 17))
        
        recent_tasks = [
            h for h in self.history
            if h["user_id"] == user_id
            and h["completed"]
            and h["actual_start"]
            and datetime.fromisoformat(h["created_at"]) >= cutoff_date
        ]
        
        # Filter by time slot
        slot_tasks = []
        for task in recent_tasks:
            try:
                hour = int(task["actual_start"].split(":")[0])
                if start_hour < end_hour:
                    if start_hour <= hour < end_hour:
                        slot_tasks.append(task)
                else:  # Night crosses midnight
                    if hour >= start_hour or hour < end_hour:
                        slot_tasks.append(task)
            except (ValueError, IndexError):
                continue
        
        if not slot_tasks:
            return ["light_focus"]  # Default
        
        # Count cognitive types
        type_counts = defaultdict(int)
        for task in slot_tasks:
            type_counts[task["cognitive_type"]] += 1
        
        # Return top types
        top_types = sorted(type_counts.items(), key=lambda x: x[1], reverse=True)
        result = [t[0] for t in top_types[:3]]
        
        logger.info("Task type preferences identified",
                   user_id=user_id,
                   time_slot=time_slot,
                   types=result)
        
        return result
    
    def get_user_insights(self, user_id: str) -> Dict:
        """
        Generate comprehensive insights for AI prompts.
        
        Returns dict with:
        - duration_multiplier: float
        - peak_hours: List[str]
        - best_focus_times: List[str]
        - preferred_exercise_time: str
        - completion_rate: float
        """
        multiplier = self.get_duration_multiplier(user_id)
        peak_periods = self.get_peak_productivity_hours(user_id)
        
        # Format peak hours for display
        peak_hours = [f"{start}-{end}" for start, end in peak_periods]
        
        # Get best times for deep focus
        morning_types = self.get_preferred_task_types_by_time(user_id, "morning")
        evening_types = self.get_preferred_task_types_by_time(user_id, "evening")
        
        best_focus_times = []
        if "deep_focus" in morning_types:
            best_focus_times.append("morning (9-12)")
        if "deep_focus" in evening_types:
            best_focus_times.append("evening (18-22)")
        
        if not best_focus_times:
            best_focus_times = ["evening (18-22)"]  # Default
        
        # Find preferred exercise time
        exercise_time = "morning"  # Default
        for slot in ["morning", "afternoon", "evening"]:
            types = self.get_preferred_task_types_by_time(user_id, slot)
            if "physical" in types:
                exercise_time = slot
                break
        
        # Calculate completion rate
        recent_tasks = [
            h for h in self.history
            if h["user_id"] == user_id
            and datetime.fromisoformat(h["created_at"]) >= datetime.now() - timedelta(days=30)
        ]
        
        completed = len([t for t in recent_tasks if t["completed"]])
        total = len(recent_tasks)
        completion_rate = (completed / total * 100) if total > 0 else 0
        
        insights = {
            "duration_multiplier": multiplier,
            "peak_hours": peak_hours,
            "best_focus_times": best_focus_times,
            "preferred_exercise_time": exercise_time,
            "completion_rate": round(completion_rate, 1),
            "total_tasks_tracked": len(recent_tasks)
        }
        
        logger.info("User insights generated",
                   user_id=user_id,
                   insights=insights)
        
        return insights


# Global instance
task_history_service = TaskHistoryService()
