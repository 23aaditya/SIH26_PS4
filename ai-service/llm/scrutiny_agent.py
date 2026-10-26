"""
Advisory Scrutiny Agent orchestrating qualitative LLM scrutiny alongside deterministic rules (Phase 3).
Validates all outputs against strict Pydantic schemas and enforces safe failure handling.
"""
import json
import logging
from typing import Dict, Any, List, Optional

from config import settings
from models.schemas import LLMFinding, LLMAnalysisResult
from llm.client import groq_client
from llm.prompts import SCRUTINY_SYSTEM_PROMPT, build_scrutiny_user_prompt

logger = logging.getLogger("ai_scrutiny_service.scrutiny_agent")

VALID_SEVERITIES = {"ADVISORY_LOW", "ADVISORY_MEDIUM", "ADVISORY_HIGH"}

class ScrutinyAgent:
    """
    Orchestrates LLM-based qualitative scrutiny using Groq.
    Acts purely as an advisory assistant to human Scrutiny Officers.
    """

    def __init__(self, client=None):
        self.client = client or groq_client

    async def analyze_application(
        self,
        app_data: Dict[str, Any],
        extracted_docs: Dict[str, Dict[str, Any]],
        deterministic_findings: List[Any],
    ) -> LLMAnalysisResult:
        """
        Perform qualitative analysis on extracted application documents.
        Identifies contextual inconsistencies, missing schedules, and ambiguities.
        Returns validated LLMAnalysisResult.
        """
        # If disabled or unconfigured, return safe non-failing result immediately
        if not settings.GROQ_ENABLED:
            return LLMAnalysisResult(
                status="DISABLED",
                model_used=settings.GROQ_MODEL,
                findings=[],
                summary="Groq LLM qualitative scrutiny is disabled via configuration.",
            )

        if not settings.GROQ_API_KEY or not settings.GROQ_API_KEY.strip():
            return LLMAnalysisResult(
                status="SKIPPED",
                model_used=settings.GROQ_MODEL,
                findings=[],
                summary="Groq LLM qualitative scrutiny skipped: GROQ_API_KEY is not configured.",
            )

        try:
            # 1. Build bounded user prompt with sanitized, truncated document chunks
            user_prompt = build_scrutiny_user_prompt(
                app_data=app_data,
                extracted_docs=extracted_docs,
                deterministic_findings=deterministic_findings,
                max_doc_chars=settings.GROQ_MAX_DOC_CHARS,
            )

            # 2. Invoke Groq completion in JSON mode
            completion_result = await self.client.generate_chat_completion(
                system_prompt=SCRUTINY_SYSTEM_PROMPT,
                user_prompt=user_prompt,
                model=settings.GROQ_MODEL,
            )

            status = completion_result.get("status")
            model_used = completion_result.get("model_used") or settings.GROQ_MODEL
            raw_content = completion_result.get("raw_content")
            error_msg = completion_result.get("error_message")

            if status != "SUCCESS" or not raw_content:
                logger.warning(f"Groq qualitative scrutiny concluded with non-success status: {status} ({error_msg})")
                return LLMAnalysisResult(
                    status=status if status in ("DISABLED", "SKIPPED", "TECHNICAL_FAILURE") else "TECHNICAL_FAILURE",
                    model_used=model_used,
                    findings=[],
                    summary=None,
                    error_message=error_msg,
                )

            # 3. Parse and validate JSON structure
            try:
                parsed = json.loads(raw_content)
            except json.JSONDecodeError as decode_err:
                logger.error(f"Malformed JSON returned by LLM: {decode_err}")
                return LLMAnalysisResult(
                    status="TECHNICAL_FAILURE",
                    model_used=model_used,
                    findings=[],
                    summary=None,
                    error_message="Malformed JSON output from model.",
                )

            if not isinstance(parsed, dict):
                return LLMAnalysisResult(
                    status="TECHNICAL_FAILURE",
                    model_used=model_used,
                    findings=[],
                    summary=None,
                    error_message="LLM output did not return a JSON object.",
                )

            summary = parsed.get("summary") or "Qualitative scrutiny analysis completed."
            raw_findings = parsed.get("findings") or []
            validated_findings: List[LLMFinding] = []

            for item in raw_findings:
                if not isinstance(item, dict):
                    continue
                try:
                    # Sanitize severity
                    sev = str(item.get("severity_suggestion", "ADVISORY_LOW")).upper().strip()
                    if sev not in VALID_SEVERITIES:
                        sev = "ADVISORY_LOW"

                    # Sanitize confidence
                    raw_conf = item.get("confidence", 0.7)
                    try:
                        conf = max(0.0, min(1.0, float(raw_conf)))
                    except (ValueError, TypeError):
                        conf = 0.7

                    # Build validated Pydantic model
                    finding = LLMFinding(
                        finding_type=str(item.get("finding_type", "QUALITATIVE_OBSERVATION")),
                        explanation=str(item.get("explanation", "Observation flagged for verification.")),
                        severity_suggestion=sev,
                        evidence_excerpt=str(item.get("evidence_excerpt", ""))[:300],
                        document_id=item.get("document_id"),
                        document_name=item.get("document_name"),
                        page_number=int(item["page_number"]) if item.get("page_number") is not None and str(item["page_number"]).isdigit() else None,
                        confidence=conf,
                        human_review_recommendation=str(item.get("human_review_recommendation", "Review submitted documentation.")),
                        is_llm_generated=True,
                    )
                    validated_findings.append(finding)
                except Exception as val_err:
                    logger.warning(f"Skipping unparseable LLM finding item: {val_err}")

            logger.info(f"Successfully validated {len(validated_findings)} LLM advisory findings.")
            return LLMAnalysisResult(
                status="SUCCESS",
                model_used=model_used,
                findings=validated_findings,
                summary=summary,
                error_message=None,
            )

        except Exception as e:
            logger.error(f"Error during advisory scrutiny execution: {type(e).__name__}: {str(e)}", exc_info=True)
            return LLMAnalysisResult(
                status="TECHNICAL_FAILURE",
                model_used=settings.GROQ_MODEL,
                findings=[],
                summary=None,
                error_message=f"Scrutiny analysis technical error: {type(e).__name__}",
            )


scrutiny_agent = ScrutinyAgent()
