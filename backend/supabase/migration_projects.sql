-- Migration: Add projects + project_subtasks tables for multi-session work
-- Run this in your Supabase SQL editor

-- ============================================
-- PROJECTS TABLE
-- ============================================
-- Large pieces of work that span multiple sessions/days. Unlike backlog items
-- (single atomic tasks), a project carries a total work-hour estimate and the
-- AI schedules realistic daily chunks against it. Progress is tracked by hours.
--
-- Time anchor is optional and comes in two flavours:
--   - deadline-driven      → pacing = on_track | behind | at_risk
--   - weekly_hours_target  → personal projects with no end date (consistency)

CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active',  -- active | parked | completed | archived
    total_hours NUMERIC(7,2) NOT NULL,             -- required, AI-assisted estimate
    hours_completed NUMERIC(7,2) NOT NULL DEFAULT 0,
    deadline DATE,                                 -- optional hard date
    weekly_hours_target NUMERIC(5,2),              -- optional, for no-deadline projects
    ai_size_estimate VARCHAR(5),                   -- XS | S | M | L | XL
    priority VARCHAR(20) DEFAULT 'medium',         -- low | medium | high (for scheduling)
    cognitive_load VARCHAR(20) DEFAULT 'deep_focus',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- PROJECT SUBTASKS TABLE
-- ============================================
-- Optional breakdown of a project. When subtasks exist, the AI schedules the
-- next incomplete subtask rather than an abstract time chunk.

CREATE TABLE IF NOT EXISTS project_subtasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    estimated_hours NUMERIC(6,2),
    hours_completed NUMERIC(6,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | in_progress | completed
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_status ON projects(user_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_created ON projects(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_subtasks_project ON project_subtasks(project_id, sort_order);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own projects" ON projects
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own projects" ON projects
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own projects" ON projects
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own projects" ON projects
    FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE project_subtasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own project subtasks" ON project_subtasks
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own project subtasks" ON project_subtasks
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own project subtasks" ON project_subtasks
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own project subtasks" ON project_subtasks
    FOR DELETE USING (auth.uid() = user_id);
