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
                    job_id, application_id, application_number, status, created_at
                ) VALUES (?, ?, ?, 'PENDING', ?)
                """,
                (job_id, application_id, application_number, now),
            )
            conn.commit()
            return {
                "job_id": job_id,
                "application_id": application_id,
                "application_number": application_number,
                "status": "PENDING",
                "version_hash": None,
                "created_at": now,
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
                return dict(row)
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
