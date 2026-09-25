from typing import Self

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_INSECURE_DEFAULT_KEY = "change-me-in-production-min-32-chars!!"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    database_url: str = "postgresql+asyncpg://eversum:secret@db:5432/eversum_db"
    database_url_sync: str = "postgresql://eversum:secret@db:5432/eversum_db"

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # JWT — v produkciji MORA biti nastavljen prek .env (openssl rand -hex 32)
    secret_key: str = _INSECURE_DEFAULT_KEY
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30

    @model_validator(mode="after")
    def validate_production_config(self) -> Self:
        if len(self.secret_key) < 32:
            raise ValueError("SECRET_KEY mora imeti vsaj 32 znakov")
        if self.environment == "production" and self.secret_key == _INSECURE_DEFAULT_KEY:
            raise ValueError("SECRET_KEY mora biti spremenjen v produkciji! Generiraj z: openssl rand -hex 32")
        return self

    # MinIO
    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "eversum-vehicle-docs"
    minio_use_ssl: bool = False

    # Celery
    celery_broker_url: str = "redis://redis:6379/1"
    celery_result_backend: str = "redis://redis:6379/2"

    # Email
    smtp_host: str = "smtp.sendgrid.net"
    smtp_port: int = 587
    smtp_user: str = "apikey"
    smtp_password: str = ""
    email_from: str = "noreply@eversum.com"

    # SMS (Twilio)
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""

    # FCM
    firebase_credentials_json: str = ""

    # Integracija z ERP (branje Last Known Configuration po VIN).
    # Prazen ključ = integracija izklopljena.
    erp_api_key: str = ""
    erp_org_name: str = "eVersum"

    # App
    environment: str = "development"
    debug: bool = True


settings = Settings()
