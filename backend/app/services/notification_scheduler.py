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


async def _process_user_task_reminders(user_id: str, dry_run: bool = False) -> dict:
    """Evaluate (and, unless dry_run, send) this user's due task reminders.

    Returns a diagnostic report describing what it saw and did — the scheduler
    ignores the return value; the debug endpoint uses it.
    """
    report: dict = {"user_id": user_id, "reason": None, "tasks": []}
    prefs = await db.get_notification_preferences(user_id) or {}
    report["enabled"] = bool(prefs.get("enabled", True))
    report["task_reminders_pref"] = bool(prefs.get("task_reminders", True))
    if not prefs.get("enabled", True) or not prefs.get("task_reminders", True):
        report["reason"] = "notifications or task-reminders turned off in preferences"
        return report

    tz = _user_tz(prefs)
    minutes_before = int(prefs.get("reminder_minutes_before", 15))
    now_local = datetime.now(tz)
    today = now_local.date()
    today_str = today.isoformat()
    yesterday_str = (today - timedelta(days=1)).isoformat()
    report.update({
        "timezone": str(tz),
        "now_local": now_local.strftime("%Y-%m-%d %H:%M:%S"),
        "today": today_str,
        "reminder_minutes_before": minutes_before,
    })

    # Scan today's AND yesterday's plans. Each task carries its own real date
    # (scheduled_date); yesterday's plan can still hold a task whose real date is
    # today (an AI-planned post-midnight block saved on the previous evening's
    # plan), so both are needed. No timezone/sleep guessing — the date is stored.
    plans = []
    for d in (today_str, yesterday_str):
        p = await db.get_daily_plan(user_id, d)
        if p:
            plans.append((d, p.get("planned_tasks") or []))
    if not plans:
        report["reason"] = f"no daily plan for {today_str} or {yesterday_str}"
        return report
    report["task_count"] = sum(len(ts) for _, ts in plans)
    fire_window = timedelta(minutes=5)

    for plan_date_str, tasks in plans:
        plan_date = date.fromisoformat(plan_date_str[:10])
        for t in tasks:
            start_str = t.get("scheduled_start")
            status = (t.get("status") or "").lower()
            entry: dict = {
                "name": t.get("name"),
                "plan_date": plan_date_str,
                "scheduled_start": start_str,
                "status": status,
            }
            if not start_str:
                entry["skipped"] = "no scheduled_start"
                report["tasks"].append(entry)
                continue
            if status in ("completed", "skipped", "cancelled"):
                entry["skipped"] = f"status={status}"
                report["tasks"].append(entry)
                continue
            # Auto-generated breaks lose their is_break flag on save (no column),
            # so match by name — a user shouldn't get "Up next: Break (15 min)".
            name = t.get("name") or ""
            if name.startswith("Break (") and name.endswith(" min)"):
                entry["skipped"] = "auto-break"
                report["tasks"].append(entry)
                continue
            start_t = _parse_hhmm(start_str[:5])
            if not start_t:
                entry["skipped"] = "unparseable start time"
                report["tasks"].append(entry)
                continue

            # The task's real instant is unambiguous: its own scheduled_date
            # (falling back to the plan date for older rows / manual tasks whose
            # plan date already IS their real date) at scheduled_start. No guessing.
            eff_date = t.get("scheduled_date") or plan_date_str
            try:
                real_date = date.fromisoformat(str(eff_date)[:10])
            except ValueError:
                real_date = plan_date
            start_dt = tz.localize(datetime.combine(real_date, start_t))

            in_pre = in_now = False
            for cand in (start_dt,):
                fire_at = cand - timedelta(minutes=minutes_before)
                if minutes_before > 0 and fire_at <= now_local < fire_at + fire_window:
                    in_pre = True
                if cand <= now_local < cand + fire_window:
                    in_now = True
            entry.update({
                "resolved_instant": start_dt.strftime("%Y-%m-%d %H:%M"),
                "in_pre_window": in_pre,
                "in_now_window": in_now,
            })

            # Dedupe on the task's real date so it fires at most once, even if it
            # surfaces in both the today and yesterday plan scans.
            real_date_key = real_date.isoformat()

            # 1) "Starts in X minutes" reminder
            if in_pre:
                dedupe = f"task_reminder:{t['id']}:{real_date_key}"
                if dry_run:
                    entry["pre_already_sent"] = await db.has_sent_notification(user_id, dedupe)
                    entry["would_send_pre"] = True
                else:
                    entry["sent_pre"] = await notification_service.send_to_user(
                        user_id=user_id,
                        title=f"Up next: {t.get('name', 'Task')}",
                        body=f"Starts in {minutes_before} min ({start_str[:5]})",
                        notif_type="task_reminder",
                        data={"task_id": str(t.get("id", "")), "url": "/app/schedule"},
                        dedupe_key=dedupe,
                    )

            # 2) "Scheduled now" reminder at exact start time
            if in_now:
                dedupe_now = f"task_start:{t['id']}:{real_date_key}"
                task_name = t.get("name", "Task")
                if dry_run:
                    entry["now_already_sent"] = await db.has_sent_notification(user_id, dedupe_now)
                    entry["would_send_now"] = True
                else:
                    entry["sent_now"] = await notification_service.send_to_user(
                        user_id=user_id,
                        title=f"Now: {task_name}",
                        body=f'You have "{task_name}" scheduled now.',
                        notif_type="task_reminder",
                        data={"task_id": str(t.get("id", "")), "url": "/app/schedule", "event": "task_start"},
                        dedupe_key=dedupe_now,
                    )
            report["tasks"].append(entry)

    return report


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


async def _within(now_local: datetime, target: dtime, window_min: int = 15) -> bool:
    # Window is wider than the 5-min tick interval so a single dropped/slow tick
    # (restart, load spike) still catches the target on a later tick. Per-day
    # dedupe in send_to_user prevents this from ever double-firing.
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
                # Only roll to tomorrow once today's wind-down is past the catch-up
                # window; otherwise a 11–15-min-late tick would skip today.
                if fire_at < now_local - timedelta(minutes=15):
                    fire_at += timedelta(days=1)
                # 15-min catch-up window (dedupe prevents double-fire).
                if 0 <= (now_local - fire_at).total_seconds() < 15 * 60:
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


def scheduler_status() -> dict:
    """Introspect the background scheduler for diagnostics."""
    if _scheduler is None:
        return {
            "running": False,
            "reason": "scheduler not started (NOTIFICATIONS_ENABLED false, or startup raised)",
            "jobs": [],
        }
    jobs = [
        {
            "id": j.id,
            "next_run": j.next_run_time.isoformat() if j.next_run_time else None,
        }
        for j in _scheduler.get_jobs()
    ]
    return {"running": bool(getattr(_scheduler, "running", False)), "jobs": jobs}


def stop_scheduler():
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("notification scheduler stopped")
