from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from typing import Optional
import pytz

from app.core.config import settings
from app.core.security import validate_supabase_token
from app.core.rate_limit import limiter
from app.core.database import db
from app.services.notification_service import notification_service

router = APIRouter(prefix="/notifications", tags=["Notifications"])


# ----------------------------- Schemas ------------------------------------
class TokenRegistration(BaseModel):
    token: str
    device_hint: Optional[str] = None
    timezone: Optional[str] = None


class TokenUnregister(BaseModel):
    token: str


class NotificationPreferences(BaseModel):
    enabled: bool = True
    task_reminders: bool = True
    break_reminders: bool = True
    daily_summary: bool = True
    sleep_warning: bool = True
    reflection_reminder: bool = True
    achievement_notifications: bool = True
    reminder_minutes_before: int = Field(default=15, ge=0, le=240)
    quiet_hours_start: str = "22:00"
    quiet_hours_end: str = "08:00"
    timezone: str = "UTC"
    daily_summary_time: str = "20:00"
    reflection_time: str = "20:30"

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        try:
            pytz.timezone(value)
        except Exception as exc:
            raise ValueError("Invalid timezone. Use a valid IANA timezone like 'Asia/Colombo'.") from exc
        return value


class TestNotificationPayload(BaseModel):
    title: str = "Taskly test"
    body: str = "If you can read this, push notifications are working."


# ----------------------------- Public config ------------------------------
@router.get("/web-config")
async def get_web_firebase_config():
    """Public Firebase web config for the service worker. These values are safe
    to expose — they only identify the Firebase project, not grant any access."""
    if not settings.firebase_api_key:
        return {"configured": False}
    return {
        "configured": True,
        "apiKey": settings.firebase_api_key,
        "authDomain": settings.firebase_auth_domain,
        "projectId": settings.firebase_project_id,
        "storageBucket": settings.firebase_storage_bucket,
        "messagingSenderId": settings.firebase_messaging_sender_id,
        "appId": settings.firebase_app_id,
        "vapidKey": settings.firebase_vapid_key,
    }


# ----------------------------- Token mgmt ---------------------------------
@router.post("/register")
@limiter.limit("20/minute")
async def register_fcm_token(
    payload: TokenRegistration,
    request: Request,
    current_user: dict = Depends(validate_supabase_token),
):
    """Register or refresh an FCM token for the current user/device."""
    if db is None:
        return {"success": False, "message": "Database not configured"}
    user_agent = request.headers.get("user-agent")
    saved = await db.upsert_fcm_token(
        user_id=current_user["user_id"],
        token=payload.token,
        device_hint=payload.device_hint,
        user_agent=user_agent,
    )

    # If client provides a valid timezone, ensure preferences have one.
    # This prevents scheduler drift for users who enabled notifications but
    # never opened notification settings.
    tz_from_client = (payload.timezone or "").strip()
    if tz_from_client:
        try:
            pytz.timezone(tz_from_client)
        except Exception:
            tz_from_client = ""
    if tz_from_client:
        await db.ensure_notification_timezone(current_user["user_id"], tz_from_client)

    return {"success": bool(saved), "message": "Token registered"}


@router.post("/unregister")
@limiter.limit("20/minute")
async def unregister_fcm_token(
    payload: TokenUnregister,
    request: Request,
    current_user: dict = Depends(validate_supabase_token),
):
    """Remove an FCM token (e.g. on logout / disable notifications)."""
    if db is None:
        return {"success": False}
    await db.delete_fcm_token(payload.token)
    return {"success": True}


# ----------------------------- Preferences --------------------------------
@router.get("/preferences", response_model=NotificationPreferences)
async def get_notification_preferences(
    current_user: dict = Depends(validate_supabase_token),
):
    if db is None:
        return NotificationPreferences()
    row = await db.get_notification_preferences(current_user["user_id"])
    if not row:
        return NotificationPreferences()
    fields = NotificationPreferences.model_fields
    return NotificationPreferences(**{k: v for k, v in row.items() if k in fields})


@router.put("/preferences", response_model=NotificationPreferences)
async def update_notification_preferences(
    prefs: NotificationPreferences,
    current_user: dict = Depends(validate_supabase_token),
):
    if db is None:
        return prefs
    payload = prefs.model_dump()
    payload["user_id"] = current_user["user_id"]
    saved = await db.save_notification_preferences(payload)
    if not saved:
        raise HTTPException(status_code=500, detail="Failed to save preferences")
    fields = NotificationPreferences.model_fields
    return NotificationPreferences(**{k: v for k, v in saved.items() if k in fields})


# ----------------------------- Diagnostics --------------------------------
@router.get("/debug/reminders")
async def debug_reminders(
    send: bool = False,
    current_user: dict = Depends(validate_supabase_token),
):
    """Evaluate this user's task reminders right now and report exactly what the
    scheduler would see — timezone, today's plan, each task's fire windows, and
    whether anything is due. Read-only by default; pass ?send=true to actually
    dispatch (subject to the same quiet-hours/dedupe rules as the real tick).

    This is the manual counterpart to the every-minute background job, so you
    can repro without waiting for a wall-clock window.
    """
    from app.services.notification_scheduler import _process_user_task_reminders, scheduler_status
    from app.services.notification_service import firebase_ready

    evaluation = await _process_user_task_reminders(current_user["user_id"], dry_run=not send)
    return {
        "firebase_ready": firebase_ready(),
        "notifications_enabled_setting": settings.notifications_enabled,
        "scheduler": scheduler_status(),
        "dispatched": bool(send),
        "evaluation": evaluation,
    }


# ----------------------------- Send ---------------------------------------
@router.post("/test")
@limiter.limit("3/minute")
async def send_test_notification(
    payload: TestNotificationPayload,
    request: Request,
    current_user: dict = Depends(validate_supabase_token),
):
    """Send a test notification to all of the current user's devices."""
    sent = await notification_service.send_to_user(
        user_id=current_user["user_id"],
        title=payload.title,
        body=payload.body,
        notif_type="test",
        respect_quiet_hours=False,
    )
    return {"success": sent > 0, "delivered_to": sent}
