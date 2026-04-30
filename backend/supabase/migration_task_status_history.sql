-- Migration: add explicit missed status + durable task status history audit table
-- Run this in Supabase SQL editor

-- 1) Ensure task_status enum can represent expired tasks explicitly
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'missed';

-- 2) Durable history of task lifecycle events
CREATE TABLE IF NOT EXISTS task_status_history (
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

CREATE INDEX IF NOT EXISTS idx_task_status_history_user_id ON task_status_history(user_id);
CREATE INDEX IF NOT EXISTS idx_task_status_history_date ON task_status_history(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_task_status_history_event_type ON task_status_history(event_type);
CREATE INDEX IF NOT EXISTS idx_task_status_history_plan_id ON task_status_history(plan_id);

ALTER TABLE task_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own task history" ON task_status_history
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own task history" ON task_status_history
    FOR INSERT WITH CHECK (auth.uid() = user_id);
