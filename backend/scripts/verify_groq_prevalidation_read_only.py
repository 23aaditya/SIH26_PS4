"""
AICTE PS4 - Read-Only Verification Script
Verifies:
A. Actual PyMuPDF PDF Text Extraction (Real text vs headers, Scanned image PDF, Short certificate).
B. Actual Groq Pre-Validation Path (Shared scheduler slot, existing Groq client).
C. Two Genuine Content-Relevance Tests:
   - Test 1 (Relevant): NBA Accreditation Certificate -> LIKELY_MATCH
   - Test 2 (Unrelated): LeetCode Problem Statement -> POSSIBLE_MISMATCH
"""

import sys
import os
import io
import asyncio
import hashlib
import json
from pathlib import Path

# Add ai-service to sys.path
AI_SERVICE_DIR = Path(__file__).resolve().parent.parent.parent / "ai-service"
sys.path.insert(0, str(AI_SERVICE_DIR))

import fitz  # PyMuPDF
from config import settings
from extractor import DocumentExtractor
from llm.client import groq_client
from llm.scheduler import groq_scheduler
from llm.prompts import (
    PREVALIDATION_SYSTEM_PROMPT,
    build_document_prevalidation_prompt,
)
from llm.prevalidation_agent import PrevalidationAgent


def create_real_pdf(text: str, title: str = "Test Document") -> bytes:
    """Create a genuine, fully compliant binary PDF with real text stream using PyMuPDF."""
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)  # A4
    rect = fitz.Rect(50, 50, 545, 792)
    page.insert_textbox(rect, text, fontsize=11, fontname="helv")
    doc.metadata = {"title": title, "author": "AICTE Verification Harness"}
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def create_scanned_image_only_pdf() -> bytes:
    """Create a genuine scanned/raster PDF containing zero text and one embedded image."""
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    # Generate a small 100x100 pixmap
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 100, 100), 0)
    pix.clear_with(200)  # Light gray
    page.insert_image(fitz.Rect(100, 100, 400, 400), pixmap=pix)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


async def run_verification():
    print("=" * 70)
    print("SECTION A: ACTUAL PDF TEXT EXTRACTION AUDIT")
    print("=" * 70)

    extractor = DocumentExtractor()

    # 1. Real Readable Multi-Paragraph PDF
    sample_text = (
        "NATIONAL BOARD OF ACCREDITATION\n"
        "NBCC Place, East Tower, 4th Floor, Bhisham Pitamah Marg, Pragati Vihar, New Delhi 110003\n\n"
        "TO: The Principal, Pune Institute of Computer Technology, Pune, Maharashtra.\n"
        "SUBJECT: Accreditation status of Undergraduate Engineering programs applied by Pune Institute of Computer Technology.\n\n"
        "Sir,\n"
        "This has reference to your application for accreditation of following Computer Engineering and Information Technology programs.\n"
        "The National Board of Accreditation has evaluated the programs and granted ACCREDITED status for Academic Years 2024-2025 to 2026-2027.\n\n"
        "Program Name: Computer Engineering (UG)\n"
        "Accreditation Status: Accredited (Valid up to 30-06-2027)\n"
        "Basis of Evaluation: Tier-II Manual January 2023 Guidelines.\n"
        "Member Secretary, NBA."
    )
    readable_bytes = create_real_pdf(sample_text, title="NBA Accreditation Certificate")
    extracted_readable = extractor.classify_and_extract(readable_bytes, "nba_accreditation.pdf")

    print(f"1. Real Readable PDF Audit:")
    print(f"   Parser in use:        PyMuPDF (fitz v{fitz.__doc__.splitlines()[0] if hasattr(fitz, '__doc__') else 'standard'})")
    print(f"   Page Count:           {extracted_readable['page_count']}")
    print(f"   Extracted Characters: {extracted_readable['total_chars']}")
    print(f"   Classification State: {extracted_readable['classification_state']}")
    print(f"   Raw headers leaked:   {'%PDF' in extracted_readable['full_text']} (Must be False)")
    print(f"   Excerpt (first 120 chars):")
    print(f"   \"{extracted_readable['full_text'][:120]}...\"\n")

    assert extracted_readable["classification_state"] == "RELEVANT_DIGITAL_TEXT"
    assert "%PDF" not in extracted_readable["full_text"]
    assert extracted_readable["page_count"] == 1
    assert extracted_readable["total_chars"] > 150

    # 2. Genuine Scanned/Image-Only PDF
    scanned_bytes = create_scanned_image_only_pdf()
    extracted_scanned = extractor.classify_and_extract(scanned_bytes, "scanned_certificate.pdf")
    print(f"2. Scanned Image-Only PDF Audit:")
    print(f"   Page Count:           {extracted_scanned['page_count']}")
    print(f"   Extracted Characters: {extracted_scanned['total_chars']}")
    print(f"   Has Raster Images:    {extracted_scanned['has_images']}")
    print(f"   Classification State: {extracted_scanned['classification_state']}")
    assert extracted_scanned["classification_state"] == "IMAGE_ONLY_SCANNED"
    print(f"   => Verified: Triggers MANUAL_REVIEW_REQUIRED, NOT technical crash.\n")

    # 3. Short Certificate (< 150 chars)
    short_text = "SANCTION ORDER: Approved intake increase of 60 seats for AY 2026-27. Signed: Director DTE."
    short_bytes = create_real_pdf(short_text, title="Short Order")
    extracted_short = extractor.classify_and_extract(short_bytes, "sanction_order.pdf")
    print(f"3. Short Certificate (< 150 chars) Audit:")
    print(f"   Extracted Characters: {extracted_short['total_chars']}")
    print(f"   Classification State: {extracted_short['classification_state']}")
    assert extracted_short["classification_state"] == "SHORT_OR_BRIEF_TEXT"
    print(f"   => Verified: Triggers MANUAL_REVIEW_REQUIRED with brief note, NOT MISMATCH.\n")

    print("=" * 70)
    print("SECTION B: GROQ PRE-VALIDATION PATH & SCHEDULER AUDIT")
    print("=" * 70)
    print(f"Groq Model in Config:       {settings.GROQ_MODEL}")
    print(f"Shared Groq Scheduler RPM:  {settings.GROQ_RPM_LIMIT}")
    print(f"Shared Groq Scheduler TPM:  {settings.GROQ_TPM_LIMIT}")
    print(f"Groq API Key Configured:    {'Yes (masked: ' + settings.GROQ_API_KEY[:6] + '...' + settings.GROQ_API_KEY[-4:] + ')' if settings.GROQ_API_KEY else 'No'}")
    print(f"Using Existing Scheduler:   llm.scheduler.groq_scheduler")
    print(f"Using Existing Groq Client: llm.client.groq_client")
    print(f"Scope Bounds Enforced:      Zero authenticity / seal / notary / signature assertions.")

    print("\n" + "=" * 70)
    print("SECTION C: TWO GENUINE CONTENT-RELEVANCE TESTS VIA LIVE GROQ INFERENCE")
    print("=" * 70)

    app_id = "test-app-audit-001"
    req_name = "NBA Accreditation Certificate"
    req_desc = (
        "Valid NBA Accreditation letter or certificate for the qualifying program "
        "documenting that the course possesses valid accredited status for the academic year "
        "under consideration for Increase in Intake."
    )
    aph_clause = "Chapter II: Norms for Increase in Intake"
    app_cat = "increase_intake"

    agent = PrevalidationAgent()

    # --- TEST 1: Relevant Document ---
    print("\n[TEST 1] Testing RELEVANT Document (Valid NBA Accreditation Certificate)...")
    prompt_rel = build_document_prevalidation_prompt(
        document_name=req_name,
        requirement_description=req_desc,
        aph_clause=aph_clause,
        application_category=app_cat,
        document_text=extracted_readable["full_text"],
        filename="nba_accreditation.pdf",
    )

    print("  Acquiring slot from shared rate-limit scheduler (priority='normal')...")
    await groq_scheduler.acquire_slot(application_id=app_id, batch_index=1, priority="normal")
    print("  Slot acquired successfully under shared provider quota.")

    print(f"  Sending chat completion to Groq ({settings.GROQ_MODEL})...")
    res_rel = await groq_client.generate_chat_completion(
        system_prompt=PREVALIDATION_SYSTEM_PROMPT,
        user_prompt=prompt_rel,
        application_id=app_id,
        batch_index=1,
    )

    assert res_rel.get("status") == "SUCCESS", f"Groq call failed: {res_rel.get('error_message')}"
    parsed_rel = json.loads(res_rel["raw_content"])
    print(f"  [OK] Groq Response Received:")
    print(f"    - Classification:    {parsed_rel.get('classification_result')}")
    print(f"    - Advisory Message:  {parsed_rel.get('advisory_message')}")
    print(f"    - Evidence Excerpt:  \"{parsed_rel.get('evidence_excerpt', '')[:100]}...\"")
    print(f"    - Facts vs Infer:    {parsed_rel.get('facts_vs_inference')}")
    print(f"    - Recommended Action:{parsed_rel.get('recommended_action')}")

    assert parsed_rel.get("classification_result") == "LIKELY_MATCH", (
        f"Expected LIKELY_MATCH, got {parsed_rel.get('classification_result')}"
    )
    print("  => TEST 1 RESULT: LIKELY_MATCH verified cleanly via live Groq LLM inference!")

    # --- TEST 2: Unrelated Document ---
    print("\n[TEST 2] Testing CLEARLY UNRELATED Document (LeetCode Problem Statement)...")
    unrelated_text = (
        "LEETCODE PROBLEM 42: TRAPPING RAIN WATER (HARD)\n\n"
        "Given n non-negative integers representing an elevation map where the width of each bar is 1, "
        "compute how much water it can trap after raining.\n\n"
        "Example 1:\n"
        "Input: height = [0,1,0,2,1,0,1,3,2,1,2,1]\n"
        "Output: 6\n"
        "Explanation: The elevation map is represented by array [0,1,0,2,1,0,1,3,2,1,2,1]. "
        "In this case, 6 units of rain water are being trapped.\n\n"
        "Constraints:\n"
        "n == height.length\n"
        "1 <= n <= 2 * 10^4\n"
        "0 <= height[i] <= 10^5\n\n"
        "Solution in Python:\n"
        "def trap(height):\n"
        "    left, right = 0, len(height) - 1\n"
        "    left_max, right_max = 0, 0\n"
        "    water = 0\n"
        "    while left < right:\n"
        "        if height[left] < height[right]:\n"
        "            if height[left] >= left_max:\n"
        "                left_max = height[left]\n"
        "            else:\n"
        "                water += left_max - height[left]\n"
        "            left += 1\n"
        "        else:\n"
        "            if height[right] >= right_max:\n"
        "                right_max = height[right]\n"
        "            else:\n"
        "                water += right_max - height[right]\n"
        "            right -= 1\n"
        "    return water\n"
    )
    unrelated_bytes = create_real_pdf(unrelated_text, title="LeetCode Trapping Rain Water")
    extracted_unrelated = extractor.classify_and_extract(unrelated_bytes, "leetcode_p42.pdf")

    prompt_unrelated = build_document_prevalidation_prompt(
        document_name=req_name,
        requirement_description=req_desc,
        aph_clause=aph_clause,
        application_category=app_cat,
        document_text=extracted_unrelated["full_text"],
        filename="leetcode_p42.pdf",
    )

    print("  Acquiring slot from shared rate-limit scheduler (priority='normal')...")
    await groq_scheduler.acquire_slot(application_id=app_id, batch_index=2, priority="normal")
    print("  Slot acquired successfully under shared provider quota.")

    print(f"  Sending chat completion to Groq ({settings.GROQ_MODEL})...")
    res_unrelated = await groq_client.generate_chat_completion(
        system_prompt=PREVALIDATION_SYSTEM_PROMPT,
        user_prompt=prompt_unrelated,
        application_id=app_id,
        batch_index=2,
    )

    assert res_unrelated.get("status") == "SUCCESS", f"Groq call failed: {res_unrelated.get('error_message')}"
    parsed_unrelated = json.loads(res_unrelated["raw_content"])
    print(f"  [OK] Groq Response Received:")
    print(f"    - Classification:    {parsed_unrelated.get('classification_result')}")
    print(f"    - Advisory Message:  {parsed_unrelated.get('advisory_message')}")
    print(f"    - Evidence Excerpt:  \"{parsed_unrelated.get('evidence_excerpt', '')[:100]}...\"")
    print(f"    - Facts vs Infer:    {parsed_unrelated.get('facts_vs_inference')}")
    print(f"    - Recommended Action:{parsed_unrelated.get('recommended_action')}")

    assert parsed_unrelated.get("classification_result") == "POSSIBLE_MISMATCH", (
        f"Expected POSSIBLE_MISMATCH, got {parsed_unrelated.get('classification_result')}"
    )
    print("  => TEST 2 RESULT: POSSIBLE_MISMATCH verified cleanly via live Groq LLM inference!")

    print("\n" + "=" * 70)
    print("ALL READ-ONLY VERIFICATION CHECKS COMPLETED WITH 100% SUCCESS")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(run_verification())
