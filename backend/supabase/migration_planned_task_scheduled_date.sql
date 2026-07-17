-- Migration: give each planned task its own real calendar date.
-- ------------------------------------------------------------------
-- Tasks stored only HH:MM against a plan's date, but a plan's date is not always
-- the task's real calendar date (the AI plans a "day" that, for a night owl,
-- runs past midnight, so a 01:00 task gets saved on the previous evening's plan).
-- That mismatch forced fragile "does this small-hours time belong to tomorrow?"
-- guessing in the reminder + missed-detection code.
--
-- scheduled_date removes the ambiguity: it IS the calendar date the task occurs.
-- NULL means "same as the plan's date" (the default for manual tasks, whose plan
-- date already equals their real date). The AI scheduler stamps it explicitly.
--
-- Run once in the Supabase SQL editor.

ALTER TABLE planned_tasks
    ADD COLUMN IF NOT EXISTS scheduled_date DATE;

-- ---------------------------------------------------------------------------
-- Keep the transactional replace RPC in sync (carry scheduled_date through a
-- plan re-save). Mirrors migration_planned_task_project_link.sql, + one column.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION replace_planned_tasks(p_plan_id uuid, p_tasks jsonb)
RETURNS SETOF planned_tasks
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM planned_tasks WHERE plan_id = p_plan_id;

    RETURN QUERY
    INSERT INTO planned_tasks (
        id, plan_id, task_id, recurring_task_id, name,
        scheduled_start, scheduled_end, estimated_minutes,
        cognitive_load, priority, status, flexibility,
        rationale, sort_order, created_at, updated_at,
        project_id, project_subtask_id, logged_hours,
        scheduled_date
    )
    SELECT
        COALESCE(NULLIF(t->>'id', '')::uuid, uuid_generate_v4()),
        p_plan_id,
        NULLIF(t->>'task_id', '')::uuid,
        NULLIF(t->>'recurring_task_id', '')::uuid,
        t->>'name',
        NULLIF(t->>'scheduled_start', '')::time,
        NULLIF(t->>'scheduled_end', '')::time,
        COALESCE((t->>'estimated_minutes')::int, 30),
        COALESCE(NULLIF(t->>'cognitive_load', '')::cognitive_load, 'light_focus'),
        COALESCE(NULLIF(t->>'priority', '')::priority_level, 'should_do'),
        COALESCE(NULLIF(t->>'status', '')::task_status, 'not_started'),
        COALESCE(NULLIF(t->>'flexibility', '')::task_flexibility, 'flexible'),
        t->>'rationale',
        COALESCE((t->>'sort_order')::int, 0),
        COALESCE((t->>'created_at')::timestamptz, NOW()),
        COALESCE((t->>'updated_at')::timestamptz, NOW()),
        NULLIF(t->>'project_id', '')::uuid,
        NULLIF(t->>'project_subtask_id', '')::uuid,
        COALESCE((t->>'logged_hours')::numeric, 0),
        NULLIF(t->>'scheduled_date', '')::date
    FROM jsonb_array_elements(COALESCE(p_tasks, '[]'::jsonb)) AS t
    RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION replace_planned_tasks(uuid, jsonb) TO service_role;
