from supabase import create_client, Client
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

_supabase_client: Client | None = None


def get_supabase_client() -> Client | None:
    global _supabase_client
    if _supabase_client is None:
        # Use secret key for server-side operations (full access)
        url = settings.supabase_url
        key = settings.supabase_secret_key
        
        if url and key:
            try:
                _supabase_client = create_client(url, key)
                logger.info("Supabase client created successfully")
            except Exception as e:
                logger.warning(f"Failed to initialize Supabase client: {e}")
                return None
        else:
            logger.warning("Supabase URL and Secret Key not configured")
            return None
    return _supabase_client


class SupabaseDB:
    """Database operations using Supabase"""
    
    def __init__(self):
        self.client = get_supabase_client()
        if self.client is None:
            logger.warning("SupabaseDB initialized without a valid client - database operations will fail")
    
    # Tasks
    async def get_tasks(self, user_id: str):
        response = self.client.table('tasks').select('*').eq('user_id', user_id).order('created_at', desc=True).execute()
        return response.data
    
    async def create_task(self, task_data: dict):
        response = self.client.table('tasks').insert(task_data).execute()
        return response.data[0] if response.data else None
    
    async def update_task(self, task_id: str, updates: dict):
        response = self.client.table('tasks').update(updates).eq('id', task_id).execute()
        return response.data[0] if response.data else None
    
    async def delete_task(self, task_id: str):
        response = self.client.table('tasks').delete().eq('id', task_id).execute()
        return response.data
    
    # Daily Plans
    async def get_daily_plan(self, user_id: str, date: str):
        response = self.client.table('daily_plans').select('*, planned_tasks(*)').eq('user_id', user_id).eq('date', date).execute()
        return response.data[0] if response.data else None
    
    async def get_daily_plans_range(self, user_id: str, start_date: str, end_date: str):
        """Get all daily plans for a user within a date range"""
        response = self.client.table('daily_plans').select('*, planned_tasks(*)').eq('user_id', user_id).gte('date', start_date).lte('date', end_date).order('date', desc=True).execute()
        return response.data

    async def get_daily_plan_by_id(self, plan_id: str, user_id: str | None = None):
        """Get a daily plan by id, optionally scoped to a user."""
        query = self.client.table('daily_plans').select('*, planned_tasks(*)').eq('id', plan_id)
        if user_id:
            query = query.eq('user_id', user_id)
        response = query.execute()
        return response.data[0] if response.data else None
    
    async def save_daily_plan(self, plan_data: dict):
        response = self.client.table('daily_plans').upsert(plan_data).execute()
        return response.data[0] if response.data else None
    
    async def delete_planned_tasks(self, plan_id: str):
        """Delete all planned tasks for a given plan"""
        response = self.client.table('planned_tasks').delete().eq('plan_id', plan_id).execute()
        return response.data
    
    async def delete_planned_task(self, task_id: str):
        """Delete a single planned task"""
        response = self.client.table('planned_tasks').delete().eq('id', task_id).execute()
        return response.data
    
    async def save_planned_tasks(self, tasks: list):
        """Save multiple planned tasks"""
        if not tasks:
            return []
        response = self.client.table('planned_tasks').insert(tasks).execute()
        return response.data

    async def update_planned_task(self, task_id: str, updates: dict):
        """Update a single planned task by id."""
        response = self.client.table('planned_tasks').update(updates).eq('id', task_id).execute()
        return response.data[0] if response.data else None

    async def save_task_status_history(self, entry: dict):
        """Save one task history/audit entry."""
        response = self.client.table('task_status_history').insert(entry).execute()
        return response.data[0] if response.data else None

    async def save_task_status_history_bulk(self, entries: list):
        """Save multiple task history/audit entries."""
        if not entries:
            return []
        response = self.client.table('task_status_history').insert(entries).execute()
        return response.data
    
    # Energy Profile
    async def get_energy_profile(self, user_id: str):
        response = self.client.table('energy_profiles').select('*').eq('user_id', user_id).execute()
        return response.data[0] if response.data else None
    
    async def save_energy_profile(self, profile_data: dict):
        response = self.client.table('energy_profiles').upsert(profile_data).execute()
        return response.data[0] if response.data else None
    
    # Sleep Schedule
    async def get_sleep_schedule(self, user_id: str):
        response = self.client.table('sleep_schedules').select('*').eq('user_id', user_id).execute()
        return response.data[0] if response.data else None
    
    async def save_sleep_schedule(self, schedule_data: dict):
        response = self.client.table('sleep_schedules').upsert(schedule_data).execute()
        return response.data[0] if response.data else None
    
    # User Preferences
    async def get_user_preferences(self, user_id: str):
        response = self.client.table('user_preferences').select('*').eq('user_id', user_id).execute()
        return response.data[0] if response.data else None
    
    async def save_user_preferences(self, preferences_data: dict):
        response = self.client.table('user_preferences').upsert(preferences_data).execute()
        return response.data[0] if response.data else None
    
    # Commitments
    async def get_commitments(self, user_id: str):
        response = self.client.table('commitments').select('*').eq('user_id', user_id).order('start_time').execute()
        return response.data
    
    async def create_commitment(self, commitment_data: dict):
        response = self.client.table('commitments').insert(commitment_data).execute()
        return response.data[0] if response.data else None
    
    async def delete_commitment(self, commitment_id: str):
        response = self.client.table('commitments').delete().eq('id', commitment_id).execute()
        return response.data
    
    # Daily Logs
    async def get_daily_logs(self, user_id: str, limit: int = 14):
        response = self.client.table('daily_logs').select('*').eq('user_id', user_id).order('date', desc=True).limit(limit).execute()
        return response.data
    
    async def save_daily_log(self, log_data: dict):
        response = self.client.table('daily_logs').upsert(log_data).execute()
        return response.data[0] if response.data else None

    # Focus Sessions
    async def get_focus_sessions(self, user_id: str, date: str):
        """Get focus sessions for a specific date (YYYY-MM-DD)"""
        response = self.client.table('focus_sessions').select('*').eq('user_id', user_id).eq('session_date', date).order('start_time').execute()
        return response.data

    async def get_focus_sessions_range(self, user_id: str, start_date: str, end_date: str):
        """Get focus sessions for a date range"""
        response = self.client.table('focus_sessions').select('*').eq('user_id', user_id).gte('session_date', start_date).lte('session_date', end_date).order('session_date').execute()
        return response.data

    async def save_focus_session(self, session_data: dict):
        response = self.client.table('focus_sessions').upsert(session_data).execute()
        return response.data[0] if response.data else None

    async def delete_focus_sessions_for_date(self, user_id: str, date: str):
        """Delete all focus sessions for a date (used in bulk sync)"""
        response = self.client.table('focus_sessions').delete().eq('user_id', user_id).eq('session_date', date).execute()
        return response.data

    async def bulk_save_focus_sessions(self, sessions: list):
        if not sessions:
            return []
        response = self.client.table('focus_sessions').insert(sessions).execute()
        return response.data

    # Sleep Entries
    async def get_sleep_entries(self, user_id: str, limit: int = 90):
        """Get sleep entries, most recent first"""
        response = self.client.table('sleep_entries').select('*').eq('user_id', user_id).order('date', desc=True).limit(limit).execute()
        return response.data

    async def get_sleep_entries_range(self, user_id: str, start_date: str, end_date: str):
        """Get sleep entries for a date range"""
        response = self.client.table('sleep_entries').select('*').eq('user_id', user_id).gte('date', start_date).lte('date', end_date).order('date').execute()
        return response.data

    async def save_sleep_entry(self, entry_data: dict):
        """Upsert a sleep entry (unique on user_id + date)"""
        response = self.client.table('sleep_entries').upsert(
            entry_data,
            on_conflict='user_id,date'
        ).execute()
        return response.data[0] if response.data else None

    async def delete_sleep_entry(self, entry_id: str):
        response = self.client.table('sleep_entries').delete().eq('id', entry_id).execute()
        return response.data

    # Daily Stats
    async def get_daily_stats(self, user_id: str, date: str):
        """Get stats for a specific date"""
        response = self.client.table('daily_stats').select('*').eq('user_id', user_id).eq('date', date).execute()
        return response.data[0] if response.data else None

    async def get_daily_stats_range(self, user_id: str, start_date: str, end_date: str):
        """Get stats for a date range"""
        response = self.client.table('daily_stats').select('*').eq('user_id', user_id).gte('date', start_date).lte('date', end_date).order('date').execute()
        return response.data

    async def save_daily_stats(self, stats_data: dict):
        """Upsert daily stats (unique on user_id + date)"""
        response = self.client.table('daily_stats').upsert(
            stats_data,
            on_conflict='user_id,date'
        ).execute()
        return response.data[0] if response.data else None

    # ============================================
    # Recurring Tasks
    # ============================================

    async def get_recurring_tasks(self, user_id: str, active_only: bool = True):
        query = self.client.table('recurring_tasks').select('*').eq('user_id', user_id)
        if active_only:
            query = query.eq('is_active', True)
        response = query.order('created_at').execute()
        return response.data

    async def get_recurring_task(self, task_id: str):
        response = self.client.table('recurring_tasks').select('*').eq('id', task_id).execute()
        return response.data[0] if response.data else None

    async def create_recurring_task(self, task_data: dict):
        response = self.client.table('recurring_tasks').insert(task_data).execute()
        return response.data[0] if response.data else None

    async def update_recurring_task(self, task_id: str, updates: dict):
        updates['updated_at'] = 'now()'
        response = self.client.table('recurring_tasks').update(updates).eq('id', task_id).execute()
        return response.data[0] if response.data else None

    async def delete_recurring_task(self, task_id: str):
        response = self.client.table('recurring_tasks').delete().eq('id', task_id).execute()
        return response.data

    async def get_recurring_tasks_for_day(self, user_id: str, day_of_week: int):
        """Get active recurring tasks that should fire on a given day (0=Sun..6=Sat)"""
        tasks = await self.get_recurring_tasks(user_id, active_only=True)
        return [t for t in tasks if day_of_week in (t.get('days_of_week') or [])]

    # ============================================
    # Routine Templates
    # ============================================

    async def get_routine_templates(self, user_id: str):
        response = self.client.table('routine_templates').select('*').eq('user_id', user_id).order('created_at').execute()
        templates = response.data or []
        # Attach recurring tasks to each template
        for tmpl in templates:
            tasks_resp = self.client.table('recurring_tasks').select('*').eq('routine_template_id', tmpl['id']).eq('user_id', user_id).order('created_at').execute()
            tmpl['tasks'] = tasks_resp.data or []
        return templates

    async def get_routine_template(self, template_id: str):
        response = self.client.table('routine_templates').select('*').eq('id', template_id).execute()
        if not response.data:
            return None
        tmpl = response.data[0]
        tasks_resp = self.client.table('recurring_tasks').select('*').eq('routine_template_id', template_id).order('created_at').execute()
        tmpl['tasks'] = tasks_resp.data or []
        return tmpl

    async def create_routine_template(self, template_data: dict):
        response = self.client.table('routine_templates').insert(template_data).execute()
        return response.data[0] if response.data else None

    async def update_routine_template(self, template_id: str, updates: dict):
        updates['updated_at'] = 'now()'
        response = self.client.table('routine_templates').update(updates).eq('id', template_id).execute()
        return response.data[0] if response.data else None

    async def delete_routine_template(self, template_id: str):
        # Tasks with this template_id will have FK set to NULL
        response = self.client.table('routine_templates').delete().eq('id', template_id).execute()
        return response.data


# Singleton instance - only create if initialization succeeds
def _create_db_instance():
    try:
        client = get_supabase_client()
        if client:
            return SupabaseDB()
    except Exception as e:
        logger.warning(f"Could not create SupabaseDB instance: {e}")
    return None

db = _create_db_instance()
