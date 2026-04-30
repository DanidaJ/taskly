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
    SleepEntryCreate,
    SleepEntryResponse,
    SleepBulkSync,
    DailyStatsCreate,
    DailyStatsResponse,
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
