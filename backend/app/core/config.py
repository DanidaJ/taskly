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
    supabase_url: str = ""
    supabase_publishable_key: str = ""  # Public key (safe for client)
    supabase_secret_key: str = ""  # Secret key (server-side only)
    supabase_jwt_secret: str = ""  # JWT secret for validating Supabase tokens
    
    # Mistral AI (using custom agent)
    mistral_api_key: str = ""
    mistral_agent_id: str = ""  # Custom agent from console.mistral.ai
    
    # Firebase
    firebase_credentials_path: str = "./firebase-credentials.json"
    
    # JWT
    jwt_secret: str = "your-secret-key-change-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440  # 24 hours
    
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


settings = Settings()
