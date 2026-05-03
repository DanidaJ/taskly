from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime
from enum import Enum


class CognitiveLoad(str, Enum):
    DEEP_FOCUS = "deep_focus"
    LIGHT_FOCUS = "light_focus"
    ADMIN = "admin"
    PHYSICAL = "physical"
    RECOVERY = "recovery"


class TaskFlexibility(str, Enum):
    FIXED = "fixed"
    FLEXIBLE = "flexible"


class Priority(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class TaskStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    SKIPPED = "skipped"
    CANCELLED = "cancelled"
    MISSED = "missed"


class EnergyPreference(str, Enum):
    MORNING = "morning"
    AFTERNOON = "afternoon"
    EVENING = "evening"
    NIGHT = "night"


# Task Models
class TaskBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    type: CognitiveLoad = CognitiveLoad.LIGHT_FOCUS
    estimated_effort: int = Field(default=3, ge=1, le=5)
    flexibility: TaskFlexibility = TaskFlexibility.FLEXIBLE
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    due_date: Optional[str] = None


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[CognitiveLoad] = None
    estimated_effort: Optional[int] = Field(default=None, ge=1, le=5)
    flexibility: Optional[TaskFlexibility] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    due_date: Optional[str] = None


class Task(TaskBase):
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Planned Task Models
class PlannedTaskBase(BaseModel):
    task_id: str
    task_name: str
    suggested_duration: str
    priority: Priority = Priority.MEDIUM
    notes: Optional[str] = None
    scheduled_start: Optional[str] = None
    scheduled_end: Optional[str] = None
    status: TaskStatus = TaskStatus.PENDING
    order: int = 0
    is_break: bool = False  # Auto-generated break tasks
    depends_on: Optional[List[str]] = None  # Task IDs that must complete first


class PlannedTaskCreate(PlannedTaskBase):
    pass


class PlannedTaskUpdate(BaseModel):
    task_name: Optional[str] = None
    suggested_duration: Optional[str] = None
    priority: Optional[Priority] = None
    notes: Optional[str] = None
    scheduled_start: Optional[str] = None
    scheduled_end: Optional[str] = None
    status: Optional[TaskStatus] = None
    actual_start: Optional[str] = None
    actual_end: Optional[str] = None
    order: Optional[int] = None


class PlannedTask(PlannedTaskBase):
    id: str
    actual_start: Optional[str] = None
    actual_end: Optional[str] = None

    class Config:
        from_attributes = True


# Daily Plan Models
class DailyPlanBase(BaseModel):
    date: str
    is_ai_generated: bool = False


class DailyPlanCreate(DailyPlanBase):
    tasks: List[PlannedTaskCreate]


class DailyPlan(DailyPlanBase):
    id: str
    user_id: str
    tasks: List[PlannedTask]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# AI Response Models
class AITaskClassification(BaseModel):
    name: str
    type: str  # Use string to accept AI response, then convert to CognitiveLoad
    estimated_effort: int = Field(ge=1, le=5, default=3)
    flexibility: str  # Use string to accept AI response


class AIPlanItem(BaseModel):
    task_name: str
    suggested_duration: str = "30 minutes"
    priority: str = "medium"  # Use string to accept AI response
    notes: Optional[str] = None
    scheduled_start: Optional[str] = None  # Time when task is scheduled to start (HH:MM)
    scheduled_end: Optional[str] = None  # Time when task is scheduled to end (HH:MM)


class AIPlanResponse(BaseModel):
    tasks: List[AITaskClassification]
    plan: List[AIPlanItem]
    recommendations: List[str]


# Energy Profile Models
class EnergyProfileBase(BaseModel):
    preference: EnergyPreference = EnergyPreference.MORNING
    peak_focus_start: str = "09:00"
    peak_focus_end: str = "12:00"
    fatigue_points: List[str] = ["14:00", "16:00"]


class EnergyProfileCreate(EnergyProfileBase):
    pass


class EnergyProfile(EnergyProfileBase):
    id: str
    user_id: str
    updated_at: datetime

    class Config:
        from_attributes = True


# Sleep Schedule Models
class SleepScheduleBase(BaseModel):
    wake_time: str = "07:00"
    sleep_time: str = "23:00"
    wind_down_minutes: int = Field(default=30, ge=0, le=120)


class SleepScheduleCreate(SleepScheduleBase):
    pass


class SleepSchedule(SleepScheduleBase):
    id: str
    user_id: str
    updated_at: datetime

    class Config:
        from_attributes = True


# User Preferences Models
class UserPreferencesBase(BaseModel):
    manual_scheduling_allowed: bool = True
    task_clustering_enabled: bool = True
    max_daily_workload_hours: int = Field(default=8, ge=1, le=16)
    preferred_task_types: List[CognitiveLoad] = [
        CognitiveLoad.DEEP_FOCUS,
        CognitiveLoad.LIGHT_FOCUS,
        CognitiveLoad.ADMIN
    ]
    notification_enabled: bool = True
    dark_mode: bool = True


class UserPreferencesCreate(UserPreferencesBase):
    pass


class UserPreferences(UserPreferencesBase):
    id: str
    user_id: str
    updated_at: datetime

    class Config:
        from_attributes = True


# Commitment Models
class CommitmentType(str, Enum):
    WORK = "work"
    SCHOOL = "school"
    MEETING = "meeting"
    APPOINTMENT = "appointment"
    OTHER = "other"


class CommitmentBase(BaseModel):
    name: str
    type: CommitmentType = CommitmentType.WORK
    start_time: str
    end_time: str
    days_of_week: Optional[List[int]] = Field(default=[1, 2, 3, 4, 5])  # Mon-Fri, None for one-time
    is_recurring: bool = True
    specific_date: Optional[str] = None  # For one-time events (YYYY-MM-DD)


class CommitmentCreate(CommitmentBase):
    pass


class Commitment(BaseModel):
    id: str
    user_id: str
    name: str
    start_time: str
    end_time: str
    days_of_week: List[int]
    is_recurring: bool = True  # Mapped from is_active in DB
    type: CommitmentType = CommitmentType.WORK  # Not in DB, default value
    created_at: datetime

    class Config:
        from_attributes = True


# Daily Log Models
class DailyReflection(BaseModel):
    what_worked: List[str]
    what_didnt_work: List[str]
    energy_feedback: str
    focus_feedback: str
    suggestions: List[str]


class DailyLogBase(BaseModel):
    date: str
    completed_tasks: List[str]
    skipped_tasks: List[str]
    energy_level: int = Field(ge=1, le=5)
    focus_level: int = Field(ge=1, le=5)
    notes: Optional[str] = None
    reflection: Optional[DailyReflection] = None


class DailyLogCreate(DailyLogBase):
    pass


class DailyLog(DailyLogBase):
    id: str
    user_id: str
    created_at: datetime

    class Config:
        from_attributes = True


# Simplified models for AI context (more flexible, fewer required fields)
class EnergyProfileLite(BaseModel):
    preference: Optional[EnergyPreference] = EnergyPreference.MORNING
    peak_focus_start: str = "09:00"
    peak_focus_end: str = "12:00"
    fatigue_points: Optional[List[str]] = None
    id: Optional[str] = None
    user_id: Optional[str] = None
    updated_at: Optional[str] = None


class SleepScheduleLite(BaseModel):
    wake_time: str = "07:00"
    sleep_time: str = "23:00"
    wind_down_minutes: int = 30
    id: Optional[str] = None
    user_id: Optional[str] = None
    updated_at: Optional[str] = None


class UserPreferencesLite(BaseModel):
    manual_scheduling_allowed: bool = True
    task_clustering_enabled: bool = True
    max_daily_workload_hours: int = 8
    preferred_task_types: Optional[List[str]] = None
    notification_enabled: bool = True
    dark_mode: bool = True
    id: Optional[str] = None
    user_id: Optional[str] = None
    updated_at: Optional[str] = None


class CommitmentLite(BaseModel):
    name: str
    type: Optional[CommitmentType] = CommitmentType.WORK
    start_time: str
    end_time: str
    days_of_week: List[int] = [1, 2, 3, 4, 5]
    is_recurring: bool = True
    id: Optional[str] = None
    user_id: Optional[str] = None
    created_at: Optional[str] = None


class DailyLogLite(BaseModel):
    date: str
    completed_tasks: List[str] = []
    skipped_tasks: List[str] = []
    energy_level: int = 3
    focus_level: int = 3
    notes: Optional[str] = None
    id: Optional[str] = None
    user_id: Optional[str] = None
    created_at: Optional[str] = None


# User Context for AI (using flexible Lite models)
class UserContext(BaseModel):
    commitments: List[CommitmentLite] = []
    energy_profile: EnergyProfileLite
    sleep_schedule: SleepScheduleLite
    preferences: UserPreferencesLite
    recent_logs: List[DailyLogLite] = []
    existing_plans: Optional[List[dict]] = None


# AI Request Models
class AIPlanRequest(BaseModel):
    raw_tasks_input: str = Field(..., min_length=1)
    user_context: UserContext
    target_date: str


class AIPlanUpdateRequest(BaseModel):
    current_plan: AIPlanResponse
    modifications: str
    user_context: UserContext


class AIReflectionRequest(BaseModel):
    completed_tasks: List[str]
    skipped_tasks: List[str]
    energy_level: int = Field(ge=1, le=5)
    focus_level: int = Field(ge=1, le=5)


class AIReflectionResponse(BaseModel):
    prompts: List[str]
    suggestions: List[str]


class AIClassifyRequest(BaseModel):
    task_description: str


# Notification Models
class NotificationType(str, Enum):
    TASK_REMINDER = "task_reminder"
    BREAK_REMINDER = "break_reminder"
    SLEEP_WARNING = "sleep_warning"
    DAILY_SUMMARY = "daily_summary"


class NotificationCreate(BaseModel):
    title: str
    body: str
    type: NotificationType
    scheduled_time: str


class Notification(NotificationCreate):
    id: str
    user_id: str
    is_sent: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================
# Focus Session Models
# ============================================

class FocusSessionCreate(BaseModel):
    task_id: Optional[str] = None
    task_name: Optional[str] = None
    start_time: str
    end_time: Optional[str] = None
    duration: int = Field(ge=0, description="Duration in seconds")
    mode: Literal["focus", "shortBreak", "longBreak"] = "focus"
    completed: bool = False
    session_date: str  # YYYY-MM-DD


class FocusSession(FocusSessionCreate):
    id: str
    user_id: str
    created_at: datetime

    class Config:
        from_attributes = True


class FocusBulkSync(BaseModel):
    """Bulk sync focus sessions for a given date"""
    date: str  # YYYY-MM-DD
    sessions: List[FocusSessionCreate]


# ============================================
# Sleep Entry Models (for tracking, not schedule)
# ============================================

class SleepEntryCreate(BaseModel):
    date: str  # YYYY-MM-DD
    bedtime: str  # HH:MM
    wake_time: str  # HH:MM
    quality: int = Field(ge=1, le=5)
    notes: Optional[str] = None
    duration: int = Field(ge=0, description="Duration in minutes")


class SleepEntryResponse(SleepEntryCreate):
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SleepBulkSync(BaseModel):
    """Bulk sync sleep entries"""
    entries: List[SleepEntryCreate]


# ============================================
# Daily Stats Models
# ============================================

class DailyStatsCreate(BaseModel):
    date: str  # YYYY-MM-DD
    tasks_completed: int = 0
    tasks_missed: int = 0
    tasks_skipped: int = 0
    tasks_total: int = 0
    focus_minutes: int = 0


class DailyStatsResponse(DailyStatsCreate):
    id: str
    user_id: str
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================
# Recurring Task Models
# ============================================

class RecurrenceType(str, Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    WEEKDAYS = "weekdays"
    WEEKENDS = "weekends"
    CUSTOM = "custom"


class RecurringTaskCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    estimated_minutes: int = Field(default=30, ge=5, le=480)
    cognitive_load: str = "light_focus"
    priority: str = "medium"
    flexibility: str = "flexible"
    recurrence_type: RecurrenceType = RecurrenceType.WEEKDAYS
    days_of_week: List[int] = Field(default=[1, 2, 3, 4, 5])
    preferred_time: Optional[str] = None  # HH:MM or None for flexible
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    routine_template_id: Optional[str] = None


class RecurringTaskUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    estimated_minutes: Optional[int] = Field(default=None, ge=5, le=480)
    cognitive_load: Optional[str] = None
    priority: Optional[str] = None
    flexibility: Optional[str] = None
    recurrence_type: Optional[RecurrenceType] = None
    days_of_week: Optional[List[int]] = None
    preferred_time: Optional[str] = None
    is_active: Optional[bool] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class RecurringTaskResponse(RecurringTaskCreate):
    id: str
    user_id: str
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================
# Routine Template Models
# ============================================

class RoutineTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    icon: str = "sun"
    tasks: Optional[List[RecurringTaskCreate]] = None  # Create tasks along with template


class RoutineTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    is_active: Optional[bool] = None


class RoutineTemplateResponse(BaseModel):
    id: str
    user_id: str
    name: str
    description: Optional[str] = None
    icon: str = "sun"
    is_active: bool = True
    tasks: List[RecurringTaskResponse] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================
# Focus Settings (Pomodoro / timer config)
# ============================================

class FocusSettingsBase(BaseModel):
    focus_duration: int = Field(default=25, ge=1, le=240)
    short_break_duration: int = Field(default=5, ge=1, le=60)
    long_break_duration: int = Field(default=15, ge=1, le=120)
    sessions_before_long_break: int = Field(default=4, ge=1, le=20)
    auto_start_breaks: bool = False
    auto_start_focus: bool = False
    sound_enabled: bool = True


class FocusSettingsResponse(FocusSettingsBase):
    user_id: str
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================
# Sleep Goals (tracking targets)
# ============================================

class SleepGoalBase(BaseModel):
    target_bedtime: str = "22:30"          # HH:MM
    target_wake_time: str = "06:30"        # HH:MM
    target_duration_hours: float = Field(default=8.0, ge=4.0, le=12.0)


class SleepGoalResponse(SleepGoalBase):
    user_id: str
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================
# User Patterns (AI-learned defaults)
# ============================================

class UserPatternBase(BaseModel):
    category: str
    key: str
    value: str
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)


class UserPatternUpsert(UserPatternBase):
    """Upsert by (user_id, category, key). Server bumps usage_count and last_used."""
    pass


class UserPatternResponse(UserPatternBase):
    id: str
    user_id: str
    last_used: datetime
    usage_count: int
    created_at: datetime

    class Config:
        from_attributes = True
