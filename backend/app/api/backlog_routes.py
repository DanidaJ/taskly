"""
Backlog routes: unscheduled task capture.

Backlog items are tasks the user wants to do "eventually" — no date assigned.
When an item is scheduled, it is converted into a planned_task on the chosen
date and deleted from the backlog (planned_task becomes the source of truth).
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import List
from datetime import datetime
import uuid

from app.core.security import get_current_user
from app.core.database import db
from app.models import (
    BacklogItemCreate,
    BacklogItemUpdate,
    BacklogItemResponse,
    BacklogScheduleRequest,
)

router = APIRouter(prefix="/backlog", tags=["Backlog"])


# Priority mapping mirrors plan_routes — backlog uses API priority strings
# directly in storage (matching recurring_tasks), but when we materialize a
# planned_task we have to convert to the DB enum.
def _api_priority_to_db(api_priority: str) -> str:
    return {
        "high": "must_do",
        "medium": "should_do",
        "low": "nice_to_have",
    }.get(api_priority, "should_do")


@router.get("", response_model=List[BacklogItemResponse])
async def list_backlog_items(current_user: dict = Depends(get_current_user)):
    """Return all backlog items for the current user, newest first."""
    user_id = current_user["user_id"]
    items = await db.get_backlog_items(user_id)
    return items or []


@router.post("", response_model=BacklogItemResponse, status_code=201)
async def create_backlog_item(
    item: BacklogItemCreate,
    current_user: dict = Depends(get_current_user),
):
    """Add a new item to the backlog."""
    user_id = current_user["user_id"]
    payload = item.model_dump()
    payload["id"] = str(uuid.uuid4())
    payload["user_id"] = user_id
    result = await db.create_backlog_item(payload)
    if not result:
        raise HTTPException(status_code=500, detail="Failed to create backlog item")
    return result


@router.patch("/{item_id}", response_model=BacklogItemResponse)
async def update_backlog_item(
    item_id: str,
    updates: BacklogItemUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update name, duration, priority, etc. of a backlog item."""
    user_id = current_user["user_id"]
    existing = await db.get_backlog_item(item_id)
    if not existing or existing.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Backlog item not found")

    update_data = updates.model_dump(exclude_none=True)
    if not update_data:
        return existing

    result = await db.update_backlog_item(item_id, update_data)
    if not result:
        raise HTTPException(status_code=500, detail="Failed to update backlog item")
    return result


@router.delete("/{item_id}", status_code=204)
async def delete_backlog_item(
    item_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Remove an item from the backlog without scheduling it."""
    user_id = current_user["user_id"]
    existing = await db.get_backlog_item(item_id)
    if not existing or existing.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Backlog item not found")
    await db.delete_backlog_item(item_id)


@router.post("/{item_id}/schedule", status_code=201)
async def schedule_backlog_item(
    item_id: str,
    request: BacklogScheduleRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Materialize a backlog item into a planned_task on the given date.
    Removes the item from the backlog after the planned_task is saved.

    Returns the newly created planned_task in the same shape used by
    /plans endpoints so the frontend can drop it straight into its store.
    """
    user_id = current_user["user_id"]
    item = await db.get_backlog_item(item_id)
    if not item or item.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Backlog item not found")

    # Validate date
    try:
        datetime.strptime(request.date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format, expected YYYY-MM-DD")

    # Compute scheduled_end if user gave a start but no end
    estimated_minutes = item.get("estimated_minutes", 60)
    sched_start = request.scheduled_start
    sched_end = request.scheduled_end
    if sched_start and not sched_end:
        try:
            hours, mins = map(int, sched_start.split(":"))
            end_total = hours * 60 + mins + estimated_minutes
            sched_end = f"{(end_total // 60) % 24:02d}:{end_total % 60:02d}"
        except (ValueError, IndexError):
            sched_end = None

    now = datetime.utcnow().isoformat()

    # Find or create the daily plan for this date
    existing_plan = await db.get_daily_plan(user_id, request.date)
    if existing_plan:
        plan_id = existing_plan["id"]
        existing_task_count = len(existing_plan.get("planned_tasks") or [])
    else:
        plan_id = str(uuid.uuid4())
        await db.save_daily_plan({
            "id": plan_id,
            "user_id": user_id,
            "date": request.date,
            "is_ai_generated": False,
            "created_at": now,
            "updated_at": now,
        })
        existing_task_count = 0

    # Insert the new planned task
    new_planned_task = {
        "id": str(uuid.uuid4()),
        "plan_id": plan_id,
        "task_id": None,
        "name": item["name"],
        "scheduled_start": sched_start,
        "scheduled_end": sched_end,
        "estimated_minutes": estimated_minutes,
        "cognitive_load": item.get("cognitive_load", "routine"),
        "priority": _api_priority_to_db(item.get("priority", "medium")),
        "status": "not_started",
        "flexibility": "flexible",
        "rationale": item.get("notes"),
        "sort_order": existing_task_count,
        "created_at": now,
        "updated_at": now,
    }

    saved = await db.save_planned_tasks([new_planned_task])
    if not saved:
        raise HTTPException(status_code=500, detail="Failed to create planned task from backlog item")

    # Backlog item is now redundant — delete it
    await db.delete_backlog_item(item_id)

    db_task = saved[0]
    db_priority_to_api = {"must_do": "high", "should_do": "medium", "nice_to_have": "low"}
    return {
        "id": db_task["id"],
        "plan_id": db_task["plan_id"],
        "plan_date": request.date,
        "task_id": db_task.get("task_id") or "",
        "task_name": db_task["name"],
        "suggested_duration": f"{db_task.get('estimated_minutes', 30)} minutes",
        "priority": db_priority_to_api.get(db_task.get("priority"), "medium"),
        "notes": db_task.get("rationale"),
        "scheduled_start": db_task.get("scheduled_start"),
        "scheduled_end": db_task.get("scheduled_end"),
        "status": "pending",
        "order": db_task.get("sort_order", 0),
    }
