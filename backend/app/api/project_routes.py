"""
Project routes: multi-session work tracked by total work hours.

A project is larger than a single task — it carries a total-hours estimate and
the AI schedules realistic daily chunks against it. Progress is measured in
hours completed. Projects may optionally be broken into subtasks; when they are,
the AI schedules the next incomplete subtask instead of an abstract time block.
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import List
from datetime import datetime
import uuid

from app.core.security import validate_supabase_token
from app.core.database import db
from app.services.ai_service import ai_service
from app.models import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    ProjectSubtaskCreate,
    ProjectSubtaskUpdate,
    ProjectSubtaskResponse,
    ProjectEstimateRequest,
    ProjectEstimateResponse,
    ProjectLogHoursRequest,
)

router = APIRouter(prefix="/projects", tags=["Projects"])


def _validate_deadline(deadline: str | None):
    if deadline:
        try:
            datetime.strptime(deadline, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid deadline format, expected YYYY-MM-DD")


async def _owned_project(project_id: str, user_id: str) -> dict:
    """Fetch a project and verify ownership, or raise 404."""
    project = await db.get_project(project_id)
    if not project or project.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


# ---------------------------------------------------------------------------
# AI estimation (declared before /{project_id} routes to avoid path capture)
# ---------------------------------------------------------------------------

@router.post("/estimate-hours", response_model=ProjectEstimateResponse)
async def estimate_project_hours(
    request: ProjectEstimateRequest,
    current_user: dict = Depends(validate_supabase_token),
):
    """Return an AI hours estimate + size bucket for a project name/description.
    Used to pre-fill the create form so the user reacts to a number instead of
    inventing one."""
    result = await ai_service.estimate_project_hours(request.name, request.description)
    return result


# ---------------------------------------------------------------------------
# Project CRUD
# ---------------------------------------------------------------------------

@router.get("", response_model=List[ProjectResponse])
async def list_projects(current_user: dict = Depends(validate_supabase_token)):
    """Return all projects for the current user, newest first, with subtasks."""
    user_id = current_user["user_id"]
    projects = await db.get_projects(user_id)
    return projects or []


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(
    project: ProjectCreate,
    current_user: dict = Depends(validate_supabase_token),
):
    """Create a project and, optionally, its subtasks in one call."""
    user_id = current_user["user_id"]
    _validate_deadline(project.deadline)

    payload = project.model_dump(exclude={"subtasks"})
    payload["id"] = str(uuid.uuid4())
    payload["user_id"] = user_id
    created = await db.create_project(payload)
    if not created:
        raise HTTPException(status_code=500, detail="Failed to create project")

    if project.subtasks:
        for i, subtask in enumerate(project.subtasks):
            sub_payload = subtask.model_dump()
            sub_payload["id"] = str(uuid.uuid4())
            sub_payload["project_id"] = created["id"]
            sub_payload["user_id"] = user_id
            sub_payload["sort_order"] = i
            await db.create_project_subtask(sub_payload)

    return await db.get_project(created["id"])


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    updates: ProjectUpdate,
    current_user: dict = Depends(validate_supabase_token),
):
    """Update any project field (name, hours, deadline, status, etc.)."""
    user_id = current_user["user_id"]
    await _owned_project(project_id, user_id)

    # exclude_unset (not exclude_none) so the client can explicitly clear
    # optional fields like deadline/weekly_hours_target by sending null.
    update_data = updates.model_dump(exclude_unset=True)
    _validate_deadline(update_data.get("deadline"))
    if not update_data:
        return await db.get_project(project_id)

    result = await db.update_project(project_id, update_data)
    if not result:
        raise HTTPException(status_code=500, detail="Failed to update project")
    return await db.get_project(project_id)


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: str,
    current_user: dict = Depends(validate_supabase_token),
):
    """Permanently delete a project (subtasks cascade)."""
    user_id = current_user["user_id"]
    await _owned_project(project_id, user_id)
    await db.delete_project(project_id)


@router.post("/{project_id}/park", response_model=ProjectResponse)
async def toggle_park_project(
    project_id: str,
    current_user: dict = Depends(validate_supabase_token),
):
    """Toggle a project between active and parked. Parked projects are skipped
    by the AI scheduler but not abandoned."""
    user_id = current_user["user_id"]
    project = await _owned_project(project_id, user_id)
    new_status = "active" if project.get("status") == "parked" else "parked"
    await db.update_project(project_id, {"status": new_status})
    return await db.get_project(project_id)


@router.post("/{project_id}/complete", response_model=ProjectResponse)
async def complete_project(
    project_id: str,
    current_user: dict = Depends(validate_supabase_token),
):
    """Mark a project complete."""
    user_id = current_user["user_id"]
    await _owned_project(project_id, user_id)
    await db.update_project(project_id, {"status": "completed"})
    return await db.get_project(project_id)


@router.post("/{project_id}/log-hours", response_model=ProjectResponse)
async def log_project_hours(
    project_id: str,
    request: ProjectLogHoursRequest,
    current_user: dict = Depends(validate_supabase_token),
):
    """Manually add completed hours to a project (edge cases — normally hours are
    logged automatically when a project-linked task is completed)."""
    user_id = current_user["user_id"]
    await _owned_project(project_id, user_id)
    await db.log_project_hours(project_id, request.hours)
    return await db.get_project(project_id)


# ---------------------------------------------------------------------------
# Subtasks
# ---------------------------------------------------------------------------

@router.get("/{project_id}/subtasks", response_model=List[ProjectSubtaskResponse])
async def list_subtasks(
    project_id: str,
    current_user: dict = Depends(validate_supabase_token),
):
    user_id = current_user["user_id"]
    project = await _owned_project(project_id, user_id)
    return project.get("subtasks") or []


@router.post("/{project_id}/subtasks", response_model=ProjectSubtaskResponse, status_code=201)
async def add_subtask(
    project_id: str,
    subtask: ProjectSubtaskCreate,
    current_user: dict = Depends(validate_supabase_token),
):
    user_id = current_user["user_id"]
    project = await _owned_project(project_id, user_id)

    payload = subtask.model_dump()
    payload["id"] = str(uuid.uuid4())
    payload["project_id"] = project_id
    payload["user_id"] = user_id
    payload["sort_order"] = len(project.get("subtasks") or [])
    result = await db.create_project_subtask(payload)
    if not result:
        raise HTTPException(status_code=500, detail="Failed to create subtask")
    return result


@router.patch("/{project_id}/subtasks/{subtask_id}", response_model=ProjectSubtaskResponse)
async def update_subtask(
    project_id: str,
    subtask_id: str,
    updates: ProjectSubtaskUpdate,
    current_user: dict = Depends(validate_supabase_token),
):
    user_id = current_user["user_id"]
    await _owned_project(project_id, user_id)
    existing = await db.get_project_subtask(subtask_id)
    if not existing or existing.get("project_id") != project_id:
        raise HTTPException(status_code=404, detail="Subtask not found")

    update_data = updates.model_dump(exclude_none=True)
    if not update_data:
        return existing

    result = await db.update_project_subtask(subtask_id, update_data)
    if not result:
        raise HTTPException(status_code=500, detail="Failed to update subtask")
    return result


@router.delete("/{project_id}/subtasks/{subtask_id}", status_code=204)
async def delete_subtask(
    project_id: str,
    subtask_id: str,
    current_user: dict = Depends(validate_supabase_token),
):
    user_id = current_user["user_id"]
    await _owned_project(project_id, user_id)
    existing = await db.get_project_subtask(subtask_id)
    if not existing or existing.get("project_id") != project_id:
        raise HTTPException(status_code=404, detail="Subtask not found")
    await db.delete_project_subtask(subtask_id)
