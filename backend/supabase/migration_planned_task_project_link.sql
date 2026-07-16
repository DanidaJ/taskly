-- Migration: link a planned task to a project (+ optional subtask) so completing
-- the task logs its hours to that project. Replaces the old brittle name-matching
-- with an explicit, reversible foreign-key link set manually by the user.
--
-- `logged_hours` records exactly how much this task has contributed to its
-- project so the contribution can be reversed cleanly on un-complete / delete /
-- unlink (the task row is its own ledger entry — no separate ledger table).
--
-- ON DELETE SET NULL: deleting a project/subtask unlinks tasks rather than
-- deleting them; hour reversal is handled in application code before delete.
--
-- Run once in the Supabase SQL editor.

ALTER TABLE planned_tasks
    ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS project_subtask_id uuid REFERENCES project_subtasks(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS logged_hours numeric(7,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_planned_tasks_project ON planned_tasks(project_id);

-- ---------------------------------------------------------------------------
-- Keep the transactional replace_planned_tasks RPC in sync: carry the new link
-- columns through a plan re-save so a manual link isn't silently dropped when a
-- plan's tasks are replaced. (See migration_daily_plan_rpc.sql for context.)
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
        project_id, project_subtask_id, logged_hours
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
        COALESCE((t->>'logged_hours')::numeric, 0)
    FROM jsonb_array_elements(COALESCE(p_tasks, '[]'::jsonb)) AS t
    RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION replace_planned_tasks(uuid, jsonb) TO service_role;
