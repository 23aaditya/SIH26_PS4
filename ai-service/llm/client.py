"""
Groq API client wrapper for AICTE Scrutiny Service (Phase 3).
Handles API key management, JSON mode chat completions, and resilient error recovery.
Never logs secrets, tokens, or untrusted payload contents.
"""
import logging
from typing import Optional, Dict, Any

from config import settings
from models.schemas import LLMAnalysisResult

logger = logging.getLogger("ai_scrutiny_service.groq_client")

# Optional import of groq with graceful fallback
try:
    from groq import AsyncGroq, RateLimitError, APITimeoutError, APIConnectionError, APIStatusError
    GROQ_SDK_AVAILABLE = True
except ImportError:
    AsyncGroq = None
    RateLimitError = Exception
    APITimeoutError = Exception
    APIConnectionError = Exception
    APIStatusError = Exception
    GROQ_SDK_AVAILABLE = False
    logger.warning("Groq SDK is not installed in current Python environment.")


class GroqScrutinyClient:
    """
    Isolated client for performing advisory LLM inferences via Groq.
    Guarantees that credentials are never logged, leaked, or exposed in error messages.
    """

    def __init__(self):
        self._client: Optional[Any] = None

    def is_configured(self) -> bool:
        """Check whether Groq inference is enabled and has an API key configured."""
        if not settings.GROQ_ENABLED:
            return False
        if not settings.GROQ_API_KEY or not settings.GROQ_API_KEY.strip():
            return False
        return GROQ_SDK_AVAILABLE

    def _get_client(self) -> Optional[Any]:
        if not self.is_configured():
            return None
        if self._client is None and AsyncGroq is not None:
            # Initialize AsyncGroq with configured API key and timeout
            self._client = AsyncGroq(
                api_key=settings.GROQ_API_KEY.strip(),
                timeout=settings.GROQ_TIMEOUT,
            )
        return self._client

    async def generate_chat_completion(
        self,
        system_prompt: str,
        user_prompt: str,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Execute chat completion in JSON mode.
        Returns a dict containing:
          - "raw_content": str (JSON string) or None
          - "model_used": str
          - "status": str ("SUCCESS", "DISABLED", "SKIPPED", "TECHNICAL_FAILURE")
          - "error_message": Optional[str]
        """
        if not settings.GROQ_ENABLED:
            logger.info("Groq LLM analysis is disabled via configuration (GROQ_ENABLED=false). Skipping inference.")
            return {
                "raw_content": None,
                "model_used": settings.GROQ_MODEL,
                "status": "DISABLED",
                "error_message": "Groq LLM scrutiny is disabled via configuration.",
            }

        if not settings.GROQ_API_KEY or not settings.GROQ_API_KEY.strip():
            logger.info("GROQ_API_KEY is not configured. Qualitative LLM scrutiny skipped.")
            return {
                "raw_content": None,
                "model_used": settings.GROQ_MODEL,
                "status": "SKIPPED",
                "error_message": "GROQ_API_KEY is not set.",
            }

        if not GROQ_SDK_AVAILABLE:
            err_msg = "Groq SDK is not installed in the environment."
            logger.error(err_msg)
            return {
                "raw_content": None,
                "model_used": settings.GROQ_MODEL,
                "status": "TECHNICAL_FAILURE",
                "error_message": err_msg,
            }

        client = self._get_client()
        active_model = model or settings.GROQ_MODEL
        max_retries = 2
        last_error_msg = None

        for attempt in range(max_retries + 1):
            try:
                logger.info(
                    f"Dispatching advisory scrutiny inference to Groq (model={active_model}, "
                    f"timeout={settings.GROQ_TIMEOUT}s, attempt={attempt + 1}/{max_retries + 1})..."
                )
                response = await client.chat.completions.create(
                    model=active_model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    response_format={"type": "json_object"},
                    max_tokens=settings.GROQ_MAX_TOKENS,
                    temperature=0.1,  # Low temperature for factual consistency
                )

                if not response.choices or not response.choices[0].message:
                    return {
                        "raw_content": None,
                        "model_used": active_model,
                        "status": "TECHNICAL_FAILURE",
                        "error_message": "Groq returned an empty completion response.",
                    }

                content = response.choices[0].message.content
                logger.info(f"Groq inference succeeded using model {active_model} (finish_reason={response.choices[0].finish_reason}).")
                return {
                    "raw_content": content,
                    "model_used": active_model,
                    "status": "SUCCESS",
                    "error_message": None,
                }

            except RateLimitError as rle:
                err_text = str(rle).lower()
                is_quota = "quota" in err_text or "credit" in err_text or "balance" in err_text
                if is_quota:
                    sanitized_msg = "Groq API monthly or organization token quota exceeded. Account credit required."
                    logger.warning(f"Groq Quota Exceeded: {sanitized_msg}")
                    return {
                        "raw_content": None,
                        "model_used": active_model,
                        "status": "TECHNICAL_FAILURE",
                        "error_message": sanitized_msg,
                    }
                
                # Check for retry-after in headers or text
                sanitized_msg = "Groq API requests-per-minute (RPM) rate limit reached."
                if attempt < max_retries:
                    wait_sec = 2.0 * (attempt + 1)
                    logger.warning(f"Rate limited by Groq on attempt {attempt + 1}. Backing off {wait_sec}s...")
                    import asyncio
                    await asyncio.sleep(wait_sec)
                    continue
                else:
                    return {
                        "raw_content": None,
                        "model_used": active_model,
                        "status": "TECHNICAL_FAILURE",
                        "error_message": f"{sanitized_msg} Retry limit reached. Please re-run scrutiny in a moment.",
                    }

            except APITimeoutError:
                sanitized_msg = f"Groq inference timed out after {settings.GROQ_TIMEOUT}s."
                if attempt < max_retries:
                    logger.warning(f"Groq timeout on attempt {attempt + 1}. Retrying once...")
                    import asyncio
                    await asyncio.sleep(1.5)
                    continue
                return {
                    "raw_content": None,
                    "model_used": active_model,
                    "status": "TECHNICAL_FAILURE",
                    "error_message": sanitized_msg,
                }

            except APIConnectionError as ce:
                sanitized_msg = f"Network connection failure while communicating with Groq API: {type(ce).__name__}."
                if attempt < max_retries:
                    import asyncio
                    await asyncio.sleep(1.5)
                    continue
                return {
                    "raw_content": None,
                    "model_used": active_model,
                    "status": "TECHNICAL_FAILURE",
                    "error_message": sanitized_msg,
                }

            except APIStatusError as e:
                status_code = getattr(e, "status_code", 500)
                if status_code == 401:
                    sanitized_msg = "Invalid Groq API Key or authentication failure."
                elif status_code == 404:
                    sanitized_msg = f"Groq model '{active_model}' is unavailable or not accessible with current API key."
                elif status_code == 429:
                    sanitized_msg = "Groq API rate limit or organization quota reached."
                else:
                    sanitized_msg = f"Groq API returned HTTP error status {status_code}."

                logger.error(f"Groq API status error: {sanitized_msg}")
                return {
                    "raw_content": None,
                    "model_used": active_model,
                    "status": "TECHNICAL_FAILURE",
                    "error_message": sanitized_msg,
                }

            except Exception as e:
                logger.error(f"Unexpected error during Groq inference: {type(e).__name__}: {e}")
                return {
                    "raw_content": None,
                    "model_used": active_model,
                    "status": "TECHNICAL_FAILURE",
                    "error_message": f"LLM inference failure: {type(e).__name__}",
                }

    async def validate_connection(self) -> Dict[str, Any]:
        """
        Safely validate Groq configuration and connectivity without exposing API keys.
        Distinguishes: READY, INVALID_KEY, MODEL_UNAVAILABLE, RATE_LIMIT, NETWORK_FAILURE.
        """
        if not settings.GROQ_ENABLED:
            return {
                "configured": bool(settings.GROQ_API_KEY and settings.GROQ_API_KEY.strip()),
                "enabled": False,
                "status": "DISABLED",
                "category": "DISABLED",
                "message": "Groq LLM is disabled via configuration.",
            }

        if not settings.GROQ_API_KEY or not settings.GROQ_API_KEY.strip():
            return {
                "configured": False,
                "enabled": True,
                "status": "UNCONFIGURED",
                "category": "MISSING_KEY",
                "message": "GROQ_API_KEY is not configured.",
            }

        if not GROQ_SDK_AVAILABLE:
            return {
                "configured": True,
                "enabled": True,
                "status": "SDK_UNAVAILABLE",
                "category": "SDK_MISSING",
                "message": "Groq Python SDK is not installed.",
            }

        client = self._get_client()
        try:
            # Query models list safely to verify credentials and model accessibility
            models_page = await client.models.list()
            available_ids = [m.id for m in models_page.data] if hasattr(models_page, "data") else []

            model_available = settings.GROQ_MODEL in available_ids or any(
                settings.GROQ_MODEL in m for m in available_ids
            )

            if available_ids and not model_available:
                return {
                    "configured": True,
                    "enabled": True,
                    "valid": True,
                    "status": "MODEL_UNAVAILABLE",
                    "category": "MODEL_UNAVAILABLE",
                    "model": settings.GROQ_MODEL,
                    "message": f"API key is valid, but model '{settings.GROQ_MODEL}' is not in accessible models.",
                }

            return {
                "configured": True,
                "enabled": True,
                "valid": True,
                "status": "READY",
                "category": "HEALTHY",
                "model": settings.GROQ_MODEL,
                "message": "Groq LLM service is connected and operational.",
            }

        except APIStatusError as e:
            status_code = getattr(e, "status_code", 500)
            if status_code == 401:
                return {
                    "configured": True,
                    "enabled": True,
                    "valid": False,
                    "status": "INVALID_KEY",
                    "category": "INVALID_KEY",
                    "message": "Configured GROQ_API_KEY is rejected by authentication.",
                }
            elif status_code == 404:
                return {
                    "configured": True,
                    "enabled": True,
                    "valid": True,
                    "status": "MODEL_UNAVAILABLE",
                    "category": "MODEL_UNAVAILABLE",
                    "message": f"Configured model '{settings.GROQ_MODEL}' was not found.",
                }
            elif status_code == 429:
                return {
                    "configured": True,
                    "enabled": True,
                    "valid": True,
                    "status": "RATE_LIMITED",
                    "category": "RATE_LIMIT",
                    "message": "Groq rate limit reached.",
                }
            else:
                return {
                    "configured": True,
                    "enabled": True,
                    "valid": False,
                    "status": "ERROR",
                    "category": f"HTTP_{status_code}",
                    "message": f"Groq API returned HTTP error {status_code}.",
                }

        except APIConnectionError:
            return {
                "configured": True,
                "enabled": True,
                "valid": False,
                "status": "NETWORK_FAILURE",
                "category": "NETWORK_FAILURE",
                "message": "Cannot reach Groq API endpoint. Network failure.",
            }

        except Exception as e:
            return {
                "configured": True,
                "enabled": True,
                "valid": False,
                "status": "ERROR",
                "category": type(e).__name__,
                "message": f"Diagnostic check failed: {type(e).__name__}",
            }


groq_client = GroqScrutinyClient()
