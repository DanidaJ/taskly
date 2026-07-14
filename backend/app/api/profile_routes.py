from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid
import pytz

from app.core.security import validate_supabase_token
from app.core.database import db
from app.models import (
    EnergyProfileCreate,
    EnergyProfile,
    SleepScheduleCreate,
    SleepSchedule,
    UserPreferencesCreate,
    UserPreferences,
    CommitmentCreate,
    Commitment,
    DailyLogCreate,
    DailyLog,
)

router = APIRouter(prefix="/profile", tags=["User Profile"])


# Energy Profile
@router.get("/energy", response_model=EnergyProfile)
async def get_energy_profile(
    current_user: dict = Depends(validate_supabase_token),
):
    """Get the user's energy profile"""
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Energy profile not found",
        )
    
    profile = await db.get_energy_profile(current_user["user_id"])
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Energy profile not found",
        )
    return profile


@router.post("/energy", response_model=EnergyProfile)
async def save_energy_profile(
    profile: EnergyProfileCreate,
    current_user: dict = Depends(validate_supabase_token),
):
    """Save/update the user's energy profile"""
    if db is None:
        return EnergyProfile(
            id=str(uuid.uuid4()),
            user_id=current_user["user_id"],
            updated_at=datetime.utcnow(),
            **profile.model_dump(),
        )
    
    # Check if profile already exists
    existing = await db.get_energy_profile(current_user["user_id"])
    
    profile_data = {
        "id": existing["id"] if existing else str(uuid.uuid4()),
        "user_id": current_user["user_id"],
        **profile.model_dump(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    return await db.save_energy_profile(profile_data)


# Sleep Schedule
@router.get("/sleep", response_model=SleepSchedule)
async def get_sleep_schedule(
    current_user: dict = Depends(validate_supabase_token),
):
    """Get the user's sleep schedule"""
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sleep schedule not found",
        )
    
    schedule = await db.get_sleep_schedule(current_user["user_id"])
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sleep schedule not found",
        )
    return schedule


@router.post("/sleep", response_model=SleepSchedule)
async def save_sleep_schedule(
    schedule: SleepScheduleCreate,
    current_user: dict = Depends(validate_supabase_token),
):
    """Save/update the user's sleep schedule"""
    if db is None:
        return SleepSchedule(
            id=str(uuid.uuid4()),
            user_id=current_user["user_id"],
            updated_at=datetime.utcnow(),
            **schedule.model_dump(),
        )
    
    # Check if schedule already exists
    existing = await db.get_sleep_schedule(current_user["user_id"])
    
    schedule_data = {
        "id": existing["id"] if existing else str(uuid.uuid4()),
        "user_id": current_user["user_id"],
        **schedule.model_dump(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    return await db.save_sleep_schedule(schedule_data)


# User Preferences
@router.get("/preferences", response_model=UserPreferences)
async def get_user_preferences(
    current_user: dict = Depends(validate_supabase_token),
):
    """Get the user's preferences"""
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User preferences not found",
        )
    
    prefs = await db.get_user_preferences(current_user["user_id"])
    if not prefs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User preferences not found",
        )
    return prefs


@router.post("/preferences", response_model=UserPreferences)
async def save_user_preferences(
    preferences: UserPreferencesCreate,
    current_user: dict = Depends(validate_supabase_token),
):
    """Save/update the user's preferences"""
    if db is None:
        return UserPreferences(
            id=str(uuid.uuid4()),
            user_id=current_user["user_id"],
            updated_at=datetime.utcnow(),
            **preferences.model_dump(),
        )
    
    # Reuse the existing row's id so the upsert updates in place instead of
    # minting a new UUID each save (matches energy/sleep handlers above).
    existing = await db.get_user_preferences(current_user["user_id"])

    prefs_data = {
        "id": existing["id"] if existing else str(uuid.uuid4()),
        "user_id": current_user["user_id"],
        **preferences.model_dump(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    return await db.save_user_preferences(prefs_data)


# Onboarding status (first-run setup wizard)
@router.get("/onboarding")
async def get_onboarding_status(
    current_user: dict = Depends(validate_supabase_token),
):
    """Whether the user has completed the first-run setup wizard."""
    if db is None:
        return {"has_onboarded": False}

    status_row = await db.get_onboarding_status(current_user["user_id"])
    return {"has_onboarded": bool(status_row and status_row.get("has_onboarded"))}


class OnboardingCompleteRequest(BaseModel):
    # The browser's IANA timezone, captured once here so time-of-day logic
    # (missed-detection, reminders, rescheduling) resolves in the user's zone
    # instead of silently defaulting to UTC.
    timezone: Optional[str] = None


@router.post("/onboarding")
async def complete_onboarding(
    payload: Optional[OnboardingCompleteRequest] = None,
    current_user: dict = Depends(validate_supabase_token),
):
    """Mark the first-run setup wizard as completed (or dismissed)."""
    if db is None:
        return {"has_onboarded": True}

    # Persist the timezone if we got a valid one and the user has none yet.
    # Best-effort: onboarding completion must still succeed if this fails.
    tz = ((payload.timezone if payload else None) or "").strip()
    if tz:
        try:
            pytz.timezone(tz)
        except Exception:
            tz = ""
    if tz:
        try:
            await db.ensure_notification_timezone(current_user["user_id"], tz)
        except Exception:
            pass

    status_row = await db.set_onboarding_status(current_user["user_id"], True)
    return {"has_onboarded": bool(status_row and status_row.get("has_onboarded"))}


# Commitments
@router.get("/commitments", response_model=list[Commitment])
async def get_commitments(
    current_user: dict = Depends(validate_supabase_token),
):
    """Get all user commitments"""
    if db is None:
        return []
    
    return await db.get_commitments(current_user["user_id"])


@router.post("/commitments", response_model=Commitment)
async def create_commitment(
    commitment: CommitmentCreate,
    current_user: dict = Depends(validate_supabase_token),
):
    """Create a new commitment"""
    if db is None:
        return Commitment(
            id=str(uuid.uuid4()),
            user_id=current_user["user_id"],
            created_at=datetime.utcnow(),
            **commitment.model_dump(),
        )
    
    # Map API fields to database fields
    type_value = commitment.type.value if hasattr(commitment.type, "value") else str(commitment.type)
    commitment_data = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["user_id"],
        "name": commitment.name,
        "type": type_value,
        "start_time": commitment.start_time,
        "end_time": commitment.end_time,
        "days_of_week": commitment.days_of_week,
        "recurrence": "weekly",  # Map is_recurring to recurrence type
        "is_active": True,
        "created_at": datetime.utcnow().isoformat(),
    }
    return await db.create_commitment(commitment_data)


@router.delete("/commitments/{commitment_id}")
async def delete_commitment(
    commitment_id: str,
    current_user: dict = Depends(validate_supabase_token),
):
    """Delete a commitment"""
    if db is not None:
        await db.delete_commitment(commitment_id)
    return {"message": "Commitment deleted"}


# Daily Logs
@router.get("/logs", response_model=list[DailyLog])
async def get_daily_logs(
    limit: int = 14,
    current_user: dict = Depends(validate_supabase_token),
):
    """Get recent daily logs"""
    if db is None:
        return []
    
    return await db.get_daily_logs(current_user["user_id"], limit)


@router.post("/logs", response_model=DailyLog)
async def save_daily_log(
    log: DailyLogCreate,
    current_user: dict = Depends(validate_supabase_token),
):
    """Save a daily log"""
    if db is None:
        return DailyLog(
            id=str(uuid.uuid4()),
            user_id=current_user["user_id"],
            created_at=datetime.utcnow(),
            **log.model_dump(),
        )
    
    log_data = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["user_id"],
        **log.model_dump(),
        "created_at": datetime.utcnow().isoformat(),
    }
    return await db.save_daily_log(log_data)
