import pytest
import sqlite3
from database import (
    init_db,
    create_job,
    update_job_status,
    complete_job,
    get_job,
    get_completed_job_by_version,
    reconcile_startup_jobs,
)
from config import settings

@pytest.fixture(autouse=True)
def setup_db():
    init_db()

def test_startup_recovery_interrupted_jobs():
    """Verify that jobs left in PENDING or PROCESSING on restart are transitioned to FAILED."""
    job1 = create_job("app-restart-1", "AICTE-2026-REC-001")
    job2 = create_job("app-restart-2", "AICTE-2026-REC-002")
    update_job_status(job2["job_id"], "PROCESSING")

    # Simulate restart reconciliation
    reconciled_count = reconcile_startup_jobs()
    assert reconciled_count >= 2

    # Verify both jobs are marked FAILED
    j1 = get_job(job1["job_id"])
    j2 = get_job(job2["job_id"])
    assert j1["status"] == "FAILED"
    assert "server restart" in j1["error_message"]
    assert j2["status"] == "FAILED"
    assert "server restart" in j2["error_message"]

def test_completed_job_persists_version_hash():
    """Verify that completing a job stores the version_hash in SQLite."""
    job = create_job("app-hash-1", "AICTE-2026-HASH-001")
    v_hash = "abc123canonicalhash999"

    complete_job(
        job_id=job["job_id"],
        version_hash=v_hash,
        report_id="rep-12345",
        outcome="COMPLIANT",
        findings=[],
        summary="Test Summary",
    )

    stored = get_job(job["job_id"])
    assert stored["status"] == "COMPLIANT" or stored["status"] == "COMPLETED"
    assert stored["version_hash"] == v_hash
    assert stored["report_id"] == "rep-12345"

def test_lookup_completed_job_by_version():
    """Verify that existing completed jobs are matched by version_hash, but different hashes return None."""
    job = create_job("app-lookup-1", "AICTE-2026-LOOKUP-001")
    v_hash = "hash_version_v1"

    complete_job(
        job_id=job["job_id"],
        version_hash=v_hash,
        report_id="report-v1",
        outcome="COMPLIANT",
        findings=[],
        summary="V1 summary",
    )

    # 1. Matching version hash finds the completed job
    match = get_completed_job_by_version("app-lookup-1", v_hash)
    assert match is not None
    assert match["job_id"] == job["job_id"]
    assert match["report_id"] == "report-v1"

    # 2. Changed version hash (e.g. document replaced) returns None -> allowing re-analysis
    changed_match = get_completed_job_by_version("app-lookup-1", "hash_version_v2_updated")
    assert changed_match is None
