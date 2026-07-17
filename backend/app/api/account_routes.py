"""
Account routes: GDPR data export (right to portability) and account deletion
(right to erasure).

Deletion leans on the schema: every user-scoped table references
auth.users(id) ON DELETE CASCADE, so removing the Supabase auth user removes all
of their rows. That keeps deletion atomic instead of a best-effort table sweep
that silently leaves orphans behind.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime
import structlog

from app.core.security import validate_supabase_token
from app.core.database import db

router = APIRouter(prefix="/account", tags=["Account"])

logger = structlog.get_logger()

# Tables keyed directly by user_id. Operational/device rows are intentionally
# excluded: they aren't portable user content and leak nothing useful.
#   - user_fcm_tokens     → device push credentials
#   - notification_log    → delivery bookkeeping
#   - active_focus_timers → transient timer state
USER_TABLES = [
    # Profile & settings
    "energy_profiles",
    "sleep_schedules",
    "user_preferences",
    "commitments",
    "user_onboarding",
    "focus_settings",
    "sleep_goals",
    "notification_preferences",
    # Content
    "tasks",
    "backlog_items",
    "recurring_tasks",
    # Logs & history
    "daily_logs",
    "focus_sessions",
    "sleep_entries",
    "daily_stats",
    "task_status_history",
    "user_patterns",
]

# Tables exported with their children embedded, so the export mirrors how the
# data is actually structured rather than forcing the reader to re-join it.
NESTED_TABLES = {
    "projects": "*, project_subtasks(*)",
    "daily_plans": "*, planned_tasks(*)",
}


@router.get("/export")
async def export_account_data(
    current_user: dict = Depends(validate_supabase_token),
):
    """Return everything we hold for this user as one JSON document.

    A per-table failure is recorded rather than aborting the whole export — a
    partial export with an explicit error beats a 500 and no data at all.
    """
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not configured",
        )

    user_id = current_user["user_id"]
    data: dict = {}
    errors: dict = {}

    for table in USER_TABLES:
        try:
            rows = db.client.table(table).select("*").eq("user_id", user_id).execute().data
            data[table] = rows or []
        except Exception as e:
            logger.warning("export_table_failed", table=table, error=str(e))
            errors[table] = str(e)
            data[table] = []

    for table, select in NESTED_TABLES.items():
        try:
            rows = db.client.table(table).select(select).eq("user_id", user_id).execute().data
            data[table] = rows or []
        except Exception as e:
            logger.warning("export_table_failed", table=table, error=str(e))
            errors[table] = str(e)
            data[table] = []

    logger.info("account_exported", user_id=user_id, tables=len(data))

    export = {
        "export_version": 1,
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "user": {
            "id": user_id,
            "email": current_user.get("email"),
        },
        "data": data,
    }
    if errors:
        export["partial_errors"] = errors
    return export


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    current_user: dict = Depends(validate_supabase_token),
):
    """Permanently delete the caller's account and all of their data.

    Deleting the Supabase auth user cascades to every user-scoped table (all of
    them declare ON DELETE CASCADE against auth.users), so this is a single
    irreversible operation rather than a partial sweep.
    """
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database not configured",
        )

    user_id = current_user["user_id"]
    try:
        db.client.auth.admin.delete_user(user_id)
    except Exception as e:
        logger.error("account_delete_failed", user_id=user_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete account. Please try again or contact support.",
        )

    logger.info("account_deleted", user_id=user_id)
    return None
