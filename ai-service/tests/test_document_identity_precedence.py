"""
Regression test suite for requirement-aware document identity assessment
and classification precedence (Case 1 through Case 4).

Tests:
1. Fire Safety field + explicit NBA Accreditation Certificate identifier -> POSSIBLE_MISMATCH.
2. Fire Safety field + identifiable Fire Safety Certificate + insufficient substantive text -> INSUFFICIENT_DOCUMENT_INFORMATION.
3. Fire Safety field + generic header without identifiable document type -> MANUAL_REVIEW_REQUIRED.
4. Fire Safety field + unrelated filename but matching actual extracted document content -> LIKELY_MATCH (no filename bias).
5. Fire Safety field + clearly relevant Fire Safety Certificate -> LIKELY_MATCH.
6. Affidavit 2 field + student-level programming problem sheet -> POSSIBLE_MISMATCH.
"""

import pytest
import json
from config import settings
from llm.client import groq_client
from llm.scheduler import groq_scheduler
from llm.prompts import (
    PREVALIDATION_SYSTEM_PROMPT,
    build_document_prevalidation_prompt,
)


FIRE_SAFETY_REQ = {
    "name": "Fire Safety Certificate / NOC",
    "description": (
        "Valid Fire Safety Certificate or No Objection Certificate (NOC) issued by the competent "
        "Fire and Emergency Services Department or Municipal Fire Brigade certifying compliance "
        "with National Building Code fire safety norms."
    ),
    "clause": "Chapter II: APH 2024-2027 Norms",
    "category": "increase_intake",
}

AFFIDAVIT_2_REQ = {
    "name": "Affidavit 2 on Non-Judicial Stamp Paper",
    "description": (
        "Affidavit 2 submitted by the Chairman / Secretary of the Trust or Society on Rs. 100/- "
        "Non-Judicial Stamp Paper, duly notarized, affirming statutory infrastructure and faculty compliance."
    ),
    "clause": "Chapter II: APH 2024-2027 Norms",
    "category": "increase_intake",
}


async def _run_llm_prevalidation(req: dict, doc_text: str, filename: str) -> dict:
    prompt = build_document_prevalidation_prompt(
        document_name=req["name"],
        requirement_description=req["description"],
        aph_clause=req["clause"],
        application_category=req["category"],
        document_text=doc_text,
        filename=filename,
    )
    groq_scheduler.reset_cooldown()
    await groq_scheduler.acquire_slot(application_id="test-identity-app", batch_index=1, priority="normal")
    res = await groq_client.generate_chat_completion(
        system_prompt=PREVALIDATION_SYSTEM_PROMPT,
        user_prompt=prompt,
        application_id="test-identity-app",
        batch_index=1,
    )
    assert res.get("status") == "SUCCESS", f"Groq call failed: {res.get('error_message')}"
    raw = res.get("raw_content") or "{}"
    return json.loads(raw)


@pytest.mark.asyncio
async def test_case_1_fire_safety_with_explicit_nba_identifier():
    """Fire Safety field + explicit NBA identifier -> POSSIBLE_MISMATCH (precedence over insufficient info)."""
    text = (
        "Type: NBA Accreditation Certificate\n"
        "National Board of Accreditation, New Delhi.\n"
        "Accreditation status evaluation for Computer Engineering program."
    )
    result = await _run_llm_prevalidation(FIRE_SAFETY_REQ, text, filename="document_upload.pdf")
    
    assert result.get("classification_result") == "POSSIBLE_MISMATCH", (
        f"Expected POSSIBLE_MISMATCH for explicit NBA document in Fire Safety field, got: {result.get('classification_result')}"
    )
    assert result.get("recommended_action") == "CHECK_AND_REPLACE"
    advisory = result.get("advisory_message", "").lower()
    assert "nba" in advisory or "accreditation" in advisory, "Advisory must identify uploaded file as NBA/accreditation"
    assert "fire" in advisory, "Advisory must identify required field as Fire Safety"


@pytest.mark.asyncio
async def test_case_2_fire_safety_identifiable_insufficient_content():
    """Fire Safety field + identifiable Fire Safety Certificate + insufficient substantive text -> INSUFFICIENT_DOCUMENT_INFORMATION."""
    text = (
        "Type: Fire Safety Certificate / NOC\n"
        "Issued by Municipal Fire Brigade."
    )
    result = await _run_llm_prevalidation(FIRE_SAFETY_REQ, text, filename="document_upload.pdf")
    
    assert result.get("classification_result") == "INSUFFICIENT_DOCUMENT_INFORMATION", (
        f"Expected INSUFFICIENT_DOCUMENT_INFORMATION, got: {result.get('classification_result')}"
    )
    assert result.get("recommended_action") in ("NONE", "CHECK_AND_REPLACE")


@pytest.mark.asyncio
async def test_case_3_fire_safety_generic_header_unidentifiable():
    """Fire Safety field + generic administrative header without identifiable document type -> MANUAL_REVIEW_REQUIRED."""
    text = (
        "Government of Maharashtra\n"
        "General Administration Department\n"
        "Reference No: GAD/2026/SEC-4/Doc-0912\n"
        "Date: 12 January 2026\n"
        "Circular regarding annual filing procedure."
    )
    result = await _run_llm_prevalidation(FIRE_SAFETY_REQ, text, filename="document_upload.pdf")
    
    assert result.get("classification_result") == "MANUAL_REVIEW_REQUIRED", (
        f"Expected MANUAL_REVIEW_REQUIRED for unidentifiable generic header, got: {result.get('classification_result')}"
    )


@pytest.mark.asyncio
async def test_case_4_fire_safety_unrelated_filename_matching_content():
    """Fire Safety field + unrelated filename ('nba_cert.pdf') but matching content -> LIKELY_MATCH (no filename bias)."""
    text = (
        "FIRE & EMERGENCY SERVICES DEPARTMENT\n"
        "FIRE SAFETY CLEARANCE / NOC\n"
        "This is to certify that Pune Institute of Computer Technology, Survey No 27, Pune "
        "has complied with all fire prevention and life safety measures as per National Building Code (NBC) norms "
        "for the institutional academic building. Valid up to 31-03-2027.\n"
        "Chief Fire Officer."
    )
    result = await _run_llm_prevalidation(FIRE_SAFETY_REQ, text, filename="nba_accreditation_certificate_2026.pdf")
    
    assert result.get("classification_result") == "LIKELY_MATCH", (
        f"Expected LIKELY_MATCH despite unrelated filename, got: {result.get('classification_result')}"
    )
    assert result.get("recommended_action") == "CONTINUE_UPLOADS"


@pytest.mark.asyncio
async def test_case_5_fire_safety_clearly_relevant():
    """Fire Safety field + clearly relevant Fire Safety Certificate -> preserve LIKELY_MATCH."""
    text = (
        "MUNICIPAL FIRE BRIGADE & DISASTER MANAGEMENT AUTHORITY\n"
        "FIRE SAFETY CERTIFICATE / NOC\n"
        "Ref: MFB/NOC/2026/884\n"
        "Certified that the academic building complex of the applicant institution is equipped with operational "
        "fire hydrants, smoke alarms, and emergency exits in full compliance with National Building Code Part 4. "
        "Valid for Academic Year 2026-2027.\n"
        "Chief Fire Officer."
    )
    result = await _run_llm_prevalidation(FIRE_SAFETY_REQ, text, filename="fire_safety_noc_signed.pdf")
    
    assert result.get("classification_result") == "LIKELY_MATCH", (
        f"Expected LIKELY_MATCH, got: {result.get('classification_result')}"
    )
    assert result.get("recommended_action") == "CONTINUE_UPLOADS"


@pytest.mark.asyncio
async def test_case_6_affidavit_2_with_programming_problem_sheet():
    """Affidavit 2 field + student-level programming problem sheet -> preserve existing POSSIBLE_MISMATCH behaviour."""
    text = (
        "LEETCODE 42: TRAPPING RAIN WATER (HARD)\n\n"
        "Given n non-negative integers representing an elevation map where the width of each bar is 1, "
        "compute how much water it can trap after raining.\n\n"
        "def trap(height):\n"
        "    left, right = 0, len(height) - 1\n"
        "    water = 0\n"
        "    return water\n"
    )
    result = await _run_llm_prevalidation(AFFIDAVIT_2_REQ, text, filename="affidavit_stamp_paper.pdf")
    
    assert result.get("classification_result") == "POSSIBLE_MISMATCH", (
        f"Expected POSSIBLE_MISMATCH for LeetCode document in Affidavit 2 field, got: {result.get('classification_result')}"
    )
    assert result.get("recommended_action") == "CHECK_AND_REPLACE"
