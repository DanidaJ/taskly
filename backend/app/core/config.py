from pydantic_settings import BaseSettings
from typing import List
import json


class Settings(BaseSettings):
    # App Info
    APP_NAME: str = "Taskly"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    
    # Database
    database_url: str = "postgresql://localhost:5432/taskly"
    # Required: the app verifies every user token against this project's public
    # JWKS at {supabase_url}/auth/v1/.well-known/jwks.json, so there is no safe
    # default. (Supabase signs user tokens with asymmetric keys — no shared
    # secret is needed server-side.)
    supabase_url: str
    supabase_publishable_key: str = ""  # Public key (safe for client)
    supabase_secret_key: str = ""  # Secret key (server-side only)
    
    # Mistral AI (using custom agent)
    mistral_api_key: str = ""
    mistral_agent_id: str = ""  # Custom agent from console.mistral.ai
    
    # Firebase
    firebase_credentials_path: str = "./firebase-credentials.json"

    # Firebase Web (public — safe to expose to browser; served via /notifications/web-config)
    firebase_api_key: str = ""
    firebase_auth_domain: str = ""
    firebase_project_id: str = ""
    firebase_storage_bucket: str = ""
    firebase_messaging_sender_id: str = ""
    firebase_app_id: str = ""
    firebase_vapid_key: str = ""

    # Notification scheduler
    notifications_enabled: bool = True
    notifications_default_timezone: str = "UTC"
    notifications_break_interval_minutes: int = 0  # 0 = disabled (per-user only)
    
    # CORS
    cors_origins: str = '["http://localhost:5173","http://localhost:3000"]'
    
    @property
    def ALLOWED_ORIGINS(self) -> List[str]:
        try:
            return json.loads(self.cors_origins)
        except json.JSONDecodeError:
            return ["http://localhost:5173", "http://localhost:3000"]
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        # Ignore unrelated/legacy env vars (e.g. the old JWT_SECRET from before
        # the custom-JWT path was dropped) instead of crashing on startup.
        extra = "ignore"


settings = Settings()
