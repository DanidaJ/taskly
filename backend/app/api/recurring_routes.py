from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from datetime import datetime, date as date_type
import uuid

from app.core.security import validate_supabase_token
from app.core.database import db
from app.models import (
    RecurringTaskCreate,
    RecurringTaskUpdate,
    RecurringTaskResponse,
    RoutineTemplateCreate,
    RoutineTemplateUpdate,
    RoutineTemplateResponse,
)

router = APIRouter(prefix="/recurring", tags=["Recurring Tasks"])


# ============================================
# Recurring Tasks CRUD
# ============================================

@router.get("/tasks", response_model=List[RecurringTaskResponse])
async def get_recurring_tasks(
    active_only: bool = True,
    current_user: dict = Depends(validate_supabase_token),
):
    """Get all recurring tasks for the current user"""
    user_id = current_user["user_id"]
    tasks = await db.get_recurring_tasks(user_id, active_only=active_only)
    return tasks


@router.get("/tasks/{task_id}", response_model=RecurringTaskResponse)
async def get_recurring_task(
    task_id: str,
    current_user: dict = Depends(validate_supabase_token),
):
    """Get a single recurring task"""
    user_id = current_user["user_id"]
    task = await db.get_recurring_task(task_id)
    if not task or task.get('user_id') != user_id:
        raise HTTPException(status_code=404, detail="Recurring task not found")
    return task


@router.post("/tasks", response_model=RecurringTaskResponse, status_code=201)
async def create_recurring_task(
    task: RecurringTaskCreate,
    current_user: dict = Depends(validate_supabase_token),
):
    """Create a new recurring task"""
    user_id = current_user["user_id"]
    task_data = task.model_dump()
    task_data['user_id'] = user_id
    task_data['id'] = str(uuid.uuid4())
    task_data['is_active'] = True

    # Normalize days_of_week based on recurrence_type
    if task_data['recurrence_type'] == 'daily':
        task_data['days_of_week'] = [0, 1, 2, 3, 4, 5, 6]
    elif task_data['recurrence_type'] == 'weekdays':
        task_data['days_of_week'] = [1, 2, 3, 4, 5]
    elif task_data['recurrence_type'] == 'weekends':
        task_data['days_of_week'] = [0, 6]

    if not task_data.get('start_date'):
        task_data['start_date'] = str(date_type.today())

    result = await db.create_recurring_task(task_data)
    if not result:
        raise HTTPException(status_code=500, detail="Failed to create recurring task")
    return result


@router.put("/tasks/{task_id}", response_model=RecurringTaskResponse)
async def update_recurring_task(
    task_id: str,
    updates: RecurringTaskUpdate,
    current_user: dict = Depends(validate_supabase_token),
):
    """Update a recurring task"""
    user_id = current_user["user_id"]
    existing = await db.get_recurring_task(task_id)
    if not existing or existing.get('user_id') != user_id:
        raise HTTPException(status_code=404, detail="Recurring task not found")

    update_data = updates.model_dump(exclude_none=True)
    
    # Normalize days_of_week if recurrence_type changed
    if 'recurrence_type' in update_data:
        rt = update_data['recurrence_type']
        if rt == 'daily':
            update_data['days_of_week'] = [0, 1, 2, 3, 4, 5, 6]
        elif rt == 'weekdays':
            update_data['days_of_week'] = [1, 2, 3, 4, 5]
        elif rt == 'weekends':
            update_data['days_of_week'] = [0, 6]

    result = await db.update_recurring_task(task_id, update_data)
    if not result:
        raise HTTPException(status_code=500, detail="Failed to update recurring task")
    return result


@router.delete("/tasks/{task_id}", status_code=204)
async def delete_recurring_task(
    task_id: str,
    current_user: dict = Depends(validate_supabase_token),
):
    """Delete a recurring task"""
    user_id = current_user["user_id"]
    existing = await db.get_recurring_task(task_id)
    if not existing or existing.get('user_id') != user_id:
        raise HTTPException(status_code=404, detail="Recurring task not found")
    await db.delete_recurring_task(task_id)


@router.post("/tasks/{task_id}/toggle", response_model=RecurringTaskResponse)
async def toggle_recurring_task(
    task_id: str,
    current_user: dict = Depends(validate_supabase_token),
):
    """Toggle a recurring task active/inactive"""
    user_id = current_user["user_id"]
    existing = await db.get_recurring_task(task_id)
    if not existing or existing.get('user_id') != user_id:
        raise HTTPException(status_code=404, detail="Recurring task not found")
    
    result = await db.update_recurring_task(task_id, {'is_active': not existing.get('is_active', True)})
    return result


# ============================================
# Generate recurring tasks for a date
# ============================================

@router.get("/for-date/{date_str}")
async def get_recurring_tasks_for_date(
    date_str: str,
    current_user: dict = Depends(validate_supabase_token),
):
    user_id = current_user["user_id"]
    """Get recurring tasks that should fire on a specific date.
    Returns planned-task-compatible objects ready to inject into a daily plan."""
    try:
        target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format, use YYYY-MM-DD")

    day_of_week = target_date.isoweekday() % 7  # Convert to 0=Sun..6=Sat

    tasks = await db.get_recurring_tasks_for_day(user_id, day_of_week)

    # Filter by start_date and end_date
    result = []
    for t in tasks:
        start = t.get('start_date')
        end = t.get('end_date')
        if start and str(target_date) < start:
            continue
        if end and str(target_date) > end:
            continue
        
        # Convert to planned-task-compatible format
        planned = {
            'recurring_task_id': t['id'],
            'task_name': t['name'],
            'description': t.get('description', ''),
            'suggested_duration': f"{t.get('estimated_minutes', 30)} minutes",
            'priority': t.get('priority', 'medium'),
            'cognitive_load': t.get('cognitive_load', 'light_focus'),
            'flexibility': t.get('flexibility', 'flexible'),
            'scheduled_start': t.get('preferred_time'),
            'scheduled_end': None,
            'notes': '(Recurring task)',
        }

        # Calculate end time if preferred_time is set
        if planned['scheduled_start']:
            try:
                start_parts = planned['scheduled_start'].split(':')
                start_minutes = int(start_parts[0]) * 60 + int(start_parts[1])
                end_minutes = start_minutes + t.get('estimated_minutes', 30)
                planned['scheduled_end'] = f"{end_minutes // 60:02d}:{end_minutes % 60:02d}"
            except (ValueError, IndexError):
                pass

        result.append(planned)

    return result


# ============================================
# Routine Templates CRUD
# ============================================

@router.get("/templates", response_model=List[RoutineTemplateResponse])
async def get_routine_templates(
    current_user: dict = Depends(validate_supabase_token),
):
    """Get all routine templates with their tasks"""
    user_id = current_user["user_id"]
    templates = await db.get_routine_templates(user_id)
    return templates


@router.get("/templates/{template_id}", response_model=RoutineTemplateResponse)
async def get_routine_template(
    template_id: str,
    current_user: dict = Depends(validate_supabase_token),
):
    """Get a single routine template with its tasks"""
    user_id = current_user["user_id"]
    template = await db.get_routine_template(template_id)
    if not template or template.get('user_id') != user_id:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.post("/templates", response_model=RoutineTemplateResponse, status_code=201)
async def create_routine_template(
    template: RoutineTemplateCreate,
    current_user: dict = Depends(validate_supabase_token),
):
    """Create a routine template, optionally with tasks"""
    user_id = current_user["user_id"]
    template_data = {
        'id': str(uuid.uuid4()),
        'user_id': user_id,
        'name': template.name,
        'description': template.description,
        'icon': template.icon,
        'is_active': True,
    }

    result = await db.create_routine_template(template_data)
    if not result:
        raise HTTPException(status_code=500, detail="Failed to create template")

    # Create associated tasks if provided
    created_tasks = []
    if template.tasks:
        for task in template.tasks:
            task_data = task.model_dump()
            task_data['user_id'] = user_id
            task_data['id'] = str(uuid.uuid4())
            task_data['is_active'] = True
            task_data['routine_template_id'] = result['id']
            if not task_data.get('start_date'):
                task_data['start_date'] = str(date_type.today())
            created = await db.create_recurring_task(task_data)
            if created:
                created_tasks.append(created)

    result['tasks'] = created_tasks
    return result


@router.put("/templates/{template_id}", response_model=RoutineTemplateResponse)
async def update_routine_template(
    template_id: str,
    updates: RoutineTemplateUpdate,
    current_user: dict = Depends(validate_supabase_token),
):
    """Update a routine template"""
    user_id = current_user["user_id"]
    existing = await db.get_routine_template(template_id)
    if not existing or existing.get('user_id') != user_id:
        raise HTTPException(status_code=404, detail="Template not found")

    update_data = updates.model_dump(exclude_none=True)
    result = await db.update_routine_template(template_id, update_data)
    if not result:
        raise HTTPException(status_code=500, detail="Failed to update template")
    
    # Re-fetch with tasks
    return await db.get_routine_template(template_id)


@router.delete("/templates/{template_id}", status_code=204)
async def delete_routine_template(
    template_id: str,
    current_user: dict = Depends(validate_supabase_token),
):
    """Delete a routine template (tasks FK set to NULL)"""
    user_id = current_user["user_id"]
    existing = await db.get_routine_template(template_id)
    if not existing or existing.get('user_id') != user_id:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete_routine_template(template_id)


# ============================================
# Apply a preset routine template
# ============================================

PRESET_TEMPLATES = {
    'morning_routine': {
        'name': 'Morning Routine',
        'description': 'Start your day right with a structured morning',
        'icon': 'sunrise',
        'tasks': [
            {'name': 'Morning Meditation', 'estimated_minutes': 10, 'cognitive_load': 'recovery', 'priority': 'high', 'recurrence_type': 'weekdays', 'preferred_time': '06:30'},
            {'name': 'Exercise / Workout', 'estimated_minutes': 30, 'cognitive_load': 'physical', 'priority': 'high', 'recurrence_type': 'weekdays', 'preferred_time': '06:45'},
            {'name': 'Healthy Breakfast', 'estimated_minutes': 20, 'cognitive_load': 'recovery', 'priority': 'medium', 'recurrence_type': 'weekdays', 'preferred_time': '07:20'},
            {'name': 'Review Today\'s Plan', 'estimated_minutes': 10, 'cognitive_load': 'light_focus', 'priority': 'high', 'recurrence_type': 'weekdays', 'preferred_time': '07:45'},
        ],
    },
    'evening_winddown': {
        'name': 'Evening Wind-down',
        'description': 'Prepare for a good night\'s sleep',
        'icon': 'moon',
        'tasks': [
            {'name': 'Daily Reflection', 'estimated_minutes': 10, 'cognitive_load': 'recovery', 'priority': 'medium', 'recurrence_type': 'daily', 'preferred_time': '21:00'},
            {'name': 'Prepare Tomorrow\'s Tasks', 'estimated_minutes': 10, 'cognitive_load': 'light_focus', 'priority': 'medium', 'recurrence_type': 'daily', 'preferred_time': '21:15'},
            {'name': 'Reading', 'estimated_minutes': 20, 'cognitive_load': 'recovery', 'priority': 'low', 'recurrence_type': 'daily', 'preferred_time': '21:30'},
        ],
    },
    'study_routine': {
        'name': 'Study Routine',
        'description': 'Consistent daily study habits',
        'icon': 'book',
        'tasks': [
            {'name': 'Review Previous Notes', 'estimated_minutes': 15, 'cognitive_load': 'light_focus', 'priority': 'high', 'recurrence_type': 'weekdays', 'preferred_time': '09:00'},
            {'name': 'Deep Study Session', 'estimated_minutes': 90, 'cognitive_load': 'deep_focus', 'priority': 'high', 'recurrence_type': 'weekdays', 'preferred_time': '09:20'},
            {'name': 'Practice Problems', 'estimated_minutes': 45, 'cognitive_load': 'deep_focus', 'priority': 'medium', 'recurrence_type': 'weekdays', 'preferred_time': '11:00'},
        ],
    },
    'fitness_routine': {
        'name': 'Fitness Routine',
        'description': 'Stay active with regular workouts',
        'icon': 'dumbbell',
        'tasks': [
            {'name': 'Warm-up / Stretching', 'estimated_minutes': 10, 'cognitive_load': 'physical', 'priority': 'high', 'recurrence_type': 'weekdays', 'preferred_time': '06:00'},
            {'name': 'Workout Session', 'estimated_minutes': 45, 'cognitive_load': 'physical', 'priority': 'high', 'recurrence_type': 'weekdays', 'preferred_time': '06:15'},
            {'name': 'Cool-down', 'estimated_minutes': 10, 'cognitive_load': 'physical', 'priority': 'medium', 'recurrence_type': 'weekdays', 'preferred_time': '07:05'},
        ],
    },
}


@router.post("/templates/apply-preset/{preset_key}", response_model=RoutineTemplateResponse, status_code=201)
async def apply_preset_template(
    preset_key: str,
    current_user: dict = Depends(validate_supabase_token),
):
    """Apply a built-in preset routine template"""
    user_id = current_user["user_id"]
    if preset_key not in PRESET_TEMPLATES:
        raise HTTPException(status_code=404, detail=f"Unknown preset: {preset_key}. Available: {list(PRESET_TEMPLATES.keys())}")

    preset = PRESET_TEMPLATES[preset_key]

    # Create the template
    template_data = {
        'id': str(uuid.uuid4()),
        'user_id': user_id,
        'name': preset['name'],
        'description': preset['description'],
        'icon': preset['icon'],
        'is_active': True,
    }
    result = await db.create_routine_template(template_data)
    if not result:
        raise HTTPException(status_code=500, detail="Failed to create template")

    # Create the tasks
    created_tasks = []
    for task_def in preset['tasks']:
        days = [1, 2, 3, 4, 5]  # default weekdays
        rt = task_def.get('recurrence_type', 'weekdays')
        if rt == 'daily':
            days = [0, 1, 2, 3, 4, 5, 6]
        elif rt == 'weekends':
            days = [0, 6]

        task_data = {
            'id': str(uuid.uuid4()),
            'user_id': user_id,
            'name': task_def['name'],
            'estimated_minutes': task_def['estimated_minutes'],
            'cognitive_load': task_def.get('cognitive_load', 'light_focus'),
            'priority': task_def.get('priority', 'medium'),
            'flexibility': 'fixed' if task_def.get('preferred_time') else 'flexible',
            'recurrence_type': rt,
            'days_of_week': days,
            'preferred_time': task_def.get('preferred_time'),
            'is_active': True,
            'start_date': str(date_type.today()),
            'routine_template_id': result['id'],
        }
        created = await db.create_recurring_task(task_data)
        if created:
            created_tasks.append(created)

    result['tasks'] = created_tasks
    return result


@router.get("/presets")
async def list_presets():
    """List available preset routine templates"""
    return {
        key: {
            'name': val['name'],
            'description': val['description'],
            'icon': val['icon'],
            'task_count': len(val['tasks']),
            'tasks_preview': [t['name'] for t in val['tasks']],
        }
        for key, val in PRESET_TEMPLATES.items()
    }
