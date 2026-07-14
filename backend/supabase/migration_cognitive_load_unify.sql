-- Migration: unify the cognitive_load vocabulary
-- ------------------------------------------------------------------
-- The Postgres enum used {deep_focus, light_logic, creative, routine,
-- communication} while the API/frontend/scheduler use
-- {deep_focus, light_focus, admin, physical, recovery}. This migrates the enum
-- (and existing rows) to the single canonical app vocabulary and removes the
-- translation layer that the backend used to bridge the two.
--
-- Remap applied to existing data:
--   deep_focus    -> deep_focus
--   light_logic   -> light_focus
--   creative      -> light_focus
--   routine       -> light_focus
--   communication -> admin
--
-- Run this ONCE in the Supabase SQL editor. Safe to re-run only if it failed
-- partway (it is wrapped in a single transaction, so a failure rolls back).

BEGIN;

-- 1. Drop the view that depends on planned_tasks.cognitive_load.
DROP VIEW IF EXISTS today_plan_view;

-- 2. Rename the old enum out of the way and create the canonical one.
ALTER TYPE cognitive_load RENAME TO cognitive_load_old;
CREATE TYPE cognitive_load AS ENUM ('deep_focus', 'light_focus', 'admin', 'physical', 'recovery');

-- 3. Convert tasks.cognitive_load to the new type, remapping values.
ALTER TABLE tasks ALTER COLUMN cognitive_load DROP DEFAULT;
ALTER TABLE tasks
    ALTER COLUMN cognitive_load TYPE cognitive_load
    USING (
        CASE cognitive_load::text
            WHEN 'deep_focus'    THEN 'deep_focus'
            WHEN 'light_logic'   THEN 'light_focus'
            WHEN 'creative'      THEN 'light_focus'
            WHEN 'routine'       THEN 'light_focus'
            WHEN 'communication' THEN 'admin'
            ELSE 'light_focus'
        END::cognitive_load
    );
ALTER TABLE tasks ALTER COLUMN cognitive_load SET DEFAULT 'light_focus';

-- 4. Same for planned_tasks.cognitive_load.
ALTER TABLE planned_tasks ALTER COLUMN cognitive_load DROP DEFAULT;
ALTER TABLE planned_tasks
    ALTER COLUMN cognitive_load TYPE cognitive_load
    USING (
        CASE cognitive_load::text
            WHEN 'deep_focus'    THEN 'deep_focus'
            WHEN 'light_logic'   THEN 'light_focus'
            WHEN 'creative'      THEN 'light_focus'
            WHEN 'routine'       THEN 'light_focus'
            WHEN 'communication' THEN 'admin'
            ELSE 'light_focus'
        END::cognitive_load
    );
ALTER TABLE planned_tasks ALTER COLUMN cognitive_load SET DEFAULT 'light_focus';

-- 5. Drop the old enum type (nothing references it now).
DROP TYPE cognitive_load_old;

-- 6. Recreate the view with its original definition.
CREATE OR REPLACE VIEW today_plan_view AS
SELECT
    dp.id AS plan_id,
    dp.user_id,
    dp.date,
    dp.is_ai_generated,
    pt.id AS task_id,
    pt.name AS task_name,
    pt.scheduled_start,
    pt.scheduled_end,
    pt.status,
    pt.cognitive_load,
    pt.priority
FROM daily_plans dp
LEFT JOIN planned_tasks pt ON dp.id = pt.plan_id
WHERE dp.date = CURRENT_DATE
ORDER BY pt.scheduled_start;

COMMIT;
