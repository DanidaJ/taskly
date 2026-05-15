"""Manual notification trigger helper for fast local testing.

Usage:
  python test_notifications_trigger.py --token "<JWT>" --task-name "Write report" --mode both

Modes:
  - prestart: sends only "starts in X min" style notification
  - start: sends only "scheduled now" style notification
  - both: sends both notifications back-to-back

This calls NotificationService.send_to_user(), so it respects your stored
preferences and token registration. By default, quiet hours are respected.
Use --ignore-quiet-hours for pure delivery testing.
"""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime
from jose import jwt

from app.services.notification_service import notification_service
from app.core.database import db


def _extract_user_id(token: str) -> str:
    payload = jwt.decode(
        token,
        key="",
        options={
            "verify_signature": False,
            "verify_exp": False,
            "verify_aud": False,
        },
    )
    user_id = payload.get("sub")
    if not user_id:
        raise ValueError("JWT does not contain 'sub' user id")
    return str(user_id)


async def _send(
    user_id: str,
    task_name: str,
    minutes_before: int,
    mode: str,
    respect_quiet_hours: bool,
    delay_seconds: int,
) -> int:
    sent_total = 0
    now_hhmm = datetime.now().strftime("%H:%M")

    tokens = await db.get_fcm_tokens_for_user(user_id) if db is not None else []
    print(f"registered_tokens={len(tokens)}")

    if mode in ("prestart", "both"):
        sent = await notification_service.send_to_user(
            user_id=user_id,
            title=f"Up next: {task_name}",
            body=f"Starts in {minutes_before} min ({now_hhmm})",
            notif_type="task_reminder",
            data={
                "task_id": "manual-test-task",
                "event": "task_prestart",
                "url": "/app/schedule",
            },
            respect_quiet_hours=respect_quiet_hours,
            dedupe_key=f"manual_prestart:{datetime.utcnow().isoformat()}",
        )
        print(f"prestart delivered_to={sent}")
        sent_total += sent

        if mode == "both" and delay_seconds > 0:
            await asyncio.sleep(delay_seconds)

    if mode in ("start", "both"):
        sent = await notification_service.send_to_user(
            user_id=user_id,
            title=f"Now: {task_name}",
            body=f'You have "{task_name}" scheduled now.',
            notif_type="task_reminder",
            data={
                "task_id": "manual-test-task",
                "event": "task_start",
                "url": "/app/schedule",
            },
            respect_quiet_hours=respect_quiet_hours,
            dedupe_key=f"manual_start:{datetime.utcnow().isoformat()}",
        )
        print(f"start delivered_to={sent}")
        sent_total += sent

    return sent_total


def main() -> int:
    parser = argparse.ArgumentParser(description="Manual trigger for task notifications")
    parser.add_argument("--token", required=True, help="JWT access token from app localStorage")
    parser.add_argument("--task-name", default="Test Task", help="Task name used in notification text")
    parser.add_argument(
        "--mode",
        choices=["prestart", "start", "both"],
        default="both",
        help="Which notification style to send",
    )
    parser.add_argument(
        "--minutes-before",
        type=int,
        default=15,
        help="Used in prestart message text",
    )
    parser.add_argument(
        "--ignore-quiet-hours",
        action="store_true",
        help="Ignore quiet hours for delivery testing",
    )
    parser.add_argument(
        "--delay-seconds",
        type=int,
        default=0,
        help="When mode=both, wait this many seconds before sending the start-notification",
    )

    args = parser.parse_args()

    try:
        user_id = _extract_user_id(args.token)
    except Exception as exc:
        print(f"Failed to parse JWT user id: {exc}")
        return 2

    print(f"user_id={user_id}")
    sent_total = asyncio.run(
        _send(
            user_id=user_id,
            task_name=args.task_name,
            minutes_before=max(0, args.minutes_before),
            mode=args.mode,
            respect_quiet_hours=not args.ignore_quiet_hours,
            delay_seconds=max(0, args.delay_seconds),
        )
    )

    if sent_total == 0:
        print("No notifications delivered. Check: token registration, prefs, quiet hours, firebase init.")
        return 1

    print(f"done delivered_total={sent_total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
