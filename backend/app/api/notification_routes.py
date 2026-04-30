from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.security import get_current_user
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["Notifications"])


class TokenRegistration(BaseModel):
    token: str


class NotificationPayload(BaseModel):
    token: str
    title: str
    body: str


@router.post("/register")
async def register_fcm_token(
    payload: TokenRegistration,
    current_user: dict = Depends(get_current_user),
):
    """Register a Firebase Cloud Messaging token for the current user"""
    # In production, save token to database associated with user
    success = await notification_service.subscribe_to_topic(
        payload.token, f"user_{current_user['user_id']}"
    )
    
    return {
        "message": "Token registered" if success else "Failed to register token",
        "success": success,
    }


@router.post("/send")
async def send_notification(
    payload: NotificationPayload,
    current_user: dict = Depends(get_current_user),
):
    """Send a push notification (admin/testing endpoint)"""
    success = await notification_service.send_notification(
        token=payload.token,
        title=payload.title,
        body=payload.body,
    )
    
    return {
        "message": "Notification sent" if success else "Failed to send notification",
        "success": success,
    }


@router.post("/task-reminder")
async def send_task_reminder(
    token: str,
    task_name: str,
    scheduled_time: str,
    current_user: dict = Depends(get_current_user),
):
    """Send a task reminder notification"""
    success = await notification_service.send_task_reminder(
        token=token,
        task_name=task_name,
        scheduled_time=scheduled_time,
    )
    
    return {"success": success}


@router.post("/break-reminder")
async def send_break_reminder(
    token: str,
    current_user: dict = Depends(get_current_user),
):
    """Send a break reminder notification"""
    success = await notification_service.send_break_reminder(token=token)
    return {"success": success}


@router.post("/sleep-warning")
async def send_sleep_warning(
    token: str,
    minutes_until_wind_down: int,
    current_user: dict = Depends(get_current_user),
):
    """Send a sleep warning notification"""
    success = await notification_service.send_sleep_warning(
        token=token,
        minutes_until_wind_down=minutes_until_wind_down,
    )
    return {"success": success}


@router.get("/scheduled")
async def get_scheduled_notifications(
    current_user: dict = Depends(get_current_user),
):
    """Get all scheduled notifications for the current user"""
    # This would query the database for scheduled notifications
    return {"notifications": []}


@router.delete("/{notification_id}")
async def cancel_notification(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Cancel a scheduled notification"""
    # This would delete the notification from the database
    return {"message": "Notification cancelled", "id": notification_id}
