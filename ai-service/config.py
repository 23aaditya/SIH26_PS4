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

    @field_validator("DB_PATH", mode="after")
    @classmethod
    def resolve_db_path(cls, v: str) -> str:
        p = Path(v)
        if not p.is_absolute():
            p = PROJECT_ROOT / p
        return str(p.resolve())

    # Groq LLM Inference Settings
    GROQ_API_KEY: Optional[str] = (os.getenv("GROQ_API_KEY") or "").strip() or None
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")
    GROQ_ENABLED: bool = os.getenv("GROQ_ENABLED", "true").lower() in ("true", "1", "yes")
    GROQ_MAX_TOKENS: int = int(os.getenv("GROQ_MAX_TOKENS", "1500"))
    GROQ_TIMEOUT: float = float(os.getenv("GROQ_TIMEOUT", "30.0"))
    GROQ_MAX_DOC_CHARS: int = int(os.getenv("GROQ_MAX_DOC_CHARS", "6000"))
    GROQ_BATCH_MAX_CHARS: int = int(os.getenv("GROQ_BATCH_MAX_CHARS", "8000"))
    GROQ_DOCS_PER_BATCH: int = int(os.getenv("GROQ_DOCS_PER_BATCH", "2"))

    model_config = SettingsConfigDict(env_file=str(ENV_PATH), extra="ignore")

settings = Settings()
