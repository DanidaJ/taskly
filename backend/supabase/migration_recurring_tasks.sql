-- Migration: Add recurring_tasks and routine_templates tables
-- Run this in your Supabase SQL editor

-- ============================================
-- RECURRING TASKS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS recurring_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    estimated_minutes INTEGER NOT NULL DEFAULT 30,
    cognitive_load VARCHAR(20) DEFAULT 'light_focus',
    priority VARCHAR(20) DEFAULT 'medium',
    flexibility VARCHAR(20) DEFAULT 'flexible',

    -- Recurrence pattern
    recurrence_type VARCHAR(20) NOT NULL DEFAULT 'weekly',  -- daily, weekly, weekdays, weekends, custom
    days_of_week INTEGER[] DEFAULT '{1,2,3,4,5}',           -- 0=Sun..6=Sat (used for weekly/custom)
    
    -- Optional fixed time (NULL = flexible, scheduler decides)
    preferred_time TIME,           -- e.g. 08:00 for "every weekday at 8 AM"
    
    -- Lifecycle
    is_active BOOLEAN DEFAULT true,
    start_date DATE DEFAULT CURRENT_DATE,
    end_date DATE,                 -- NULL = no end
    
    -- Template source (NULL if standalone)
    routine_template_id UUID,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ROUTINE TEMPLATES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS routine_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,           -- e.g. "Morning Routine", "Evening Wind-down"
    description TEXT,
    icon VARCHAR(50) DEFAULT 'sun',       -- icon name for UI
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add FK now that both tables exist
ALTER TABLE recurring_tasks
    ADD CONSTRAINT fk_recurring_tasks_routine_template
    FOREIGN KEY (routine_template_id)
    REFERENCES routine_templates(id) ON DELETE SET NULL;

-- Link planned_tasks back to their recurring source
ALTER TABLE planned_tasks
    ADD COLUMN IF NOT EXISTS recurring_task_id UUID REFERENCES recurring_tasks(id) ON DELETE SET NULL;

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_recurring_tasks_user ON recurring_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_tasks_active ON recurring_tasks(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_recurring_tasks_template ON recurring_tasks(routine_template_id);
CREATE INDEX IF NOT EXISTS idx_routine_templates_user ON routine_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_planned_tasks_recurring ON planned_tasks(recurring_task_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE recurring_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE routine_templates ENABLE ROW LEVEL SECURITY;

-- Recurring Tasks RLS
CREATE POLICY "Users can view own recurring tasks" ON recurring_tasks
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own recurring tasks" ON recurring_tasks
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own recurring tasks" ON recurring_tasks
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own recurring tasks" ON recurring_tasks
    FOR DELETE USING (auth.uid() = user_id);

-- Routine Templates RLS
CREATE POLICY "Users can view own routine templates" ON routine_templates
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own routine templates" ON routine_templates
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own routine templates" ON routine_templates
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own routine templates" ON routine_templates
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- SEED: Built-in routine templates
-- ============================================
-- These are system templates; actual recurring_tasks entries are created per user when they "apply" a template.
-- The frontend will have these hardcoded as presets; no DB seed needed.
