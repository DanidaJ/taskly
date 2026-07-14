from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from datetime import datetime, date as date_type
import uuid
import structlog
import pytz

from app.core.security import validate_supabase_token
from app.core.database import db
from app.core.timeutils import user_now, resolve_task_window
from app.services import schedule_service
from app.models import (
    DailyPlanCreate,
    DailyPlan,
    PlannedTaskUpdate,
    PlannedTask,
    EnergyProfile,
    SleepSchedule,
    Commitment,
)

router = APIRouter(prefix="/plans", tags=["Plans"])

logger = structlog.get_logger()


# Mapping between API values and DB enum values
def api_status_to_db(api_status: str) -> str:
    """Convert API status to DB status"""
    mapping = {
        "pending": "not_started",
        "in_progress": "in_progress",
        "completed": "completed",
        "skipped": "skipped",
        "cancelled": "postponed",
        "missed": "missed",
    }
    return mapping.get(api_status, "not_started")


def db_status_to_api(db_status: str) -> str:
    """Convert DB status to API status"""
    mapping = {
        "not_started": "pending",
        "in_progress": "in_progress",
        "completed": "completed",
        "skipped": "skipped",
        "postponed": "cancelled",
        "missed": "missed",
    }
    return mapping.get(db_status, "pending")


def parse_duration_to_minutes(duration: str | None) -> int:
    """Parse a human duration like '1 hour 30 minutes' into minutes."""
    if not duration:
        return 30
    dur = duration.lower()
    import re as _re
    hours_match = _re.search(r'(\d+(?:\.\d+)?)\s*(?:hour|hr|h)', dur)
    mins_match = _re.search(r'(\d+)\s*(?:minute|min|m)', dur)
    parsed_minutes = 0
    if hours_match:
        parsed_minutes += int(float(hours_match.group(1)) * 60)
    if mins_match:
        parsed_minutes += int(mins_match.group(1))
    return parsed_minutes if parsed_minutes > 0 else 30


async def log_task_history_entry(entry: dict):
    """Best-effort audit log write. Does not block core operations."""
    if db is None:
        return
    try:
        await db.save_task_status_history(entry)
    except Exception as e:
        logger.warning("task_history_write_failed", error=str(e))


async def get_user_timezone(user_id: str) -> str:
    """Resolve the user's IANA timezone for time-of-day comparisons.

    Prefers the profile preference, falls back to the notification preference,
    then UTC. Returns a string suitable for ``pytz.timezone``.
    """
    if db is None:
        return "UTC"
    for getter in (db.get_user_preferences, db.get_notification_preferences):
        try:
            row = await getter(user_id)
        except Exception:
            continue
        tz = (row or {}).get("timezone")
        if tz:
            return tz
    return "UTC"


def is_task_missed(task_data: dict, plan_date: str, user_tz: str = "UTC") -> bool:
    """Check if a task's scheduled time has passed without completion.

    Compares "now" and the task's scheduled end *in the user's timezone*, so a
    plan-local end time like 18:00 is judged against the user's local clock
    rather than the server's (UTC). Returns True if it should be marked missed.
    """
    from datetime import timedelta
    status = task_data.get('status', 'not_started')
    if status in ('completed', 'in_progress', 'skipped', 'postponed'):
        return False
    try:
        # Resolve the task window in the user's timezone, with cross-midnight
        # (23:00–01:00) end-rollover handled centrally. See app.core.timeutils.
        start_dt, end_dt = resolve_task_window(
            plan_date,
            task_data.get('scheduled_start'),
            task_data.get('scheduled_end'),
            user_tz,
        )
        if end_dt is None:
            return False
        now = user_now(user_tz)
        # A task whose start window hasn't opened yet can't be missed (guards
        # late-night tasks like a 23:00 start being flagged earlier the same day).
        if start_dt and start_dt > now:
            return False
        return now > (end_dt + timedelta(minutes=15))
    except Exception:
        return False


def api_priority_to_db(api_priority: str) -> str:
    """Convert API priority to DB priority"""
    mapping = {
        "high": "must_do",
        "medium": "should_do",
        "low": "nice_to_have",
    }
    return mapping.get(api_priority, "should_do")


def db_priority_to_api(db_priority: str) -> str:
    """Convert DB priority to API priority"""
    mapping = {
        "must_do": "high",
        "should_do": "medium",
        "nice_to_have": "low",
    }
    return mapping.get(db_priority, "medium")


def normalize_time_format(time_value) -> str | None:
    """
    Normalize time format from database to HH:MM string.
    
    Supabase returns TIME type in various formats:
    - String: "07:00:00" or "23:00"
    - datetime.time object
    - timedelta object
    - None
    
    This ensures frontend always receives "HH:MM" format.
    """
    if time_value is None:
        return None
    
    # Already a string
    if isinstance(time_value, str):
        # Remove seconds if present: "07:00:00" -> "07:00"
        parts = time_value.split(":")
        if len(parts) >= 2:
            return f"{parts[0].zfill(2)}:{parts[1].zfill(2)}"
        return time_value
    
    # datetime.time object
    if hasattr(time_value, 'hour') and hasattr(time_value, 'minute'):
        return f"{time_value.hour:02d}:{time_value.minute:02d}"
    
    # timedelta object (rare but possible)
    if hasattr(time_value, 'total_seconds'):
        total_seconds = int(time_value.total_seconds())
        hours = (total_seconds // 3600) % 24
        minutes = (total_seconds % 3600) // 60
        return f"{hours:02d}:{minutes:02d}"
    
    # Fallback: try string conversion
    return str(time_value)


@router.get("/{date}", response_model=DailyPlan)
async def get_daily_plan(
    date: str,
    current_user: dict = Depends(validate_supabase_token),
):
    """Get the daily plan for a specific date"""
    if db is None:
        # Return empty plan when no database is configured
        now = datetime.utcnow()
        return DailyPlan(
            id=str(uuid.uuid4()),
            user_id=current_user["user_id"],
            date=date,
            is_ai_generated=False,
            tasks=[],
            created_at=now,
            updated_at=now,
        )
    
    try:
        plan = await db.get_daily_plan(current_user["user_id"], date)
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No plan found for this date",
            )
        
        # Transform planned_tasks from DB format to API format
        user_tz = await get_user_timezone(current_user["user_id"])
        db_tasks = plan.get("planned_tasks", [])
        tasks = []
        for t in db_tasks:
            # Auto-detect missed tasks based on schedule time
            api_status = db_status_to_api(t.get("status", "not_started"))
            if api_status == "pending" and is_task_missed(t, date, user_tz):
                api_status = "missed"
            tasks.append(PlannedTask(
                id=t["id"],
                task_id=t.get("task_id") or "",  # Return empty string if NULL, not the task id
                task_name=t.get("name", "Untitled Task"),
                suggested_duration=f"{t.get('estimated_minutes', 30)} minutes",
                priority=db_priority_to_api(t.get("priority", "should_do")),
                notes=t.get("rationale"),
                scheduled_start=normalize_time_format(t.get("scheduled_start")),
                scheduled_end=normalize_time_format(t.get("scheduled_end")),
                status=api_status,
                order=t.get("sort_order", 0),
                actual_start=str(t["actual_start"]) if t.get("actual_start") else None,
                actual_end=str(t["actual_end"]) if t.get("actual_end") else None,
            ))
        
        return DailyPlan(
            id=plan["id"],
            user_id=plan["user_id"],
            date=plan["date"],
            is_ai_generated=plan.get("is_ai_generated", False),
            tasks=tasks,
            created_at=plan.get("created_at"),
            updated_at=plan.get("updated_at"),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch plan: {str(e)}",
        )

@router.post("", response_model=DailyPlan)
async def save_daily_plan(
    plan: DailyPlanCreate,
    current_user: dict = Depends(validate_supabase_token),
):
    """Save a daily plan"""
    if db is None:
        # Return mock plan when no database is configured
        now = datetime.utcnow()
        user_id = current_user["user_id"]
        return DailyPlan(
            id=str(uuid.uuid4()),
            user_id=user_id,
            date=plan.date,
            is_ai_generated=plan.is_ai_generated,
            tasks=[
                PlannedTask(id=str(uuid.uuid4()), **t.model_dump())
                for t in plan.tasks
            ],
            created_at=now,
            updated_at=now,
        )
    
    try:
        user_id = current_user["user_id"]
        now = datetime.utcnow().isoformat()
        
        # Check if a plan already exists for this date
        existing_plan = await db.get_daily_plan(user_id, plan.date)
        
        if existing_plan:
            plan_id = existing_plan["id"]
            old_tasks = existing_plan.get("planned_tasks", [])

            if old_tasks:
                history_entries = []
                for t in old_tasks:
                    history_entries.append({
                        "id": str(uuid.uuid4()),
                        "user_id": user_id,
                        "plan_id": plan_id,
                        "planned_task_id": t.get("id"),
                        "task_id": t.get("task_id"),
                        "task_name": t.get("name", "Untitled Task"),
                        "event_type": "plan_replaced",
                        "previous_status": t.get("status"),
                        "new_status": t.get("status"),
                        "scheduled_date": plan.date,
                        "scheduled_start": t.get("scheduled_start"),
                        "scheduled_end": t.get("scheduled_end"),
                        "actual_start": t.get("actual_start"),
                        "actual_end": t.get("actual_end"),
                        "metadata": {"reason": "save_daily_plan_overwrite"},
                        "created_at": now,
                    })
                try:
                    await db.save_task_status_history_bulk(history_entries)
                except Exception as e:
                    logger.warning("archive_replaced_tasks_failed", error=str(e))

            # Old planned tasks are replaced atomically below (see
            # replace_planned_tasks), so we don't delete them separately here.
            plan_data = {
                "id": plan_id,
                "user_id": user_id,
                "date": plan.date,
                "is_ai_generated": plan.is_ai_generated,
                "updated_at": now,
            }
        else:
            plan_id = str(uuid.uuid4())
            plan_data = {
                "id": plan_id,
                "user_id": user_id,
                "date": plan.date,
                "is_ai_generated": plan.is_ai_generated,
                "created_at": now,
                "updated_at": now,
            }
        
        saved_plan = await db.save_daily_plan(plan_data)
        
        # Save planned tasks
        saved_tasks = []
        tasks_to_save = []
        if plan.tasks:
            for idx, task in enumerate(plan.tasks):
                # Get the API values as strings
                api_priority = task.priority.value if hasattr(task.priority, 'value') else str(task.priority)
                api_status = task.status.value if hasattr(task.status, 'value') else str(task.status)
                
                # Validate task_id as UUID, set to None if invalid or empty
                task_id_value = None
                if task.task_id and task.task_id.strip():  # Check for non-empty string
                    try:
                        # Check if it's a valid UUID
                        uuid.UUID(task.task_id)
                        task_id_value = task.task_id
                    except (ValueError, AttributeError):
                        # Not a valid UUID, set to None
                        task_id_value = None
                
                logger.debug("planned_task_id_resolved", raw=task.task_id, resolved=task_id_value)

                # Parse estimated_minutes from suggested_duration
                estimated_minutes = 30  # Default
                if task.suggested_duration:
                    dur = task.suggested_duration.lower()
                    import re as _re
                    hours_match = _re.search(r'(\d+(?:\.\d+)?)\s*(?:hour|hr|h)', dur)
                    mins_match = _re.search(r'(\d+)\s*(?:minute|min|m)', dur)
                    parsed_minutes = 0
                    if hours_match:
                        parsed_minutes += int(float(hours_match.group(1)) * 60)
                    if mins_match:
                        parsed_minutes += int(mins_match.group(1))
                    if parsed_minutes > 0:
                        estimated_minutes = parsed_minutes
                
                task_data = {
                    "id": str(uuid.uuid4()),
                    "plan_id": plan_id,
                    "task_id": task_id_value,
                    "name": task.task_name,
                    "scheduled_start": task.scheduled_start,
                    "scheduled_end": task.scheduled_end,
                    "estimated_minutes": estimated_minutes,
                    "cognitive_load": "light_focus",  # Default value
                    "priority": api_priority_to_db(api_priority),
                    "status": api_status_to_db(api_status),
                    "flexibility": "flexible",  # Default value
                    "rationale": task.notes,
                    "sort_order": task.order if task.order else idx,
                    "created_at": now,
                    "updated_at": now,
                }
                tasks_to_save.append(task_data)
        
        # Auto-inject recurring tasks for this date
        try:
            target_date = datetime.strptime(plan.date, "%Y-%m-%d").date()
            day_of_week = target_date.isoweekday() % 7  # 0=Sun..6=Sat
            recurring = await db.get_recurring_tasks_for_day(user_id, day_of_week)
            
            existing_names = {t["name"].lower().strip() for t in tasks_to_save}
            
            for rt in recurring:
                # Check date bounds
                start = rt.get('start_date')
                end = rt.get('end_date')
                if start and str(target_date) < start:
                    continue
                if end and str(target_date) > end:
                    continue
                
                # Skip if already in the plan by name
                if rt['name'].lower().strip() in existing_names:
                    continue
                
                # Calculate scheduled_end from preferred_time
                sched_start = None
                sched_end = None
                pref = rt.get('preferred_time')
                if pref:
                    sched_start = str(pref)
                    try:
                        parts = str(pref).split(':')
                        start_min = int(parts[0]) * 60 + int(parts[1])
                        end_min = start_min + rt.get('estimated_minutes', 30)
                        sched_end = f"{end_min // 60:02d}:{end_min % 60:02d}"
                    except (ValueError, IndexError):
                        pass
                
                rt_task = {
                    "id": str(uuid.uuid4()),
                    "plan_id": plan_id,
                    "task_id": None,
                    "recurring_task_id": rt['id'],
                    "name": rt['name'],
                    "scheduled_start": sched_start,
                    "scheduled_end": sched_end,
                    "estimated_minutes": rt.get('estimated_minutes', 30),
                    "cognitive_load": rt.get('cognitive_load', 'light_focus'),
                    "priority": api_priority_to_db(rt.get('priority', 'medium')),
                    "status": "not_started",
                    "flexibility": rt.get('flexibility', 'flexible'),
                    "rationale": "(Recurring task)",
                    "sort_order": len(tasks_to_save),
                    "created_at": now,
                    "updated_at": now,
                }
                tasks_to_save.append(rt_task)
                existing_names.add(rt['name'].lower().strip())
        except Exception as e:
            logger.warning("inject_recurring_tasks_failed", error=str(e))
        
        # Atomically replace the plan's tasks (delete old + insert new in one
        # transaction). Always called — including with an empty list — so that
        # saving an emptied plan clears its tasks without a non-atomic delete.
        saved_tasks_data = await db.replace_planned_tasks(plan_id, tasks_to_save)

        # Transform saved tasks to PlannedTask response format
        if saved_tasks_data:
            for db_task in saved_tasks_data:
                saved_tasks.append(PlannedTask(
                    id=db_task["id"],
                    task_id=db_task.get("task_id") or "",
                    task_name=db_task["name"],
                    suggested_duration=f"{db_task.get('estimated_minutes', 30)} minutes",
                    priority=db_priority_to_api(db_task.get("priority", "should_do")),
                    notes=db_task.get("rationale"),
                    scheduled_start=normalize_time_format(db_task.get("scheduled_start")),
                    scheduled_end=normalize_time_format(db_task.get("scheduled_end")),
                    status=db_status_to_api(db_task.get("status", "not_started")),
                    order=db_task.get("sort_order", 0),
                    actual_start=str(db_task["actual_start"]) if db_task.get("actual_start") else None,
                    actual_end=str(db_task["actual_end"]) if db_task.get("actual_end") else None,
                ))
        
        return DailyPlan(
            id=saved_plan["id"],
            user_id=saved_plan["user_id"],
            date=saved_plan["date"],
            is_ai_generated=saved_plan.get("is_ai_generated", False),
            tasks=saved_tasks,
            created_at=saved_plan.get("created_at") or now,
            updated_at=saved_plan.get("updated_at") or now,
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save plan: {str(e)}",
        )


@router.patch("/{plan_id}/tasks/{task_id}")
async def update_task_status(
    plan_id: str,
    task_id: str,
    updates: PlannedTaskUpdate,
    current_user: dict = Depends(validate_supabase_token),
):
    """Update a planned task and persist lifecycle changes to DB."""
    if db is None:
        return {
            "message": "Task updated",
            "task_id": task_id,
            "updates": updates.model_dump(exclude_none=True),
        }

    try:
        plan = await db.get_daily_plan_by_id(plan_id, current_user["user_id"])
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Plan not found",
            )

        existing_task = None
        for t in plan.get("planned_tasks", []):
            if t.get("id") == task_id:
                existing_task = t
                break

        if not existing_task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found in this plan",
            )

        payload = updates.model_dump(exclude_none=True)
        db_updates = {
            "updated_at": datetime.utcnow().isoformat(),
        }

        if "status" in payload:
            status_val = payload["status"]
            if hasattr(status_val, "value"):
                status_val = status_val.value
            db_updates["status"] = api_status_to_db(str(status_val))
        if "actual_start" in payload:
            db_updates["actual_start"] = payload["actual_start"]
        if "actual_end" in payload:
            db_updates["actual_end"] = payload["actual_end"]
        if "order" in payload:
            db_updates["sort_order"] = payload["order"]
        if "task_name" in payload:
            db_updates["name"] = payload["task_name"]
        if "notes" in payload:
            db_updates["rationale"] = payload["notes"]
        if "priority" in payload:
            priority_val = payload["priority"]
            if hasattr(priority_val, "value"):
                priority_val = priority_val.value
            db_updates["priority"] = api_priority_to_db(str(priority_val))
        if "suggested_duration" in payload:
            db_updates["estimated_minutes"] = parse_duration_to_minutes(payload["suggested_duration"])
        if "scheduled_start" in payload:
            db_updates["scheduled_start"] = payload["scheduled_start"]
        if "scheduled_end" in payload:
            db_updates["scheduled_end"] = payload["scheduled_end"]

        # Build start-timing metadata for the audit log
        start_timing_meta: dict = {}
        if "start_type" in payload and payload["start_type"]:
            start_timing_meta["start_type"] = payload["start_type"]
        if "minutes_offset" in payload and payload["minutes_offset"] is not None:
            start_timing_meta["minutes_offset"] = payload["minutes_offset"]
            # Convenience fields for analytics queries
            if payload["minutes_offset"] < 0:
                start_timing_meta["minutes_early"] = abs(payload["minutes_offset"])
            elif payload["minutes_offset"] > 0:
                start_timing_meta["minutes_late"] = payload["minutes_offset"]

        updated = await db.update_planned_task(task_id, db_updates)
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Task update failed",
            )

        await log_task_history_entry({
            "id": str(uuid.uuid4()),
            "user_id": current_user["user_id"],
            "plan_id": plan_id,
            "planned_task_id": task_id,
            "task_id": existing_task.get("task_id"),
            "task_name": updated.get("name") or existing_task.get("name") or "Untitled Task",
            "event_type": "task_updated",
            "previous_status": existing_task.get("status"),
            "new_status": updated.get("status", existing_task.get("status")),
            "scheduled_date": str(plan.get("date")),
            "scheduled_start": updated.get("scheduled_start", existing_task.get("scheduled_start")),
            "scheduled_end": updated.get("scheduled_end", existing_task.get("scheduled_end")),
            "actual_start": updated.get("actual_start", existing_task.get("actual_start")),
            "actual_end": updated.get("actual_end", existing_task.get("actual_end")),
            "metadata": {**start_timing_meta, "api_payload": payload},
            "created_at": datetime.utcnow().isoformat(),
        })

        return {
            "message": "Task updated",
            "task_id": task_id,
            "plan_id": plan_id,
            "status": db_status_to_api(updated.get("status", "not_started")),
            "updated_at": updated.get("updated_at"),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update task: {str(e)}",
        )


@router.delete("/{plan_id}/tasks/{task_id}")
async def delete_planned_task(
    plan_id: str,
    task_id: str,
    current_user: dict = Depends(validate_supabase_token),
):
    """Delete a planned task"""
    if db is None:
        return {"message": "Task deleted", "task_id": task_id}
    
    try:
        existing_task = None
        plan = await db.get_daily_plan_by_id(plan_id, current_user["user_id"])
        if plan:
            for t in plan.get("planned_tasks", []):
                if t.get("id") == task_id:
                    existing_task = t
                    break

        if existing_task:
            await log_task_history_entry({
                "id": str(uuid.uuid4()),
                "user_id": current_user["user_id"],
                "plan_id": plan_id,
                "planned_task_id": task_id,
                "task_id": existing_task.get("task_id"),
                "task_name": existing_task.get("name", "Untitled Task"),
                "event_type": "task_deleted",
                "previous_status": existing_task.get("status"),
                "new_status": existing_task.get("status"),
                "scheduled_date": str(plan.get("date")) if plan else None,
                "scheduled_start": existing_task.get("scheduled_start"),
                "scheduled_end": existing_task.get("scheduled_end"),
                "actual_start": existing_task.get("actual_start"),
                "actual_end": existing_task.get("actual_end"),
                "metadata": {"reason": "manual_delete"},
                "created_at": datetime.utcnow().isoformat(),
            })

        # Delete the planned task from database
        await db.delete_planned_task(task_id)
        return {"message": "Task deleted", "task_id": task_id}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete task: {str(e)}",
        )


@router.post("/{plan_id}/tasks/{task_id}/reschedule")
async def reschedule_task(
    plan_id: str,
    task_id: str,
    body: dict,
    current_user: dict = Depends(validate_supabase_token),
):
    """Reschedule a missed task to a new time slot.
    
    Body params:
      - mode: 'next_slot' | 'tomorrow' | 'custom'
      - date: target date (for 'tomorrow' or 'custom')
      - time: target start time HH:MM (for 'custom')
    """
    from app.services.schedule_service import schedule_service
    from datetime import timedelta
    import re as _re
    
    mode = body.get("mode", "next_slot")
    target_date = body.get("date")
    custom_time = body.get("time")
    
    user_id = current_user["user_id"]

    # Resolve "now" in the user's timezone (naive wall-clock) so "today"/"tomorrow"
    # and the past-time guard below don't drift by the UTC offset near midnight.
    user_tz = await get_user_timezone(user_id)
    now_local = user_now(user_tz).replace(tzinfo=None)

    # Look up the task (using the plan_id from the URL) to get its duration
    task_duration = 30  # default
    if db:
        source_plan = await db.get_daily_plan_by_id(plan_id, user_id)
        if source_plan:
            for t in source_plan.get("planned_tasks", []):
                if t["id"] == task_id:
                    task_duration = t.get("estimated_minutes", 30)
                    break

    # Get user profile for scheduling
    energy_profile_data = await db.get_energy_profile(user_id) if db else None
    sleep_schedule_data = await db.get_sleep_schedule(user_id) if db else None
    commitments_data = await db.get_commitments(user_id) if db else []
    
    energy_profile = EnergyProfile(**energy_profile_data) if energy_profile_data else None
    sleep_schedule = SleepSchedule(**sleep_schedule_data) if sleep_schedule_data else None
    commitments_list = [Commitment(**c) for c in commitments_data] if commitments_data else []
    
    if not target_date:
        if mode == "tomorrow":
            target_date = (now_local + timedelta(days=1)).strftime('%Y-%m-%d')
        else:
            target_date = now_local.strftime('%Y-%m-%d')
    
    # Get existing plan for target date to find occupied slots
    existing_plan = await db.get_daily_plan(user_id, target_date) if db else None
    existing_tasks = []
    if existing_plan:
        for t in existing_plan.get("planned_tasks", []):
            t_start = normalize_time_format(t.get("scheduled_start"))
            t_end = normalize_time_format(t.get("scheduled_end"))
            if t_start and t_end and t["id"] != task_id:
                from app.models import PlannedTask as PT
                existing_tasks.append(PT(
                    id=t["id"], task_id=t.get("task_id") or "",
                    task_name=t.get("name", ""), suggested_duration=f"{t.get('estimated_minutes', 30)} minutes",
                    priority="medium", order=0, status="pending",
                    scheduled_start=t_start, scheduled_end=t_end,
                ))
    
    if mode == "custom" and custom_time:
        # Validate HH:MM format
        if not _re.match(r'^\d{2}:\d{2}$', custom_time):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="time must be HH:MM",
            )
        try:
            new_start_dt = datetime.strptime(f"{target_date} {custom_time}", '%Y-%m-%d %H:%M')
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="invalid date/time combination",
            )
        # Refuse past times for today (judged in the user's timezone)
        if target_date == now_local.strftime('%Y-%m-%d') and new_start_dt <= now_local:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="cannot reschedule to a past time",
            )
        new_end_dt = new_start_dt + timedelta(minutes=task_duration)
        # Check overlap with existing tasks (already excludes this task by id above)
        for et in existing_tasks:
            try:
                et_start = datetime.strptime(f"{target_date} {et.scheduled_start}", '%Y-%m-%d %H:%M')
                et_end = datetime.strptime(f"{target_date} {et.scheduled_end}", '%Y-%m-%d %H:%M')
            except (ValueError, TypeError):
                continue
            if new_start_dt < et_end and new_end_dt > et_start:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"overlaps with existing task at {et.scheduled_start}",
                )
        # Check overlap with commitments
        day_of_week = (new_start_dt.weekday() + 1) % 7
        for c in commitments_list:
            if day_of_week not in c.days_of_week:
                continue
            try:
                c_start = datetime.strptime(f"{target_date} {normalize_time_format(c.start_time)}", '%Y-%m-%d %H:%M')
                c_end = datetime.strptime(f"{target_date} {normalize_time_format(c.end_time)}", '%Y-%m-%d %H:%M')
            except (ValueError, TypeError):
                continue
            if new_start_dt < c_end and new_end_dt > c_start:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"overlaps with commitment '{c.name}'",
                )
        return {
            "scheduled_start": new_start_dt.strftime('%H:%M'),
            "scheduled_end": new_end_dt.strftime('%H:%M'),
            "date": target_date,
        }

    # Find available slots
    if sleep_schedule and energy_profile:
        available_slots = schedule_service.get_available_time_slots(
            target_date, commitments_list, sleep_schedule,
            existing_tasks=existing_tasks if existing_tasks else None,
            energy_profile=energy_profile,
        )
    else:
        # Fallback: assume 08:00-22:00 as available window
        base = datetime.strptime(target_date, '%Y-%m-%d')
        fallback_start = base.replace(hour=8, minute=0)
        fallback_end = base.replace(hour=22, minute=0)
        available_slots = [(fallback_start, fallback_end)]
    
    if not available_slots:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No available time slots for rescheduling",
        )
    
    # Find the first slot that's in the future (for today) or any slot (for other days)
    best_slot = None
    for slot_start, slot_end in available_slots:
        slot_minutes = int((slot_end - slot_start).total_seconds() // 60)
        if slot_minutes < 15:
            continue
        if target_date == now_local.strftime('%Y-%m-%d'):
            if slot_start > now_local:
                best_slot = (slot_start, slot_end)
                break
        else:
            best_slot = (slot_start, slot_end)
            break
    
    if not best_slot:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No future time slots available for rescheduling",
        )
    
    new_start = best_slot[0].strftime('%H:%M')
    new_end_dt = best_slot[0] + timedelta(minutes=task_duration)
    if new_end_dt > best_slot[1]:
        new_end_dt = best_slot[1]
    new_end = new_end_dt.strftime('%H:%M')
    
    return {
        "scheduled_start": new_start,
        "scheduled_end": new_end,
        "date": target_date,
    }


@router.get("/schedule/free-slots/{target_date}")
async def get_free_slots(
    target_date: str,
    exclude_task_id: str | None = None,
    current_user: dict = Depends(validate_supabase_token),
):
    """Return day boundaries + busy windows for a date so the frontend can
    render a slot picker for rescheduling.

    Query params:
      - exclude_task_id: optional planned-task id to omit from busy_windows
        (so a task being rescheduled doesn't block its own current slot)
    """
    user_id = current_user["user_id"]

    # Day boundaries: prefer the user's sleep schedule, fall back to 08:00–22:00
    wake_time_str = "08:00"
    sleep_deadline_str = "22:00"
    sleep_schedule_data = await db.get_sleep_schedule(user_id) if db else None
    sleep_schedule = SleepSchedule(**sleep_schedule_data) if sleep_schedule_data else None
    if sleep_schedule:
        wake_time_str = normalize_time_format(sleep_schedule.wake_time) or wake_time_str
        try:
            deadline_dt = schedule_service.calculate_sleep_deadline(sleep_schedule, target_date)
            sleep_deadline_str = deadline_dt.strftime('%H:%M')
        except Exception:
            pass

    busy_windows: list[dict] = []

    # Commitments for this day-of-week
    commitments_data = await db.get_commitments(user_id) if db else []
    try:
        day_of_week = (datetime.strptime(target_date, '%Y-%m-%d').weekday() + 1) % 7
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="target_date must be YYYY-MM-DD",
        )
    for c in commitments_data or []:
        if day_of_week in (c.get('days_of_week') or []):
            c_start = normalize_time_format(c.get('start_time'))
            c_end = normalize_time_format(c.get('end_time'))
            if c_start and c_end:
                busy_windows.append({
                    "start": c_start,
                    "end": c_end,
                    "label": c.get('name', 'Commitment'),
                    "kind": "commitment",
                })

    # Tasks already scheduled on this date
    if db:
        try:
            existing_plan = await db.get_daily_plan(user_id, target_date)
        except Exception:
            existing_plan = None
        if existing_plan:
            for t in existing_plan.get('planned_tasks', []) or []:
                if exclude_task_id and t.get('id') == exclude_task_id:
                    continue
                # Cancelled/skipped tasks no longer hold their slot
                if t.get('status') in ('postponed', 'skipped'):
                    continue
                t_start = normalize_time_format(t.get('scheduled_start'))
                t_end = normalize_time_format(t.get('scheduled_end'))
                if t_start and t_end:
                    busy_windows.append({
                        "start": t_start,
                        "end": t_end,
                        "label": t.get('name', 'Task'),
                        "kind": "task",
                        "task_id": t.get('id'),
                    })

    return {
        "date": target_date,
        "wake_time": wake_time_str,
        "sleep_deadline": sleep_deadline_str,
        "busy_windows": busy_windows,
    }


@router.post("/schedule/enforce")
async def enforce_schedule_timing(
    planned_tasks: List[dict],
    current_user: dict = Depends(validate_supabase_token),
):
    """
    Enforce timing on planned tasks based on user's commitments and sleep schedule.
    This is the deterministic backend logic that assigns actual time slots.
    """
    # Get user's profile data
    if db is not None:
        user_id = current_user["user_id"]
        energy_profile_data = await db.get_energy_profile(user_id)
        sleep_schedule_data = await db.get_sleep_schedule(user_id)
        commitments_data = await db.get_commitments(user_id)
        
        energy_profile = EnergyProfile(**energy_profile_data) if energy_profile_data else None
        sleep_schedule = SleepSchedule(**sleep_schedule_data) if sleep_schedule_data else None
        commitments = [Commitment(**c) for c in commitments_data] if commitments_data else []
    else:
        # Default values for demo
        energy_profile = None
        sleep_schedule = None
        commitments = []
    
    if not energy_profile or not sleep_schedule:
        return {
            "message": "User profile not configured",
            "scheduled_tasks": planned_tasks,
        }
    
    # Convert to PlannedTask objects
    tasks = [PlannedTask(**t) for t in planned_tasks]
    
    # Enforce timing
    from datetime import date
    scheduled_tasks = schedule_service.enforce_timing(
        tasks,
        date.today().isoformat(),
        commitments,
        sleep_schedule,
        energy_profile,
    )
    
    # Suggest breaks
    breaks = schedule_service.suggest_break_times(scheduled_tasks)
    
    return {
        "scheduled_tasks": [t.model_dump() for t in scheduled_tasks],
        "suggested_breaks": breaks,
    }

@router.get("/range/{start_date}/{end_date}", response_model=List[DailyPlan])
async def get_daily_plans_range(
    start_date: str,
    end_date: str,
    current_user: dict = Depends(validate_supabase_token),
):
    """Get all daily plans for a user within a date range (e.g., to show historical tasks in calendar)"""
    if db is None:
        # Return empty list when no database is configured
        return []
    
    try:
        plans = await db.get_daily_plans_range(current_user["user_id"], start_date, end_date)
        if not plans:
            return []

        # Transform all plans from DB format to API format
        user_tz = await get_user_timezone(current_user["user_id"])
        result = []
        for plan in plans:
            plan_date = plan.get("date", "")
            if hasattr(plan_date, 'isoformat'):
                plan_date = plan_date.isoformat()
            db_tasks = plan.get("planned_tasks", [])
            tasks = []
            for t in db_tasks:
                api_status = db_status_to_api(t.get("status", "not_started"))
                if api_status == "pending" and is_task_missed(t, str(plan_date), user_tz):
                    api_status = "missed"
                tasks.append(PlannedTask(
                    id=t["id"],
                    task_id=t.get("task_id") or "",  # Return empty string if NULL, not the task id
                    task_name=t.get("name", "Untitled Task"),
                    suggested_duration=f"{t.get('estimated_minutes', 30)} minutes",
                    priority=db_priority_to_api(t.get("priority", "should_do")),
                    notes=t.get("rationale"),
                    scheduled_start=normalize_time_format(t.get("scheduled_start")),
                    scheduled_end=normalize_time_format(t.get("scheduled_end")),
                    status=api_status,
                    order=t.get("sort_order", 0),
                    actual_start=str(t["actual_start"]) if t.get("actual_start") else None,
                    actual_end=str(t["actual_end"]) if t.get("actual_end") else None,
                ))
            
            result.append(DailyPlan(
                id=plan["id"],
                user_id=plan["user_id"],
                date=plan["date"],
                is_ai_generated=plan.get("is_ai_generated", False),
                tasks=tasks,
                created_at=plan.get("created_at"),
                updated_at=plan.get("updated_at"),
            ))
        
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch plans: {str(e)}",
        )