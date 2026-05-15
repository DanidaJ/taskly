"""
Data sync routes for focus sessions, sleep entries, and daily stats.
These endpoints enable cross-device data persistence that was previously
localStorage-only.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime
import uuid

from app.core.security import get_current_user
from app.core.database import db
from app.models import (
    FocusSessionCreate,
    FocusSession,
    FocusBulkSync,
    ActiveFocusTimerUpsert,
    ActiveFocusTimerResponse,
    SleepEntryCreate,
    SleepEntryResponse,
    SleepBulkSync,
    DailyStatsCreate,
    DailyStatsResponse,
    FocusSettingsBase,
    FocusSettingsResponse,
    SleepGoalBase,
    SleepGoalResponse,
    UserPatternUpsert,
    UserPatternResponse,
)

router = APIRouter(prefix="/data", tags=["Data Sync"])


# ============================================
# Focus Sessions
# ============================================

@router.get("/focus-sessions/{date}", response_model=list[FocusSession])
async def get_focus_sessions(
    date: str,
    current_user: dict = Depends(get_current_user),
):
    """Get all focus sessions for a specific date (YYYY-MM-DD)"""
    if db is None:
        return []
    return await db.get_focus_sessions(current_user["user_id"], date)


@router.get("/focus-sessions/range/{start_date}/{end_date}", response_model=list[FocusSession])
async def get_focus_sessions_range(
    start_date: str,
    end_date: str,
    current_user: dict = Depends(get_current_user),
):
    """Get focus sessions for a date range"""
    if db is None:
        return []
    return await db.get_focus_sessions_range(current_user["user_id"], start_date, end_date)


@router.post("/focus-sessions", response_model=FocusSession)
async def save_focus_session(
    session: FocusSessionCreate,
    current_user: dict = Depends(get_current_user),
):
    """Save a single focus session"""
    session_data = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["user_id"],
        **session.model_dump(),
        "created_at": datetime.utcnow().isoformat(),
    }

    if db is None:
        return FocusSession(
            id=session_data["id"],
            user_id=current_user["user_id"],
            created_at=datetime.utcnow(),
            **session.model_dump(),
        )

    result = await db.save_focus_session(session_data)
    return result


@router.post("/focus-sessions/sync")
async def sync_focus_sessions(
    bulk: FocusBulkSync,
    current_user: dict = Depends(get_current_user),
):
    """Bulk sync: replace all sessions for a date with provided list"""
    if db is None:
        return {"synced": len(bulk.sessions)}

    # Delete existing sessions for this date
    await db.delete_focus_sessions_for_date(current_user["user_id"], bulk.date)

    # Insert new sessions
    if bulk.sessions:
        sessions_data = []
        for s in bulk.sessions:
            sessions_data.append({
                "id": str(uuid.uuid4()),
                "user_id": current_user["user_id"],
                **s.model_dump(),
                "created_at": datetime.utcnow().isoformat(),
            })
        await db.bulk_save_focus_sessions(sessions_data)

    return {"synced": len(bulk.sessions)}


@router.get("/active-focus-timer", response_model=ActiveFocusTimerResponse | None)
async def get_active_focus_timer(
    current_user: dict = Depends(get_current_user),
):
    """Get the current active/paused focus timer snapshot for this user."""
    if db is None:
        return None
    return await db.get_active_focus_timer(current_user["user_id"])


@router.put("/active-focus-timer", response_model=ActiveFocusTimerResponse)
async def save_active_focus_timer(
    payload: ActiveFocusTimerUpsert,
    current_user: dict = Depends(get_current_user),
):
    """Upsert active focus timer snapshot for this user."""
    timer_data = {
        "user_id": current_user["user_id"],
        **payload.model_dump(),
    }

    if db is None:
        now = datetime.utcnow()
        return ActiveFocusTimerResponse(
            id=str(uuid.uuid4()),
            user_id=current_user["user_id"],
            created_at=now,
            updated_at=now,
            **payload.model_dump(),
        )

    saved = await db.save_active_focus_timer(timer_data)
    if saved:
        return saved

    now = datetime.utcnow()
    return ActiveFocusTimerResponse(
        id=str(uuid.uuid4()),
        user_id=current_user["user_id"],
        created_at=now,
        updated_at=now,
        **payload.model_dump(),
    )


@router.delete("/active-focus-timer")
async def clear_active_focus_timer(
    current_user: dict = Depends(get_current_user),
):
    """Clear active focus timer snapshot for this user."""
    if db is not None:
        await db.clear_active_focus_timer(current_user["user_id"])
    return {"message": "Active timer cleared"}


# ============================================
# Sleep Entries
# ============================================

@router.get("/sleep-entries", response_model=list[SleepEntryResponse])
async def get_sleep_entries(
    limit: int = 90,
    current_user: dict = Depends(get_current_user),
):
    """Get all sleep entries (most recent first)"""
    if db is None:
        return []
    return await db.get_sleep_entries(current_user["user_id"], limit)


@router.get("/sleep-entries/range/{start_date}/{end_date}", response_model=list[SleepEntryResponse])
async def get_sleep_entries_range(
    start_date: str,
    end_date: str,
    current_user: dict = Depends(get_current_user),
):
    """Get sleep entries for a date range"""
    if db is None:
        return []
    return await db.get_sleep_entries_range(current_user["user_id"], start_date, end_date)


@router.post("/sleep-entries", response_model=SleepEntryResponse)
async def save_sleep_entry(
    entry: SleepEntryCreate,
    current_user: dict = Depends(get_current_user),
):
    """Save/update a sleep entry (upserts on user_id + date)"""
    now_iso = datetime.utcnow().isoformat()
    entry_data = {
        "user_id": current_user["user_id"],
        **entry.model_dump(),
        "updated_at": now_iso,
    }

    if db is None:
        return SleepEntryResponse(
            id=str(uuid.uuid4()),
            user_id=current_user["user_id"],
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            **entry.model_dump(),
        )

    result = await db.save_sleep_entry(entry_data)
    return result


@router.post("/sleep-entries/sync")
async def sync_sleep_entries(
    bulk: SleepBulkSync,
    current_user: dict = Depends(get_current_user),
):
    """Bulk sync: upsert multiple sleep entries"""
    if db is None:
        return {"synced": len(bulk.entries)}

    synced = 0
    for entry in bulk.entries:
        now_iso = datetime.utcnow().isoformat()
        entry_data = {
            "user_id": current_user["user_id"],
            **entry.model_dump(),
            "updated_at": now_iso,
        }
        await db.save_sleep_entry(entry_data)
        synced += 1

    return {"synced": synced}


@router.delete("/sleep-entries/{entry_id}")
async def delete_sleep_entry(
    entry_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a sleep entry"""
    if db is not None:
        await db.delete_sleep_entry(entry_id)
    return {"message": "Sleep entry deleted"}


# ============================================
# Daily Stats
# ============================================

@router.get("/stats/{date}", response_model=DailyStatsResponse)
async def get_daily_stats(
    date: str,
    current_user: dict = Depends(get_current_user),
):
    """Get daily stats for a specific date"""
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stats not found",
        )
    result = await db.get_daily_stats(current_user["user_id"], date)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stats not found for this date",
        )
    return result


@router.get("/stats/range/{start_date}/{end_date}", response_model=list[DailyStatsResponse])
async def get_daily_stats_range(
    start_date: str,
    end_date: str,
    current_user: dict = Depends(get_current_user),
):
    """Get daily stats for a date range"""
    if db is None:
        return []
    return await db.get_daily_stats_range(current_user["user_id"], start_date, end_date)


@router.post("/stats", response_model=DailyStatsResponse)
async def save_daily_stats(
    stats: DailyStatsCreate,
    current_user: dict = Depends(get_current_user),
):
    """Save/update daily stats (upserts on user_id + date)"""
    now_iso = datetime.utcnow().isoformat()
    stats_data = {
        "user_id": current_user["user_id"],
        **stats.model_dump(),
        "updated_at": now_iso,
    }

    if db is None:
        return DailyStatsResponse(
            id=str(uuid.uuid4()),
            user_id=current_user["user_id"],
            updated_at=datetime.utcnow(),
            **stats.model_dump(),
        )

    result = await db.save_daily_stats(stats_data)
    return result


# ============================================
# Focus Settings (Pomodoro / timer config)
# ============================================

@router.get("/focus-settings", response_model=FocusSettingsResponse)
async def get_focus_settings(
    current_user: dict = Depends(get_current_user),
):
    """Get the user's focus timer settings. Returns defaults if not set."""
    user_id = current_user["user_id"]
    if db is None:
        return FocusSettingsResponse(user_id=user_id, **FocusSettingsBase().model_dump())
    row = await db.get_focus_settings(user_id)
    if not row:
        return FocusSettingsResponse(user_id=user_id, **FocusSettingsBase().model_dump())
    return FocusSettingsResponse(**row)


@router.put("/focus-settings", response_model=FocusSettingsResponse)
async def save_focus_settings(
    payload: FocusSettingsBase,
    current_user: dict = Depends(get_current_user),
):
    """Save/update the user's focus timer settings."""
    user_id = current_user["user_id"]
    if db is None:
        return FocusSettingsResponse(user_id=user_id, **payload.model_dump())
    saved = await db.save_focus_settings({"user_id": user_id, **payload.model_dump()})
    return FocusSettingsResponse(**(saved or {"user_id": user_id, **payload.model_dump()}))


# ============================================
# Sleep Goals (tracking targets)
# ============================================

@router.get("/sleep-goal", response_model=SleepGoalResponse)
async def get_sleep_goal(
    current_user: dict = Depends(get_current_user),
):
    """Get the user's sleep tracking goals. Returns defaults if not set."""
    user_id = current_user["user_id"]
    if db is None:
        return SleepGoalResponse(user_id=user_id, **SleepGoalBase().model_dump())
    row = await db.get_sleep_goal(user_id)
    if not row:
        return SleepGoalResponse(user_id=user_id, **SleepGoalBase().model_dump())
    return SleepGoalResponse(**row)


@router.put("/sleep-goal", response_model=SleepGoalResponse)
async def save_sleep_goal(
    payload: SleepGoalBase,
    current_user: dict = Depends(get_current_user),
):
    """Save/update the user's sleep tracking goals."""
    user_id = current_user["user_id"]
    if db is None:
        return SleepGoalResponse(user_id=user_id, **payload.model_dump())
    saved = await db.save_sleep_goal({"user_id": user_id, **payload.model_dump()})
    return SleepGoalResponse(**(saved or {"user_id": user_id, **payload.model_dump()}))


# ============================================
# User Patterns (AI learnings)
# ============================================

@router.get("/user-patterns", response_model=list[UserPatternResponse])
async def list_user_patterns(
    current_user: dict = Depends(get_current_user),
):
    """List all learned patterns for the current user."""
    if db is None:
        return []
    return await db.get_user_patterns(current_user["user_id"])


@router.post("/user-patterns", response_model=UserPatternResponse)
async def upsert_user_pattern(
    payload: UserPatternUpsert,
    current_user: dict = Depends(get_current_user),
):
    """Upsert a learned pattern. Bumps usage_count + last_used on conflict."""
    if db is None:
        raise HTTPException(status_code=503, detail="Database not configured")
    saved = await db.upsert_user_pattern(
        user_id=current_user["user_id"],
        category=payload.category,
        key=payload.key,
        value=payload.value,
        confidence=payload.confidence,
    )
    if not saved:
        raise HTTPException(status_code=500, detail="Failed to save pattern")
    return saved


@router.delete("/user-patterns/{pattern_id}")
async def delete_user_pattern(
    pattern_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a single learned pattern."""
    if db is not None:
        await db.delete_user_pattern(current_user["user_id"], pattern_id)
    return {"message": "Pattern deleted"}


@router.delete("/user-patterns")
async def clear_user_patterns(
    current_user: dict = Depends(get_current_user),
):
    """Delete all learned patterns for the current user."""
    if db is not None:
        await db.clear_user_patterns(current_user["user_id"])
    return {"message": "All patterns cleared"}
