import hashlib
import json
import logging
from contextlib import asynccontextmanager
from typing import Dict, Any

from fastapi import FastAPI, BackgroundTasks, HTTPException, status, Depends
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from auth import verify_service_authorization
from database import (
    init_db,
    create_job,
    update_job_status,
    update_job_version,
    complete_job,
    get_job,
    get_latest_job_for_application,
    get_completed_job_by_version,
    reconcile_startup_jobs,
)
from client import backend_client
from extractor import document_extractor
from rules.engine import rule_engine
from llm.scrutiny_agent import scrutiny_agent
from llm.client import groq_client
from models.schemas import TriggerJobRequest, JobStatusResponse


logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ai_scrutiny_service")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite job store
    init_db()
    # Startup reconciliation: clean up dangling in-flight jobs from prior crashes/restarts
    reconciled_count = reconcile_startup_jobs()
    if reconciled_count > 0:
        logger.info(f"Startup recovery: Reconciled {reconciled_count} interrupted jobs to FAILED status.")
    logger.info("AI Scrutiny Assistant initialized. SQLite job store ready.")
    yield
    logger.info("AI Scrutiny Assistant shutting down.")

app = FastAPI(
    title="AICTE Scrutiny Assistant Service",
    description="Dedicated agentic pre-check microservice for SIH 2026 Problem Statement 26262.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def compute_application_version_hash(
    app_data: Dict[str, Any],
    doc_checksums: Dict[str, str],
) -> str:
    """
    Compute canonical idempotency version hash based on:
    - application ID
    - application updatedAt timestamp / workflowVersion
    - total document count
    - sorted document IDs paired with verified SHA-256 content checksums
    Guarantees that document content modifications invalidate the hash even if document IDs stay identical.
    """
    application_id = app_data.get("id") or ""
    app_version = app_data.get("updatedAt") or app_data.get("workflowVersion") or "v-2.4"
    docs = app_data.get("documents", [])
    hash_seed = f"{application_id}:{app_version}:{len(docs)}:" + ":".join(
        f"{d.get('id')}:{doc_checksums.get(d.get('id'), 'missing')}"
        for d in sorted(docs, key=lambda x: x.get("id", ""))
    )
    return hashlib.sha256(hash_seed.encode("utf-8")).hexdigest()

async def run_scrutiny_analysis(job_id: str, application_id: str):
    """
    Background worker that runs deterministic statutory scrutiny checks on an application.
    Enforces retry safety, atomic idempotency, and cryptographic version integrity.
    """
    logger.info(f"Starting scrutiny analysis for job {job_id}, application {application_id}")
    update_job_status(job_id, "PROCESSING")

    try:
        # 1. Fetch dossier from Express backend via M2M auth
        app_data = await backend_client.get_application(application_id)
        app_num = app_data.get("applicationNumber")
        docs = app_data.get("documents", [])

        # 2. Download documents, extract text, and verify cryptographic SHA-256 content checksums
        extracted_docs: Dict[str, Dict[str, Any]] = {}
        verified_doc_checksums: Dict[str, str] = {}
        technical_failures: List[Dict[str, str]] = []

        for doc in docs:
            doc_id = doc.get("id")
            fname = doc.get("originalFilename") or f"{doc_id}.pdf"
            server_checksum = doc.get("checksum")
            try:
                raw_bytes, downloaded_fname = await backend_client.download_document(doc_id)
                if not raw_bytes or len(raw_bytes) == 0:
                    raise ValueError(f"Downloaded empty document payload for {fname}")

                computed_checksum = hashlib.sha256(raw_bytes).hexdigest()
                if server_checksum and server_checksum.lower() != computed_checksum.lower():
                    logger.warning(
                        f"Checksum mismatch for doc {doc_id} ({fname}): server metadata had {server_checksum[:10]}... "
                        f"but actual downloaded content hashed to {computed_checksum[:10]}... Using verified content hash."
                    )

                extracted = document_extractor.extract_from_bytes(raw_bytes, downloaded_fname or fname)
                if extracted.get("metadata", {}).get("error"):
                    raise ValueError(extracted["metadata"]["error"])

                verified_doc_checksums[doc_id] = computed_checksum
                extracted_docs[doc_id] = extracted
                logger.info(
                    f"Extracted doc {doc_id} ({fname}): {extracted.get('total_chars')} chars, "
                    f"scanned={extracted.get('is_scanned')}, checksum={computed_checksum[:10]}..."
                )
            except Exception as doc_err:
                logger.error(f"Technical failure downloading or extracting doc {doc_id} ({fname}): {doc_err}")
                technical_failures.append({
                    "doc_id": doc_id,
                    "filename": fname,
                    "error": str(doc_err),
                })

        # Technical Failure Handling: If any required document failed download/extraction,
        # fail the job explicitly. Never submit an incomplete report or key a report to a failed state.
        if technical_failures:
            failed_summary = ", ".join(f"{f['filename']} ({f['doc_id']})" for f in technical_failures)
            err_msg = f"Technical document processing failure: Could not download or extract {len(technical_failures)} document(s): {failed_summary}."
            logger.error(f"Job {job_id} aborted: {err_msg}")
            update_job_status(job_id, "FAILED", error_message=err_msg)
            return

        # 3. Compute canonical idempotency version hash based on verified document content checksums
        version_hash = compute_application_version_hash(app_data, verified_doc_checksums)
        update_job_version(job_id, version_hash)

        # 4. Check if an identical version has already been analyzed and completed
        existing_completed = get_completed_job_by_version(application_id, version_hash)
        if existing_completed and existing_completed.get("report_id"):
            logger.info(
                f"Application {application_id} version {version_hash[:10]} already analyzed in job {existing_completed['job_id']}. Reusing results."
            )
            complete_job(
                job_id=job_id,
                version_hash=version_hash,
                report_id=existing_completed["report_id"],
                outcome=existing_completed["outcome"],
                findings=json.loads(existing_completed.get("findings_json") or "[]"),
                summary=existing_completed.get("summary") or "",
            )
            return

        # 5. Evaluate rules deterministically
        pre_check = rule_engine.evaluate_eoa(app_data, extracted_docs)
        logger.info(f"Rule evaluation complete for {app_num}: Outcome = {pre_check.outcome}")

        # 5b. Advisory LLM Qualitative Scrutiny (Groq): Identify contextual inconsistencies, missing schedules, and ambiguities
        llm_result = await scrutiny_agent.analyze_application(
            app_data=app_data,
            extracted_docs=extracted_docs,
            deterministic_findings=pre_check.findings,
        )
        logger.info(
            f"Advisory LLM scrutiny finished for {app_num}: status={llm_result.status}, "
            f"findings={len(llm_result.findings)}"
        )

        # 6. Retry-safe report submission: Check if Express already has a report for this version hash
        existing_report_id = await backend_client.find_existing_report_by_version(application_id, version_hash)

        # Build combined content and recommendations
        recommendations_parts = [
            "Statutory Advisory Findings:",
            "- Human Scrutiny Officer verification required.",
            f"- Deterministic pre-check assessment: {pre_check.outcome}.",
        ]
        if llm_result.status == "SUCCESS" and llm_result.findings:
            recommendations_parts.append(
                f"- Qualitative Advisory: {len(llm_result.findings)} observation(s) flagged for human verification."
            )
        elif llm_result.status in ("TECHNICAL_FAILURE", "PARTIAL_ANALYSIS"):
            recommendations_parts.append(
                f"- Qualitative Advisory Note: LLM scrutiny had technical limitation ({llm_result.error_message or 'service unavailable'}); deterministic findings remain authoritative."
            )

        combined_content = pre_check.summary
        if llm_result.status == "SUCCESS" and llm_result.summary:
            combined_content += f"\n\n--- AI Qualitative Scrutiny Observations ({llm_result.model_used or 'Groq LLM'}) ---\n{llm_result.summary}"

        if existing_report_id:
            report_id = existing_report_id
            logger.info(f"Reusing existing Express report {report_id} for version {version_hash[:10]}.")
        else:
            report_payload = {
                "stageKey": "scrutiny",
                "reportType": "AI_SCRUTINY_PRE_CHECK",
                "title": pre_check.title,
                "content": combined_content,
                "recommendations": "\n".join(recommendations_parts),
                "outcome": pre_check.outcome,  # DETERMINISTIC REGULATORY OUTCOME PRESERVED; NEVER SILENTLY OVERRIDDEN
                "metadata": {
                    "jobId": job_id,
                    "versionHash": version_hash,
                    "handbookVersion": pre_check.handbook_version,
                    "findings": [f.model_dump() for f in pre_check.findings],  # Backward compatible deterministic findings
                    "llmFindings": [f.model_dump() for f in llm_result.findings],
                    "llmAnalysis": {
                        "status": llm_result.status,
                        "model": llm_result.model_used,
                        "summary": llm_result.summary,
                        "findingsCount": len(llm_result.findings),
                        "errorMessage": llm_result.error_message,
                    },
                },
            }
            report_resp = await backend_client.submit_pre_check_report(application_id, report_payload)
            report_id = report_resp.get("report", {}).get("id")
            logger.info(f"Advisory report submitted successfully for {app_num}. Report ID: {report_id}")

        # 7. Record job completion in SQLite with version hash
        complete_job(
            job_id=job_id,
            version_hash=version_hash,
            report_id=report_id,
            outcome=pre_check.outcome,
            findings=[f.model_dump() for f in pre_check.findings],
            summary=combined_content,
        )

    except Exception as e:
        logger.error(f"Scrutiny analysis failed for job {job_id}: {str(e)}", exc_info=True)
        update_job_status(job_id, "FAILED", error_message=str(e))

@app.get("/health")
@app.get("/api/v1/health")
async def health_check():
    diag = await groq_client.validate_connection()
    return {
        "status": "ok",
        "service": "ai-scrutiny-assistant",
        "version": "1.0.0",
        "handbook": settings.AICTE_APH_VERSION,
        "backend_url": settings.EXPRESS_BACKEND_URL,
        "llm_provider": "groq",
        "llm_model": settings.GROQ_MODEL,
        "llm_enabled": settings.GROQ_ENABLED,
        "llm_configured": bool(settings.GROQ_API_KEY and settings.GROQ_API_KEY.strip()),
        "llm_status": diag.get("status"),
        "llm_diagnostic": {
            "category": diag.get("category"),
            "message": diag.get("message"),
        },
    }


@app.post(
    "/api/v1/jobs/trigger",
    response_model=JobStatusResponse,
    dependencies=[Depends(verify_service_authorization)],
)
async def trigger_scrutiny_job(payload: TriggerJobRequest, background_tasks: BackgroundTasks):
    """
    Trigger an asynchronous AI Scrutiny pre-check evaluation for a submitted application.
    Requires machine authentication. Returns existing job if one is already active.
    """
    try:
        job = create_job(payload.application_id, payload.application_number)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to record scrutiny job: {str(e)}",
        )

    # Only dispatch new background task if the job was just created (status PENDING and no completed_at)
    if job.get("status") == "PENDING" and not job.get("completed_at"):
        background_tasks.add_task(run_scrutiny_analysis, job["job_id"], payload.application_id)

    findings = []
    if job.get("findings_json"):
        try:
            findings = json.loads(job["findings_json"])
        except Exception:
            pass

    return JobStatusResponse(
        job_id=job["job_id"],
        application_id=payload.application_id,
        application_number=payload.application_number or job.get("application_number"),
        status=job["status"],
        report_id=job.get("report_id"),
        outcome=job.get("outcome"),
        findings_count=len(findings),
        created_at=job.get("created_at", ""),
        completed_at=job.get("completed_at"),
        error_message=job.get("error_message"),
    )

@app.get(
    "/api/v1/jobs/{job_id}",
    response_model=JobStatusResponse,
    dependencies=[Depends(verify_service_authorization)],
)
async def get_job_status(job_id: str):
    """
    Retrieve the status and results of a scrutiny analysis job. Requires machine authentication.
    """
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    findings = []
    if job.get("findings_json"):
        try:
            findings = json.loads(job["findings_json"])
        except Exception:
            pass

    return JobStatusResponse(
        job_id=job["job_id"],
        application_id=job["application_id"],
        application_number=job.get("application_number"),
        status=job["status"],
        report_id=job.get("report_id"),
        outcome=job.get("outcome"),
        findings_count=len(findings),
        created_at=job["created_at"],
        completed_at=job.get("completed_at"),
        error_message=job.get("error_message"),
    )

@app.get(
    "/api/v1/jobs/application/{application_id}",
    response_model=JobStatusResponse,
    dependencies=[Depends(verify_service_authorization)],
)
async def get_latest_job_for_app(application_id: str):
    """
    Retrieve the latest scrutiny analysis job for a specific application. Requires machine authentication.
    """
    job = get_latest_job_for_application(application_id)
    if not job:
        raise HTTPException(status_code=404, detail="No scrutiny job found for this application")

    findings = []
    if job.get("findings_json"):
        try:
            findings = json.loads(job["findings_json"])
        except Exception:
            pass

    return JobStatusResponse(
        job_id=job["job_id"],
        application_id=job["application_id"],
        application_number=job.get("application_number"),
        status=job["status"],
        report_id=job.get("report_id"),
        outcome=job.get("outcome"),
        findings_count=len(findings),
        created_at=job["created_at"],
        completed_at=job.get("completed_at"),
        error_message=job.get("error_message"),
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=True)
