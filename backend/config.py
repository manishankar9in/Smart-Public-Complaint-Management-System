from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "Smart Public Complaint Priority and Response System"
    MONGODB_URI: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "smart_public_complaint_db"
    FIREBASE_PROJECT_ID: str = ""
    JWT_SECRET: str = "change-me-in-production-use-long-random-string"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()

