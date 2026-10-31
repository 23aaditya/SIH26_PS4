"""
Comprehensive Unit and Integration Test Suite for Phase 4 AICTE Lifecycle Agent.
Tests event handling, tool registry constraints, human approval gates, resumption,
idempotency, resubmission reconciliation diffs, and resilience.
"""

import pytest
import uuid
import json
from unittest.mock import AsyncMock, MagicMock, patch

from agent.models import (
    LifecycleEventType,
    AgentState,
    ActionType,
    ActionStatus,
)
from agent.store import (
    init_agent_tables,
    create_execution,
    get_execution,
    get_execution_by_correlation_id,
    update_execution,
    create_action,
    get_action,
    get_actions_for_execution,
    get_actions_for_application,
    update_action,
    reconcile_startup_executions,
)
from agent.tools import (
    tool_get_application_state,
    tool_get_document_dossier,
    tool_run_deterministic_scrutiny,
    tool_run_qualitative_scrutiny,
    tool_reconcile_resubmission_findings,
    tool_submit_advisory_report,
    tool_create_internal_notification,
    tool_propose_deficiency_notice,
    tool_execute_approved_action,
    ToolExecutionError,
)
from agent.orchestrator import LifecycleAgentOrchestrator
from rules.base import RuleFinding


@pytest.fixture(autouse=True)
def setup_agent_db():
    init_agent_tables()


# =============================================================================
# 1. Store & State Machine Persistence Tests
# =============================================================================

def test_execution_creation_and_idempotency():
    app_id = f"app-test-{uuid.uuid4().hex[:6]}"
    corr_id = f"corr-{uuid.uuid4().hex[:8]}"

    # Initial creation
    exec1 = create_execution(
        application_id=app_id,
        event_type=LifecycleEventType.APPLICATION_SUBMITTED.value,
        correlation_id=corr_id,
        payload={"sample": "data"},
    )
    assert exec1["execution_id"].startswith("exec-")
    assert exec1["status"] == "PENDING"
    assert exec1["correlation_id"] == corr_id

    # Duplicate creation with same correlation_id must return existing execution
    exec2 = create_execution(
        application_id=app_id,
        event_type=LifecycleEventType.APPLICATION_SUBMITTED.value,
        correlation_id=corr_id,
    )
    assert exec2["execution_id"] == exec1["execution_id"]


def test_action_lifecycle_and_approval_gate():
    exec_id = f"exec-{uuid.uuid4().hex[:8]}"
    app_id = f"app-{uuid.uuid4().hex[:8]}"

    # Action requiring approval
    act = create_action(
        execution_id=exec_id,
        application_id=app_id,
        action_type=ActionType.PROPOSE_DEFICIENCY_NOTICE.value,
        input_payload={"deficiency": "Missing Fire NOC"},
        requires_approval=True,
        rationale="Statutory violation under APH Section 2.14",
    )
    assert act["action_id"].startswith("act-")
    assert act["status"] == "WAITING_FOR_APPROVAL"
    assert act["requires_approval"] is True

    # Officer approves action
    updated = update_action(
        action_id=act["action_id"],
        status="EXECUTED",
        output_payload={"executed": True},
        approved_by="DEMO-AIC-034",
    )
    assert updated["status"] == "EXECUTED"
    assert updated["approved_by"] == "DEMO-AIC-034"
    assert updated["approved_at"] is not None


def test_startup_recovery_reconciles_running_executions():
    app_id = f"app-{uuid.uuid4().hex[:8]}"
    exec1 = create_execution(app_id, "APPLICATION_SUBMITTED")
    update_execution(exec1["execution_id"], status="RUNNING")

    # Simulate server crash and restart recovery
    reconciled = reconcile_startup_executions()
    assert reconciled >= 1

    recovered = get_execution(exec1["execution_id"])
    assert recovered["status"] == "PARTIAL_FAILURE"
    assert "Interrupted by server restart" in recovered["error_message"]


# =============================================================================
# 2. Controlled Tool Registry Tests
# =============================================================================

@pytest.mark.asyncio
async def test_tool_get_application_state_validation():
    # Empty or invalid ID must raise ToolExecutionError
    with pytest.raises(ToolExecutionError):
        await tool_get_application_state("")

    with pytest.raises(ToolExecutionError):
        await tool_get_application_state("ab")


def test_tool_run_deterministic_scrutiny_preserves_category():
    app_data = {
        "id": "app-test-eoa",
        "applicationNumber": "AICTE-2026-EOA-100",
        "applicationCategory": "Extension of Approval (EoA)",
        "documents": [],
    }
    extracted_docs = {}

    result = tool_run_deterministic_scrutiny("app-test-eoa", app_data, extracted_docs)
    assert result["category"] in ("eoa", "extension_of_approval")
    assert result["outcome"] in ("DEFICIENCY_SUGGESTED", "DEFICIENT")
    assert len(result["findings"]) == 5  # Exactly 5 baseline EoA checks
    assert not result["unsupported_category"]


@pytest.mark.asyncio
async def test_tool_reconcile_resubmission_diff():
    app_id = "app-test-reconcile"

    # Mock prior report findings: Rule 1 was DEFICIENT, Rule 2 was DEFICIENT
    mock_prior_report = {
        "reportType": "AI_SCRUTINY_PRE_CHECK",
        "metadataJson": json.dumps({
            "findings": [
                {"rule_id": "APH_FIRE_NOC", "rule_name": "Fire Safety NOC", "status": "DEFICIENT"},
                {"rule_id": "APH_OCCUPANCY_CERT", "rule_name": "Building Occupancy Certificate", "status": "DEFICIENT"},
            ]
        })
    }

    # Current findings: Rule 1 is now COMPLIANT, Rule 2 is still DEFICIENT
    current_findings = [
        RuleFinding(
            rule_id="APH_FIRE_NOC",
            rule_name="Fire Safety NOC",
            status="COMPLIANT",
            evidence="Verified",
            aph_clause="Clause 2.14",
            recommendation="Compliant",
        ),
        RuleFinding(
            rule_id="APH_OCCUPANCY_CERT",
            rule_name="Building Occupancy Certificate",
            status="DEFICIENT",
            evidence="Missing",
            aph_clause="Clause 2.15",
            recommendation="Upload valid certificate",
        ),
    ]

    with patch("agent.tools.backend_client.get_application_reports", new=AsyncMock(return_value=[mock_prior_report])):
        reconciled = await tool_reconcile_resubmission_findings(app_id, current_findings)

        assert reconciled["has_prior_report"] is True
        assert reconciled["resolved_count"] == 1
        assert reconciled["outstanding_count"] == 1

        diff_map = {d["rule_id"]: d["classification"] for d in reconciled["resubmission_diff"]}
        assert diff_map["APH_FIRE_NOC"] == "RESOLVED"
        assert diff_map["APH_OCCUPANCY_CERT"] == "STILL_OUTSTANDING"


def test_tool_propose_deficiency_notice_creates_approval_gate():
    exec_id = f"exec-{uuid.uuid4().hex[:6]}"
    app_id = f"app-{uuid.uuid4().hex[:6]}"
    items = [{"rule_id": "APH_FIRE_NOC", "deficiency": "Expired NOC"}]

    res = tool_propose_deficiency_notice(
        execution_id=exec_id,
        application_id=app_id,
        deficiency_items=items,
        rationale="Fire NOC expired in 2023",
    )

    assert res["requires_approval"] is True
    assert res["status"] == "WAITING_FOR_APPROVAL"
    assert res["deficiency_count"] == 1

    act = get_action(res["action_id"])
    assert act is not None
    assert act["requires_approval"] is True
    assert act["status"] == "WAITING_FOR_APPROVAL"


def test_tool_execute_approved_action():
    exec_id = f"exec-{uuid.uuid4().hex[:6]}"
    app_id = f"app-{uuid.uuid4().hex[:6]}"

    action = create_action(
        execution_id=exec_id,
        application_id=app_id,
        action_type="PROPOSE_DEFICIENCY_NOTICE",
        input_payload={"test": 1},
        requires_approval=True,
    )

    res = tool_execute_approved_action(
        action_id=action["action_id"],
        approver_id="DEMO-AIC-034",
        approval_notes="Approved with statutory 10-day timeline",
    )
    assert res["status"] == "EXECUTED"
    assert res["executed_by_authority"] == "DEMO-AIC-034"


# =============================================================================
# 3. Agent Orchestrator End-to-End Workflow Tests
# =============================================================================

@pytest.mark.asyncio
async def test_orchestrator_application_submitted_with_deficiencies_enters_waiting_approval():
    orchestrator = LifecycleAgentOrchestrator()
    app_id = f"app-sub-{uuid.uuid4().hex[:6]}"

    mock_app_state = {
        "id": app_id,
        "applicationNumber": "AICTE-2026-EOA-777",
        "applicationCategory": "Extension of Approval (EoA)",
        "status": "in_review",
        "currentStageId": "scrutiny",
        "currentStageName": "Scrutiny Committee Review",
        "currentAssigneeRole": "scrutiny_committee",
        "assignedUserId": "DEMO-AIC-034",
        "raw": {
            "id": app_id,
            "applicationNumber": "AICTE-2026-EOA-777",
            "applicationCategory": "Extension of Approval (EoA)",
            "status": "in_review",
            "currentStageId": "scrutiny",
            "documents": [],
        },
    }

    mock_dossier = {
        "extracted_docs": {},
        "verified_checksums": {},
        "technical_failures": [],
        "version_hash": "hash_version_12345",
        "document_count": 0,
    }

    with patch("agent.orchestrator.tool_get_application_state", new=AsyncMock(return_value=mock_app_state)), \
         patch("agent.orchestrator.tool_get_document_dossier", new=AsyncMock(return_value=mock_dossier)), \
         patch("agent.orchestrator.tool_run_qualitative_scrutiny", new=AsyncMock(return_value={"status": "SKIPPED", "findings": []})), \
         patch("agent.orchestrator.tool_submit_advisory_report", new=AsyncMock(return_value={"report_id": "rep-1", "version_hash": "h1"})), \
         patch("agent.orchestrator.tool_create_internal_notification", new=AsyncMock(return_value={"success": True})):

        resp = await orchestrator.handle_event(
            event_type=LifecycleEventType.APPLICATION_SUBMITTED.value,
            application_id=app_id,
            correlation_id=f"corr-sub-{app_id}",
        )

        assert resp["status"] == AgentState.WAITING_FOR_APPROVAL.value
        assert resp["result"]["deficiencies_flagged"] > 0
        assert len(resp["actions"]) > 0

        # Verify proposed action in waiting for approval
        proposed = next((a for a in resp["actions"] if a["action_type"] == "PROPOSE_DEFICIENCY_NOTICE"), None)
        assert proposed is not None
        assert proposed["requires_approval"] is True
        assert proposed["status"] == "WAITING_FOR_APPROVAL"


@pytest.mark.asyncio
async def test_orchestrator_action_approval_resumes_workflow():
    orchestrator = LifecycleAgentOrchestrator()
    exec_id = f"exec-{uuid.uuid4().hex[:6]}"
    app_id = f"app-{uuid.uuid4().hex[:6]}"

    # Setup pending action
    action = create_action(
        execution_id=exec_id,
        application_id=app_id,
        action_type="PROPOSE_DEFICIENCY_NOTICE",
        input_payload={"deficiencyText": "Provide valid Fire NOC"},
        requires_approval=True,
    )

    resp = await orchestrator.handle_event(
        event_type=LifecycleEventType.ACTION_APPROVED.value,
        application_id=app_id,
        payload={
            "action_id": action["action_id"],
            "approved_by": "DEMO-AIC-034",
            "approval_notes": "Official deficiency notice authorized.",
        },
        actor="DEMO-AIC-034",
    )

    assert resp["status"] == AgentState.COMPLETED.value
    assert resp["result"]["approved_action_executed"] == action["action_id"]

    # Verify action marked EXECUTED in database
    act_record = get_action(action["action_id"])
    assert act_record["status"] == "EXECUTED"
    assert act_record["approved_by"] == "DEMO-AIC-034"


@pytest.mark.asyncio
async def test_orchestrator_action_rejection():
    orchestrator = LifecycleAgentOrchestrator()
    exec_id = f"exec-{uuid.uuid4().hex[:6]}"
    app_id = f"app-{uuid.uuid4().hex[:6]}"

    action = create_action(
        execution_id=exec_id,
        application_id=app_id,
        action_type="PROPOSE_DEFICIENCY_NOTICE",
        requires_approval=True,
    )

    resp = await orchestrator.handle_event(
        event_type=LifecycleEventType.ACTION_REJECTED.value,
        application_id=app_id,
        payload={
            "action_id": action["action_id"],
            "rejected_by": "DEMO-AIC-034",
            "rejection_reason": "Officer verified exemption clause.",
        },
        actor="DEMO-AIC-034",
    )

    assert resp["status"] == AgentState.COMPLETED.value
    act_record = get_action(action["action_id"])
    assert act_record["status"] == "REJECTED"
    assert act_record["rejection_reason"] == "Officer verified exemption clause."


@pytest.mark.asyncio
async def test_orchestrator_resubmission_reconciliation():
    orchestrator = LifecycleAgentOrchestrator()
    app_id = f"app-resub-{uuid.uuid4().hex[:6]}"

    mock_app_state = {
        "id": app_id,
        "applicationNumber": "AICTE-2026-EOA-999",
        "applicationCategory": "Extension of Approval (EoA)",
        "status": "in_review",
        "raw": {
            "id": app_id,
            "applicationNumber": "AICTE-2026-EOA-999",
            "applicationCategory": "Extension of Approval (EoA)",
            "documents": [],
        },
    }

    mock_dossier = {
        "extracted_docs": {},
        "verified_checksums": {},
        "technical_failures": [],
        "version_hash": "hash_resub_v2",
        "document_count": 0,
    }

    mock_reconciled = {
        "has_prior_report": True,
        "resubmission_diff": [
            {
                "rule_id": "APH_FIRE_NOC",
                "rule_name": "Fire Safety NOC",
                "previous_status": "DEFICIENT",
                "current_status": "COMPLIANT",
                "classification": "RESOLVED",
                "note": "Resolved by resubmission",
            }
        ],
        "resolved_count": 1,
        "outstanding_count": 0,
        "review_count": 0,
    }

    with patch("agent.orchestrator.tool_get_application_state", new=AsyncMock(return_value=mock_app_state)), \
         patch("agent.orchestrator.tool_get_document_dossier", new=AsyncMock(return_value=mock_dossier)), \
         patch("agent.orchestrator.tool_reconcile_resubmission_findings", new=AsyncMock(return_value=mock_reconciled)), \
         patch("agent.orchestrator.tool_run_qualitative_scrutiny", new=AsyncMock(return_value={"status": "SKIPPED", "findings": []})), \
         patch("agent.orchestrator.tool_submit_advisory_report", new=AsyncMock(return_value={"report_id": "rep-2", "version_hash": "hash_resub_v2"})), \
         patch("agent.orchestrator.tool_create_internal_notification", new=AsyncMock(return_value={"success": True})):

        resp = await orchestrator.handle_event(
            event_type=LifecycleEventType.RESUBMISSION_RECEIVED.value,
            application_id=app_id,
            correlation_id=f"corr-resub-{app_id}",
        )

        assert resp["status"] in (AgentState.COMPLETED.value, AgentState.WAITING_FOR_APPROVAL.value)
        assert resp["result"]["resolved_count"] == 1
        assert resp["result"]["outstanding_count"] == 0


# =============================================================================
# 4. Agent FastAPI Endpoints Integration Tests
# =============================================================================

def test_api_agent_events_unauthenticated_rejected():
    from fastapi.testclient import TestClient
    from main import app
    client = TestClient(app)

    resp = client.post(
        "/api/v1/agent/events",
        json={"event_type": "APPLICATION_SUBMITTED", "application_id": "test-app-123"},
    )
    assert resp.status_code == 401


def test_api_agent_events_dispatch_and_query():
    from fastapi.testclient import TestClient
    from main import app
    from config import settings
    client = TestClient(app)
    auth_header = {"X-Service-Authorization": f"Bearer {settings.AI_BACKEND_SECRET}"}
    app_id = f"app-api-{uuid.uuid4().hex[:6]}"

    mock_app_state = {
        "id": app_id,
        "applicationNumber": "AICTE-2026-EOA-API",
        "applicationCategory": "Extension of Approval (EoA)",
        "status": "in_review",
        "raw": {"id": app_id, "applicationNumber": "AICTE-2026-EOA-API", "documents": []},
    }
    mock_dossier = {
        "extracted_docs": {},
        "verified_checksums": {},
        "technical_failures": [],
        "version_hash": "hash_api_1",
        "document_count": 0,
    }

    mock_pre_check = {
        "title": "AICTE Scrutiny Pre-Check",
        "category": "eoa",
        "category_label": "Extension of Approval (EoA)",
        "outcome": "DEFICIENCY_SUGGESTED",
        "summary": "Deficiency detected",
        "handbook_version": "APH 2024-2027",
        "unsupported_category": False,
        "findings": [{"rule_id": "APH_FIRE_NOC", "rule_name": "Fire Safety NOC", "status": "DEFICIENT"}],
        "findings_raw": [],
    }

    with patch("agent.orchestrator.tool_get_application_state", new=AsyncMock(return_value=mock_app_state)), \
         patch("agent.orchestrator.tool_get_document_dossier", new=AsyncMock(return_value=mock_dossier)), \
         patch("agent.orchestrator.tool_run_deterministic_scrutiny", return_value=mock_pre_check), \
         patch("agent.orchestrator.tool_run_qualitative_scrutiny", new=AsyncMock(return_value={"status": "SKIPPED", "findings": []})), \
         patch("agent.orchestrator.tool_submit_advisory_report", new=AsyncMock(return_value={"report_id": "rep-api", "version_hash": "hash_api_1"})), \
         patch("agent.orchestrator.tool_create_internal_notification", new=AsyncMock(return_value={"success": True})):

        resp = client.post(
            "/api/v1/agent/events",
            headers=auth_header,
            json={
                "event_type": "APPLICATION_SUBMITTED",
                "application_id": app_id,
                "correlation_id": f"api-corr-{app_id}",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["application_id"] == app_id
        assert data["execution_id"].startswith("exec-")
        exec_id = data["execution_id"]

        # Fetch execution status
        get_resp = client.get(
            f"/api/v1/agent/executions/{exec_id}",
            headers=auth_header,
        )
        assert get_resp.status_code == 200
        get_data = get_resp.json()
        assert get_data["execution_id"] == exec_id

        # Query actions for application
        actions_resp = client.get(
            f"/api/v1/agent/applications/{app_id}/actions",
            headers=auth_header,
        )
        assert actions_resp.status_code == 200
        actions = actions_resp.json()
        assert len(actions) > 0
        action_id = actions[0]["action_id"]

        # Test approve action endpoint
        approve_resp = client.post(
            f"/api/v1/agent/actions/{action_id}/approve",
            headers=auth_header,
            json={"action_id": action_id, "approved_by": "DEMO-AIC-034", "approval_notes": "Approved via API"},
        )
        assert approve_resp.status_code == 200
        assert approve_resp.json()["status"] == "COMPLETED"


def test_tool_propose_deficiency_notice_structure_and_recipient():
    """
    Verify tool_propose_deficiency_notice:
    - Associates rule ID, evidence, source document/page, and verified APH reference.
    - Generates a structured draft deficiency notice with itemized explanation and corrective action.
    - Selects intended institution and recipient from authoritative application records.
    - Persists draft_notice, intended_recipient_user_id, version_hash in SQLite action record.
    """
    exec_id = f"exec-{uuid.uuid4().hex[:8]}"
    app_id = f"app-{uuid.uuid4().hex[:8]}"

    deficiency_items = [
        {
            "rule_id": "APH_FIRE_NOC",
            "rule_name": "Fire Safety NOC / Certificate",
            "status": "DEFICIENT",
            "aph_clause": "APH 2024-27 Clause 2.3.1",
            "aph_chapter": "Chapter II",
            "document_name": "Fire_NOC.pdf",
            "page_number": 1,
            "evidence": "Fire safety certificate expired on 2023-12-31.",
            "recommendation": "Submit a renewed Fire Safety Certificate from competent local authority.",
        },
        {
            "rule_id": "APH_BUILDING_OCCUPANCY",
            "rule_name": "Building Occupancy / Completion Certificate",
            "status": "DEFICIENT",
            "aph_clause": "APH 2024-27 Clause 2.3.2",
            "aph_chapter": "Chapter II",
            "document_name": "Building_Occupancy.pdf",
            "page_number": 3,
            "evidence": "Incomplete occupancy certificate without municipal seal.",
            "recommendation": "Submit building completion certificate authenticated by municipal commissioner.",
        },
    ]

    mock_app_state = {
        "id": app_id,
        "applicationNumber": "AICTE-2026-EOA-9999",
        "institutionId": "inst-auth-456",
        "institutionName": "National Institute of Technology Example",
        "assignedUserId": "DEMO-AIC-034",
        "createdById": "user-inst-admin",
        "raw": {
            "id": app_id,
            "applicationNumber": "AICTE-2026-EOA-9999",
            "institutionId": "inst-auth-456",
            "createdById": "user-inst-admin",
            "institution": {"institutionName": "National Institute of Technology Example"},
        },
    }

    res = tool_propose_deficiency_notice(
        execution_id=exec_id,
        application_id=app_id,
        deficiency_items=deficiency_items,
        rationale="Agent detected 2 statutory deficiencies in EoA submission.",
        app_state=mock_app_state,
        version_hash="hash_authoritative_v1",
    )

    assert res["status"] == "WAITING_FOR_APPROVAL"
    assert res["requires_approval"] is True
    assert res["deficiency_count"] == 2
    assert res["institution_id"] == "inst-auth-456"
    assert res["intended_recipient_user_id"] == "user-inst-admin"
    assert res["version_hash"] == "hash_authoritative_v1"

    # Verify structured draft notice
    draft = res["draft_notice"]
    assert draft["title"] == "Statutory Deficiency Notice: AICTE-2026-EOA-9999"
    assert draft["recipient_institution"] == "National Institute of Technology Example"
    assert draft["suggested_due_days"] == 10
    assert len(draft["items"]) == 2

    item0 = draft["items"][0]
    assert item0["rule_id"] == "APH_FIRE_NOC"
    assert item0["aph_clause"] == "APH 2024-27 Clause 2.3.1"
    assert item0["source_document"] == "Fire_NOC.pdf"
    assert item0["source_page"] == 1
    assert "expired on 2023-12-31" in item0["evidence"]
    assert "renewed Fire Safety Certificate" in item0["corrective_action"]

    # Verify durable database record in SQLite
    action_rec = get_action(res["action_id"])
    assert action_rec is not None
    assert action_rec["status"] == "WAITING_FOR_APPROVAL"
    assert action_rec["requires_approval"] == 1
    payload = action_rec["input_payload"]
    assert payload["institution_id"] == "inst-auth-456"
    assert payload["intended_recipient_user_id"] == "user-inst-admin"
    assert payload["version_hash"] == "hash_authoritative_v1"
    assert len(payload["draft_notice"]["items"]) == 2


