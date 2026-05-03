import firebase_admin
from firebase_admin import credentials, messaging
from typing import Optional
import structlog
import os
from urllib.parse import urlparse
from app.core.config import settings
from app.core.database import db

logger = structlog.get_logger()

_firebase_initialized = False


def initialize_firebase():
    """Initialize Firebase Admin SDK"""
    global _firebase_initialized
    
    if _firebase_initialized:
        return
    
    # Check if credentials path is provided and file exists
    creds_path = settings.firebase_credentials_path
    if not creds_path or not os.path.exists(creds_path):
        logger.info("Firebase credentials not configured, notifications disabled")
        return
    
    try:
        cred = credentials.Certificate(creds_path)
        firebase_admin.initialize_app(cred)
        _firebase_initialized = True
        logger.info("Firebase initialized successfully")
    except Exception as e:
        logger.warning("Failed to initialize Firebase", error=str(e))


class NotificationService:
    """Service for sending push notifications via Firebase Cloud Messaging"""
    
    def __init__(self):
        initialize_firebase()
    
    async def send_notification(
        self,
        token: str,
        title: str,
        body: str,
        data: Optional[dict] = None,
    ) -> bool:
        """Send a push notification to a specific device"""
        if not _firebase_initialized:
            logger.warning("Firebase not initialized, skipping notification")
            return False
        
        try:
            message = messaging.Message(
                notification=messaging.Notification(
                    title=title,
                    body=body,
                ),
                data=data or {},
                token=token,
            )
            
            response = messaging.send(message)
            logger.info("Notification sent", message_id=response)
            return True
        except Exception as e:
            logger.error("Failed to send notification", error=str(e))
            return False
    
    async def send_task_reminder(
        self,
        token: str,
        task_name: str,
        scheduled_time: str,
    ) -> bool:
        """Send a task reminder notification"""
        return await self.send_notification(
            token=token,
            title="Task Reminder 📋",
            body=f"Time for: {task_name}",
            data={
                "type": "task_reminder",
                "task_name": task_name,
                "scheduled_time": scheduled_time,
            },
        )
    
    async def send_break_reminder(self, token: str) -> bool:
        """Send a break reminder notification"""
        return await self.send_notification(
            token=token,
            title="Break Time ☕",
            body="Take a short break to recharge your energy!",
            data={"type": "break_reminder"},
        )
    
    async def send_sleep_warning(
        self,
        token: str,
        minutes_until_wind_down: int,
    ) -> bool:
        """Send a sleep warning notification"""
        return await self.send_notification(
            token=token,
            title="Wind Down Time 🌙",
            body=f"Start winding down in {minutes_until_wind_down} minutes for better sleep.",
            data={
                "type": "sleep_warning",
                "minutes": str(minutes_until_wind_down),
            },
        )
    
    async def send_daily_summary(
        self,
        token: str,
        completed_count: int,
        total_count: int,
    ) -> bool:
        """Send end-of-day summary notification"""
        percentage = (completed_count / total_count * 100) if total_count > 0 else 0
        emoji = "🎉" if percentage >= 80 else "👍" if percentage >= 50 else "💪"
        
        return await self.send_notification(
            token=token,
            title=f"Daily Summary {emoji}",
            body=f"You completed {completed_count}/{total_count} tasks today ({percentage:.0f}%)",
            data={
                "type": "daily_summary",
                "completed": str(completed_count),
                "total": str(total_count),
            },
        )
    
    async def subscribe_to_topic(self, token: str, topic: str) -> bool:
        """Subscribe a device to a topic"""
        if not _firebase_initialized:
            return False
        
        try:
            messaging.subscribe_to_topic([token], topic)
            logger.info("Subscribed to topic", token=token[:20], topic=topic)
            return True
        except Exception as e:
            logger.error("Failed to subscribe to topic", error=str(e))
            return False
    
    async def unsubscribe_from_topic(self, token: str, topic: str) -> bool:
        """Unsubscribe a device from a topic"""
        if not _firebase_initialized:
            return False
        
        try:
            messaging.unsubscribe_from_topic([token], topic)
            logger.info("Unsubscribed from topic", token=token[:20], topic=topic)
            return True
        except Exception as e:
            logger.error("Failed to unsubscribe from topic", error=str(e))
            return False

    # ------------------------------------------------------------------
    # User-aware fan-out (uses DB to look up tokens + preferences)
    # ------------------------------------------------------------------
    PREF_KEY_BY_TYPE = {
        "task_reminder": "task_reminders",
        "break_reminder": "break_reminders",
        "daily_summary": "daily_summary",
        "sleep_warning": "sleep_warning",
        "reflection_reminder": "reflection_reminder",
        "achievement": "achievement_notifications",
        "test": None,  # always allowed if master enabled
    }

    @staticmethod
    def _is_in_quiet_hours(now_hhmm: str, start: str, end: str) -> bool:
        try:
            def to_min(s: str) -> int:
                h, m = s.split(":")
                return int(h) * 60 + int(m)
            n, s, e = to_min(now_hhmm), to_min(start), to_min(end)
            return (n >= s or n < e) if s > e else (s <= n < e)
        except Exception:
            return False

    @staticmethod
    def _get_https_link(data: Optional[dict]) -> Optional[str]:
        """Return a valid HTTPS link for FCM webpush options, otherwise None.

        Firebase requires `WebpushFCMOptions.link` to be an absolute HTTPS URL.
        Relative paths like `/app` or HTTP localhost URLs will be rejected.
        """
        raw = (data or {}).get("url")
        if not raw:
            return None
        try:
            parsed = urlparse(str(raw))
            if parsed.scheme == "https" and parsed.netloc:
                return str(raw)
        except Exception:
            return None
        return None

    async def send_to_user(
        self,
        user_id: str,
        title: str,
        body: str,
        notif_type: str = "test",
        data: Optional[dict] = None,
        respect_quiet_hours: bool = True,
        dedupe_key: Optional[str] = None,
    ) -> int:
        """Fan out a notification to all of a user's registered devices.

        Returns the count of successful sends. Honors per-user preferences,
        per-type opt-outs, quiet hours, and idempotency via dedupe_key.
        Removes dead tokens automatically.
        """
        if not _firebase_initialized or db is None:
            return 0

        # Idempotency check
        if dedupe_key and await db.has_sent_notification(user_id, dedupe_key):
            logger.debug("Skipping already-sent notification", user_id=user_id, dedupe_key=dedupe_key)
            return 0

        prefs = await db.get_notification_preferences(user_id) or {}
        if not prefs.get("enabled", True):
            return 0
        pref_key = self.PREF_KEY_BY_TYPE.get(notif_type)
        if pref_key and not prefs.get(pref_key, True):
            return 0

        if respect_quiet_hours and notif_type != "test":
            try:
                from datetime import datetime
                import pytz
                tz = pytz.timezone(prefs.get("timezone") or settings.notifications_default_timezone)
                now_hhmm = datetime.now(tz).strftime("%H:%M")
                if self._is_in_quiet_hours(
                    now_hhmm,
                    prefs.get("quiet_hours_start", "22:00"),
                    prefs.get("quiet_hours_end", "08:00"),
                ):
                    logger.debug("Suppressed by quiet hours", user_id=user_id)
                    return 0
            except Exception as e:
                logger.warning("Quiet hours check failed", error=str(e))

        tokens = await db.get_fcm_tokens_for_user(user_id)
        if not tokens:
            return 0

        sent = 0
        for token in tokens:
            try:
                https_link = self._get_https_link(data)
                webpush_config = messaging.WebpushConfig(
                    notification=messaging.WebpushNotification(
                        title=title,
                        body=body,
                        icon="/icons/icon-192x192.png",
                        badge="/icons/icon-72x72.png",
                        tag=notif_type,
                    ),
                    fcm_options=messaging.WebpushFCMOptions(link=https_link) if https_link else None,
                )

                msg = messaging.Message(
                    notification=messaging.Notification(title=title, body=body),
                    data={k: str(v) for k, v in (data or {}).items()},
                    token=token,
                    webpush=webpush_config,
                )
                messaging.send(msg)
                sent += 1
            except messaging.UnregisteredError:
                # Token is dead — remove it
                await db.delete_fcm_token(token)
                logger.info("Removed unregistered FCM token", token=token[:20])
            except Exception as e:
                logger.warning("Failed to send to token", error=str(e), token=token[:20])

        if sent and dedupe_key:
            await db.record_sent_notification(user_id, dedupe_key, notif_type)
        return sent


# Singleton instance
notification_service = NotificationService()
