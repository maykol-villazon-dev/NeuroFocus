from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    PROJECT_NAME: str = "Herramienta Computacional de Monitoreo Multimodal de Atención"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # JWT Authentication Security
    SECRET_KEY: str = "tdah_monitoreo_uagrm_ficct_2026_super_secret_key_987654321"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 # 24 hours
    
    # Database Configuration (Default: SQLite Async)
    DATABASE_URL: str = "sqlite+aiosqlite:///./monitoreo_tdah.db"
    
    # Camera Session Limits (Privacy & Resource Management)
    SESSION_TIMEOUT_SECONDS: int = 7200 # 2 Hours Auto-Cutoff
    CALIBRATION_DURATION_SECONDS: int = 30 # 30s Base Posture Routine

    class Config:
        case_sensitive = True


settings = Settings()
