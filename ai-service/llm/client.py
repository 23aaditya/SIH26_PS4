"""
Groq API client wrapper for AICTE Scrutiny Service (Phase 3).
Handles API key management, JSON mode chat completions, and resilient error recovery.
Never logs secrets, tokens, or untrusted payload contents.
"""
import logging
import re
from typing import Optional, Dict, Any, Tuple

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


def extract_groq_error_details(e: Any) -> Tuple[Optional[int], Optional[int], Optional[int], str]:
    """
    Extract (http_status, requested_tokens, token_limit, sanitized_message)
    from a Groq exception or error payload.
    Redacts secrets and internal identifiers while preserving regulatory and token diagnostics.
    """
    status_code = getattr(e, "status_code", None)
    raw_str = str(e)
    body = getattr(e, "body", None)
    if isinstance(body, dict):
        err_dict = body.get("error", {})
        if isinstance(err_dict, dict) and "message" in err_dict:
            raw_str = f"{err_dict['message']} {raw_str}"

    # Extract requested and limit tokens if available in message
    req_m = re.search(r"(?:requested|requesting)\s*[:=]?\s*(\d[\d,]*)", raw_str, re.IGNORECASE)
    lim_m = re.search(r"(?:limit|max(?:imum)?)\s*[:=]?\s*(\d[\d,]*)", raw_str, re.IGNORECASE)
    requested_tokens = int(req_m.group(1).replace(",", "")) if req_m else None
    token_limit = int(lim_m.group(1).replace(",", "")) if lim_m else None

    # Determine status code if not already set on exception
    if status_code is None:
        if "413" in raw_str or "payload too large" in raw_str.lower() or "request entity too large" in raw_str.lower():
            status_code = 413
        elif "429" in raw_str or "rate limit" in raw_str.lower():
            status_code = 429
        elif "401" in raw_str or "unauthorized" in raw_str.lower():
            status_code = 401
        elif "404" in raw_str:
            status_code = 404

    # Sanitize message: redact API keys, Bearer tokens, organization IDs
    sanitized = raw_str
    sanitized = re.sub(r"gsk_[a-zA-Z0-9_\-]+", "[REDACTED_API_KEY]", sanitized)
    sanitized = re.sub(r"org_[a-zA-Z0-9_\-]+", "[REDACTED_ORG]", sanitized)
    sanitized = re.sub(r"Bearer\s+[a-zA-Z0-9_\-\.]+", "Bearer [REDACTED]", sanitized)

    # 1. HTTP 413 (Payload Too Large / Requested tokens exceed model token limit)
    if status_code == 413 or (requested_tokens and token_limit and requested_tokens > token_limit):
        status_code = 413
        if requested_tokens and token_limit:
            msg = (
                f"Groq request entity too large (HTTP 413): "
                f"Requested {requested_tokens:,} tokens exceeds model limit of {token_limit:,} tokens."
            )
        else:
            msg = "Groq request entity too large (HTTP 413): Total request payload exceeded Groq model token limit."
        return 413, requested_tokens, token_limit, msg

    # 2. HTTP 429 (Rate Limit / Quota Exceeded)
    if status_code == 429:
        is_quota = "quota" in raw_str.lower() or "credit" in raw_str.lower() or "balance" in raw_str.lower()
        if is_quota:
            msg = "Groq API monthly or organization token quota exceeded. Account credit required."
        else:
            msg = "Groq API requests-per-minute (RPM) rate limit reached."
        return 429, requested_tokens, token_limit, msg

    # 3. HTTP 401 (Unauthorized)
    if status_code == 401:
        return 401, requested_tokens, token_limit, "Invalid Groq API Key or authentication failure."

    # 4. HTTP 404 (Model Not Found)
    if status_code == 404:
        return 404, requested_tokens, token_limit, "Groq model is unavailable or not accessible with current API key."

    clean_msg = re.sub(r"Error code:\s*\d+\s*-\s*", "", sanitized).strip()
    return status_code, requested_tokens, token_limit, f"Groq API returned HTTP error {status_code or 500}: {clean_msg[:200]}"


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
                "http_status": None,
                "requested_tokens": None,
                "token_limit": None,
            }

        if not settings.GROQ_API_KEY or not settings.GROQ_API_KEY.strip():
            logger.info("GROQ_API_KEY is not configured. Qualitative LLM scrutiny skipped.")
            return {
                "raw_content": None,
                "model_used": settings.GROQ_MODEL,
                "status": "SKIPPED",
                "error_message": "GROQ_API_KEY is not set.",
                "http_status": None,
                "requested_tokens": None,
                "token_limit": None,
            }

        if not GROQ_SDK_AVAILABLE:
            err_msg = "Groq SDK is not installed in the environment."
            logger.error(err_msg)
            return {
                "raw_content": None,
                "model_used": settings.GROQ_MODEL,
                "status": "TECHNICAL_FAILURE",
                "error_message": err_msg,
                "http_status": None,
                "requested_tokens": None,
                "token_limit": None,
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
                    "http_status": 200,
                    "requested_tokens": None,
                    "token_limit": None,
                }

            except RateLimitError as rle:
                status_code, req_tokens, lim_tokens, sanitized_msg = extract_groq_error_details(rle)

                # Check if this RateLimitError is actually an oversized request (HTTP 413) or token limit overflow
                if status_code == 413 or (req_tokens and lim_tokens and req_tokens > lim_tokens):
                    logger.warning(
                        f"Groq request entity too large (HTTP 413, aborting retries): {sanitized_msg}"
                    )
                    return {
                        "raw_content": None,
                        "model_used": active_model,
                        "status": "TECHNICAL_FAILURE",
                        "error_message": sanitized_msg,
                        "http_status": 413,
                        "requested_tokens": req_tokens,
                        "token_limit": lim_tokens,
                    }

                # Quota exceeded (e.g. monthly credits exhausted): DO NOT RETRY
                is_quota = "quota" in str(rle).lower() or "credit" in str(rle).lower() or "balance" in str(rle).lower()
                if is_quota:
                    logger.warning(f"Groq Quota Exceeded (aborting retries): {sanitized_msg}")
                    return {
                        "raw_content": None,
                        "model_used": active_model,
                        "status": "TECHNICAL_FAILURE",
                        "error_message": sanitized_msg,
                        "http_status": 429,
                        "requested_tokens": req_tokens,
                        "token_limit": lim_tokens,
                    }

                # RPM rate limit: back off and retry
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
                        "http_status": 429,
                        "requested_tokens": req_tokens,
                        "token_limit": lim_tokens,
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
                    "http_status": 408,
                    "requested_tokens": None,
                    "token_limit": None,
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
                    "http_status": None,
                    "requested_tokens": None,
                    "token_limit": None,
                }

            except APIStatusError as e:
                status_code, req_tokens, lim_tokens, sanitized_msg = extract_groq_error_details(e)

                # HTTP 413: DO NOT RETRY an unchanged oversized request!
                if status_code == 413 or (req_tokens and lim_tokens and req_tokens > lim_tokens):
                    logger.warning(
                        f"Groq HTTP 413 Request Entity Too Large (aborting retries): {sanitized_msg}"
                    )
                    return {
                        "raw_content": None,
                        "model_used": active_model,
                        "status": "TECHNICAL_FAILURE",
                        "error_message": sanitized_msg,
                        "http_status": 413,
                        "requested_tokens": req_tokens,
                        "token_limit": lim_tokens,
                    }

                # HTTP 429: Rate limit or quota
                if status_code == 429:
                    is_quota = "quota" in str(e).lower() or "credit" in str(e).lower() or "balance" in str(e).lower()
                    if is_quota:
                        logger.warning(f"Groq Quota Exceeded: {sanitized_msg}")
                        return {
                            "raw_content": None,
                            "model_used": active_model,
                            "status": "TECHNICAL_FAILURE",
                            "error_message": sanitized_msg,
                            "http_status": 429,
                            "requested_tokens": req_tokens,
                            "token_limit": lim_tokens,
                        }
                    if attempt < max_retries:
                        wait_sec = 2.0 * (attempt + 1)
                        import asyncio
                        await asyncio.sleep(wait_sec)
                        continue
                    return {
                        "raw_content": None,
                        "model_used": active_model,
                        "status": "TECHNICAL_FAILURE",
                        "error_message": f"{sanitized_msg} Retry limit reached. Please re-run scrutiny in a moment.",
                        "http_status": 429,
                        "requested_tokens": req_tokens,
                        "token_limit": lim_tokens,
                    }

                logger.error(f"Groq API status error: {sanitized_msg}")
                return {
                    "raw_content": None,
                    "model_used": active_model,
                    "status": "TECHNICAL_FAILURE",
                    "error_message": sanitized_msg,
                    "http_status": status_code,
                    "requested_tokens": req_tokens,
                    "token_limit": lim_tokens,
                }

            except Exception as e:
                logger.error(f"Unexpected error during Groq inference: {type(e).__name__}: {e}")
                status_code, req_tokens, lim_tokens, sanitized_msg = extract_groq_error_details(e)
                return {
                    "raw_content": None,
                    "model_used": active_model,
                    "status": "TECHNICAL_FAILURE",
                    "error_message": sanitized_msg or f"LLM inference failure: {type(e).__name__}",
                    "http_status": status_code,
                    "requested_tokens": req_tokens,
                    "token_limit": lim_tokens,
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
