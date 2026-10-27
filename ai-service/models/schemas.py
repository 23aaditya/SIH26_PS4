from typing import List, Optional, Literal
from pydantic import BaseModel, Field

class RuleFinding(BaseModel):
    rule_id: str
    rule_name: str
    status: Literal["COMPLIANT", "DEFICIENT", "NEEDS_HUMAN_REVIEW"]
    aph_clause: str
    evidence: str
    page_number: Optional[int] = None
    document_id: Optional[str] = None
    document_name: Optional[str] = None
    recommendation: str
    notes: Optional[str] = None

class PreCheckResult(BaseModel):
    application_id: str
    application_number: str
    outcome: Literal["RECOMMEND_ACCEPT", "DEFICIENCY_SUGGESTED", "NEEDS_HUMAN_REVIEW"]
    title: str
    summary: str
    findings: List[RuleFinding]
    handbook_version: str = "APH 2024-2027"

class TriggerJobRequest(BaseModel):
    application_id: str
    application_number: Optional[str] = None
    force_rerun: bool = False
    retry_llm: bool = False
    is_resubmission: bool = False

class JobStatusResponse(BaseModel):
    job_id: str
    application_id: str
    application_number: Optional[str] = None
    status: Literal["PENDING", "PROCESSING", "COMPLETED", "FAILED"]
    report_id: Optional[str] = None
    outcome: Optional[str] = None
    findings_count: int = 0
    created_at: str
    completed_at: Optional[str] = None
    error_message: Optional[str] = None

class LLMFinding(BaseModel):
    finding_type: str = Field(
        ...,
        description="Type of finding: CONTEXTUAL_INCONSISTENCY, MISSING_SUPPORTING_EVIDENCE, AMBIGUOUS_STATEMENT, QUALITATIVE_OBSERVATION, etc."
    )
    explanation: str = Field(
        ...,
        description="Detailed qualitative explanation of why this observation was flagged."
    )
    severity_suggestion: Literal["ADVISORY_LOW", "ADVISORY_MEDIUM", "ADVISORY_HIGH"] = Field(
        "ADVISORY_LOW",
        description="Suggested severity rating for human scrutiny officer consideration."
    )
    evidence_excerpt: str = Field(
        ...,
        description="Verbatim or close excerpt from the submitted document establishing the finding."
    )
    document_id: Optional[str] = Field(
        None,
        description="Unique identifier of the document where evidence was found."
    )
    document_name: Optional[str] = Field(
        None,
        description="Filename or title of the document."
    )
    page_number: Optional[int] = Field(
        None,
        description="1-indexed page number if source document page is known."
    )
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Model confidence score between 0.0 and 1.0."
    )
    human_review_recommendation: str = Field(
        ...,
        description="Specific recommended verification action for the human Scrutiny Officer."
    )
    facts_vs_inference: Optional[str] = Field(
        None,
        description="Explicit breakdown distinguishing verifiable facts from inferred interpretation."
    )
    significance: Optional[str] = Field(
        None,
        description="Explanation of why this evidence matters under AICTE regulatory norms."
    )
    excerpt_verified: bool = Field(
        True,
        description="Whether the quoted evidence excerpt was verified to exist in the extracted text."
    )
    is_llm_generated: bool = Field(
        True,
        description="Explicit flag distinguishing LLM-generated observation from deterministic rule finding."
    )

class LLMAnalysisResult(BaseModel):
    status: Literal["SUCCESS", "DISABLED", "SKIPPED", "TECHNICAL_FAILURE", "PARTIAL_ANALYSIS"] = "SUCCESS"
    model_used: Optional[str] = None
    findings: List[LLMFinding] = []
    summary: Optional[str] = None
    error_message: Optional[str] = None

