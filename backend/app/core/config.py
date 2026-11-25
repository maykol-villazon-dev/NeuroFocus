from pathlib import Path
from pydantic_settings import BaseSettings
from typing import Optional

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent

# En contenedor de producción persistente montado en /app_db/monitoreo_tdah.db
# Si existe el directorio montado /app_db, alojar allí la base de datos para persistencia permanente
PROD_DB_DIR = Path("/app_db")
if PROD_DB_DIR.exists():
    DB_PATH = PROD_DB_DIR / "monitoreo_tdah.db"
else:
    DB_PATH = BACKEND_DIR / "monitoreo_tdah.db"


class Settings(BaseSettings):
    PROJECT_NAME: str = "Herramienta Computacional de Monitoreo Multimodal de Atención"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # JWT Authentication Security
    SECRET_KEY: str = "tdah_monitoreo_uagrm_ficct_2026_super_secret_key_987654321"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 # 24 hours
    
    # Database Configuration (Ruta absoluta canónica para evitar desajustes de CWD)
    DATABASE_URL: str = f"sqlite+aiosqlite:///{DB_PATH.as_posix()}"
    
    # Camera Session Limits (Privacy & Resource Management)
    SESSION_TIMEOUT_SECONDS: int = 7200 # 2 Hours Auto-Cutoff
    CALIBRATION_DURATION_SECONDS: int = 30 # 30s Base Posture Routine

    class Config:
        case_sensitive = True


settings = Settings()
