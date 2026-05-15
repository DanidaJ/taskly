"""Notification scheduler — APScheduler jobs that send FCM pushes server-side.

Runs three kinds of jobs:
  1. A frequent "reminder tick" (every minute) that scans the next ~120 minutes
     of planned tasks across all users-with-tokens and sends task reminders at
     the right moment. Idempotency guarded by notification_log.
  2. A "daily tick" (every 5 minutes) that fires daily-summary, sleep-warning,
     and reflection-reminder when the user's local time matches their config.
  3. (Optional) A break reminder tick — disabled by default, opt-in via env.

Failures in scheduler jobs are caught and logged so the loop never dies.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, date, timedelta, time as dtime
from typing import Optional

import pytz
import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core.config import settings
from app.core.database import db
from app.services.notification_service import notification_service

logger = structlog.get_logger()

_scheduler: Optional[AsyncIOScheduler] = None


def _parse_hhmm(s: str) -> Optional[dtime]:
    try:
        h, m = s.split(":")
        return dtime(int(h), int(m))
    except Exception:
        return None


def _user_tz(prefs: dict) -> pytz.BaseTzInfo:
    tzname = (prefs or {}).get("timezone") or settings.notifications_default_timezone
    try:
        return pytz.timezone(tzname)
    except Exception:
        return pytz.UTC


# ---------------------------------------------------------------------------
# Job 1: Task reminder tick
# ---------------------------------------------------------------------------
async def task_reminder_tick():
    if db is None:
        return
    try:
        user_ids = await db.get_all_users_with_tokens()
    except Exception as e:
        logger.warning("scheduler: failed listing users", error=str(e))
        return

    for user_id in user_ids:
        try:
            await _process_user_task_reminders(user_id)
        except Exception as e:
            logger.warning("scheduler: task reminder failed", user_id=user_id, error=str(e))


async def _process_user_task_reminders(user_id: str):
    prefs = await db.get_notification_preferences(user_id) or {}
    if not prefs.get("enabled", True) or not prefs.get("task_reminders", True):
        return

    tz = _user_tz(prefs)
    minutes_before = int(prefs.get("reminder_minutes_before", 15))
    now_local = datetime.now(tz)
    today_str = now_local.date().isoformat()

    plan = await db.get_daily_plan(user_id, today_str)
    if not plan:
        return
    tasks = plan.get("planned_tasks") or []
    fire_window = timedelta(minutes=5)

    for t in tasks:
        start_str = t.get("scheduled_start")
        if not start_str:
            continue
        if (t.get("status") or "").lower() in ("completed", "skipped", "cancelled"):
            continue
        start_t = _parse_hhmm(start_str[:5])
        if not start_t:
            continue
        start_dt = tz.localize(datetime.combine(now_local.date(), start_t))

        # 1) "Starts in X minutes" reminder
        fire_at = start_dt - timedelta(minutes=minutes_before)
        # Fire window: [fire_at, fire_at + 5m)
        if minutes_before > 0 and fire_at <= now_local < fire_at + fire_window:
            dedupe = f"task_reminder:{t['id']}:{today_str}"
            await notification_service.send_to_user(
                user_id=user_id,
                title=f"Up next: {t.get('name', 'Task')}",
                body=f"Starts in {minutes_before} min ({start_str[:5]})",
                notif_type="task_reminder",
                data={
                    "task_id": str(t.get("id", "")),
                    "url": "/app/schedule",
                },
                dedupe_key=dedupe,
            )

        # 2) "Scheduled now" reminder at exact start time
        if start_dt <= now_local < start_dt + fire_window:
            dedupe_now = f"task_start:{t['id']}:{today_str}"
            task_name = t.get("name", "Task")
            await notification_service.send_to_user(
                user_id=user_id,
                title=f"Now: {task_name}",
                body=f'You have "{task_name}" scheduled now.',
                notif_type="task_reminder",
                data={
                    "task_id": str(t.get("id", "")),
                    "url": "/app/schedule",
                    "event": "task_start",
                },
                dedupe_key=dedupe_now,
            )


# ---------------------------------------------------------------------------
# Job 2: Daily-time tick (summary, reflection, sleep warning)
# ---------------------------------------------------------------------------
async def daily_time_tick():
    if db is None:
        return
    try:
        user_ids = await db.get_all_users_with_tokens()
    except Exception as e:
        logger.warning("scheduler: failed listing users", error=str(e))
        return

    for user_id in user_ids:
        try:
            await _process_user_daily(user_id)
        except Exception as e:
            logger.warning("scheduler: daily tick failed", user_id=user_id, error=str(e))


async def _within(now_local: datetime, target: dtime, window_min: int = 5) -> bool:
    target_dt = now_local.replace(hour=target.hour, minute=target.minute, second=0, microsecond=0)
    return 0 <= (now_local - target_dt).total_seconds() < window_min * 60


async def _process_user_daily(user_id: str):
    prefs = await db.get_notification_preferences(user_id) or {}
    if not prefs.get("enabled", True):
        return
    tz = _user_tz(prefs)
    now_local = datetime.now(tz)
    today_str = now_local.date().isoformat()

    # --- Daily summary ---
    if prefs.get("daily_summary", True):
        target = _parse_hhmm(prefs.get("daily_summary_time", "20:00"))
        if target and await _within(now_local, target):
            plan = await db.get_daily_plan(user_id, today_str)
            tasks = (plan or {}).get("planned_tasks") or []
            total = len(tasks)
            done = sum(1 for t in tasks if (t.get("status") or "").lower() == "completed")
            if total > 0:
                pct = int(done / total * 100)
                emoji = "🎉" if pct >= 80 else "👍" if pct >= 50 else "💪"
                await notification_service.send_to_user(
                    user_id=user_id,
                    title=f"Daily summary {emoji}",
                    body=f"You completed {done}/{total} tasks today ({pct}%).",
                    notif_type="daily_summary",
                    data={"url": "/app/reflection"},
                    dedupe_key=f"daily_summary:{today_str}",
                )

    # --- Reflection reminder ---
    if prefs.get("reflection_reminder", True):
        target = _parse_hhmm(prefs.get("reflection_time", "20:30"))
        if target and await _within(now_local, target):
            await notification_service.send_to_user(
                user_id=user_id,
                title="Reflection time 📝",
                body="Take a few minutes to reflect on your day.",
                notif_type="reflection_reminder",
                data={"url": "/app/reflection"},
                dedupe_key=f"reflection:{today_str}",
            )

    # --- Sleep wind-down warning ---
    if prefs.get("sleep_warning", True):
        try:
            sleep_row = await db.get_sleep_schedule(user_id)
        except Exception:
            sleep_row = None
        if sleep_row and sleep_row.get("sleep_time"):
            sleep_t = _parse_hhmm(str(sleep_row["sleep_time"])[:5])
            wind_down_min = int(sleep_row.get("wind_down_minutes") or 30)
            if sleep_t:
                # Notify wind_down_min before sleep_time
                sleep_dt = now_local.replace(
                    hour=sleep_t.hour, minute=sleep_t.minute, second=0, microsecond=0
                )
                fire_at = sleep_dt - timedelta(minutes=wind_down_min)
                # If sleep_time appears earlier than now (e.g. past midnight setting),
                # try tomorrow's wind-down
                if fire_at < now_local - timedelta(minutes=10):
                    fire_at += timedelta(days=1)
                if 0 <= (now_local - fire_at).total_seconds() < 5 * 60:
                    await notification_service.send_to_user(
                        user_id=user_id,
                        title="Wind-down time 🌙",
                        body=f"Start winding down in {wind_down_min} min for better sleep.",
                        notif_type="sleep_warning",
                        data={"url": "/app/sleep"},
                        dedupe_key=f"sleep_warning:{today_str}",
                    )


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------
def start_scheduler():
    global _scheduler
    if _scheduler is not None:
        return
    if not settings.notifications_enabled:
        logger.info("notification scheduler disabled via settings")
        return
    _scheduler = AsyncIOScheduler(timezone=pytz.UTC)
    _scheduler.add_job(task_reminder_tick, "interval", minutes=1, id="task_reminder_tick", coalesce=True, max_instances=1)
    _scheduler.add_job(daily_time_tick, "interval", minutes=5, id="daily_time_tick", coalesce=True, max_instances=1)
    _scheduler.start()
    logger.info("notification scheduler started")


def stop_scheduler():
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("notification scheduler stopped")
