-- ============================================================================
-- User Settings: focus_settings, sleep_goals, user_patterns
-- Moves data that was previously frontend-only (localStorage) into the DB so
-- it persists across devices and stays consistent on refresh.
-- Apply via Supabase SQL editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) focus_settings: per-user Pomodoro / timer configuration.
--    One row per user. Replaces localStorage 'planiq-focus-settings'.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS focus_settings (
    user_id UUID PRIMARY KEY,
    focus_duration INTEGER NOT NULL DEFAULT 25,            -- minutes
    short_break_duration INTEGER NOT NULL DEFAULT 5,        -- minutes
    long_break_duration INTEGER NOT NULL DEFAULT 15,        -- minutes
    sessions_before_long_break INTEGER NOT NULL DEFAULT 4,
    auto_start_breaks BOOLEAN NOT NULL DEFAULT FALSE,
    auto_start_focus BOOLEAN NOT NULL DEFAULT FALSE,
    sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE focus_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own focus settings" ON focus_settings;
CREATE POLICY "Users can view their own focus settings" ON focus_settings
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own focus settings" ON focus_settings;
CREATE POLICY "Users can manage their own focus settings" ON focus_settings
    FOR ALL USING (auth.uid() = user_id);


-- ----------------------------------------------------------------------------
-- 2) sleep_goals: per-user sleep tracking targets (separate from
--    sleep_schedules, which is the "actual" schedule used by the AI planner).
--    Replaces localStorage 'planiq-sleep-goal'.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sleep_goals (
    user_id UUID PRIMARY KEY,
    target_bedtime TEXT NOT NULL DEFAULT '22:30',           -- HH:MM
    target_wake_time TEXT NOT NULL DEFAULT '06:30',         -- HH:MM
    target_duration_hours NUMERIC(3,1) NOT NULL DEFAULT 8.0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE sleep_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own sleep goals" ON sleep_goals;
CREATE POLICY "Users can view their own sleep goals" ON sleep_goals
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own sleep goals" ON sleep_goals;
CREATE POLICY "Users can manage their own sleep goals" ON sleep_goals
    FOR ALL USING (auth.uid() = user_id);


-- ----------------------------------------------------------------------------
-- 3) user_patterns: learned behaviour patterns the AI uses when planning
--    (e.g. "dinner takes 1 hour"). Replaces localStorage 'taskly-user-patterns'.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    category TEXT NOT NULL,            -- 'duration', 'time', 'preference', ...
    key TEXT NOT NULL,                 -- 'dinner', 'workout', ...
    value TEXT NOT NULL,               -- '1 hour', '30 minutes', ...
    confidence NUMERIC(3,2) NOT NULL DEFAULT 0.5,
    last_used TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    usage_count INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (user_id, category, key)
);

CREATE INDEX IF NOT EXISTS idx_user_patterns_user_id ON user_patterns(user_id);

ALTER TABLE user_patterns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own patterns" ON user_patterns;
CREATE POLICY "Users can view their own patterns" ON user_patterns
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own patterns" ON user_patterns;
CREATE POLICY "Users can manage their own patterns" ON user_patterns
    FOR ALL USING (auth.uid() = user_id);
