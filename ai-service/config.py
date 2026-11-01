from pathlib import Path
from typing import Optional
import os
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv

ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=True)

PROJECT_ROOT = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    EXPRESS_BACKEND_URL: str = os.getenv("EXPRESS_BACKEND_URL", "http://localhost:4000/api")
    AI_BACKEND_SECRET: str = os.getenv("AI_BACKEND_SECRET", "aicte_agent_secret_prod_2026_x89f_secure_token")
    PORT: int = int(os.getenv("PORT", 8000))
    HOST: str = os.getenv("HOST", "127.0.0.1")
    DB_PATH: str = os.getenv("DB_PATH", "agent_jobs.db")
    AICTE_APH_VERSION: str = os.getenv("AICTE_APH_VERSION", "APH 2024-2027")
    PREVALIDATION_STAGING_DIR: str = os.getenv("PREVALIDATION_STAGING_DIR", "D:\\SIH_DATA\\prevalidation\\staging")
    PROJECT_ROOT: Path = PROJECT_ROOT

    @field_validator("DB_PATH", "PREVALIDATION_STAGING_DIR", mode="after")
    @classmethod
    def resolve_paths(cls, v: str) -> str:
        p = Path(v)
        if not p.is_absolute():
            p = PROJECT_ROOT / p
        resolved = str(p.resolve())
        # Ensure directory exists if it's the staging directory
        if "staging" in resolved:
            Path(resolved).mkdir(parents=True, exist_ok=True)
        return resolved

    # Groq LLM Inference Settings
    GROQ_API_KEY: Optional[str] = (os.getenv("GROQ_API_KEY") or "").strip() or None
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")
    GROQ_ENABLED: bool = os.getenv("GROQ_ENABLED", "true").lower() in ("true", "1", "yes")
    GROQ_MAX_TOKENS: int = int(os.getenv("GROQ_MAX_TOKENS", "1200"))
    GROQ_TIMEOUT: float = float(os.getenv("GROQ_TIMEOUT", "30.0"))
    GROQ_MAX_DOC_CHARS: int = int(os.getenv("GROQ_MAX_DOC_CHARS", "4500"))
    GROQ_BATCH_MAX_CHARS: int = int(os.getenv("GROQ_BATCH_MAX_CHARS", "6000"))
    GROQ_DOCS_PER_BATCH: int = int(os.getenv("GROQ_DOCS_PER_BATCH", "2"))

    # Groq Centralized Rate Limiter & Scheduling Settings
    GROQ_RPM_LIMIT: int = int(os.getenv("GROQ_RPM_LIMIT", "30"))
    GROQ_TPM_LIMIT: int = int(os.getenv("GROQ_TPM_LIMIT", "8000"))
    GROQ_RPD_LIMIT: int = int(os.getenv("GROQ_RPD_LIMIT", "1000"))
    GROQ_SAFETY_MARGIN_PERCENT: float = float(os.getenv("GROQ_SAFETY_MARGIN_PERCENT", "15.0"))
    GROQ_MIN_REQUEST_INTERVAL_SECONDS: float = float(os.getenv("GROQ_MIN_REQUEST_INTERVAL_SECONDS", "2.5"))
    GROQ_MAX_RETRY_WINDOW_SECONDS: float = float(os.getenv("GROQ_MAX_RETRY_WINDOW_SECONDS", "180.0"))
    GROQ_MAX_BATCH_RETRIES: int = int(os.getenv("GROQ_MAX_BATCH_RETRIES", "3"))

    model_config = SettingsConfigDict(env_file=str(ENV_PATH), extra="ignore")

settings = Settings()
