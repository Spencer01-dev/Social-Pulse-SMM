import os
from pathlib import Path
from typing import List, Optional, Union
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=os.path.join(BASE_DIR, ".env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

    PROJECT_NAME: str = "SocialPulse"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    API_V1_STR: str = "/api/v1"
    
    # JWT Authentication
    SECRET_KEY: str = "socialpulse_super_secret_jwt_key_2026_change_in_prod"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Database
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: int = 5433
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "@Oscar599"
    POSTGRES_DB: str = "socialpulse_db"
    DATABASE_URL: str = "postgresql+asyncpg://postgres:%40Oscar599@localhost:5433/socialpulse_db"
    SYNC_DATABASE_URL: str = "postgresql://postgres:%40Oscar599@localhost:5433/socialpulse_db"

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def assemble_async_db_url(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str) and v:
            if v.startswith("postgres://"):
                return v.replace("postgres://", "postgresql+asyncpg://", 1)
            elif v.startswith("postgresql://") and not v.startswith("postgresql+asyncpg://"):
                return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    @field_validator("SYNC_DATABASE_URL", mode="before")
    @classmethod
    def assemble_sync_db_url(cls, v: Optional[str]) -> Optional[str]:
        if isinstance(v, str) and v:
            if v.startswith("postgresql+asyncpg://"):
                return v.replace("postgresql+asyncpg://", "postgresql://", 1)
            elif v.startswith("postgres://"):
                return v.replace("postgres://", "postgresql://", 1)
        return v

    # Redis
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "https://*.vercel.app",
        "*"
    ]

    # Upstream Provider (Delix Gains KE)
    DELIX_API_URL: str = "https://delixgainske.com/api/v2"
    DELIX_API_KEY: str = "EVDcnX9t9VSVJdUveItbi1tbvGuVqyBCUigzGE9pEv5n7Zwa8qmJGrDoeZs3"
    USE_MOCK_PROVIDERS: bool = False

    # Payments
    MPESA_ENVIRONMENT: str = "sandbox"
    MPESA_CONSUMER_KEY: str = ""
    MPESA_CONSUMER_SECRET: str = ""
    MPESA_SHORTCODE: str = "174379"
    MPESA_PASSKEY: str = ""
    MPESA_CALLBACK_URL: str = "http://localhost:8000/api/v1/payments/mpesa/callback"

    PAYSTACK_PUBLIC_KEY: str = ""
    PAYSTACK_SECRET_KEY: str = ""

    # Currency
    PRIMARY_CURRENCY: str = "KES"
    DEFAULT_USD_TO_KES: float = 130.00
    EXCHANGE_RATE_MARKUP_PERCENT: float = 2.0


settings = Settings()
