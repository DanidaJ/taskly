from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime
import uuid

from app.core.security import get_current_user
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
    current_user: dict = Depends(get_current_user),
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
    current_user: dict = Depends(get_current_user),
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
    current_user: dict = Depends(get_current_user),
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
    current_user: dict = Depends(get_current_user),
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
    current_user: dict = Depends(get_current_user),
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
    current_user: dict = Depends(get_current_user),
):
    """Save/update the user's preferences"""
    if db is None:
        return UserPreferences(
            id=str(uuid.uuid4()),
            user_id=current_user["user_id"],
            updated_at=datetime.utcnow(),
            **preferences.model_dump(),
        )
    
    prefs_data = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["user_id"],
        **preferences.model_dump(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    return await db.save_user_preferences(prefs_data)


# Commitments
@router.get("/commitments", response_model=list[Commitment])
async def get_commitments(
    current_user: dict = Depends(get_current_user),
):
    """Get all user commitments"""
    if db is None:
        return []
    
    return await db.get_commitments(current_user["user_id"])


@router.post("/commitments", response_model=Commitment)
async def create_commitment(
    commitment: CommitmentCreate,
    current_user: dict = Depends(get_current_user),
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
    commitment_data = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["user_id"],
        "name": commitment.name,
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
    current_user: dict = Depends(get_current_user),
):
    """Delete a commitment"""
    if db is not None:
        await db.delete_commitment(commitment_id)
    return {"message": "Commitment deleted"}


# Daily Logs
@router.get("/logs", response_model=list[DailyLog])
async def get_daily_logs(
    limit: int = 14,
    current_user: dict = Depends(get_current_user),
):
    """Get recent daily logs"""
    if db is None:
        return []
    
    return await db.get_daily_logs(current_user["user_id"], limit)


@router.post("/logs", response_model=DailyLog)
async def save_daily_log(
    log: DailyLogCreate,
    current_user: dict = Depends(get_current_user),
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
