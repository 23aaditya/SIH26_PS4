import pytest
import httpx
import time

EXPRESS_URL = "http://localhost:4000/api"
AI_SERVICE_URL = "http://127.0.0.1:8000"
VALID_AI_SECRET = "aicte_agent_secret_prod_2026_x89f_secure_token"

@pytest.mark.asyncio
async def test_e2e_ai_scrutiny_workflow():
    """
    End-to-End Integration Test for Phase 2:
    1. Fetch an eligible scrutiny application from Express.
    2. Trigger AI Scrutiny analysis via FastAPI POST /api/v1/jobs/trigger.
    3. Poll job completion in FastAPI.
    4. Verify the report exists in Express with reportType 'AI_SCRUTINY_PRE_CHECK'.
    5. Confirm application workflow stage and status remain unchanged.
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Fetch eligible scrutiny application
        apps_resp = await client.get(
            f"{EXPRESS_URL}/applications?pageSize=50",
        )
        assert apps_resp.status_code == 200
        apps_data = apps_resp.json().get("items", [])
        scrutiny_app = next(
            (a for a in apps_data if a.get("status") == "in_review" and a.get("currentStageId") in ["scrutiny", "re_scrutiny"]),
            None,
        )
        assert scrutiny_app is not None, "No eligible scrutiny-stage application found in database"
        app_id = scrutiny_app["id"]
        app_number = scrutiny_app["applicationNumber"]

        # 2. Trigger AI Scrutiny job via FastAPI (with machine credentials)
        trigger_resp = await client.post(
            f"{AI_SERVICE_URL}/api/v1/jobs/trigger",
            headers={"X-Service-Authorization": f"Bearer {VALID_AI_SECRET}"},
            json={"application_id": app_id, "application_number": app_number},
        )
        assert trigger_resp.status_code == 200
        trigger_data = trigger_resp.json()
        job_id = trigger_data["job_id"]
        assert trigger_data["status"] in ["PENDING", "PROCESSING", "COMPLETED"]

        # 3. Poll for job completion (with machine credentials)
        job_completed = False
        final_job_data = None
        for _ in range(15):
            await asyncio_sleep(1.0)
            status_resp = await client.get(
                f"{AI_SERVICE_URL}/api/v1/jobs/{job_id}",
                headers={"X-Service-Authorization": f"Bearer {VALID_AI_SECRET}"},
            )
            assert status_resp.status_code == 200
            final_job_data = status_resp.json()
            if final_job_data["status"] in ["COMPLETED", "FAILED"]:
                job_completed = True
                break

        assert job_completed is True, "AI Scrutiny job timed out"
        assert final_job_data["status"] == "COMPLETED", f"Job failed: {final_job_data.get('error_message')}"
        assert final_job_data["report_id"] is not None
        assert final_job_data["findings_count"] == 5

        # 4. Verify report in Express as human scrutiny officer
        reports_resp = await client.get(
            f"{EXPRESS_URL}/aicte/applications/{app_id}/reports",
            headers={"x-user-id": "DEMO-AIC-034"},
        )
        assert reports_resp.status_code == 200
        reports = reports_resp.json()
        ai_report = next((r for r in reports if r["id"] == final_job_data["report_id"]), None)
        assert ai_report is not None
        assert ai_report["reportType"] == "AI_SCRUTINY_PRE_CHECK"
        assert "AI Scrutiny Advisory Pre-Check" in ai_report["content"]
        assert "APH 2024-2027" in ai_report["metadataJson"]

        # 5. Confirm application status and current stage remained completely untouched
        app_check_resp = await client.get(
            f"{EXPRESS_URL}/aicte/applications/{app_id}",
            headers={"x-user-id": "DEMO-AIC-034"},
        )
        assert app_check_resp.status_code == 200
        verified_app = app_check_resp.json()
        assert verified_app["status"] == scrutiny_app["status"]
        assert verified_app["currentStageId"] == scrutiny_app["currentStageId"]

async def asyncio_sleep(seconds: float):
    import asyncio
    await asyncio.sleep(seconds)
