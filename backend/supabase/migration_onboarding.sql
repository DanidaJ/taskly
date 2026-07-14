-- Migration: first-run onboarding status
-- ------------------------------------------------------------------
-- Tracks whether a user has completed (or dismissed) the first-run setup
-- wizard, so it is shown exactly once per account rather than per device.
-- Kept in its own 1-row-per-user table instead of user_preferences to stay
-- decoupled from that table's evolving shape.
--
-- Run once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS user_onboarding (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    has_onboarded BOOLEAN NOT NULL DEFAULT false,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE user_onboarding ENABLE ROW LEVEL SECURITY;

-- Recreate policies idempotently so this migration can be re-run safely.
DROP POLICY IF EXISTS "Users can view their own onboarding" ON user_onboarding;
CREATE POLICY "Users can view their own onboarding" ON user_onboarding
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own onboarding" ON user_onboarding;
CREATE POLICY "Users can create their own onboarding" ON user_onboarding
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own onboarding" ON user_onboarding;
CREATE POLICY "Users can update their own onboarding" ON user_onboarding
    FOR UPDATE USING (auth.uid() = user_id);

-- Keep updated_at fresh (reuses the shared trigger fn from schema.sql).
DROP TRIGGER IF EXISTS update_user_onboarding_updated_at ON user_onboarding;
CREATE TRIGGER update_user_onboarding_updated_at
    BEFORE UPDATE ON user_onboarding
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
