-- Taskly Database Schema for Supabase
-- Run this in your Supabase SQL editor to set up the database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUM TYPES
-- ============================================

-- Cognitive Load Types
CREATE TYPE cognitive_load AS ENUM ('deep_focus', 'light_logic', 'creative', 'routine', 'communication');

-- Priority Levels
CREATE TYPE priority_level AS ENUM ('must_do', 'should_do', 'nice_to_have');

-- Task Flexibility
CREATE TYPE task_flexibility AS ENUM ('fixed', 'flexible');

-- Task Status
CREATE TYPE task_status AS ENUM ('not_started', 'in_progress', 'completed', 'skipped', 'postponed', 'missed');

-- Commitment Recurrence
CREATE TYPE recurrence_type AS ENUM ('daily', 'weekly', 'biweekly', 'monthly', 'custom');

-- ============================================
-- TABLES
-- ============================================

-- Tasks Table
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    raw_input TEXT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    estimated_minutes INTEGER NOT NULL DEFAULT 30,
    cognitive_load cognitive_load DEFAULT 'routine',
    priority priority_level DEFAULT 'should_do',
    flexibility task_flexibility DEFAULT 'flexible',
    deadline TIMESTAMP WITH TIME ZONE,
    status task_status DEFAULT 'not_started',
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Daily Plans Table
CREATE TABLE daily_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    is_ai_generated BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- Planned Tasks Table (tasks scheduled in a daily plan)
CREATE TABLE planned_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id UUID NOT NULL REFERENCES daily_plans(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    scheduled_start TIME,
    scheduled_end TIME,
    estimated_minutes INTEGER NOT NULL DEFAULT 30,
    cognitive_load cognitive_load DEFAULT 'routine',
    priority priority_level DEFAULT 'should_do',
    flexibility task_flexibility DEFAULT 'flexible',
    status task_status DEFAULT 'not_started',
    rationale TEXT,
    actual_start TIMESTAMP WITH TIME ZONE,
    actual_end TIMESTAMP WITH TIME ZONE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Task Status History Table (durable task lifecycle/audit log)
CREATE TABLE task_status_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES daily_plans(id) ON DELETE SET NULL,
    planned_task_id UUID,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    task_name VARCHAR(255) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    previous_status task_status,
    new_status task_status,
    scheduled_date DATE,
    scheduled_start TIME,
    scheduled_end TIME,
    actual_start TIMESTAMP WITH TIME ZONE,
    actual_end TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Energy Profiles Table
CREATE TABLE energy_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    preference VARCHAR(20) NOT NULL DEFAULT 'morning', -- morning, afternoon, evening, night
    peak_focus_start TIME NOT NULL DEFAULT '09:00',
    peak_focus_end TIME NOT NULL DEFAULT '12:00',
    fatigue_points TEXT[] DEFAULT '{14:00,16:00}',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sleep Schedules Table
CREATE TABLE sleep_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    wake_time TIME NOT NULL DEFAULT '07:00',
    sleep_time TIME NOT NULL DEFAULT '23:00',
    wind_down_minutes INTEGER NOT NULL DEFAULT 30,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Preferences Table
CREATE TABLE user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    theme VARCHAR(20) DEFAULT 'system',
    notifications_enabled BOOLEAN DEFAULT true,
    reminder_minutes_before INTEGER DEFAULT 5,
    show_time_in_24h BOOLEAN DEFAULT false,
    first_day_of_week INTEGER DEFAULT 0, -- 0 = Sunday, 1 = Monday
    fcm_token TEXT,
    timezone VARCHAR(50) DEFAULT 'UTC',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Commitments Table (recurring events)
CREATE TABLE commitments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    days_of_week INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}', -- 0-6, Sunday = 0
    recurrence recurrence_type DEFAULT 'weekly',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Daily Logs Table (for reflection)
CREATE TABLE daily_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    mood_rating INTEGER CHECK (mood_rating BETWEEN 1 AND 5),
    energy_rating INTEGER CHECK (energy_rating BETWEEN 1 AND 5),
    productivity_rating INTEGER CHECK (productivity_rating BETWEEN 1 AND 5),
    wins TEXT[] DEFAULT '{}',
    challenges TEXT[] DEFAULT '{}',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_deadline ON tasks(deadline);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);

CREATE INDEX idx_daily_plans_user_id ON daily_plans(user_id);
CREATE INDEX idx_daily_plans_date ON daily_plans(date);

CREATE INDEX idx_planned_tasks_plan_id ON planned_tasks(plan_id);
CREATE INDEX idx_planned_tasks_status ON planned_tasks(status);
CREATE INDEX idx_task_status_history_user_id ON task_status_history(user_id);
CREATE INDEX idx_task_status_history_date ON task_status_history(scheduled_date);
CREATE INDEX idx_task_status_history_event_type ON task_status_history(event_type);

CREATE INDEX idx_commitments_user_id ON commitments(user_id);
CREATE INDEX idx_commitments_active ON commitments(is_active);

CREATE INDEX idx_daily_logs_user_id ON daily_logs(user_id);
CREATE INDEX idx_daily_logs_date ON daily_logs(date);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE planned_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sleep_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;

-- Tasks RLS policies
CREATE POLICY "Users can view their own tasks" ON tasks
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tasks" ON tasks
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tasks" ON tasks
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tasks" ON tasks
    FOR DELETE USING (auth.uid() = user_id);

-- Daily Plans RLS policies
CREATE POLICY "Users can view their own plans" ON daily_plans
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own plans" ON daily_plans
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own plans" ON daily_plans
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own plans" ON daily_plans
    FOR DELETE USING (auth.uid() = user_id);

-- Planned Tasks RLS policies (via plan ownership)
CREATE POLICY "Users can view their own planned tasks" ON planned_tasks
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM daily_plans WHERE daily_plans.id = planned_tasks.plan_id AND daily_plans.user_id = auth.uid())
    );

CREATE POLICY "Users can create their own planned tasks" ON planned_tasks
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM daily_plans WHERE daily_plans.id = planned_tasks.plan_id AND daily_plans.user_id = auth.uid())
    );

CREATE POLICY "Users can update their own planned tasks" ON planned_tasks
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM daily_plans WHERE daily_plans.id = planned_tasks.plan_id AND daily_plans.user_id = auth.uid())
    );

CREATE POLICY "Users can delete their own planned tasks" ON planned_tasks
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM daily_plans WHERE daily_plans.id = planned_tasks.plan_id AND daily_plans.user_id = auth.uid())
    );

-- Task Status History RLS policies
CREATE POLICY "Users can view own task history" ON task_status_history
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own task history" ON task_status_history
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Energy Profiles RLS policies
CREATE POLICY "Users can view their own energy profile" ON energy_profiles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own energy profile" ON energy_profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own energy profile" ON energy_profiles
    FOR UPDATE USING (auth.uid() = user_id);

-- Sleep Schedules RLS policies
CREATE POLICY "Users can view their own sleep schedule" ON sleep_schedules
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own sleep schedule" ON sleep_schedules
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sleep schedule" ON sleep_schedules
    FOR UPDATE USING (auth.uid() = user_id);

-- User Preferences RLS policies
CREATE POLICY "Users can view their own preferences" ON user_preferences
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own preferences" ON user_preferences
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences" ON user_preferences
    FOR UPDATE USING (auth.uid() = user_id);

-- Commitments RLS policies
CREATE POLICY "Users can view their own commitments" ON commitments
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own commitments" ON commitments
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own commitments" ON commitments
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own commitments" ON commitments
    FOR DELETE USING (auth.uid() = user_id);

-- Daily Logs RLS policies
CREATE POLICY "Users can view their own logs" ON daily_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own logs" ON daily_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own logs" ON daily_logs
    FOR UPDATE USING (auth.uid() = user_id);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_daily_plans_updated_at
    BEFORE UPDATE ON daily_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_planned_tasks_updated_at
    BEFORE UPDATE ON planned_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_energy_profiles_updated_at
    BEFORE UPDATE ON energy_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sleep_schedules_updated_at
    BEFORE UPDATE ON sleep_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at
    BEFORE UPDATE ON user_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_commitments_updated_at
    BEFORE UPDATE ON commitments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- INITIAL DATA SETUP (Optional)
-- ============================================

-- Function to initialize user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Create default energy profile
    INSERT INTO public.energy_profiles (user_id)
    VALUES (NEW.id);
    
    -- Create default sleep schedule
    INSERT INTO public.sleep_schedules (user_id)
    VALUES (NEW.id);
    
    -- Create default preferences
    INSERT INTO public.user_preferences (user_id)
    VALUES (NEW.id);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to run after user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- VIEWS (Optional - for easier querying)
-- ============================================

-- View for today's plan with tasks
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

-- View for task completion statistics
CREATE OR REPLACE VIEW task_completion_stats AS
SELECT 
    user_id,
    date,
    COUNT(*) AS total_tasks,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed_tasks,
    ROUND(
        COUNT(CASE WHEN status = 'completed' THEN 1 END)::NUMERIC / 
        NULLIF(COUNT(*), 0) * 100, 
        2
    ) AS completion_rate
FROM daily_plans dp
JOIN planned_tasks pt ON dp.id = pt.plan_id
GROUP BY user_id, date
ORDER BY date DESC;
