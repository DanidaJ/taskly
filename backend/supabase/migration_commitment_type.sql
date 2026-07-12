-- Adds a `type` column to commitments so we can distinguish work-style fixed
-- commitments (meetings, office hours) from daily personal routines (meals,
-- exercise, wind-down). Both are time blocks the AI scheduler skips — the
-- type is purely for UX framing in the Settings UI.

ALTER TABLE commitments
    ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'work';

-- Backfill existing rows: they were all "work-style" commitments by definition,
-- since that was the only kind that existed.
UPDATE commitments SET type = 'work' WHERE type IS NULL;
