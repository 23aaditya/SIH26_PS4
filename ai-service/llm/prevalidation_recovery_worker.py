"""
Dedicated Asynchronous Recovery Worker for Institute Document Pre-Validation (Phase 1).

Monitors `document_prevalidations` table in `agent_jobs.db` for queued,
retry-scheduled, and stalled jobs. Operates with dynamic 60s leases,
20s periodic background heartbeats, and claim-token fencing.
Completely isolated from officer-side scrutiny batch recovery.
"""

import asyncio
import logging
import os
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from config import settings
from database import (
    claim_next_prevalidation_job,
    renew_prevalidation_lease,
    get_connection,
    execute_with_retry,
)
from llm.prevalidation_agent import prevalidation_agent

logger = logging.getLogger("ai_scrutiny_service.prevalidation_recovery_worker")


class DocumentPrevalidationRecoveryWorker:
    """
    Dedicated recovery worker executing and recovering pre-validation jobs.
    """

    def __init__(self, poll_interval: float = 3.0, lease_duration: float = 60.0, heartbeat_interval: float = 20.0):
        self.poll_interval = poll_interval
        self.lease_duration = lease_duration
        self.heartbeat_interval = heartbeat_interval
        self.worker_id = f"preval-worker-{uuid.uuid4().hex[:8]}"
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._janitor_task: Optional[asyncio.Task] = None

    def start(self):
        """Start the background recovery loop."""
        if self._running:
            return
        self._running = True
        try:
            loop = asyncio.get_running_loop()
            self._task = loop.create_task(self._run_loop())
            self._janitor_task = loop.create_task(self._run_janitor_loop())
            logger.info(f"DocumentPrevalidationRecoveryWorker started (worker_id={self.worker_id}).")
        except RuntimeError:
            logger.warning("DocumentPrevalidationRecoveryWorker: No running event loop found to start worker.")

    def stop(self):
        """Stop the background recovery loop."""
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
        if self._janitor_task and not self._janitor_task.done():
            self._janitor_task.cancel()
        logger.info(f"DocumentPrevalidationRecoveryWorker stopped ({self.worker_id}).")

    async def _heartbeat_loop(self, job_id: str, claim_token: str, stop_event: asyncio.Event):
        """Periodic heartbeat renewing lease while pre-validation inference is active."""
        while not stop_event.is_set():
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=self.heartbeat_interval)
                break
            except asyncio.TimeoutError:
                pass

            if stop_event.is_set():
                break

            renewed = renew_prevalidation_lease(job_id, claim_token, self.lease_duration)
            if not renewed:
                logger.warning(
                    f"DocumentPrevalidationRecoveryWorker: Heartbeat renewal failed for {job_id} "
                    f"(lease expired or reclaimed)."
                )
                break

    async def _process_single_job(self, job: dict, claim_token: str):
        """Process a claimed prevalidation job with background heartbeat protection."""
        job_id = job["job_id"]
        stop_event = asyncio.Event()
        heartbeat_task = asyncio.create_task(self._heartbeat_loop(job_id, claim_token, stop_event))

        try:
            await prevalidation_agent.prevalidate_staged_document(job, claim_token)
        except Exception as e:
            logger.error(f"DocumentPrevalidationRecoveryWorker: Unhandled exception in job {job_id}: {e}", exc_info=True)
        finally:
            stop_event.set()
            try:
                await heartbeat_task
            except Exception:
                pass

    async def _run_loop(self):
        """Continuous polling loop scanning for work in SQLite."""
        while self._running:
            try:
                claim_token = f"{self.worker_id}:{uuid.uuid4().hex[:12]}"
                job = claim_next_prevalidation_job(claim_token, lease_seconds=self.lease_duration)

                if job:
                    logger.info(f"DocumentPrevalidationRecoveryWorker: Claimed job {job['job_id']}")
                    await self._process_single_job(job, claim_token)
                    continue
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"DocumentPrevalidationRecoveryWorker polling loop error: {e}", exc_info=True)

            await asyncio.sleep(self.poll_interval)

    async def _run_janitor_loop(self):
        """Periodic janitor cleaning up aged staged files (> 24h) for terminal jobs."""
        while self._running:
            try:
                await asyncio.sleep(3600.0)  # Hourly check
                self.clean_aged_staging_files(max_age_hours=24.0)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"DocumentPrevalidationRecoveryWorker janitor loop error: {e}")

    def clean_aged_staging_files(self, max_age_hours: float = 24.0) -> int:
        """Unlink staged files for completed/failed jobs older than max_age_hours."""
        cutoff_iso = (datetime.now(timezone.utc) - timedelta(hours=max_age_hours)).isoformat()

        def _cleanup():
            conn = get_connection()
            try:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT id, job_id, staged_file_path FROM document_prevalidations
                    WHERE job_status IN ('COMPLETED', 'FAILED')
                      AND completed_at IS NOT NULL
                      AND completed_at < ?
                      AND staged_file_path IS NOT NULL
                """, (cutoff_iso,))
                rows = cursor.fetchall()
                unlinked = 0
                for r in rows:
                    path_str = r[2]
                    if path_str and os.path.exists(path_str):
                        try:
                            os.remove(path_str)
                            unlinked += 1
                        except Exception as e:
                            logger.warning(f"Failed to unlink aged staged file {path_str}: {e}")
                return unlinked
            finally:
                conn.close()

        try:
            count = execute_with_retry(_cleanup)
            if count > 0:
                logger.info(f"DocumentPrevalidationRecoveryWorker: Cleaned {count} aged staged PDF files.")
            return count
        except Exception as e:
            logger.warning(f"Janitor cleanup failed: {e}")
            return 0


prevalidation_recovery_worker = DocumentPrevalidationRecoveryWorker()
