-- ============================================================================
-- Notifications: FCM Tokens + User Notification Preferences
-- Apply via Supabase SQL editor.
-- ============================================================================

-- 1) FCM tokens per user/device. Token is unique across users (a device only
--    belongs to one user at a time). UPSERT on token reassigns it.
CREATE TABLE IF NOT EXISTS user_fcm_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    token TEXT NOT NULL UNIQUE,
    device_hint TEXT,
    user_agent TEXT,
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_fcm_tokens_user_id ON user_fcm_tokens(user_id);

ALTER TABLE user_fcm_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own fcm tokens" ON user_fcm_tokens;
CREATE POLICY "Users can view their own fcm tokens" ON user_fcm_tokens
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own fcm tokens" ON user_fcm_tokens;
CREATE POLICY "Users can manage their own fcm tokens" ON user_fcm_tokens
    FOR ALL USING (auth.uid() = user_id);


-- 2) Per-user notification preferences. One row per user.
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id UUID PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    task_reminders BOOLEAN NOT NULL DEFAULT TRUE,
    break_reminders BOOLEAN NOT NULL DEFAULT TRUE,
    daily_summary BOOLEAN NOT NULL DEFAULT TRUE,
    sleep_warning BOOLEAN NOT NULL DEFAULT TRUE,
    reflection_reminder BOOLEAN NOT NULL DEFAULT TRUE,
    achievement_notifications BOOLEAN NOT NULL DEFAULT TRUE,
    reminder_minutes_before INTEGER NOT NULL DEFAULT 15,
    quiet_hours_start TEXT NOT NULL DEFAULT '22:00',  -- HH:MM
    quiet_hours_end   TEXT NOT NULL DEFAULT '08:00',
    timezone TEXT NOT NULL DEFAULT 'UTC',
    daily_summary_time TEXT NOT NULL DEFAULT '20:00',
    reflection_time TEXT NOT NULL DEFAULT '20:30',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notification prefs" ON notification_preferences;
CREATE POLICY "Users can view their own notification prefs" ON notification_preferences
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own notification prefs" ON notification_preferences;
CREATE POLICY "Users can manage their own notification prefs" ON notification_preferences
    FOR ALL USING (auth.uid() = user_id);


-- 3) Sent notification log (idempotency for scheduler — avoid double-sending).
CREATE TABLE IF NOT EXISTS notification_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    dedupe_key TEXT NOT NULL,    -- e.g. "task_reminder:<task_id>:<YYYY-MM-DD>"
    notif_type TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_notification_log_user_id ON notification_log(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_sent_at ON notification_log(sent_at);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own notification log" ON notification_log;
CREATE POLICY "Users can view their own notification log" ON notification_log
    FOR SELECT USING (auth.uid() = user_id);
