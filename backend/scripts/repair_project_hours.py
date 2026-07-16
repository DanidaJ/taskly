"""One-off repair for project hours drifted by the pre-fix re-save bug.

Recomputes each project's `hours_completed` from the true window of its
completed linked planned tasks, fixes each linked task's `logged_hours` to match,
and re-marks subtasks completed where a completed task points at them.

Idempotent — safe to run more than once. Run from the backend dir:

    PYTHONPATH=. python scripts/repair_project_hours.py
"""
import asyncio

from app.core.database import db
from app.api.plan_routes import _task_window_hours


async def main():
    if db is None:
        print("No database configured — nothing to repair.")
        return

    projects = (db.client.table("projects").select("id, name, hours_completed").execute().data) or []
    print(f"Repairing {len(projects)} project(s)…\n")

    for p in projects:
        tasks = (
            db.client.table("planned_tasks")
            .select(
                "id, status, scheduled_start, scheduled_end, actual_start, "
                "actual_end, project_subtask_id, logged_hours"
            )
            .eq("project_id", p["id"])
            .execute()
            .data
        ) or []

        total = 0.0
        completed_subtasks = set()
        for t in tasks:
            completed = str(t.get("status")) == "completed"
            want = round(_task_window_hours(t), 2) if completed else 0.0
            if completed:
                total += want
                if t.get("project_subtask_id"):
                    completed_subtasks.add(t["project_subtask_id"])
            # Repair the per-task ledger value if it drifted.
            if round(float(t.get("logged_hours") or 0), 2) != want:
                db.client.table("planned_tasks").update({"logged_hours": want}).eq("id", t["id"]).execute()

        total = round(total, 2)
        old = round(float(p.get("hours_completed") or 0), 2)
        if old != total:
            db.client.table("projects").update({"hours_completed": total}).eq("id", p["id"]).execute()
            print(f"  {p.get('name')!r}: {old}h -> {total}h  ({len(tasks)} linked task(s))")
        else:
            print(f"  {p.get('name')!r}: {total}h (unchanged)")

        # Re-mark subtasks that a completed task advanced.
        for sid in completed_subtasks:
            db.client.table("project_subtasks").update({"status": "completed"}).eq("id", sid).execute()

    print("\nDone.")


if __name__ == "__main__":
    asyncio.run(main())
