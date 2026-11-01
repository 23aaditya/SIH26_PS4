"""
Autonomous Groq Scrutiny Batch Recovery Worker (Phase 5).

Active background daemon that discovers due retry batches, atomically claims them,
executes inference through the centralized rate limiter, persists findings,
and automatically reconciles the final ReviewReport in SQLite (dev.db).
Guarantees that scrutiny officers never have to manually click 'Retry' for batches
that are already scheduled for automated recovery.
"""

import asyncio
import json
import logging
import random
import re
import sqlite3
import time
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from config import settings, PROJECT_ROOT
from database import get_connection, execute_with_retry
from llm.batch_store import (
    get_due_retry_batches,
    claim_batch_for_retry,
    revert_stale_claims,
    get_all_batches_for_version,
    upsert_batch_record,
)
from llm.scheduler import groq_scheduler, parse_retry_after, classify_rate_limit
from llm.prompts import SCRUTINY_SYSTEM_PROMPT

VALID_SEVERITIES = {"ADVISORY_LOW", "ADVISORY_MEDIUM", "ADVISORY_HIGH"}

def normalize_text_for_comparison(txt: str) -> str:
    """Normalize text for reliable fuzzy excerpt verification."""
    return re.sub(r"[^\w\s]", "", (txt or "").lower()).replace("\n", " ").strip()
from models.schemas import LLMFinding

logger = logging.getLogger("ai_scrutiny_service.recovery_worker")


async def reconcile_and_update_report(application_id: str, version_hash: str) -> Dict[str, Any]:
    """
    Reconcile all batch findings for an application document version and
    atomically update the active ReviewReport in dev.db (Prisma SQLite).
    Transitions qualitative status to SUCCESS when all batches complete.
    """
    batches = get_all_batches_for_version(application_id, version_hash)
    if not batches:
        logger.warning(f"Reconciliation: No batches found for {application_id} (version={version_hash[:10]})")
        return {"status": "NO_BATCHES", "findings_count": 0}

    total = len(batches)
    success_batches = [b for b in batches if b.get("status") == "SUCCESS"]
    retry_batches = [b for b in batches if b.get("status") == "RETRY_SCHEDULED"]
    failed_batches = [b for b in batches if b.get("status") == "FAILED"]

    # Gather and deduplicate findings across successful batches
    all_raw_findings: List[Dict[str, Any]] = []
    summaries: List[str] = []

    for b in success_batches:
        f_json = b.get("findings_json")
        if f_json:
            try:
                parsed = json.loads(f_json)
                if isinstance(parsed, list):
                    all_raw_findings.extend(parsed)
            except Exception as e:
                logger.warning(f"Error parsing batch findings during reconciliation: {e}")
        sum_text = b.get("summary_text")
        if sum_text and isinstance(sum_text, str) and sum_text.strip():
            summaries.append(sum_text.strip())

    seen_sigs = set()
    deduped_findings: List[Dict[str, Any]] = []
    for item in all_raw_findings:
        if not isinstance(item, dict):
            continue
        excerpt = item.get("evidence_excerpt") or ""
        norm_exc = normalize_text_for_comparison(excerpt[:50] or item.get("finding_type", ""))
        sig = (item.get("document_id"), item.get("page_number"), norm_exc)
        if sig not in seen_sigs:
            seen_sigs.add(sig)
            deduped_findings.append(item)

    # Determine overall qualitative status
    if len(success_batches) == total:
        overall_status = "SUCCESS"
        error_msg = None
        combined_summary = " ".join(summaries) if summaries else "Qualitative scrutiny completed successfully across all document batches."
    elif len(success_batches) > 0:
        overall_status = "PARTIAL_ANALYSIS"
        error_msg = (
            f"Qualitative scrutiny partially completed: {len(success_batches)} of {total} batches processed. "
            f"{len(retry_batches)} batch(es) awaiting automated retry. Findings from successful batches are preserved."
        )
        combined_summary = f"[Partial Analysis: {len(success_batches)}/{total} batches processed] " + (" ".join(summaries) if summaries else "")
    elif len(retry_batches) > 0:
        overall_status = "RETRY_SCHEDULED"
        error_msg = f"Groq qualitative scrutiny temporarily paused (API rate limit). {len(retry_batches)} batch(es) scheduled for automated retry."
        combined_summary = None
    else:
        overall_status = "TECHNICAL_FAILURE"
        error_msg = f"All {total} qualitative scrutiny batches failed."
        combined_summary = None

    # Update ReviewReport in backend/prisma/dev.db
    prisma_db = PROJECT_ROOT / "backend" / "prisma" / "dev.db"
    report_updated = False
    report_id = None

    if prisma_db.exists():
        try:
            conn = sqlite3.connect(str(prisma_db))
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT id, metadataJson, content, outcome FROM ReviewReport
                WHERE applicationId = ? AND reportType = 'AI_SCRUTINY_PRE_CHECK'
                ORDER BY submittedAt DESC LIMIT 1
                """,
                (application_id,),
            )
            report_row = cursor.fetchone()
            if report_row:
                report_id = report_row["id"]
                raw_meta = report_row["metadataJson"]
                meta = json.loads(raw_meta) if raw_meta else {}

                # Preserve deterministic findings completely untouched!
                llm_analysis = meta.get("llmAnalysis", {})
                llm_analysis["status"] = overall_status
                llm_analysis["successful_batches"] = len(success_batches)
                llm_analysis["successfulBatches"] = len(success_batches)
                llm_analysis["total_batches"] = total
                llm_analysis["totalBatches"] = total
                llm_analysis["retry_scheduled_batches"] = len(retry_batches)
                llm_analysis["summary"] = combined_summary
                llm_analysis["error_message"] = error_msg
                llm_analysis["errorMessage"] = error_msg
                llm_analysis["findingsCount"] = len(deduped_findings)
                llm_analysis["is_preserved_findings"] = False

                meta["llmAnalysis"] = llm_analysis
                meta["llmFindings"] = deduped_findings

                # Rebuild content note
                content = report_row["content"] or ""
                if overall_status == "SUCCESS":
                    # Remove retry/warning notes from content if present
                    content = re.sub(r"\n\n--- AI Qualitative Scrutiny Note ---.*", "", content, flags=re.DOTALL)
                    if combined_summary:
                        content += f"\n\n--- AI Qualitative Scrutiny Advisory Summary ---\n{combined_summary}"

                cursor.execute(
                    """
                    UPDATE ReviewReport
                    SET metadataJson = ?,
                        content = ?
                    WHERE id = ?
                    """,
                    (json.dumps(meta), content, report_id),
                )
                conn.commit()
                report_updated = True
        except Exception as db_err:
            logger.error(f"Failed to update ReviewReport in dev.db during reconciliation: {db_err}")
        finally:
            try:
                conn.close()
            except Exception:
                pass

    logger.info(
        f"Report reconciliation completed for app {application_id} (version={version_hash[:10]}): "
        f"status={overall_status}, batches={len(success_batches)}/{total}, findings={len(deduped_findings)}, "
        f"report_updated={report_updated} (report_id={report_id})"
    )

    # Universal Autonomous Agent Action Synchronization with updated batch findings
    try:
        from agent.tools import synchronize_agent_action_observations
        synchronize_agent_action_observations(
            application_id=application_id,
            version_hash=version_hash,
            new_findings=deduped_findings,
        )
    except Exception as sync_err:
        logger.warning(f"Failed to synchronize agent action observations during recovery reconciliation: {sync_err}")

    return {
        "status": overall_status,
        "successful_batches": len(success_batches),
        "total_batches": total,
        "retry_scheduled_batches": len(retry_batches),
        "findings_count": len(deduped_findings),
        "report_id": report_id,
        "report_updated": report_updated,
    }


class BatchRecoveryWorker:
    """
    Standing background service for automated recovery of rate-limited document batches.
    Polls scrutiny_batches for due RETRY_SCHEDULED entries, claims them atomically,
    executes them through the central scheduler, and automatically updates the persisted report.
    """

    def __init__(self):
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._wakeup_event: asyncio.Event = asyncio.Event()

    def start(self):
        """Start the background recovery loop."""
        if self._running:
            return
        self._running = True
        self._wakeup_event.clear()
        self._task = asyncio.create_task(self._recovery_loop(), name="groq_batch_recovery_worker")
        logger.info("BatchRecoveryWorker started.")

    def stop(self):
        """Stop the background recovery loop."""
        self._running = False
        self._wakeup_event.set()
        if self._task and not self._task.done():
            self._task.cancel()
        logger.info("BatchRecoveryWorker stopped.")

    def wake_up(self):
        """Signal the recovery worker to check for due batches immediately."""
        self._wakeup_event.set()

    async def _recovery_loop(self):
        """Continuous recovery loop with periodic heartbeat and event wakeups."""
        while self._running:
            try:
                # 1. Clean up any stale claims (> 90s)
                revert_stale_claims(timeout_seconds=90.0)

                # 2. Check for due batches
                due_batches = get_due_retry_batches(limit=3)
                if due_batches:
                    for batch in due_batches:
                        if not self._running:
                            break
                        await self._execute_due_batch(batch)
                else:
                    # Sleep until next heartbeat or wakeup signal
                    try:
                        await asyncio.wait_for(self._wakeup_event.wait(), timeout=2.0)
                        self._wakeup_event.clear()
                    except asyncio.TimeoutError:
                        pass
            except asyncio.CancelledError:
                break
            except Exception as loop_err:
                logger.error(f"Error in BatchRecoveryWorker loop: {loop_err}", exc_info=True)
                await asyncio.sleep(2.0)

    async def _execute_due_batch(self, batch: Dict[str, Any]):
        """Atomically claim, pace, execute, and reconcile a due batch."""
        from llm.client import GroqScrutinyClient

        batch_id = batch["batch_id"]
        app_id = batch["application_id"]
        version_hash = batch["version_hash"]
        batch_idx = batch["batch_index"]
        total_batches = batch["total_batches"]
        retry_count = batch.get("retry_count", 0)
        max_retries = batch.get("max_retries", 3)
        prompt_text = batch.get("prompt_text")

        claim_token = f"claim-{uuid.uuid4().hex[:10]}"
        claimed = claim_batch_for_retry(batch_id, claim_token)
        if not claimed:
            # Batch was claimed by another worker concurrently
            return

        logger.info(
            f"BatchRecoveryWorker claimed batch {batch_id} (app={app_id}, attempt={retry_count + 1}/{max_retries}). "
            f"Scheduling inference slot..."
        )

        client = GroqScrutinyClient()
        if not client.is_configured():
            logger.warning(f"Groq client unconfigured. Cannot execute retry for batch {batch_id}.")
            upsert_batch_record(
                batch_id=batch_id,
                job_id=batch["job_id"],
                application_id=app_id,
                version_hash=version_hash,
                batch_index=batch_idx,
                total_batches=total_batches,
                doc_ids=json.loads(batch.get("doc_ids_json") or "[]"),
                status="FAILED",
                error_message="Groq inference is disabled or GROQ_API_KEY is not configured.",
            )
            await reconcile_and_update_report(app_id, version_hash)
            return

        # If prompt_text is missing from batch record, rebuild from application docs
        if not prompt_text:
            logger.info(f"Rebuilding prompt for batch {batch_id} from application documents...")
            try:
                from client import backend_client
                from extractor import document_extractor
                from llm.prompts import build_batch_scrutiny_user_prompt

                app_data = await backend_client.get_application(app_id)
                doc_ids = json.loads(batch.get("doc_ids_json") or "[]")
                batch_docs = {}
                for doc_meta in app_data.get("documents", []):
                    if doc_meta.get("id") in doc_ids:
                        d_id = doc_meta["id"]
                        raw_bytes, fname = await backend_client.download_document(d_id)
                        extracted = document_extractor.extract_from_bytes(raw_bytes, fname)
                        batch_docs[d_id] = extracted

                prompt_text = build_batch_scrutiny_user_prompt(
                    app_data=app_data,
                    batch_docs=batch_docs,
                    deterministic_findings=[],
                    batch_index=batch_idx,
                    total_batches=total_batches,
                    max_doc_chars=settings.GROQ_MAX_DOC_CHARS,
                )
            except Exception as prep_err:
                logger.error(f"Failed to rebuild prompt for batch {batch_id}: {prep_err}")
                upsert_batch_record(
                    batch_id=batch_id,
                    job_id=batch["job_id"],
                    application_id=app_id,
                    version_hash=version_hash,
                    batch_index=batch_idx,
                    total_batches=total_batches,
                    doc_ids=json.loads(batch.get("doc_ids_json") or "[]"),
                    status="FAILED",
                    error_message=f"Failed to prepare batch documents: {prep_err}",
                )
                await reconcile_and_update_report(app_id, version_hash)
                return

        # Execute completion in JSON mode through centralized rate-limiting scheduler
        completion_result = await client.generate_chat_completion(
            system_prompt=SCRUTINY_SYSTEM_PROMPT,
            user_prompt=prompt_text,
            model=settings.GROQ_MODEL,
            application_id=app_id,
            batch_index=batch_idx,
        )

        b_status = completion_result.get("status")
        raw_content = completion_result.get("raw_content")
        error_msg = completion_result.get("error_message")
        b_retry_after = completion_result.get("retry_after")
        b_http_status = completion_result.get("http_status")

        if b_status == "SUCCESS" and raw_content:
            try:
                parsed = json.loads(raw_content)
                b_summary = parsed.get("summary")
                raw_findings = parsed.get("findings") or []
                batch_findings: List[Dict[str, Any]] = []

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

                        finding = LLMFinding(
                            finding_type=item.get("finding_type", "CONTEXTUAL_INCONSISTENCY"),
                            explanation=str(item.get("explanation", ""))[:1000],
                            severity_suggestion=sev,
                            evidence_excerpt=str(item.get("evidence_excerpt", ""))[:300].strip(),
                            document_id=item.get("document_id"),
                            document_name=item.get("document_name"),
                            page_number=item.get("page_number"),
                            confidence=conf,
                            human_review_recommendation=str(item.get("human_review_recommendation", ""))[:500],
                            facts_vs_inference=item.get("facts_vs_inference"),
                            significance=item.get("significance"),
                            excerpt_verified=True,
                            is_llm_generated=True,
                        )
                        batch_findings.append(finding.model_dump())
                    except Exception as parse_item_err:
                        logger.warning(f"Skipping invalid item in recovered batch {batch_id}: {parse_item_err}")

                # Persist batch success
                upsert_batch_record(
                    batch_id=batch_id,
                    job_id=batch["job_id"],
                    application_id=app_id,
                    version_hash=version_hash,
                    batch_index=batch_idx,
                    total_batches=total_batches,
                    doc_ids=json.loads(batch.get("doc_ids_json") or "[]"),
                    status="SUCCESS",
                    findings=batch_findings,
                    summary=b_summary,
                    http_status=200,
                    prompt_text=prompt_text,
                )
                logger.info(
                    f"Batch {batch_id} successfully recovered! Saved {len(batch_findings)} findings. Reconciling report..."
                )
                await reconcile_and_update_report(app_id, version_hash)
                return
            except Exception as parse_err:
                logger.warning(f"Failed to parse LLM output in recovered batch {batch_id}: {parse_err}")
                upsert_batch_record(
                    batch_id=batch_id,
                    job_id=batch["job_id"],
                    application_id=app_id,
                    version_hash=version_hash,
                    batch_index=batch_idx,
                    total_batches=total_batches,
                    doc_ids=json.loads(batch.get("doc_ids_json") or "[]"),
                    status="FAILED",
                    error_message=f"Malformed JSON output: {parse_err}",
                    prompt_text=prompt_text,
                )
                await reconcile_and_update_report(app_id, version_hash)
                return

        # Handle rate limiting or technical error during retry
        new_retry_count = retry_count + 1
        if new_retry_count < max_retries and b_http_status == 429:
            retry_delay = b_retry_after or (5.0 * (new_retry_count + 1))
            jitter = random.uniform(0.2, 1.0)
            next_retry_at = time.time() + retry_delay + jitter
            upsert_batch_record(
                batch_id=batch_id,
                job_id=batch["job_id"],
                application_id=app_id,
                version_hash=version_hash,
                batch_index=batch_idx,
                total_batches=total_batches,
                doc_ids=json.loads(batch.get("doc_ids_json") or "[]"),
                status="RETRY_SCHEDULED",
                error_message=error_msg or "Rate limited during recovery retry",
                retry_count=new_retry_count,
                next_retry_at=next_retry_at,
                http_status=429,
                prompt_text=prompt_text,
            )
            logger.warning(
                f"Batch {batch_id} rate limited on retry {new_retry_count}/{max_retries}. "
                f"Next automated retry scheduled at +{retry_delay + jitter:.1f}s."
            )
        else:
            upsert_batch_record(
                batch_id=batch_id,
                job_id=batch["job_id"],
                application_id=app_id,
                version_hash=version_hash,
                batch_index=batch_idx,
                total_batches=total_batches,
                doc_ids=json.loads(batch.get("doc_ids_json") or "[]"),
                status="FAILED",
                error_message=f"{error_msg or 'Batch execution failed'} (retries exhausted)",
                retry_count=new_retry_count,
                http_status=b_http_status,
                prompt_text=prompt_text,
            )
            logger.error(f"Batch {batch_id} failed terminally after {new_retry_count} retries.")

        await reconcile_and_update_report(app_id, version_hash)


# Global singleton worker
recovery_worker = BatchRecoveryWorker()
