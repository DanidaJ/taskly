import firebase_admin
from firebase_admin import credentials, messaging
from typing import Optional
import structlog
import os
from app.core.config import settings

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


# Singleton instance
notification_service = NotificationService()
