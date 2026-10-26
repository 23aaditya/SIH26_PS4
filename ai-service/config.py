from pathlib import Path
from typing import Optional
import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv

ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=ENV_PATH, override=True)

class Settings(BaseSettings):
    EXPRESS_BACKEND_URL: str = os.getenv("EXPRESS_BACKEND_URL", "http://localhost:4000/api")
    AI_BACKEND_SECRET: str = os.getenv("AI_BACKEND_SECRET", "aicte_agent_secret_prod_2026_x89f_secure_token")
    PORT: int = int(os.getenv("PORT", 8000))
    HOST: str = os.getenv("HOST", "127.0.0.1")
    DB_PATH: str = os.getenv("DB_PATH", "agent_jobs.db")
    AICTE_APH_VERSION: str = os.getenv("AICTE_APH_VERSION", "APH 2024-2027")

    # Groq LLM Inference Settings
    GROQ_API_KEY: Optional[str] = (os.getenv("GROQ_API_KEY") or "").strip() or None
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")
    GROQ_ENABLED: bool = os.getenv("GROQ_ENABLED", "true").lower() in ("true", "1", "yes")
    GROQ_MAX_TOKENS: int = int(os.getenv("GROQ_MAX_TOKENS", "4096"))
    GROQ_TIMEOUT: float = float(os.getenv("GROQ_TIMEOUT", "30.0"))
    GROQ_MAX_DOC_CHARS: int = int(os.getenv("GROQ_MAX_DOC_CHARS", "12000"))

    model_config = SettingsConfigDict(env_file=str(ENV_PATH), extra="ignore")

settings = Settings()
