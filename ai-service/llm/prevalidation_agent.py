"""
Single-Document Pre-Validation Agent (Phase 1).

Coordinates document extraction, rate-limited Groq LLM inference,
quote verification, and SQLite result persistence for applicant document uploads.
Strictly bounded to document-type matching and content relevance.
"""

import hashlib
import json
import logging
import os
from pathlib import Path
from typing import Dict, Any, Optional

from config import settings
from database import (
    complete_prevalidation_job,
    fail_or_retry_prevalidation_job,
)
from extractor import document_extractor
from llm.client import groq_client, parse_retry_after
from llm.prompts import (
    PREVALIDATION_SYSTEM_PROMPT,
    build_document_prevalidation_prompt,
)
from llm.scheduler import groq_scheduler
from llm.scrutiny_agent import normalize_text_for_comparison

logger = logging.getLogger("ai_scrutiny_service.prevalidation_agent")


def compute_prevalidation_cache_key(
    application_id: str,
    checksum: str,
    requirement_id: str,
    category: str,
    program_context_hash: Optional[str] = None,
    clause_version: str = "APH_2024_2027",
    prompt_version: str = "PV_PROMPT_V2.1",
    model: Optional[str] = None,
) -> str:
    """
    Compute application-scoped composite cache key ensuring contextual isolation.
    """
    raw_key = (
        f"{application_id}:"
        f"{checksum}:"
        f"{requirement_id}:"
        f"{category}:"
        f"{program_context_hash or 'DEFAULT'}:"
        f"{clause_version}:"
        f"{prompt_version}:"
        f"{model or settings.GROQ_MODEL}"
    )
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


class PrevalidationAgent:
    """
    Orchestrates targeted single-document qualitative pre-validation.
    """

    async def prevalidate_staged_document(
        self,
        job_record: Dict[str, Any],
        worker_token: str,
    ) -> bool:
        """
        Execute pre-validation for a claimed job using its staged PDF.
        Returns True if job was processed and persisted under the claim token,
        False if fenced out or failed.
        """
        job_id = job_record["job_id"]
        application_id = job_record["application_id"]
        staged_path = job_record.get("staged_file_path")
        expected_checksum = job_record.get("checksum")
        doc_name = job_record.get("filename") or "document.pdf"
        app_category = job_record.get("application_category") or "other"
        req_id = job_record.get("requirement_id") or "UNKNOWN_REQ"

        logger.info(
            f"PrevalidationAgent: Starting pre-validation for job {job_id} "
            f"(app={application_id}, doc={job_record.get('document_id')})"
        )

        # 1. Verify physical staged file
        if not staged_path or not os.path.exists(staged_path):
            logger.error(f"PrevalidationAgent: Staged file not found at {staged_path}")
            return fail_or_retry_prevalidation_job(
                job_id,
                worker_token,
                error_message=f"Staged document file not found at path {staged_path}.",
                http_status=404,
                retry_delay=None,
            )

        try:
            with open(staged_path, "rb") as f:
                pdf_bytes = f.read()
        except Exception as e:
            logger.error(f"PrevalidationAgent: Failed to read staged file {staged_path}: {e}")
            return fail_or_retry_prevalidation_job(
                job_id,
                worker_token,
                error_message=f"Failed to read staged document file: {str(e)}",
                http_status=500,
                retry_delay=None,
            )

        # 2. Checksum verification
        actual_checksum = hashlib.sha256(pdf_bytes).hexdigest()
        if expected_checksum and actual_checksum.lower() != expected_checksum.lower():
            logger.warning(
                f"PrevalidationAgent: Checksum mismatch for job {job_id}. "
                f"Expected {expected_checksum}, got {actual_checksum}"
            )
            return fail_or_retry_prevalidation_job(
                job_id,
                worker_token,
                error_message="Cryptographic checksum mismatch between Express payload and staged bytes.",
                http_status=400,
                retry_delay=None,
            )

        # 3. Document Extraction & Multi-Condition Classification
        extracted = document_extractor.classify_and_extract(pdf_bytes, filename=doc_name)
        classification_state = extracted.get("classification_state", "RELEVANT_DIGITAL_TEXT")

        logger.info(f"PrevalidationAgent: Job {job_id} document extracted state: {classification_state}")

        # Case A: Corrupted / Unreadable File
        if classification_state == "CORRUPTED_FILE":
            return complete_prevalidation_job(
                job_id,
                worker_token,
                {
                    "classification_result": "MANUAL_REVIEW_REQUIRED",
                    "advisory_message": (
                        "The uploaded file could not be read or parsed. Please verify that the file "
                        "is not corrupted, password-protected, or damaged, and re-upload if needed."
                    ),
                    "evidence_excerpt": "",
                    "facts_vs_inference": "FACT: File parser was unable to read valid PDF streams or text.",
                    "recommended_action": "CHECK_AND_REPLACE",
                    "model_used": "NONE_PARSER_ERROR",
                },
            )

        # Case B: Blank PDF
        if classification_state == "BLANK_PDF":
            return complete_prevalidation_job(
                job_id,
                worker_token,
                {
                    "classification_result": "INSUFFICIENT_EVIDENCE",
                    "advisory_message": (
                        "The uploaded document appears to contain blank or empty pages. "
                        "Please inspect your file and re-upload the complete document."
                    ),
                    "evidence_excerpt": "",
                    "facts_vs_inference": "FACT: Zero digital text characters and zero image streams detected.",
                    "recommended_action": "CHECK_AND_REPLACE",
                    "model_used": "NONE_BLANK_FILE",
                },
            )

        # Case C: Image-Only Scanned PDF
        if classification_state == "IMAGE_ONLY_SCANNED":
            return complete_prevalidation_job(
                job_id,
                worker_token,
                {
                    "classification_result": "MANUAL_REVIEW_REQUIRED",
                    "advisory_message": (
                        "Automatic text-based assessment is unavailable for this document. "
                        "This does not necessarily mean the document is incorrect. "
                        "Please verify that the complete document has been uploaded. "
                        "The document will undergo manual inspection by the Scrutiny Officer."
                    ),
                    "evidence_excerpt": "",
                    "facts_vs_inference": "FACT: Document contains visual/raster images without extractable digital text stream.",
                    "recommended_action": "NONE",
                    "model_used": "NONE_SCANNED_PDF",
                },
            )

        # Case D: Legitimate Short Digital Certificate (< 150 chars)
        if classification_state == "SHORT_OR_BRIEF_TEXT":
            brief_text = extracted.get("full_text", "").strip()[:150]
            return complete_prevalidation_job(
                job_id,
                worker_token,
                {
                    "classification_result": "MANUAL_REVIEW_REQUIRED",
                    "advisory_message": (
                        "Extracted text is brief (e.g. single-page sanction/certificate). "
                        "Document appears readable but contains limited text for automated scoring; "
                        "it will be verified manually by the Scrutiny Officer."
                    ),
                    "evidence_excerpt": brief_text,
                    "facts_vs_inference": f"FACT: Extracted digital text is brief ({extracted.get('total_chars', 0)} characters).",
                    "recommended_action": "NONE",
                    "model_used": "NONE_BRIEF_TEXT",
                },
            )

        # Case E: Non-standard 'other' category without canonical APH requirements
        if app_category == "other":
            return complete_prevalidation_job(
                job_id,
                worker_token,
                {
                    "classification_result": "MANUAL_REVIEW_REQUIRED",
                    "advisory_message": (
                        "This document requirement belongs to a specialized or non-standard application category "
                        "that requires custom manual evaluation by the AICTE Scrutiny Officer. "
                        "Automated pre-validation is disabled for this field."
                    ),
                    "evidence_excerpt": "",
                    "facts_vs_inference": "FACT: Application category 'other' does not define an automated APH statutory checklist.",
                    "recommended_action": "NONE",
                    "model_used": "NONE_UNMAPPED_CATEGORY",
                },
            )

        # Case F: Substantive Digital Text -> Scheduled Groq LLM Inference
        prompt = build_document_prevalidation_prompt(
            document_name=doc_name,
            requirement_description=job_record.get("requirement_description") or "",
            aph_clause=job_record.get("aph_clause") or "",
            application_category=app_category,
            document_text=extracted.get("full_text", ""),
            filename=doc_name,
            program_context=job_record.get("program_context"),
        )

        # Acquire reservation under shared Groq budget with normal priority
        try:
            await groq_scheduler.acquire_slot(
                application_id=application_id,
                batch_index=1,
                priority="normal",
                max_wait_seconds=60.0,
            )
        except Exception as e:
            logger.warning(f"PrevalidationAgent: Scheduler wait timed out for job {job_id}: {e}")
            return fail_or_retry_prevalidation_job(
                job_id,
                worker_token,
                error_message=f"Rate limit scheduler timed out: {str(e)}",
                http_status=429,
                retry_delay=10.0,
            )

        # Execute Groq chat completion with JSON mode
        try:
            llm_res = await groq_client.generate_chat_completion(
                system_prompt=PREVALIDATION_SYSTEM_PROMPT,
                user_prompt=prompt,
                application_id=application_id,
                batch_index=1,
            )
        except Exception as e:
            logger.error(f"PrevalidationAgent: Groq API call crashed for job {job_id}: {e}")
            return fail_or_retry_prevalidation_job(
                job_id,
                worker_token,
                error_message=f"Groq API communication error: {str(e)}",
                http_status=502,
                retry_delay=15.0,
            )

        # Check for rate-limiting or provider failures
        if llm_res.get("status") == "TECHNICAL_FAILURE":
            http_status = llm_res.get("http_status") or 500
            err_msg = llm_res.get("error_message") or "Groq API error during pre-validation."
            retry_delay = 10.0 if http_status == 429 else 15.0
            return fail_or_retry_prevalidation_job(
                job_id,
                worker_token,
                error_message=err_msg,
                http_status=http_status,
                retry_delay=retry_delay,
            )

        raw_content = llm_res.get("raw_content") or "{}"
        try:
            parsed = json.loads(raw_content)
        except Exception:
            parsed = {
                "classification_result": "INSUFFICIENT_EVIDENCE",
                "advisory_message": "Document content could not be parsed into structured advisory format.",
                "evidence_excerpt": "",
                "facts_vs_inference": "FACT: LLM response was not valid JSON.",
                "recommended_action": "NONE",
            }

        # Validate classification result enum
        valid_results = {"LIKELY_MATCH", "POSSIBLE_MISMATCH", "INSUFFICIENT_EVIDENCE"}
        c_result = parsed.get("classification_result", "INSUFFICIENT_EVIDENCE")
        if c_result not in valid_results:
            c_result = "INSUFFICIENT_EVIDENCE"

        # Verify evidence excerpt against source text
        raw_excerpt = (parsed.get("evidence_excerpt") or "").strip()
        verified_excerpt = raw_excerpt
        if raw_excerpt:
            norm_doc = normalize_text_for_comparison(extracted.get("full_text", ""))
            norm_exc = normalize_text_for_comparison(raw_excerpt)
            if norm_exc not in norm_doc and len(norm_exc) > 10:
                logger.info(f"PrevalidationAgent: Excerpt not verbatim in document for job {job_id}; omitting quote.")
                verified_excerpt = ""

        # Persist completed prevalidation result with claim token fencing
        update_data = {
            "classification_result": c_result,
            "advisory_message": parsed.get("advisory_message") or "Preliminary content relevance check completed.",
            "evidence_excerpt": verified_excerpt,
            "facts_vs_inference": parsed.get("facts_vs_inference") or "",
            "recommended_action": parsed.get("recommended_action") or ("CHECK_AND_REPLACE" if c_result == "POSSIBLE_MISMATCH" else "CONTINUE_UPLOADS"),
            "model_used": llm_res.get("model_used") or settings.GROQ_MODEL,
        }

        success = complete_prevalidation_job(job_id, worker_token, update_data)
        if not success:
            logger.warning(f"PrevalidationAgent: Fenced out on completion for job {job_id} (lease expired/reclaimed).")
            return False

        logger.info(f"PrevalidationAgent: Successfully completed job {job_id} ({c_result}).")
        return True


prevalidation_agent = PrevalidationAgent()
