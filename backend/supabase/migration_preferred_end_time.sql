-- Adds a hard "stop scheduling work" cap to the sleep schedule.
-- Night owls can keep a late sleep_time without the AI filling that time
-- with tasks. NULL means "fall back to sleep_time - wind_down_minutes".

ALTER TABLE sleep_schedules
    ADD COLUMN IF NOT EXISTS preferred_end_time TIME;
