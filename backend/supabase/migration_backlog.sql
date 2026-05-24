-- Migration: Add backlog_items table for unscheduled task capture
-- Run this in your Supabase SQL editor

-- ============================================
-- BACKLOG ITEMS TABLE
-- ============================================
-- Tasks the user wants to do "eventually" but hasn't scheduled yet.
-- When an item is scheduled, it is converted into a planned_task and
-- deleted from this table (the planned_task is the source of truth).

CREATE TABLE IF NOT EXISTS backlog_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    estimated_minutes INTEGER NOT NULL DEFAULT 60,
    priority VARCHAR(20) DEFAULT 'medium',         -- 'low' | 'medium' | 'high'
    cognitive_load VARCHAR(20) DEFAULT 'light_focus',
    tags TEXT[] DEFAULT '{}',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_backlog_items_user ON backlog_items(user_id);
CREATE INDEX IF NOT EXISTS idx_backlog_items_created ON backlog_items(user_id, created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE backlog_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own backlog items" ON backlog_items
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own backlog items" ON backlog_items
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own backlog items" ON backlog_items
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own backlog items" ON backlog_items
    FOR DELETE USING (auth.uid() = user_id);
