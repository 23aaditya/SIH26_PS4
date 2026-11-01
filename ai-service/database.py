import sqlite3
import json
import uuid
import time
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from config import settings

logger = logging.getLogger("ai_scrutiny_database")

def get_connection():
    conn = sqlite3.connect(settings.DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    return conn

def execute_with_retry(func, max_retries=3, delay=0.1):
    """Execute SQLite operations with bounded retries on database lock contention."""
    last_err = None
    for attempt in range(max_retries):
        try:
            return func()
        except sqlite3.OperationalError as e:
            last_err = e
            if "locked" in str(e).lower() or "busy" in str(e).lower():
                time.sleep(delay * (2 ** attempt))
            else:
                raise
    raise last_err

def init_db():
    def _init():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA synchronous=NORMAL;")
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS scrutiny_jobs (
                    job_id TEXT PRIMARY KEY,
                    application_id TEXT NOT NULL,
                    application_number TEXT,
                    status TEXT NOT NULL,
                    version_hash TEXT,
                    report_id TEXT,
                    outcome TEXT,
                    summary TEXT,
                    findings_json TEXT,
                    error_message TEXT,
                    retry_count INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL,
                    completed_at TEXT
                )
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_scrutiny_jobs_app_id
                ON scrutiny_jobs (application_id)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_scrutiny_jobs_version
                ON scrutiny_jobs (application_id, version_hash)
            """)
            cursor.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_app_job
                ON scrutiny_jobs (application_id)
                WHERE status IN ('PENDING', 'PROCESSING')
            """)
            cursor.execute("PRAGMA table_info(scrutiny_jobs)")
            cols = [row[1] for row in cursor.fetchall()]
            if "correlation_id" not in cols:
                cursor.execute("ALTER TABLE scrutiny_jobs ADD COLUMN correlation_id TEXT")
            conn.commit()
        finally:
            conn.close()

    execute_with_retry(_init)

def get_active_job_for_application(application_id: str) -> Optional[Dict[str, Any]]:
    """Check if an active (PENDING or PROCESSING) job is currently running for this application."""
    def _query():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT * FROM scrutiny_jobs
                WHERE application_id = ? AND status IN ('PENDING', 'PROCESSING')
                ORDER BY created_at DESC LIMIT 1
                """,
                (application_id,),
            )
            row = cursor.fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    return execute_with_retry(_query)

def get_completed_job_by_version(application_id: str, version_hash: str) -> Optional[Dict[str, Any]]:
    """Retrieve an existing COMPLETED job for this exact application version hash."""
    if not version_hash:
        return None

    def _query():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT * FROM scrutiny_jobs
                WHERE application_id = ? AND version_hash = ? AND status = 'COMPLETED' AND report_id IS NOT NULL
                ORDER BY created_at DESC LIMIT 1
                """,
                (application_id, version_hash),
            )
            row = cursor.fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    return execute_with_retry(_query)

def create_job(
    application_id: str,
    application_number: Optional[str] = None,
    correlation_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Enqueue a scrutiny job safely.
    Guarantees atomic uniqueness via database-level partial unique index:
    idx_unique_active_app_job ON scrutiny_jobs (application_id) WHERE status IN ('PENDING', 'PROCESSING').
    If a job is already PENDING or PROCESSING for this application, returns the active job.
    Handles concurrent insertion races safely by catching IntegrityError and returning the race winner.
    """
    active = get_active_job_for_application(application_id)
    if active:
        logger.info(f"Reusing existing active job {active['job_id']} for application {application_id}")
        active["is_new"] = False
        return active

    def _insert():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            job_id = f"job-{uuid.uuid4().hex[:12]}"
            now = datetime.now(timezone.utc).isoformat()
            cursor.execute(
                """
                INSERT INTO scrutiny_jobs (
                    job_id, application_id, application_number, status, created_at, correlation_id
                ) VALUES (?, ?, ?, 'PENDING', ?, ?)
                """,
                (job_id, application_id, application_number, now, correlation_id),
            )
            conn.commit()
            return {
                "job_id": job_id,
                "application_id": application_id,
                "application_number": application_number,
                "status": "PENDING",
                "version_hash": None,
                "created_at": now,
                "correlation_id": correlation_id,
                "is_new": True,
            }
        except sqlite3.IntegrityError as e:
            # Atomic conflict on idx_unique_active_app_job: another concurrent request inserted an active job
            logger.info(f"Concurrent active job conflict for application {application_id}: {e}. Returning active job.")
            conn.rollback()
            cursor.execute(
                """
                SELECT * FROM scrutiny_jobs
                WHERE application_id = ? AND status IN ('PENDING', 'PROCESSING')
                ORDER BY created_at DESC LIMIT 1
                """,
                (application_id,),
            )
            row = cursor.fetchone()
            if row:
                res = dict(row)
                res["is_new"] = False
                return res
            raise
        finally:
            conn.close()

    return execute_with_retry(_insert)

def update_job_version(job_id: str, version_hash: str):
    def _update():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE scrutiny_jobs SET version_hash = ? WHERE job_id = ?",
                (version_hash, job_id),
            )
            conn.commit()
        finally:
            conn.close()

    execute_with_retry(_update)

def update_job_status(job_id: str, status: str, error_message: Optional[str] = None):
    def _update():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE scrutiny_jobs SET status = ?, error_message = ? WHERE job_id = ?",
                (status, error_message, job_id),
            )
            conn.commit()
        finally:
            conn.close()

    execute_with_retry(_update)

def complete_job(
    job_id: str,
    version_hash: str,
    report_id: Optional[str],
    outcome: str,
    findings: List[Dict[str, Any]],
    summary: str,
):
    """Persist completed job status along with computed version_hash and report reference."""
    def _complete():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            now = datetime.now(timezone.utc).isoformat()
            cursor.execute(
                """
                UPDATE scrutiny_jobs
                SET status = 'COMPLETED',
                    version_hash = ?,
                    report_id = ?,
                    outcome = ?,
                    findings_json = ?,
                    summary = ?,
                    completed_at = ?
                WHERE job_id = ?
                """,
                (version_hash, report_id, outcome, json.dumps(findings), summary, now, job_id),
            )
            conn.commit()
        finally:
            conn.close()

    execute_with_retry(_complete)

def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    def _query():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM scrutiny_jobs WHERE job_id = ?", (job_id,))
            row = cursor.fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    return execute_with_retry(_query)

def get_latest_job_for_application(application_id: str) -> Optional[Dict[str, Any]]:
    def _query():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM scrutiny_jobs WHERE application_id = ? ORDER BY created_at DESC LIMIT 1",
                (application_id,),
            )
            row = cursor.fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    return execute_with_retry(_query)

def reconcile_startup_jobs() -> int:
    """
    On service startup, reconcile any interrupted jobs that were left in PENDING or PROCESSING.
    Transitions them to FAILED so they do not block subsequent analysis.
    """
    def _reconcile():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE scrutiny_jobs
                SET status = 'FAILED',
                    error_message = 'Job interrupted by server restart; safe to re-trigger.'
                WHERE status IN ('PENDING', 'PROCESSING')
                """
            )
            count = cursor.rowcount
            conn.commit()
            return count
        finally:
            conn.close()

    return execute_with_retry(_reconcile)


# ============================================================================
# Institute Document Pre-Validation Persistence (Phase 1)
# ============================================================================

def init_prevalidation_tables():
    """Initialize SQLite tables and indexes for institute-side document pre-validation."""
    def _init():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA synchronous=NORMAL;")
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS document_prevalidations (
                    id TEXT PRIMARY KEY,
                    job_id TEXT UNIQUE NOT NULL,
                    document_id TEXT NOT NULL,
                    application_id TEXT NOT NULL,
                    institution_id TEXT NOT NULL,
                    requirement_id TEXT NOT NULL,
                    cache_key TEXT NOT NULL,
                    checksum TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    application_category TEXT NOT NULL,
                    staged_file_path TEXT NOT NULL,
                    job_status TEXT NOT NULL,
                    classification_result TEXT,
                    advisory_message TEXT,
                    evidence_excerpt TEXT,
                    facts_vs_inference TEXT,
                    recommended_action TEXT,
                    http_status INTEGER,
                    error_message TEXT,
                    retry_count INTEGER DEFAULT 0,
                    max_retries INTEGER DEFAULT 3,
                    next_retry_at REAL DEFAULT 0.0,
                    claim_token TEXT,
                    claimed_at REAL,
                    lease_expires_at REAL DEFAULT 0.0,
                    is_superseded INTEGER DEFAULT 0,
                    model_used TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    completed_at TEXT
                )
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_preval_cache_lookup 
                ON document_prevalidations (cache_key)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_preval_active_poll 
                ON document_prevalidations (application_id, document_id, is_superseded)
            """)
            cursor.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_active_preval_job 
                ON document_prevalidations (application_id, document_id)
                WHERE job_status IN ('QUEUED', 'PROCESSING', 'RETRY_SCHEDULED')
            """)
            conn.commit()
        finally:
            conn.close()

    execute_with_retry(_init)


def create_prevalidation_job(job_data: Dict[str, Any]) -> str:
    """Create a new pre-validation job in QUEUED status."""
    def _insert():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO document_prevalidations (
                    id, job_id, document_id, application_id, institution_id, requirement_id,
                    cache_key, checksum, filename, application_category, staged_file_path,
                    job_status, classification_result, advisory_message, evidence_excerpt,
                    facts_vs_inference, recommended_action, retry_count, max_retries,
                    next_retry_at, is_superseded, model_used, created_at, updated_at
                ) VALUES (
                    ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?, ?, ?
                )
            """, (
                job_data["id"], job_data["job_id"], job_data["document_id"], job_data["application_id"],
                job_data["institution_id"], job_data["requirement_id"], job_data["cache_key"],
                job_data["checksum"], job_data["filename"], job_data["application_category"],
                job_data["staged_file_path"], job_data.get("job_status", "QUEUED"),
                job_data.get("classification_result"), job_data.get("advisory_message"),
                job_data.get("evidence_excerpt"), job_data.get("facts_vs_inference"),
                job_data.get("recommended_action"), job_data.get("retry_count", 0),
                job_data.get("max_retries", 3), job_data.get("next_retry_at", 0.0),
                job_data.get("is_superseded", 0), job_data.get("model_used"),
                job_data["created_at"], job_data["updated_at"]
            ))
            conn.commit()
            return job_data["job_id"]
        finally:
            conn.close()

    return execute_with_retry(_insert)


def get_prevalidation_job(job_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve pre-validation record by job_id."""
    def _get():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM document_prevalidations WHERE job_id = ? LIMIT 1", (job_id,))
            row = cursor.fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    return execute_with_retry(_get)


def get_active_prevalidation_for_document(application_id: str, document_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve any currently active (QUEUED, PROCESSING, RETRY_SCHEDULED) job for this document."""
    def _get():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM document_prevalidations 
                WHERE application_id = ? AND document_id = ? 
                  AND job_status IN ('QUEUED', 'PROCESSING', 'RETRY_SCHEDULED')
                  AND is_superseded = 0
                ORDER BY created_at DESC LIMIT 1
            """, (application_id, document_id))
            row = cursor.fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    return execute_with_retry(_get)


def get_latest_prevalidation_for_document(application_id: str, document_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve the latest non-superseded pre-validation result for a document."""
    def _get():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM document_prevalidations 
                WHERE application_id = ? AND document_id = ? AND is_superseded = 0
                ORDER BY created_at DESC LIMIT 1
            """, (application_id, document_id))
            row = cursor.fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    return execute_with_retry(_get)


def get_cached_prevalidation(cache_key: str) -> Optional[Dict[str, Any]]:
    """Retrieve completed, non-superseded result matching exact contextual cache key."""
    def _get():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM document_prevalidations 
                WHERE cache_key = ? AND job_status = 'COMPLETED' AND is_superseded = 0
                ORDER BY created_at DESC LIMIT 1
            """, (cache_key,))
            row = cursor.fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    return execute_with_retry(_get)


def mark_prevalidation_superseded(document_id: str) -> int:
    """Mark all prevalidation jobs for a superseded document."""
    def _mark():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            now_iso = datetime.now(timezone.utc).isoformat()
            cursor.execute("""
                UPDATE document_prevalidations 
                SET is_superseded = 1, updated_at = ?
                WHERE document_id = ?
            """, (now_iso, document_id))
            count = cursor.rowcount
            conn.commit()
            return count
        finally:
            conn.close()

    return execute_with_retry(_mark)


def claim_next_prevalidation_job(worker_token: str, lease_seconds: float = 60.0) -> Optional[Dict[str, Any]]:
    """
    Atomically find and claim the next available pre-validation job.
    Claims:
      - QUEUED jobs with no claim token.
      - RETRY_SCHEDULED jobs where next_retry_at <= now.
      - Stale PROCESSING jobs where lease_expires_at < now.
    Sets claim_token, claimed_at, lease_expires_at, and job_status='PROCESSING'.
    """
    def _claim():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            now = time.time()
            now_iso = datetime.now(timezone.utc).isoformat()
            lease_expires = now + lease_seconds

            cursor.execute("""
                SELECT id, job_id FROM document_prevalidations
                WHERE (
                    (job_status = 'QUEUED' AND (claim_token IS NULL OR lease_expires_at < ?))
                    OR (job_status = 'RETRY_SCHEDULED' AND next_retry_at <= ? AND (claim_token IS NULL OR lease_expires_at < ?))
                    OR (job_status = 'PROCESSING' AND lease_expires_at < ?)
                )
                AND is_superseded = 0
                ORDER BY created_at ASC
                LIMIT 1
            """, (now, now, now, now))
            row = cursor.fetchone()
            if not row:
                return None

            job_pk = row[0]
            cursor.execute("""
                UPDATE document_prevalidations
                SET claim_token = ?,
                    claimed_at = ?,
                    lease_expires_at = ?,
                    job_status = 'PROCESSING',
                    updated_at = ?
                WHERE id = ? AND is_superseded = 0
            """, (worker_token, now, lease_expires, now_iso, job_pk))

            if cursor.rowcount == 0:
                return None

            conn.commit()

            cursor.execute("SELECT * FROM document_prevalidations WHERE id = ?", (job_pk,))
            claimed_row = cursor.fetchone()
            return dict(claimed_row) if claimed_row else None
        finally:
            conn.close()

    return execute_with_retry(_claim)


def renew_prevalidation_lease(job_id: str, claim_token: str, lease_seconds: float = 60.0) -> bool:
    """Heartbeat lease renewal while worker is executing inference."""
    def _renew():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            now = time.time()
            now_iso = datetime.now(timezone.utc).isoformat()
            new_lease = now + lease_seconds
            cursor.execute("""
                UPDATE document_prevalidations
                SET lease_expires_at = ?, updated_at = ?
                WHERE job_id = ? AND claim_token = ? AND job_status = 'PROCESSING'
            """, (new_lease, now_iso, job_id, claim_token))
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    return execute_with_retry(_renew)


def complete_prevalidation_job(job_id: str, claim_token: str, update_data: Dict[str, Any]) -> bool:
    """
    Conditionally persist completed pre-validation result with claim token fencing.
    Fails safely (returns False) if worker lease was expired and claimed by another worker.
    """
    def _complete():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            now_iso = datetime.now(timezone.utc).isoformat()
            cursor.execute("""
                UPDATE document_prevalidations
                SET job_status = 'COMPLETED',
                    classification_result = ?,
                    advisory_message = ?,
                    evidence_excerpt = ?,
                    facts_vs_inference = ?,
                    recommended_action = ?,
                    model_used = ?,
                    http_status = 200,
                    error_message = NULL,
                    completed_at = ?,
                    updated_at = ?,
                    claim_token = NULL
                WHERE job_id = ? AND claim_token = ?
            """, (
                update_data.get("classification_result"),
                update_data.get("advisory_message"),
                update_data.get("evidence_excerpt"),
                update_data.get("facts_vs_inference"),
                update_data.get("recommended_action"),
                update_data.get("model_used"),
                now_iso, now_iso,
                job_id, claim_token
            ))
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    return execute_with_retry(_complete)


def fail_or_retry_prevalidation_job(
    job_id: str,
    claim_token: str,
    error_message: str,
    http_status: Optional[int] = None,
    retry_delay: Optional[float] = None
) -> bool:
    """Handle prevalidation failure or schedule retry."""
    def _handle():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            now = time.time()
            now_iso = datetime.now(timezone.utc).isoformat()

            cursor.execute("SELECT retry_count, max_retries FROM document_prevalidations WHERE job_id = ?", (job_id,))
            row = cursor.fetchone()
            if not row:
                return False

            retries, max_retries = row[0] or 0, row[1] or 3

            if retry_delay is not None and retries < max_retries:
                # Schedule retry
                next_retry = now + retry_delay
                cursor.execute("""
                    UPDATE document_prevalidations
                    SET job_status = 'RETRY_SCHEDULED',
                        retry_count = retry_count + 1,
                        next_retry_at = ?,
                        http_status = ?,
                        error_message = ?,
                        updated_at = ?,
                        claim_token = NULL
                    WHERE job_id = ? AND claim_token = ?
                """, (next_retry, http_status, error_message, now_iso, job_id, claim_token))
            else:
                # Terminal failure
                cursor.execute("""
                    UPDATE document_prevalidations
                    SET job_status = 'FAILED',
                        http_status = ?,
                        error_message = ?,
                        completed_at = ?,
                        updated_at = ?,
                        claim_token = NULL
                    WHERE job_id = ? AND claim_token = ?
                """, (http_status, error_message, now_iso, now_iso, job_id, claim_token))

            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    return execute_with_retry(_handle)
