import pytest
from fastapi.testclient import TestClient
from main import app
from database import init_db
from config import settings

client = TestClient(app)
VALID_TOKEN = settings.AI_BACKEND_SECRET
AUTH_HEADER = {"X-Service-Authorization": f"Bearer {VALID_TOKEN}"}

@pytest.fixture(autouse=True)
def setup_database():
    init_db()

def test_health_endpoint_public():
    """Health check remains open for container/liveness probes."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "ai-scrutiny-assistant"
    assert "APH 2024-2027" in data["handbook"]

def test_trigger_job_unauthenticated():
    """Unauthenticated request to trigger endpoint must be rejected with 401."""
    response = client.post(
        "/api/v1/jobs/trigger",
        json={"application_id": "test-app-unauth"},
    )
    assert response.status_code == 401
    assert "Missing machine authorization" in response.json().get("detail", "")

def test_trigger_job_malformed_auth():
    """Malformed auth header must be rejected with 401."""
    response = client.post(
        "/api/v1/jobs/trigger",
        headers={"X-Service-Authorization": "InvalidFormatToken"},
        json={"application_id": "test-app-unauth"},
    )
    assert response.status_code == 401
    assert "Malformed" in response.json().get("detail", "")

def test_trigger_job_invalid_secret():
    """Invalid machine secret must be rejected with 401."""
    response = client.post(
        "/api/v1/jobs/trigger",
        headers={"X-Service-Authorization": "Bearer wrong_secret_token_123"},
        json={"application_id": "test-app-unauth"},
    )
    assert response.status_code == 401
    assert "Invalid machine service credentials" in response.json().get("detail", "")

def test_trigger_job_authenticated_success():
    """Valid machine credentials allow job dispatch."""
    response = client.post(
        "/api/v1/jobs/trigger",
        headers=AUTH_HEADER,
        json={"application_id": "test-app-auth", "application_number": "AICTE-2026-AUTH-001"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "job_id" in data
    assert data["application_id"] == "test-app-auth"
    assert data["status"] in ["PENDING", "PROCESSING"]

def test_duplicate_trigger_reuses_active_job():
    """Triggering for an application with an active (PROCESSING) job returns the existing job without duplicating."""
    from database import create_job, update_job_status
    # Create an initial active job in PROCESSING state
    initial_job = create_job("test-app-active-dup", "AICTE-2026-ACTIVE-001")
    update_job_status(initial_job["job_id"], "PROCESSING")

    # Now trigger via API for the same application while it is active
    resp = client.post(
        "/api/v1/jobs/trigger",
        headers=AUTH_HEADER,
        json={"application_id": "test-app-active-dup", "application_number": "AICTE-2026-ACTIVE-001"},
    )
    assert resp.status_code == 200
    returned_data = resp.json()

    # Must return the existing active job ID and status
    assert returned_data["job_id"] == initial_job["job_id"]
    assert returned_data["status"] == "PROCESSING"

def test_job_polling_endpoints_authentication():
    """Job status polling endpoints require authentication."""
    # Create a job first
    trig_resp = client.post(
        "/api/v1/jobs/trigger",
        headers=AUTH_HEADER,
        json={"application_id": "test-app-poll"},
    )
    job_id = trig_resp.json()["job_id"]

    # 1. Unauthenticated polling by job_id -> 401
    poll_unauth = client.get(f"/api/v1/jobs/{job_id}")
    assert poll_unauth.status_code == 401

    # 2. Authenticated polling by job_id -> 200
    poll_auth = client.get(f"/api/v1/jobs/{job_id}", headers=AUTH_HEADER)
    assert poll_auth.status_code == 200
    assert poll_auth.json()["job_id"] == job_id

    # 3. Unauthenticated polling by application_id -> 401
    app_unauth = client.get("/api/v1/jobs/application/test-app-poll")
    assert app_unauth.status_code == 401

    # 4. Authenticated polling by application_id -> 200
    app_auth = client.get("/api/v1/jobs/application/test-app-poll", headers=AUTH_HEADER)
    assert app_auth.status_code == 200
    assert app_auth.json()["application_id"] == "test-app-poll"
