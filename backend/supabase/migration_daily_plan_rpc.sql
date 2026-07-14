-- Migration: transactional replace of a daily plan's planned tasks
-- ------------------------------------------------------------------
-- save_daily_plan previously deleted a plan's planned_tasks and then inserted
-- the new set in two separate requests. If the insert failed (or the process
-- died between them), the plan was left with its tasks deleted and none
-- inserted — silent data loss. This function does both in ONE transaction
-- (a plpgsql function body is atomic), so a failure rolls the delete back.
--
-- Prerequisite: run migration_cognitive_load_unify.sql first (this function
-- casts to the unified cognitive_load enum).
--
-- Run once in the Supabase SQL editor.

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
        rationale, sort_order, created_at, updated_at
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
        COALESCE((t->>'updated_at')::timestamptz, NOW())
    FROM jsonb_array_elements(COALESCE(p_tasks, '[]'::jsonb)) AS t
    RETURNING *;
END;
$$;

-- The backend calls this with the service_role key; grant execute explicitly.
GRANT EXECUTE ON FUNCTION replace_planned_tasks(uuid, jsonb) TO service_role;
