-- Migration: Durable active focus timer state (cross-device + restart-safe)
-- Run this in Supabase SQL editor after prior sync/user-settings migrations.

CREATE TABLE IF NOT EXISTS active_focus_timers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    mode VARCHAR(20) NOT NULL DEFAULT 'focus',
    task_id TEXT,
    task_name TEXT,
    task_date DATE,
    is_running BOOLEAN NOT NULL DEFAULT false,
    remaining_seconds INTEGER NOT NULL DEFAULT 0 CHECK (remaining_seconds >= 0),
    total_seconds INTEGER NOT NULL DEFAULT 0 CHECK (total_seconds >= 0),
    started_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT active_focus_timers_mode_check CHECK (mode IN ('focus', 'shortBreak', 'longBreak'))
);

CREATE INDEX IF NOT EXISTS idx_active_focus_timers_user_id ON active_focus_timers(user_id);

ALTER TABLE active_focus_timers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own active timer" ON active_focus_timers;
CREATE POLICY "Users can view own active timer" ON active_focus_timers
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own active timer" ON active_focus_timers;
CREATE POLICY "Users can create own active timer" ON active_focus_timers
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own active timer" ON active_focus_timers;
CREATE POLICY "Users can update own active timer" ON active_focus_timers
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own active timer" ON active_focus_timers;
CREATE POLICY "Users can delete own active timer" ON active_focus_timers
    FOR DELETE USING (auth.uid() = user_id);
