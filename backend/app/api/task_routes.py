from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from datetime import datetime
import uuid

from app.core.security import get_current_user
from app.core.database import db
from app.models import (
    TaskCreate,
    TaskUpdate,
    Task,
)

router = APIRouter(prefix="/tasks", tags=["Tasks"])


@router.get("", response_model=List[Task])
async def get_tasks(
    current_user: dict = Depends(get_current_user),
):
    """Get all tasks for the current user"""
    if db is None:
        # Return empty list if database not configured
        return []
    
    try:
        tasks = await db.get_tasks(current_user["user_id"])
        return tasks
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch tasks: {str(e)}",
        )


@router.post("", response_model=Task)
async def create_task(
    task: TaskCreate,
    current_user: dict = Depends(get_current_user),
):
    """Create a new task"""
    if db is None:
        # Create a mock task for demo
        now = datetime.utcnow()
        return Task(
            id=str(uuid.uuid4()),
            user_id=current_user["user_id"],
            created_at=now,
            updated_at=now,
            **task.model_dump(),
        )
    
    try:
        task_dict = task.model_dump()
        
        # Map frontend field names to database field names and align enum values
        cognitive_map = {
            "light_focus": "routine",
            "deep_focus": "deep_focus",
            "admin": "communication",
            "physical": "physical",
            "recovery": "routine",
            "light_logic": "light_logic",
            "creative": "creative",
            "communication": "communication",
            "routine": "routine",
        }
        load_type = task_dict.get("type", "routine")
        cognitive_load = cognitive_map.get(load_type, "routine")

        # Convert effort (1-5) to minutes (15–75 minutes, clamped)
        effort = task_dict.get("estimated_effort", 3)
        estimated_minutes = max(5, min(240, effort * 15))

        task_data = {
            "id": str(uuid.uuid4()),
            "user_id": current_user["user_id"],
            "name": task_dict.get("name"),
            "description": task_dict.get("description"),
            "estimated_minutes": estimated_minutes,
            "cognitive_load": cognitive_load,
            "priority": "should_do",  # Default priority
            "flexibility": task_dict.get("flexibility", "flexible"),
            "deadline": task_dict.get("due_date"),  # Map due_date to deadline
            "status": "not_started",
            "tags": task_dict.get("tags", []),
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        }
        
        print(f"Creating task with data: {task_data}")
        created_task = await db.create_task(task_data)
        print(f"Task created successfully: {created_task}")
        
        # Map the database response back to the API response format
        if created_task:
            # Reverse map database cognitive_load to API type
            reverse_cognitive_map = {
                "routine": "light_focus",
                "deep_focus": "deep_focus",
                "communication": "admin",
                "physical": "physical",
                "light_logic": "light_focus",
                "creative": "light_focus",
            }
            db_cognitive_load = created_task.get("cognitive_load", "routine")
            api_type = reverse_cognitive_map.get(db_cognitive_load, "light_focus")
            
            # Convert estimated_minutes back to effort level (1-5)
            estimated_minutes = created_task.get("estimated_minutes", 30)
            effort_level = max(1, min(5, round(estimated_minutes / 15)))
            
            return Task(
                id=created_task.get("id"),
                user_id=created_task.get("user_id"),
                name=created_task.get("name"),
                type=api_type,
                estimated_effort=effort_level,
                flexibility=created_task.get("flexibility", "flexible"),
                description=created_task.get("description"),
                tags=created_task.get("tags"),
                due_date=created_task.get("deadline"),
                created_at=created_task.get("created_at"),
                updated_at=created_task.get("updated_at"),
            )
        return created_task
    except Exception as e:
        print(f"Error creating task: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create task: {str(e)}",
        )


@router.put("/{task_id}", response_model=Task)
async def update_task(
    task_id: str,
    updates: TaskUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update an existing task"""
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Database not configured",
        )
    
    try:
        # Filter out None values
        update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
        update_data["updated_at"] = datetime.utcnow().isoformat()
        
        updated_task = await db.update_task(task_id, update_data)
        if not updated_task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found",
            )
        return updated_task
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update task: {str(e)}",
        )


@router.delete("/{task_id}")
async def delete_task(
    task_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a task"""
    if db is None:
        return {"message": "Task deleted"}
    
    try:
        await db.delete_task(task_id)
        return {"message": "Task deleted"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete task: {str(e)}",
        )
