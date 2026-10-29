"""
Advisory Scrutiny Agent orchestrating qualitative LLM scrutiny alongside deterministic rules (Phase 3).
Validates all outputs against strict Pydantic schemas and enforces safe failure handling.
Features bounded multi-document batching to eliminate Groq HTTP 413 context overflows.
"""
import json
import logging
import re
from typing import Dict, Any, List, Optional

from config import settings
from models.schemas import LLMFinding, LLMAnalysisResult
from llm.client import groq_client
from llm.prompts import (
    SCRUTINY_SYSTEM_PROMPT,
    build_batch_scrutiny_user_prompt,
    build_scrutiny_user_prompt,
)

logger = logging.getLogger("ai_scrutiny_service.scrutiny_agent")

VALID_SEVERITIES = {"ADVISORY_LOW", "ADVISORY_MEDIUM", "ADVISORY_HIGH"}


def normalize_text_for_comparison(txt: str) -> str:
    """Normalize text for reliable fuzzy excerpt verification."""
    return re.sub(r"[^\w\s]", "", (txt or "").lower()).replace("\n", " ").strip()


class ScrutinyAgent:
    """
    Orchestrates LLM-based qualitative scrutiny using Groq.
    Acts purely as an advisory assistant to human Scrutiny Officers.
    Implements bounded document batching to prevent HTTP 413 token overflow.
    """

    def __init__(self, client=None):
        self.client = client or groq_client

    def create_document_batches(
        self,
        extracted_docs: Dict[str, Dict[str, Any]],
        max_chars_per_batch: int = 8000,
        max_docs_per_batch: int = 2,
    ) -> List[Dict[str, Dict[str, Any]]]:
        """
        Group extracted documents into bounded batches to enforce Groq token limits.
        Guarantees that no single request exceeds the model TPM / context ceiling.
        """
        if not extracted_docs:
            return []

        batches: List[Dict[str, Dict[str, Any]]] = []
        current_batch: Dict[str, Dict[str, Any]] = {}
        current_chars = 0

        # Sort doc IDs for deterministic, reproducible batching
        for doc_id in sorted(extracted_docs.keys()):
            doc_info = extracted_docs[doc_id]
            doc_text = doc_info.get("full_text") or ""
            doc_len = len(doc_text)

            # Check if adding this document breaches batch constraints
            would_exceed_chars = (current_chars + min(doc_len, 3500)) > max_chars_per_batch
            would_exceed_docs = len(current_batch) >= max_docs_per_batch

            if current_batch and (would_exceed_chars or would_exceed_docs):
                batches.append(current_batch)
                current_batch = {}
                current_chars = 0

            current_batch[doc_id] = doc_info
            current_chars += min(doc_len, 3500)

        if current_batch:
            batches.append(current_batch)

        return batches

    async def analyze_application(
        self,
        app_data: Dict[str, Any],
        extracted_docs: Dict[str, Dict[str, Any]],
        deterministic_findings: List[Any],
    ) -> LLMAnalysisResult:
        """
        Perform qualitative analysis on extracted application documents using bounded batching.
        Identifies contextual inconsistencies, missing schedules, and ambiguities.
        Returns validated LLMAnalysisResult supporting partial analysis on batch failure.
        """
        # If disabled or unconfigured, return safe non-failing result immediately
        if not settings.GROQ_ENABLED:
            return LLMAnalysisResult(
                status="DISABLED",
                model_used=settings.GROQ_MODEL,
                findings=[],
                summary="Groq LLM qualitative scrutiny is disabled via configuration.",
                http_status=None,
                requested_tokens=None,
                token_limit=None,
                total_batches=0,
                successful_batches=0,
            )

        if not settings.GROQ_API_KEY or not settings.GROQ_API_KEY.strip():
            return LLMAnalysisResult(
                status="SKIPPED",
                model_used=settings.GROQ_MODEL,
                findings=[],
                summary="Groq LLM qualitative scrutiny skipped: GROQ_API_KEY is not configured.",
                http_status=None,
                requested_tokens=None,
                token_limit=None,
                total_batches=0,
                successful_batches=0,
            )

        if not extracted_docs:
            return LLMAnalysisResult(
                status="SUCCESS",
                model_used=settings.GROQ_MODEL,
                findings=[],
                summary="No applicant documents submitted for qualitative scrutiny.",
                http_status=200,
                requested_tokens=None,
                token_limit=None,
                total_batches=0,
                successful_batches=0,
            )

        try:
            # 1. Partition documents into bounded batches to eliminate HTTP 413 overflows
            batches = self.create_document_batches(
                extracted_docs,
                max_chars_per_batch=settings.GROQ_BATCH_MAX_CHARS,
                max_docs_per_batch=settings.GROQ_DOCS_PER_BATCH,
            )
            total_batches = len(batches)

            all_findings: List[LLMFinding] = []
            batch_summaries: List[str] = []
            batch_errors: List[str] = []
            successful_batches = 0
            last_http_status: Optional[int] = None
            last_requested_tokens: Optional[int] = None
            last_token_limit: Optional[int] = None
            active_model = settings.GROQ_MODEL

            for b_idx, batch_docs in enumerate(batches):
                batch_num = b_idx + 1
                logger.info(
                    f"Processing LLM scrutiny batch {batch_num}/{total_batches} "
                    f"({len(batch_docs)} documents: {list(batch_docs.keys())})..."
                )

                # 2. Build bounded user prompt for this specific batch
                user_prompt = build_batch_scrutiny_user_prompt(
                    app_data=app_data,
                    batch_docs=batch_docs,
                    deterministic_findings=deterministic_findings,
                    batch_index=batch_num,
                    total_batches=total_batches,
                    max_doc_chars=settings.GROQ_MAX_DOC_CHARS,
                )

                # 3. Invoke Groq completion in JSON mode
                completion_result = await self.client.generate_chat_completion(
                    system_prompt=SCRUTINY_SYSTEM_PROMPT,
                    user_prompt=user_prompt,
                    model=settings.GROQ_MODEL,
                )

                b_status = completion_result.get("status")
                active_model = completion_result.get("model_used") or active_model
                raw_content = completion_result.get("raw_content")
                error_msg = completion_result.get("error_message")
                b_http_status = completion_result.get("http_status")
                b_req_tokens = completion_result.get("requested_tokens")
                b_lim_tokens = completion_result.get("token_limit")

                if b_http_status:
                    last_http_status = b_http_status
                if b_req_tokens:
                    last_requested_tokens = b_req_tokens
                if b_lim_tokens:
                    last_token_limit = b_lim_tokens

                # Handle batch failure
                if b_status != "SUCCESS" or not raw_content:
                    err_desc = error_msg or f"HTTP status {b_http_status or 'unknown'}"
                    logger.warning(
                        f"Batch {batch_num}/{total_batches} failed with status {b_status}: {err_desc}"
                    )
                    batch_errors.append(f"Batch {batch_num} ({', '.join(batch_docs.keys())}): {err_desc}")
                    continue

                # 4. Parse and validate JSON structure for this batch
                try:
                    parsed = json.loads(raw_content)
                except json.JSONDecodeError as decode_err:
                    logger.warning(f"Malformed JSON in batch {batch_num}: {decode_err}")
                    batch_errors.append(f"Batch {batch_num}: Malformed JSON output from model")
                    continue

                if not isinstance(parsed, dict):
                    batch_errors.append(f"Batch {batch_num}: Output was not a JSON dictionary")
                    continue

                b_summary = parsed.get("summary")
                if b_summary and isinstance(b_summary, str) and b_summary.strip():
                    batch_summaries.append(b_summary.strip())

                raw_findings = parsed.get("findings") or []
                batch_findings: List[LLMFinding] = []

                for item in raw_findings:
                    if not isinstance(item, dict):
                        continue
                    try:
                        sev = str(item.get("severity_suggestion", "ADVISORY_LOW")).upper().strip()
                        if sev not in VALID_SEVERITIES:
                            sev = "ADVISORY_LOW"

                        raw_conf = item.get("confidence", 0.7)
                        try:
                            conf = max(0.0, min(1.0, float(raw_conf)))
                        except (ValueError, TypeError):
                            conf = 0.7

                        raw_excerpt = str(item.get("evidence_excerpt", ""))[:300].strip()
                        doc_id_ref = item.get("document_id")

                        # Verify that quoted excerpt actually appears in extracted text
                        excerpt_verified = True
                        if raw_excerpt and len(raw_excerpt) >= 15:
                            norm_exc = normalize_text_for_comparison(raw_excerpt)
                            found = False
                            # Check referenced doc first
                            if doc_id_ref and doc_id_ref in extracted_docs:
                                doc_full = normalize_text_for_comparison(extracted_docs[doc_id_ref].get("full_text", ""))
                                if norm_exc in doc_full or norm_exc[:45] in doc_full:
                                    found = True
                            if not found:
                                for d_info in extracted_docs.values():
                                    doc_full = normalize_text_for_comparison(d_info.get("full_text", ""))
                                    if norm_exc in doc_full or norm_exc[:45] in doc_full:
                                        found = True
                                        break
                            if not found:
                                excerpt_verified = False
                                conf = max(0.3, conf - 0.2)

                        rec = str(item.get("human_review_recommendation", "Review submitted documentation."))
                        if not excerpt_verified:
                            rec = f"[Manual Excerpt Verification Required] {rec}"

                        finding = LLMFinding(
                            finding_type=str(item.get("finding_type", "QUALITATIVE_OBSERVATION")),
                            explanation=str(item.get("explanation", "Observation flagged for verification.")),
                            severity_suggestion=sev,
                            evidence_excerpt=raw_excerpt,
                            document_id=doc_id_ref,
                            document_name=item.get("document_name"),
                            page_number=int(item["page_number"]) if item.get("page_number") is not None and str(item["page_number"]).isdigit() else None,
                            confidence=round(conf, 2),
                            human_review_recommendation=rec,
                            facts_vs_inference=item.get("facts_vs_inference"),
                            significance=item.get("significance"),
                            excerpt_verified=excerpt_verified,
                            is_llm_generated=True,
                        )
                        batch_findings.append(finding)
                    except Exception as val_err:
                        logger.warning(f"Skipping unparseable LLM finding in batch {batch_num}: {val_err}")

                all_findings.extend(batch_findings)
                successful_batches += 1

            # 5. Deduplicate findings across batches
            seen_signatures = set()
            unique_findings: List[LLMFinding] = []
            for f in all_findings:
                sig = (f.document_id, f.page_number, normalize_text_for_comparison(f.evidence_excerpt[:50] or f.finding_type))
                if sig not in seen_signatures:
                    seen_signatures.add(sig)
                    unique_findings.append(f)

            # 6. Synthesize multi-batch summary
            if batch_summaries:
                combined_summary = " ".join(batch_summaries)
            elif unique_findings:
                combined_summary = f"Qualitative scrutiny completed across {successful_batches} document batch(es)."
            else:
                combined_summary = "No qualitative discrepancies or conditional clauses detected across submitted documents."

            # 7. Determine overall LLM status
            if successful_batches == total_batches:
                overall_status = "SUCCESS"
                overall_error = None
            elif successful_batches > 0:
                overall_status = "PARTIAL_ANALYSIS"
                overall_error = (
                    f"LLM qualitative scrutiny was partially completed: {total_batches - successful_batches} of "
                    f"{total_batches} document batch(es) failed: {'; '.join(batch_errors)}. "
                    f"Findings from successful batches are preserved."
                )
                combined_summary = f"[Partial Analysis: {successful_batches}/{total_batches} batches processed] {combined_summary}"
            else:
                overall_status = "TECHNICAL_FAILURE"
                overall_error = (
                    f"LLM qualitative scrutiny failed across all {total_batches} batch(es): "
                    f"{'; '.join(batch_errors)}"
                )
                combined_summary = None

            logger.info(
                f"LLM analysis concluded: status={overall_status}, batches={successful_batches}/{total_batches}, "
                f"findings={len(unique_findings)}, http_status={last_http_status}"
            )

            return LLMAnalysisResult(
                status=overall_status,
                model_used=active_model,
                findings=unique_findings,
                summary=combined_summary,
                error_message=overall_error,
                http_status=last_http_status,
                requested_tokens=last_requested_tokens,
                token_limit=last_token_limit,
                total_batches=total_batches,
                successful_batches=successful_batches,
            )

        except Exception as e:
            logger.error(f"Error during advisory scrutiny execution: {type(e).__name__}: {str(e)}", exc_info=True)
            return LLMAnalysisResult(
                status="TECHNICAL_FAILURE",
                model_used=settings.GROQ_MODEL,
                findings=[],
                summary=None,
                error_message=f"Scrutiny analysis technical error: {type(e).__name__}",
                http_status=500,
                requested_tokens=None,
                token_limit=None,
                total_batches=0,
                successful_batches=0,
            )


scrutiny_agent = ScrutinyAgent()
