"""Shared wall-clock → absolute-instant helpers.

Scheduling data stores times as bare ``HH:MM`` "wall clock" values against a
plan date (e.g. a task at ``23:00``). Deciding whether such a time is in the
past/future, or whether a window has elapsed, requires resolving it in the
*user's* timezone and handling windows that cross midnight. Doing that ad-hoc
at each call site is exactly how the "task wrongly flagged missed" class of bug
slips in — so every such resolution should go through here.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional, Tuple

import pytz


def get_tz(tz_name: Optional[str]) -> pytz.BaseTzInfo:
    """Return a tz object for an IANA name, falling back to UTC on anything odd."""
    try:
        return pytz.timezone(tz_name) if tz_name else pytz.UTC
    except Exception:
        return pytz.UTC


def user_now(tz_name: Optional[str]) -> datetime:
    """Current instant as a timezone-aware datetime in the user's timezone."""
    return datetime.now(get_tz(tz_name))


def normalize_hhmm(value) -> Optional[str]:
    """Coerce a stored time value to a canonical ``HH:MM`` string, or None.

    Handles the shapes Supabase/Postgres hand back for a TIME column: ``"23:00"``,
    ``"23:00:00"``, ``datetime.time``, and ``timedelta`` (all stringify to an
    ``H:MM[:SS]`` form). Returns None for anything unparseable.
    """
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    parts = s.split(":")
    if len(parts) < 2:
        return None
    try:
        h, m = int(parts[0]), int(parts[1])
    except ValueError:
        return None
    if not (0 <= h <= 23 and 0 <= m <= 59):
        return None
    return f"{h:02d}:{m:02d}"


def resolve_wall_time(plan_date, hhmm, tz_name: Optional[str]) -> Optional[datetime]:
    """Resolve a bare ``HH:MM`` on ``plan_date`` to an aware datetime in ``tz``.

    ``plan_date`` may be a ``YYYY-MM-DD`` string or a date object. Returns None
    if either input is missing/unparseable.
    """
    norm = normalize_hhmm(hhmm)
    if not norm:
        return None
    if hasattr(plan_date, "isoformat"):
        plan_date = plan_date.isoformat()
    plan_date = str(plan_date)[:10]
    try:
        naive = datetime.strptime(f"{plan_date} {norm}", "%Y-%m-%d %H:%M")
    except (ValueError, TypeError):
        return None
    return get_tz(tz_name).localize(naive)


def resolve_task_window(
    plan_date, start, end, tz_name: Optional[str]
) -> Tuple[Optional[datetime], Optional[datetime]]:
    """Resolve a task's (start, end) to aware datetimes in the user's timezone.

    When the window crosses midnight (``end <= start``, e.g. ``23:00``–``01:00``),
    the end instant is rolled to the next day so it isn't judged against a time
    ~a full day in the past — the root cause of the missed-task bug.
    """
    start_dt = resolve_wall_time(plan_date, start, tz_name)
    end_dt = resolve_wall_time(plan_date, end, tz_name)
    if start_dt and end_dt and end_dt <= start_dt:
        end_dt = end_dt + timedelta(days=1)
    return start_dt, end_dt
