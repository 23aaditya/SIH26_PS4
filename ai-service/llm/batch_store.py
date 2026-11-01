"""
Durable SQLite Persistence Store for Scrutiny Document Batches (Phase 4 & 5).

Persists individual document batch execution state, successful intermediate findings,
and scheduled retry timers in agent_jobs.db.
Survives worker restarts and guarantees that findings from successful batches
are never discarded when a later batch or retry encounters a rate limit.
"""

import sqlite3
import json
import time
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple

from database import get_connection, execute_with_retry
from config import PROJECT_ROOT

logger = logging.getLogger("ai_scrutiny_service.batch_store")


def init_batch_tables():
    """Initialize durable batch persistence table and indexes."""
    def _init():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA synchronous=NORMAL;")

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS scrutiny_batches (
                    batch_id TEXT PRIMARY KEY,
                    job_id TEXT NOT NULL,
                    application_id TEXT NOT NULL,
                    version_hash TEXT NOT NULL,
                    batch_index INTEGER NOT NULL,
                    total_batches INTEGER NOT NULL,
                    doc_ids_json TEXT NOT NULL,
                    status TEXT NOT NULL,
                    findings_json TEXT,
                    summary_text TEXT,
                    error_message TEXT,
                    retry_count INTEGER DEFAULT 0,
                    max_retries INTEGER DEFAULT 3,
                    next_retry_at REAL DEFAULT 0.0,
                    http_status INTEGER,
                    prompt_text TEXT,
                    claim_token TEXT,
                    claimed_at REAL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    completed_at TEXT
                )
            """)

            # Ensure newly added columns exist in older tables
            for col, col_type in [
                ("prompt_text", "TEXT"),
                ("claim_token", "TEXT"),
                ("claimed_at", "REAL"),
            ]:
                try:
                    cursor.execute(f"ALTER TABLE scrutiny_batches ADD COLUMN {col} {col_type}")
                except Exception:
                    pass

            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_batches_app_version
                ON scrutiny_batches (application_id, version_hash)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_batches_status
                ON scrutiny_batches (status)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_batches_job
                ON scrutiny_batches (job_id)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_batches_retry
                ON scrutiny_batches (status, next_retry_at)
            """)
            conn.commit()
        finally:
            conn.close()

    execute_with_retry(_init)


def get_batches_for_version(application_id: str, version_hash: str) -> List[Dict[str, Any]]:
    """Retrieve all persisted batches for an application dossier version."""
    def _query():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT * FROM scrutiny_batches
                WHERE application_id = ? AND version_hash = ?
                ORDER BY batch_index ASC
                """,
                (application_id, version_hash),
            )
            rows = cursor.fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    return execute_with_retry(_query)


def get_batch_by_id(batch_id: str) -> Optional[Dict[str, Any]]:
    def _query():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM scrutiny_batches WHERE batch_id = ?", (batch_id,))
            row = cursor.fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    return execute_with_retry(_query)


def upsert_batch_record(
    batch_id: str,
    job_id: str,
    application_id: str,
    version_hash: str,
    batch_index: int,
    total_batches: int,
    doc_ids: List[str],
    status: str,
    findings: Optional[List[Dict[str, Any]]] = None,
    summary: Optional[str] = None,
    error_message: Optional[str] = None,
    retry_count: int = 0,
    max_retries: int = 3,
    next_retry_at: float = 0.0,
    http_status: Optional[int] = None,
    prompt_text: Optional[str] = None,
):
    """Atomically record batch state progress or completion."""
    now_iso = datetime.now(timezone.utc).isoformat()
    findings_json = json.dumps(findings) if findings is not None else None
    completed_at = now_iso if status == "SUCCESS" else None

    def _upsert():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO scrutiny_batches (
                    batch_id, job_id, application_id, version_hash, batch_index,
                    total_batches, doc_ids_json, status, findings_json, summary_text,
                    error_message, retry_count, max_retries, next_retry_at, http_status,
                    prompt_text, created_at, updated_at, completed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(batch_id) DO UPDATE SET
                    job_id = excluded.job_id,
                    status = excluded.status,
                    findings_json = COALESCE(excluded.findings_json, scrutiny_batches.findings_json),
                    summary_text = COALESCE(excluded.summary_text, scrutiny_batches.summary_text),
                    error_message = excluded.error_message,
                    retry_count = excluded.retry_count,
                    next_retry_at = excluded.next_retry_at,
                    http_status = excluded.http_status,
                    prompt_text = COALESCE(excluded.prompt_text, scrutiny_batches.prompt_text),
                    updated_at = excluded.updated_at,
                    completed_at = COALESCE(excluded.completed_at, scrutiny_batches.completed_at)
            """, (
                batch_id, job_id, application_id, version_hash, batch_index,
                total_batches, json.dumps(doc_ids), status, findings_json, summary,
                error_message, retry_count, max_retries, next_retry_at, http_status,
                prompt_text, now_iso, now_iso, completed_at
            ))
            conn.commit()
        finally:
            conn.close()

    execute_with_retry(_upsert)


def get_due_retry_batches(limit: int = 5) -> List[Dict[str, Any]]:
    """Retrieve batches that are scheduled for retry and whose cooldown has expired."""
    def _query():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            now = time.time()
            cursor.execute("""
                SELECT * FROM scrutiny_batches
                WHERE status = 'RETRY_SCHEDULED'
                  AND next_retry_at <= ?
                  AND retry_count < max_retries
                ORDER BY next_retry_at ASC
                LIMIT ?
            """, (now, limit))
            return [dict(r) for r in cursor.fetchall()]
        finally:
            conn.close()

    return execute_with_retry(_query)


def claim_batch_for_retry(batch_id: str, claim_token: str) -> bool:
    """Atomically claim a due retry batch for processing, preventing race conditions across workers."""
    def _claim():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            now = time.time()
            cursor.execute("""
                UPDATE scrutiny_batches
                SET status = 'PROCESSING',
                    claim_token = ?,
                    claimed_at = ?,
                    updated_at = ?
                WHERE batch_id = ?
                  AND status = 'RETRY_SCHEDULED'
            """, (claim_token, now, datetime.now(timezone.utc).isoformat(), batch_id))
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    return execute_with_retry(_claim)


def revert_stale_claims(timeout_seconds: float = 90.0) -> int:
    """Revert batches stuck in PROCESSING due to worker crashes or unhandled hangs."""
    def _revert():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cutoff = time.time() - timeout_seconds
            now_iso = datetime.now(timezone.utc).isoformat()
            cursor.execute("""
                UPDATE scrutiny_batches
                SET status = 'RETRY_SCHEDULED',
                    next_retry_at = ?,
                    updated_at = ?
                WHERE status = 'PROCESSING'
                  AND claimed_at IS NOT NULL
                  AND claimed_at < ?
            """, (time.time() + 2.0, now_iso, cutoff))
            conn.commit()
            return cursor.rowcount
        finally:
            conn.close()

    return execute_with_retry(_revert)


def get_all_batches_for_version(application_id: str, version_hash: str) -> List[Dict[str, Any]]:
    """Retrieve all batches for an application dossier version, ordered by batch_index."""
    def _query():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM scrutiny_batches
                WHERE application_id = ? AND version_hash = ?
                ORDER BY batch_index ASC
            """, (application_id, version_hash))
            return [dict(r) for r in cursor.fetchall()]
        finally:
            conn.close()

    return execute_with_retry(_query)


def find_preserved_findings_from_history(
    application_id: str,
    version_hash: str,
) -> Tuple[Optional[str], List[Dict[str, Any]], Optional[str]]:
    """
    Look for previously generated valid findings for the exact same dossier version hash.
    Checks:
      1. scrutiny_batches table in SQLite.
      2. Previous scrutiny_jobs in SQLite with findings_json.
    Returns (source_job_or_report_id, findings_list, summary_text).
    """
    if not version_hash:
        return None, [], None

    def _search():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            # 1. Search scrutiny_batches for completed batches on this version
            cursor.execute(
                """
                SELECT findings_json, summary_text, job_id FROM scrutiny_batches
                WHERE application_id = ? AND version_hash = ? AND status = 'SUCCESS' AND findings_json IS NOT NULL
                ORDER BY batch_index ASC
                """,
                (application_id, version_hash),
            )
            b_rows = cursor.fetchall()
            if b_rows:
                aggregated = []
                summaries = []
                source_job = None
                for row in b_rows:
                    if row["findings_json"]:
                        try:
                            f_list = json.loads(row["findings_json"])
                            aggregated.extend(f_list)
                        except Exception:
                            pass
                    if row["summary_text"]:
                        summaries.append(row["summary_text"])
                    if not source_job and row["job_id"]:
                        source_job = row["job_id"]
                if aggregated:
                    return source_job, aggregated, " ".join(summaries) if summaries else None

            # 2. Check dev.db for prior reports on this application & version
            prisma_db = PROJECT_ROOT / "backend" / "prisma" / "dev.db"
            if prisma_db.exists():
                try:
                    p_conn = sqlite3.connect(str(prisma_db))
                    p_conn.row_factory = sqlite3.Row
                    p_cursor = p_conn.cursor()
                    p_cursor.execute(
                        """
                        SELECT id, metadataJson, submittedAt FROM ReviewReport
                        WHERE applicationId = ? AND reportType = 'AI_SCRUTINY_PRE_CHECK'
                        ORDER BY submittedAt DESC
                        """,
                        (application_id,),
                    )
                    r_rows = p_cursor.fetchall()
                    for r_row in r_rows:
                        if r_row["metadataJson"]:
                            try:
                                meta = json.loads(r_row["metadataJson"])
                                r_vhash = meta.get("versionHash")
                                if r_vhash == version_hash or (not r_vhash and version_hash):
                                    llm_f = meta.get("llmFindings", [])
                                    if llm_f and len(llm_f) > 0:
                                        p_summary = meta.get("llmAnalysis", {}).get("summary")
                                        return r_row["id"], llm_f, p_summary
                            except Exception:
                                pass
                except Exception as p_err:
                    logger.debug(f"Could not read prior ReviewReport from dev.db: {p_err}")
                finally:
                    try:
                        p_conn.close()
                    except Exception:
                        pass

            return None, [], None
        finally:
            conn.close()

    return execute_with_retry(_search)


# Initialize tables on import
init_batch_tables()
