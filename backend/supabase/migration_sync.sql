-- Migration: Add focus_sessions, sleep_entries, and daily_stats tables
-- Run this in your Supabase SQL editor

-- ============================================
-- NEW TABLES FOR DATA SYNC
-- ============================================

-- Focus Sessions Table
CREATE TABLE IF NOT EXISTS focus_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    task_id TEXT,
    task_name TEXT,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    duration INTEGER NOT NULL DEFAULT 0,  -- in seconds
    mode VARCHAR(20) NOT NULL DEFAULT 'focus',  -- focus, shortBreak, longBreak
    completed BOOLEAN DEFAULT false,
    session_date DATE NOT NULL,  -- the calendar date this session belongs to
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sleep Entries Table
CREATE TABLE IF NOT EXISTS sleep_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    bedtime VARCHAR(5) NOT NULL,        -- HH:MM
    wake_time VARCHAR(5) NOT NULL,      -- HH:MM
    quality INTEGER NOT NULL CHECK (quality BETWEEN 1 AND 5),
    notes TEXT,
    duration INTEGER NOT NULL DEFAULT 0,  -- in minutes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- Daily Stats Table (aggregated task stats per day)
CREATE TABLE IF NOT EXISTS daily_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    tasks_completed INTEGER DEFAULT 0,
    tasks_missed INTEGER DEFAULT 0,
    tasks_skipped INTEGER DEFAULT 0,
    tasks_total INTEGER DEFAULT 0,
    focus_minutes INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_focus_sessions_user_id ON focus_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_focus_sessions_date ON focus_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_focus_sessions_user_date ON focus_sessions(user_id, session_date);

CREATE INDEX IF NOT EXISTS idx_sleep_entries_user_id ON sleep_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_sleep_entries_date ON sleep_entries(date);
CREATE INDEX IF NOT EXISTS idx_sleep_entries_user_date ON sleep_entries(user_id, date);

CREATE INDEX IF NOT EXISTS idx_daily_stats_user_id ON daily_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date);
CREATE INDEX IF NOT EXISTS idx_daily_stats_user_date ON daily_stats(user_id, date);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE focus_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sleep_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;

-- Focus Sessions RLS
CREATE POLICY "Users can view own focus sessions" ON focus_sessions
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own focus sessions" ON focus_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own focus sessions" ON focus_sessions
    FOR DELETE USING (auth.uid() = user_id);

-- Sleep Entries RLS
CREATE POLICY "Users can view own sleep entries" ON sleep_entries
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own sleep entries" ON sleep_entries
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sleep entries" ON sleep_entries
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sleep entries" ON sleep_entries
    FOR DELETE USING (auth.uid() = user_id);

-- Daily Stats RLS
CREATE POLICY "Users can view own daily stats" ON daily_stats
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own daily stats" ON daily_stats
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own daily stats" ON daily_stats
    FOR UPDATE USING (auth.uid() = user_id);
