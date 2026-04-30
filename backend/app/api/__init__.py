from .ai_routes import router as ai_router
from .task_routes import router as task_router
from .plan_routes import router as plan_router
from .notification_routes import router as notification_router
from .profile_routes import router as profile_router
from .data_routes import router as data_router
from .recurring_routes import router as recurring_router

__all__ = [
    "ai_router",
    "task_router",
    "plan_router",
    "notification_router",
    "profile_router",
    "data_router",
    "recurring_router",
]
