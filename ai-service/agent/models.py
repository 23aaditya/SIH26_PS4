"""
Pydantic schemas and enums for the AICTE Application Lifecycle Agent.
Defines lifecycle events, agent execution states, action types, and request/response payloads.
"""

from enum import Enum
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field


class LifecycleEventType(str, Enum):
    APPLICATION_SUBMITTED = "APPLICATION_SUBMITTED"
    DOCUMENTS_UPDATED = "DOCUMENTS_UPDATED"
    APPLICATION_RETURNED = "APPLICATION_RETURNED"
    DEFICIENCY_RAISED = "DEFICIENCY_RAISED"
    RESUBMISSION_RECEIVED = "RESUBMISSION_RECEIVED"
    SCRUTINY_COMPLETED = "SCRUTINY_COMPLETED"
    DEADLINE_APPROACHING = "DEADLINE_APPROACHING"
    ACTION_APPROVED = "ACTION_APPROVED"
    ACTION_REJECTED = "ACTION_REJECTED"


class AgentState(str, Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    WAITING_FOR_APPROVAL = "WAITING_FOR_APPROVAL"
    COMPLETED = "COMPLETED"
    PARTIAL_FAILURE = "PARTIAL_FAILURE"
    FAILED = "FAILED"


class ActionType(str, Enum):
    # Routine / Permitted actions (Autonomous)
    FETCH_APPLICATION_STATE = "FETCH_APPLICATION_STATE"
    FETCH_DOSSIER = "FETCH_DOSSIER"
    RUN_DETERMINISTIC_SCRUTINY = "RUN_DETERMINISTIC_SCRUTINY"
    RUN_QUALITATIVE_SCRUTINY = "RUN_QUALITATIVE_SCRUTINY"
    RECONCILE_FINDINGS = "RECONCILE_FINDINGS"
    SUBMIT_ADVISORY_REPORT = "SUBMIT_ADVISORY_REPORT"
    SEND_INTERNAL_NOTIFICATION = "SEND_INTERNAL_NOTIFICATION"

    # Reserved actions (Strictly require Human Approval)
    PROPOSE_DEFICIENCY_NOTICE = "PROPOSE_DEFICIENCY_NOTICE"
    PROPOSE_FORWARD_TO_NEXT_STAGE = "PROPOSE_FORWARD_TO_NEXT_STAGE"
    REQUEST_HUMAN_REVIEW = "REQUEST_HUMAN_REVIEW"
    DRAFT_OFFICIAL_COMMUNICATION = "DRAFT_OFFICIAL_COMMUNICATION"
    REQUEST_SITE_INSPECTION = "REQUEST_SITE_INSPECTION"
    PROPOSE_STAGE_TRANSITION = "PROPOSE_STAGE_TRANSITION"


class ActionStatus(str, Enum):
    PLANNED = "PLANNED"
    EXECUTING = "EXECUTING"
    WAITING_FOR_APPROVAL = "WAITING_FOR_APPROVAL"
    APPROVED = "APPROVED"
    EXECUTED = "EXECUTED"
    REJECTED = "REJECTED"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


class AgentEventRequest(BaseModel):
    event_type: str = Field(..., description="Lifecycle event type")
    application_id: str = Field(..., description="Application CUID or number")
    payload: Dict[str, Any] = Field(default_factory=dict, description="Event contextual payload")
    actor: Optional[str] = Field(default=None, description="Initiating user ID or service name")
    correlation_id: Optional[str] = Field(default=None, description="Idempotency key for event deduplication")


class ActionApprovalRequest(BaseModel):
    action_id: str = Field(..., description="Agent action identifier")
    approved_by: str = Field(..., description="Staff/Officer ID of the approving human")
    approval_notes: Optional[str] = Field(default=None, description="Human officer remarks or conditions")
    official_notice_id: Optional[str] = Field(default=None, description="Official deficiency request ID")
    deficiency_cycle: Optional[int] = Field(default=None, description="Deficiency cycle number")


class ActionRejectionRequest(BaseModel):
    action_id: str = Field(..., description="Agent action identifier")
    rejected_by: str = Field(..., description="Staff/Officer ID of the rejecting human")
    rejection_reason: str = Field(..., description="Mandatory reason for rejection")


class AgentActionResponse(BaseModel):
    action_id: str
    execution_id: str
    application_id: str
    action_type: str
    status: str
    requires_approval: bool
    rationale: Optional[str] = None
    input_payload: Dict[str, Any] = Field(default_factory=dict)
    output_payload: Optional[Dict[str, Any]] = None
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    rejection_reason: Optional[str] = None
    error_message: Optional[str] = None
    created_at: str
    updated_at: str


class AgentExecutionResponse(BaseModel):
    execution_id: str
    application_id: str
    event_type: str
    correlation_id: Optional[str] = None
    status: str
    current_step: Optional[str] = None
    actions: List[AgentActionResponse] = Field(default_factory=list)
    result: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    created_at: str
    updated_at: str
    completed_at: Optional[str] = None
