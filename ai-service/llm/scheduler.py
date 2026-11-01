"""
Centralized Persistent Groq Request Scheduler and Rate Limiter (Phase 2 & 3).

Coordinates all Groq LLM qualitative analysis requests across all applications,
batches, and processes sharing the same Groq quota.
Backed by SQLite (WAL mode) to guarantee cross-process synchronization and restart durability.
"""

import sqlite3
import time
import random
import re
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Tuple

from config import settings
from database import get_connection, execute_with_retry

logger = logging.getLogger("ai_scrutiny_service.groq_scheduler")


def init_scheduler_tables():
    """Idempotently initialize rate limiter reservation and global cooldown tables."""
    def _init():
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA synchronous=NORMAL;")

            # 1. Rolling window request reservations table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS groq_request_reservations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    request_id TEXT UNIQUE NOT NULL,
                    application_id TEXT,
                    batch_index INTEGER,
                    reserved_at REAL NOT NULL,
                    status TEXT NOT NULL
                )
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_groq_res_time
                ON groq_request_reservations (reserved_at)
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_groq_res_app
                ON groq_request_reservations (application_id)
            """)

            # 2. Global provider cooldown table (singleton row id=1)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS groq_global_cooldown (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    cooldown_until REAL NOT NULL,
                    reason TEXT,
                    retry_after REAL,
                    error_message TEXT,
                    updated_at TEXT NOT NULL
                )
            """)
            # Initialize singleton row if missing
            cursor.execute("""
                INSERT OR IGNORE INTO groq_global_cooldown (
                    id, cooldown_until, reason, retry_after, error_message, updated_at
                ) VALUES (1, 0.0, 'INITIALIZED', NULL, NULL, ?)
            """, (datetime.now(timezone.utc).isoformat(),))

            conn.commit()
        finally:
            conn.close()

    execute_with_retry(_init)


def classify_rate_limit(raw_str: str, headers: Optional[Dict[str, Any]] = None) -> str:
    """
    Classify the rate limit category strictly based on provider evidence:
    - RATE_LIMIT_TYPE_RPM: Requests per minute limit exceeded
    - RATE_LIMIT_TYPE_TPM: Tokens per minute limit exceeded
    - RATE_LIMIT_TYPE_RPD: Requests per day limit exceeded
    - RATE_LIMIT_TYPE_TPD: Tokens per day limit exceeded
    - RATE_LIMIT_TYPE_UNKNOWN: Default when exact limit category is not established
    """
    s = (raw_str or "").lower()
    if re.search(r"\brpm\b|requests\s+per\s+minute", s):
        return "RATE_LIMIT_TYPE_RPM"
    if re.search(r"\btpm\b|tokens\s+per\s+minute", s):
        return "RATE_LIMIT_TYPE_TPM"
    if re.search(r"\brpd\b|requests\s+per\s+day", s):
        return "RATE_LIMIT_TYPE_RPD"
    if re.search(r"\btpd\b|tokens\s+per\s+day", s):
        return "RATE_LIMIT_TYPE_TPD"
    return "RATE_LIMIT_TYPE_UNKNOWN"


def parse_retry_after(raw_str: str, headers: Optional[Dict[str, Any]] = None) -> Optional[float]:
    """
    Extract provider-recommended cooldown seconds strictly from authoritative fields.
    Authoritative sources:
      1. HTTP 'Retry-After' header (standard wait seconds).
      2. Direct error message text indicating wait time (e.g., 'Please try again in 12.5s').
      3. For verified TPM rate limits, 'x-ratelimit-reset-tokens'.
    CRITICAL: Never interpret 'x-ratelimit-reset-requests' as an RPM cooldown.
    Per Groq docs, 'x-ratelimit-reset-requests' indicates reset time for Requests Per Day (RPD).
    """
    if headers:
        # 1. Standard HTTP Retry-After
        ra = headers.get("retry-after") or headers.get("Retry-After")
        if ra:
            try:
                return max(0.5, float(ra))
            except (ValueError, TypeError):
                pass

        # 2. Check x-ratelimit-reset-tokens ONLY if TPM limit is indicated
        is_tpm = "tpm" in (raw_str or "").lower() or "tokens per minute" in (raw_str or "").lower()
        if is_tpm:
            val = headers.get("x-ratelimit-reset-tokens")
            if val and isinstance(val, str):
                m = re.search(r"([0-9\.]+)\s*(m?s)", val, re.IGNORECASE)
                if m:
                    n = float(m.group(1))
                    unit = m.group(2).lower()
                    sec = n / 1000.0 if unit == "ms" else n
                    return max(0.5, sec)

    # 3. Parse error message text for wait instruction (e.g. "Please try again in 12.5s" or "840ms")
    m = re.search(r"(?:try again in|retry after|wait)\s*([0-9\.]+)\s*(m?s)", raw_str or "", re.IGNORECASE)
    if m:
        n = float(m.group(1))
        unit = m.group(2).lower()
        sec = n / 1000.0 if unit == "ms" else n
        return max(0.5, sec)

    # Compound minute + second format: e.g. "try again in 1m20s"
    m_compound = re.search(r"(?:try again in|wait)\s*([0-9]+)\s*m\s*([0-9\.]+)\s*s", raw_str or "", re.IGNORECASE)
    if m_compound:
        mins = float(m_compound.group(1))
        secs = float(m_compound.group(2))
        return max(0.5, mins * 60.0 + secs)

    return None


class GroqRequestScheduler:
    """
    Centralized, cross-process Groq request coordinator.
    Enforces rolling RPM windows, minimum spacing intervals, provider cooldowns,
    and fair scheduling across applications and document batches.
    """

    def __init__(self):
        init_scheduler_tables()

    @property
    def effective_rpm(self) -> int:
        margin = max(0.0, min(90.0, settings.GROQ_SAFETY_MARGIN_PERCENT))
        budget = int(settings.GROQ_RPM_LIMIT * (1.0 - margin / 100.0))
        return max(1, budget)

    @property
    def min_interval(self) -> float:
        # Mathematically derived spacing to guarantee no burst exceeds effective RPM
        spacing_from_rpm = 60.0 / float(self.effective_rpm)
        configured_min = max(0.2, settings.GROQ_MIN_REQUEST_INTERVAL_SECONDS)
        return max(configured_min, spacing_from_rpm)

    def get_cooldown_status(self) -> Dict[str, Any]:
        """Check if Groq API is currently in a global cooldown window."""
        def _check():
            conn = get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("SELECT cooldown_until, reason, error_message FROM groq_global_cooldown WHERE id = 1")
                row = cursor.fetchone()
                if not row:
                    return {"in_cooldown": False, "remaining_seconds": 0.0, "reason": None}
                cd_until = float(row["cooldown_until"] or 0.0)
                now = time.time()
                remaining = max(0.0, cd_until - now)
                return {
                    "in_cooldown": remaining > 0.05,
                    "remaining_seconds": round(remaining, 2),
                    "reason": row["reason"],
                    "error_message": row["error_message"],
                    "cooldown_until": cd_until,
                }
            finally:
                conn.close()

        return execute_with_retry(_check)

    def set_global_cooldown(
        self,
        duration_seconds: float,
        reason: str = "HTTP_429_RATE_LIMIT",
        error_message: Optional[str] = None,
        retry_after: Optional[float] = None,
    ):
        """
        Record provider-mandated cooldown across all workers and applications.
        Adds controlled jitter (+0.2s to +1.0s) to eliminate synchronized retries.
        """
        jitter = random.uniform(0.2, 1.0)
        total_cooldown = max(1.0, duration_seconds) + jitter
        cooldown_until = time.time() + total_cooldown
        now_iso = datetime.now(timezone.utc).isoformat()

        def _update():
            conn = get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("""
                    UPDATE groq_global_cooldown
                    SET cooldown_until = MAX(cooldown_until, ?),
                        reason = ?,
                        retry_after = ?,
                        error_message = ?,
                        updated_at = ?
                    WHERE id = 1
                """, (cooldown_until, reason, retry_after or duration_seconds, error_message, now_iso))
                conn.commit()
            finally:
                conn.close()

        execute_with_retry(_update)
        logger.warning(
            f"Groq Global Cooldown activated for {total_cooldown:.2f}s (until {cooldown_until:.2f}, "
            f"reason={reason}, jitter={jitter:.2f}s): {error_message}"
        )

    def reset_cooldown(self):
        """Reset global cooldown and clear recent reservations (useful for tests and admin recovery)."""
        def _reset():
            conn = get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("""
                    UPDATE groq_global_cooldown
                    SET cooldown_until = 0.0,
                        reason = 'RESET',
                        retry_after = NULL,
                        error_message = NULL,
                        updated_at = ?
                    WHERE id = 1
                """, (datetime.now(timezone.utc).isoformat(),))
                cursor.execute("DELETE FROM groq_request_reservations")
                conn.commit()
            finally:
                conn.close()

        execute_with_retry(_reset)
        logger.info("GroqRequestScheduler: global cooldown and reservations reset.")

    async def acquire_slot(
        self,
        application_id: str,
        batch_index: int = 1,
        max_wait_seconds: float = 60.0,
        priority: str = "high",
    ) -> str:
        """
        Wait for and acquire an authorized request slot under the shared Groq budget.
        Enforces:
          1. Global provider cooldown (e.g. from previous HTTP 429).
          2. Minimum inter-request spacing interval (e.g. 2.0s).
          3. Rolling 60-second window request cap (effective RPM).
          4. Priority awareness: officer scrutiny ("high") receives priority reservation
             headroom over institute pre-validation ("normal").
          5. Anti-starvation: normal requests waiting > 30s receive guaranteed slot allocation.
        Returns a unique reservation ID upon acquisition.
        """
        import asyncio

        start_time = time.time()
        req_id = f"greq-{uuid.uuid4().hex[:12]}"

        while True:
            elapsed = time.time() - start_time
            if elapsed >= max_wait_seconds:
                raise TimeoutError(
                    f"Groq request scheduler timed out waiting for rate-limit slot after {elapsed:.1f}s."
                )

            # 1. Check global cooldown
            cd = self.get_cooldown_status()
            if cd["in_cooldown"]:
                wait_sec = min(cd["remaining_seconds"] + 0.1, max_wait_seconds - elapsed)
                logger.info(
                    f"Groq provider in cooldown ({cd['reason']}). Application {application_id} batch {batch_index} "
                    f"waiting {wait_sec:.2f}s..."
                )
                await asyncio.sleep(wait_sec)
                continue

            # 2. Check rolling window, priority headroom, and inter-request interval in SQLite
            def _check_and_reserve():
                conn = get_connection()
                try:
                    cursor = conn.cursor()
                    now = time.time()
                    cutoff_60s = now - 60.0

                    # Prune ancient reservations (> 10 minutes)
                    cursor.execute("DELETE FROM groq_request_reservations WHERE reserved_at < ?", (now - 600.0,))

                    # Check spacing interval against most recent reservation across all apps
                    cursor.execute("SELECT MAX(reserved_at) FROM groq_request_reservations")
                    row = cursor.fetchone()
                    last_reserved_at = row[0] if (row and row[0] is not None) else 0.0
                    interval_needed = self.min_interval - (now - last_reserved_at)

                    if interval_needed > 0.02:
                        return {"can_reserve": False, "wait_seconds": interval_needed}

                    # Count active reservations in the 60s sliding window
                    cursor.execute(
                        "SELECT COUNT(*), MIN(reserved_at) FROM groq_request_reservations WHERE reserved_at > ?",
                        (cutoff_60s,),
                    )
                    cnt_row = cursor.fetchone()
                    req_count = cnt_row[0] or 0
                    oldest_in_window = cnt_row[1] or now

                    # Check absolute ceiling
                    if req_count >= self.effective_rpm:
                        wait_for_window = max(0.1, (oldest_in_window + 60.0) - now + 0.1)
                        return {"can_reserve": False, "wait_seconds": wait_for_window}

                    # Priority evaluation for normal-priority pre-validations
                    if priority == "normal":
                        normal_ceiling = max(1, int(self.effective_rpm * 0.70))
                        # Anti-starvation check: if normal request has waited >= 30s, grant slot under full ceiling
                        has_starved = elapsed >= 30.0
                        if req_count >= normal_ceiling and not has_starved:
                            # Normal priority deferred to reserve headroom for officer scrutiny
                            wait_for_window = max(0.5, (oldest_in_window + 60.0) - now + 0.1)
                            return {"can_reserve": False, "wait_seconds": min(2.5, wait_for_window)}

                    # Slot available: atomically reserve it
                    cursor.execute("""
                        INSERT INTO groq_request_reservations (
                            request_id, application_id, batch_index, reserved_at, status
                        ) VALUES (?, ?, ?, ?, 'RESERVED')
                    """, (req_id, application_id, batch_index, now))
                    conn.commit()

                    return {"can_reserve": True, "wait_seconds": 0.0}
                finally:
                    conn.close()

            res = execute_with_retry(_check_and_reserve)
            if res["can_reserve"]:
                logger.info(
                    f"Groq request slot acquired: {req_id} (app={application_id}, priority={priority}, "
                    f"effective_rpm={self.effective_rpm})"
                )
                return req_id

            sleep_time = min(res["wait_seconds"], max_wait_seconds - elapsed)
            logger.debug(
                f"Groq rate limiter pacing: waiting {sleep_time:.2f}s before dispatch (app={application_id})..."
            )
            await asyncio.sleep(sleep_time)

    def finish_slot(self, request_id: str, success: bool):
        """Mark reservation outcome for tracking and analytics."""
        def _finish():
            conn = get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute(
                    "UPDATE groq_request_reservations SET status = ? WHERE request_id = ?",
                    ("COMPLETED" if success else "FAILED", request_id),
                )
                conn.commit()
            finally:
                conn.close()

        execute_with_retry(_finish)


# Global singleton scheduler instance
groq_scheduler = GroqRequestScheduler()
