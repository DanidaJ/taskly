-- Migration: align user_preferences with the backend UserPreferences model
-- ------------------------------------------------------------------
-- The live user_preferences table predates the current Pydantic model, so
-- saving preferences (e.g. from the onboarding wizard) failed with
--   PGRST204: Could not find the 'dark_mode' column of 'user_preferences'
-- Add the model's columns idempotently. Older columns (theme, etc.) are left
-- in place and simply unused — harmless.
--
-- Run once in the Supabase SQL editor.

ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS manual_scheduling_allowed BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS task_clustering_enabled  BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS max_daily_workload_hours INTEGER NOT NULL DEFAULT 8;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS preferred_task_types     TEXT[]  NOT NULL DEFAULT '{deep_focus,light_focus,admin}';
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS notification_enabled     BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS dark_mode                BOOLEAN NOT NULL DEFAULT true;
