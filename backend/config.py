from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).resolve().parent / ".env"


class Settings(BaseSettings):
    PROJECT_NAME: str = "Smart Public Complaint Priority and Response System"
    MONGODB_URI: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "public_complaint_system"
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

    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="ignore")

settings = Settings()

