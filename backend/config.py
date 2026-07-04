import os
from pathlib import Path
from urllib.parse import urlparse

from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).resolve().parent / ".env"


class Settings(BaseSettings):
    PROJECT_NAME: str = "Smart Public Complaint Priority and Response System"
    MONGODB_URI: str = os.getenv("MONGODB_URI") or ""
    DATABASE_NAME: str = "smart_public"
    FIREBASE_PROJECT_ID: str = ""
    JWT_SECRET: str = "change-me-in-production-use-long-random-string"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7

    FRONTEND_URL: str = "http://localhost:5173"
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = ""

    ADMIN_EMAIL: str = "admin@municipality.gov"
    ADMIN_PASSWORD: str = "Admin@12345"
    ADMIN_NAME: str = "System Administrator"

    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="ignore")

    def get_database_name(self) -> str:
        explicit_name = (self.DATABASE_NAME or "").strip()
        if explicit_name:
            return explicit_name

        parsed_uri = urlparse(self.MONGODB_URI or "")
        if parsed_uri.path and parsed_uri.path != "/":
            return parsed_uri.path.lstrip("/")

        return "smart_public"


settings = Settings()

