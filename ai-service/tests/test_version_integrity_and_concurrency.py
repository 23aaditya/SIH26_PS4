import pytest
import hashlib
from concurrent.futures import ThreadPoolExecutor
from main import compute_application_version_hash
from database import (
    init_db,
    create_job,
    get_job,
    get_active_job_for_application,
    update_job_status,
    get_connection,
)

@pytest.fixture(autouse=True)
def setup_db():
    init_db()
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM scrutiny_jobs WHERE application_id LIKE 'app-%'")
        conn.commit()
    finally:
        conn.close()

# ==============================================================================
# Fix A Tests: Document Version Integrity
# ==============================================================================

def test_identical_app_and_doc_content_produces_identical_hash():
    """Identical application and document content produces the exact same version hash."""
    app_data = {
        "id": "app-test-1",
        "updatedAt": "2026-10-26T12:00:00.000Z",
        "workflowVersion": "v-2.4",
        "documents": [
            {"id": "doc-1", "originalFilename": "fire_noc.pdf"},
            {"id": "doc-2", "originalFilename": "affidavit.pdf"},
        ],
    }
    checksums = {
        "doc-1": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "doc-2": "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
    }

    hash1 = compute_application_version_hash(app_data, checksums)
    hash2 = compute_application_version_hash(app_data, checksums)
    assert hash1 == hash2
    assert len(hash1) == 64

def test_replacing_doc_content_changes_hash_with_same_doc_id():
    """Replacing document content changes the version hash even if the document ID remains unchanged."""
    app_data = {
        "id": "app-test-2",
        "updatedAt": "2026-10-26T12:00:00.000Z",
        "workflowVersion": "v-2.4",
        "documents": [
            {"id": "doc-fixed-id", "originalFilename": "occupancy_cert.pdf"},
        ],
    }
    initial_checksums = {"doc-fixed-id": "1111111111111111111111111111111111111111111111111111111111111111"}
    replaced_checksums = {"doc-fixed-id": "2222222222222222222222222222222222222222222222222222222222222222"}

    initial_hash = compute_application_version_hash(app_data, initial_checksums)
    replaced_hash = compute_application_version_hash(app_data, replaced_checksums)

    assert initial_hash != replaced_hash

def test_adding_or_removing_doc_changes_version_hash():
    """Adding or removing a document changes the version hash."""
    base_app = {
        "id": "app-test-3",
        "updatedAt": "2026-10-26T12:00:00.000Z",
        "workflowVersion": "v-2.4",
        "documents": [
            {"id": "doc-a", "originalFilename": "a.pdf"},
        ],
    }
    base_checksums = {"doc-a": "aaaa"}

    app_added = {
        "id": "app-test-3",
        "updatedAt": "2026-10-26T12:00:00.000Z",
        "workflowVersion": "v-2.4",
        "documents": [
            {"id": "doc-a", "originalFilename": "a.pdf"},
            {"id": "doc-b", "originalFilename": "b.pdf"},
        ],
    }
    added_checksums = {"doc-a": "aaaa", "doc-b": "bbbb"}

    base_hash = compute_application_version_hash(base_app, base_checksums)
    added_hash = compute_application_version_hash(app_added, added_checksums)

    assert base_hash != added_hash

def test_unreadable_or_missing_content_handled_explicitly():
    """Unreadable or missing content is handled explicitly and does not silently assume unchanged content."""
    app_data = {
        "id": "app-test-4",
        "updatedAt": "2026-10-26T12:00:00.000Z",
        "workflowVersion": "v-2.4",
        "documents": [{"id": "doc-corrupted", "originalFilename": "corrupt.pdf"}],
    }
    # Explicit fallback markers for corrupted / unreadable files
    corrupt_checksums = {"doc-corrupted": "unreadable:doc-corrupted"}
    valid_checksums = {"doc-corrupted": "valid_sha256_hash_here"}

    hash_unreadable = compute_application_version_hash(app_data, corrupt_checksums)
    hash_valid = compute_application_version_hash(app_data, valid_checksums)

    assert hash_unreadable != hash_valid
    assert len(hash_unreadable) == 64

# ==============================================================================
# Fix B Tests: Atomic Idempotency and Concurrency Protection
# ==============================================================================

def test_concurrent_simultaneous_job_triggers_atomic_deduplication():
    """
    Test that sending 10 simultaneous job creation requests across concurrent threads
    for the same application results in EXACTLY ONE active job created in SQLite,
    with all threads safely receiving that same job.
    """
    app_id = "app-atomic-concurrency-test"
    app_num = "AICTE-2026-CONC-001"

    def _trigger():
        return create_job(app_id, app_num)

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(_trigger) for _ in range(10)]
        results = [f.result() for f in futures]

    # All 10 callers must have received a valid job dict
    assert len(results) == 10

    # Every single caller received the exact same job_id
    first_job_id = results[0]["job_id"]
    for res in results:
        assert res["job_id"] == first_job_id
        assert res["application_id"] == app_id

    # Verify that SQLite contains only ONE active job for this application
    active = get_active_job_for_application(app_id)
    assert active is not None
    assert active["job_id"] == first_job_id
    assert active["status"] in ("PENDING", "PROCESSING")

# ==============================================================================
# D-02 Regression Tests: Unreadable Document Recovery & Report Reuse
# ==============================================================================

@pytest.mark.asyncio
async def test_unreadable_document_retry_recovery_sequence(monkeypatch):
    """
    D-02 Requirement 8:
    Reproduce the precise failure and recovery sequence:
    1. A document has a stored server checksum.
    2. The first attempt fails to download/extract the document.
    3. The failed attempt must NOT create a reusable successful report for that content.
    4. The document becomes readable without changing its ID, application timestamp, or server checksum.
    5. A retry re-downloads and extracts the content, evaluates it, and produces a correct report rather than reusing an incomplete report.
    """
    from main import run_scrutiny_analysis, backend_client
    from database import get_completed_job_by_version

    app_id = "app-d02-seq-test"
    doc_id = "doc-d02-target"
    real_pdf_bytes = b"%PDF-1.4 Mock valid PDF document text layer"
    real_checksum = hashlib.sha256(real_pdf_bytes).hexdigest()

    app_data = {
        "id": app_id,
        "applicationNumber": "AICTE-2026-D02-001",
        "updatedAt": "2026-10-26T12:00:00.000Z",
        "workflowVersion": "v-2.4",
        "documents": [
            {
                "id": doc_id,
                "originalFilename": "Fire_Safety_NOC.pdf",
                "checksum": real_checksum, # Stored server checksum present
            }
        ],
    }

    # Step 1: Mock get_application to return our test dossier
    async def mock_get_app(_app_id):
        return app_data

    monkeypatch.setattr(backend_client, "get_application", mock_get_app)

    # Step 2: Attempt 1 - download_document raises an I/O / technical error
    async def mock_download_fail(_doc_id):
        raise ConnectionResetError("Simulated network timeout during PDF download")

    monkeypatch.setattr(backend_client, "download_document", mock_download_fail)

    report_submissions = []
    async def mock_submit_report(_app_id, payload):
        report_submissions.append(payload)
        return {"success": True, "report": {"id": "rep-should-not-exist"}}

    monkeypatch.setattr(backend_client, "submit_pre_check_report", mock_submit_report)

    # Run attempt 1
    job1 = create_job(app_id, "AICTE-2026-D02-001")
    await run_scrutiny_analysis(job1["job_id"], app_id)

    # Assert Attempt 1 results:
    # - Job must be FAILED with explicit technical error message
    # - NO report must have been submitted to Express
    # - get_completed_job_by_version must be None
    job1_state = get_job(job1["job_id"])
    assert job1_state["status"] == "FAILED"
    assert "Technical document processing failure" in job1_state["error_message"]
    assert len(report_submissions) == 0, "Failed attempt must NOT submit a report to Express"

    # Step 3: Attempt 2 (Retry) - Document becomes readable without ID, updatedAt, or server checksum changing
    async def mock_download_success(_doc_id):
        return real_pdf_bytes, "Fire_Safety_NOC.pdf"

    monkeypatch.setattr(backend_client, "download_document", mock_download_success)

    async def mock_find_existing_report(_app_id, _vhash):
        return None # No prior report existed in Express

    monkeypatch.setattr(backend_client, "find_existing_report_by_version", mock_find_existing_report)

    async def mock_submit_report_success(_app_id, payload):
        report_submissions.append(payload)
        return {"success": True, "report": {"id": "rep-authoritative-d02-success"}}

    monkeypatch.setattr(backend_client, "submit_pre_check_report", mock_submit_report_success)

    # Trigger retry
    job2 = create_job(app_id, "AICTE-2026-D02-001")
    await run_scrutiny_analysis(job2["job_id"], app_id)

    # Assert Attempt 2 results:
    # - Job must be COMPLETED
    # - Real report submitted to Express
    # - report_id linked to the authoritative report
    job2_state = get_job(job2["job_id"])
    assert job2_state["status"] == "COMPLETED"
    assert job2_state["report_id"] == "rep-authoritative-d02-success"
    assert len(report_submissions) == 1, "Retry must submit the genuine authoritative report"

    # Step 4: Subsequent retry with same readable content reuses the completed report
    job3 = create_job(app_id, "AICTE-2026-D02-001")
    await run_scrutiny_analysis(job3["job_id"], app_id)
    job3_state = get_job(job3["job_id"])
    assert job3_state["status"] == "COMPLETED"
    assert job3_state["report_id"] == "rep-authoritative-d02-success"
    assert len(report_submissions) == 1, "Unchanged retry must reuse completed report without re-submitting"

@pytest.mark.asyncio
async def test_persistent_unreadability_aborts_without_false_regulatory_report(monkeypatch):
    """Verify that persistent technical failure aborts cleanly and never submits a false regulatory deficiency report."""
    from main import run_scrutiny_analysis, backend_client

    app_id = "app-persistent-unreadable"
    app_data = {
        "id": app_id,
        "applicationNumber": "AICTE-2026-PERSIST-001",
        "updatedAt": "2026-10-26T12:00:00.000Z",
        "workflowVersion": "v-2.4",
        "documents": [{"id": "doc-corrupted-bytes", "originalFilename": "damaged.pdf", "checksum": "aabbcc"}],
    }

    async def mock_get_app(_app_id):
        return app_data

    async def mock_download_corrupt(_doc_id):
        # Storage corruption or unreadable I/O failure
        raise IOError("Corrupted file on storage volume: CRC32 mismatch")

    monkeypatch.setattr(backend_client, "get_application", mock_get_app)
    monkeypatch.setattr(backend_client, "download_document", mock_download_corrupt)

    submitted_reports = []
    async def mock_submit_report(_app_id, payload):
        submitted_reports.append(payload)
        return {"success": True, "report": {"id": "rep-unwanted"}}

    monkeypatch.setattr(backend_client, "submit_pre_check_report", mock_submit_report)

    job = create_job(app_id, "AICTE-2026-PERSIST-001")
    await run_scrutiny_analysis(job["job_id"], app_id)

    job_state = get_job(job["job_id"])
    assert job_state["status"] == "FAILED"
    assert "Technical document processing failure" in job_state["error_message"]
    assert len(submitted_reports) == 0, "No report must be submitted on persistent technical unreadability"

@pytest.mark.asyncio
async def test_retry_after_report_persistence_before_local_job_completion(monkeypatch):
    """
    D-02 Requirement 9:
    Verify that if Express already saved the report for this version hash,
    but local SQLite job completion was interrupted, a subsequent retry finds and reuses
    the Express report ID, skips duplicate submission, and successfully completes SQLite job state.
    """
    from main import run_scrutiny_analysis, backend_client

    app_id = "app-retry-persisted-report"
    pdf_bytes = b"%PDF-1.4 Mock document for crash recovery"
    csum = hashlib.sha256(pdf_bytes).hexdigest()

    app_data = {
        "id": app_id,
        "applicationNumber": "AICTE-2026-CRASH-001",
        "updatedAt": "2026-10-26T12:00:00.000Z",
        "workflowVersion": "v-2.4",
        "documents": [{"id": "doc-crash-rec", "originalFilename": "valid.pdf", "checksum": csum}],
    }

    async def mock_get_app(_app_id):
        return app_data

    async def mock_download(_doc_id):
        return pdf_bytes, "valid.pdf"

    # Express backend ALREADY has a persisted report for this version hash
    async def mock_find_existing(_app_id, _vhash):
        return "rep-previously-persisted-999"

    submit_called = []
    async def mock_submit_report(_app_id, payload):
        submit_called.append(payload)
        return {"success": True, "report": {"id": "rep-new-unwanted"}}

    monkeypatch.setattr(backend_client, "get_application", mock_get_app)
    monkeypatch.setattr(backend_client, "download_document", mock_download)
    monkeypatch.setattr(backend_client, "find_existing_report_by_version", mock_find_existing)
    monkeypatch.setattr(backend_client, "submit_pre_check_report", mock_submit_report)

    # Local SQLite has a fresh PENDING job (previous run crashed before complete_job)
    job = create_job(app_id, "AICTE-2026-CRASH-001")
    await run_scrutiny_analysis(job["job_id"], app_id)

    # Verify:
    # 1. Express report submission was NOT called again (no duplicate)
    # 2. Local SQLite job is COMPLETED with the existing Express report ID
    assert len(submit_called) == 0, "Must NOT re-submit report when Express already has it persisted"
    job_state = get_job(job["job_id"])
    assert job_state["status"] == "COMPLETED"
    assert job_state["report_id"] == "rep-previously-persisted-999"


