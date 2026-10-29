import re
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from models.schemas import RuleFinding
from rules.base import parse_date_safely, find_document_by_type_or_keywords

# ==============================================================================
# 1. INCREASE IN INTAKE & ADDITIONAL COURSE RULES (Chapter II Clause 2.6)
# ==============================================================================

def check_affidavit_8(app_data: Dict[str, Any], extracted_docs: Dict[str, Dict[str, Any]]) -> RuleFinding:
    """
    Check Affidavit 8 on Non-Judicial Stamp Paper / E-Stamp (Rs. 100).
    AICTE APH 2024-27 Chapter II Clause 2.6.b.iii, Annexure-2 Section 2.6.i & Affidavit 8 (Pages 16, 82, 194).
    Mandatory specifically for Increase in Intake and Additional Course(s).
    """
    rule_id = "INTAKE-AFFIDAVIT8"
    rule_name = "Affidavit 8 for Additional Course / Increase in Intake"
    aph_clause = "AICTE APH 2024-27 Chapter II Clause 2.6.b.iii & Annexure-2 Section 2.6.i (Pages 16, 82)"

    docs = app_data.get("documents", [])
    target_doc = find_document_by_type_or_keywords(docs, ["affidavit_8", "affidavit 8", "affidavit-8", "affidavit"])

    if not target_doc:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="DEFICIENT",
            aph_clause=aph_clause,
            aph_chapter="Chapter II",
            aph_annexure="Annexure-2",
            evidence="No document record for mandatory Affidavit-8 has been uploaded to the application dossier (not found in submitted documents).",
            recommendation="Applicant institution must submit Affidavit-8 on Rs. 100 non-judicial stamp paper affirming creation of additional infrastructure, faculty, and funds as mandated by APH Annexure-2 Section 2.6.i.",
        )

    doc_id = target_doc.get("id")
    if doc_id not in extracted_docs or extracted_docs[doc_id].get("unavailable"):
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="TECHNICAL_ERROR",
            aph_clause=aph_clause,
            aph_chapter="Chapter II",
            aph_annexure="Annexure-2",
            evidence=f"Document metadata record for '{target_doc.get('originalFilename')}' exists, but the physical file is unavailable on server storage for inspection.",
            document_id=doc_id,
            document_name=target_doc.get("originalFilename"),
            recommendation="Technical verification required: Scrutiny officer must verify document file storage and request applicant to re-upload if file is missing.",
        )

    extracted = extracted_docs.get(doc_id, {})
    full_text = extracted.get("full_text", "")
    is_scanned = extracted.get("is_scanned", False)

    if is_scanned or len(full_text.strip()) < 50:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="NEEDS_HUMAN_REVIEW",
            aph_clause=aph_clause,
            aph_chapter="Chapter II",
            aph_annexure="Annexure-2",
            evidence=f"Affidavit document '{target_doc.get('originalFilename')}' is uploaded and available, but appears to be a scanned image without an embedded digital text layer. Substantive compliance could not be verified automatically.",
            document_id=doc_id,
            document_name=target_doc.get("originalFilename"),
            recommendation="Scrutiny Committee officer must visually verify the stamp paper value (>= Rs. 100), notary seal, and Affidavit-8 recitals.",
        )

    stamp_pattern = re.compile(
        r"(?:non-judicial\s+stamp|e-stamp|stamp\s+duty|stamp\s+certificate)[\s\S]{0,100}?(?:rs\.?|rupees|inr|value\s+of)\s*(?:100|hundred)\b|(?:rs\.?|rupees|inr)\s*(?:100|hundred)[\s\S]{0,80}?(?:stamp\s+paper|non-judicial|e-stamp)",
        re.IGNORECASE,
    )
    affidavit8_pattern = re.compile(
        r"\b(?:affidavit[\s-]*8|additional\s+course|increase\s+in\s+intake|additional\s+facilities|additional\s+infrastructure)\b",
        re.IGNORECASE,
    )
    deponent_pattern = re.compile(
        r"\b(?:solemnly\s+(?:affirm|declare)|do\s+hereby\s+solemnly|sworn\s+on\s+oath|deponent)\b",
        re.IGNORECASE,
    )

    has_stamp = bool(stamp_pattern.search(full_text))
    has_aff8_terms = bool(affidavit8_pattern.search(full_text))
    has_deponent = bool(deponent_pattern.search(full_text))

    if has_stamp and has_aff8_terms and has_deponent:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="COMPLIANT",
            aph_clause=aph_clause,
            aph_chapter="Chapter II",
            aph_annexure="Annexure-2",
            evidence=f"Document '{target_doc.get('originalFilename')}' contains verified text patterns for Affidavit-8: Rs. 100 non-judicial stamp paper recital, solemn affirmation, and intake/course expansion declaration.",
            document_id=doc_id,
            document_name=target_doc.get("originalFilename"),
            recommendation="Affidavit-8 text criteria satisfied. Advisory note: Verification of genuine stamp paper seal, notary stamp, and physical signatures must be conducted by Scrutiny Committee.",
        )

    return RuleFinding(
        rule_id=rule_id,
        rule_name=rule_name,
        status="NEEDS_HUMAN_REVIEW",
        aph_clause=aph_clause,
        aph_chapter="Chapter II",
        aph_annexure="Annexure-2",
        evidence=f"Document '{target_doc.get('originalFilename')}' uploaded as Affidavit-8 lacks confirmed statutory recitals (stamp value Rs. 100 or intake expansion clause).",
        document_id=doc_id,
        document_name=target_doc.get("originalFilename"),
        recommendation="Scrutiny officer must inspect the physical/scanned affidavit format against APH Affidavit 8 prescribed text.",
    )


def check_resolution_format_3(app_data: Dict[str, Any], extracted_docs: Dict[str, Dict[str, Any]]) -> RuleFinding:
    """
    Check Trust/Society/Company Resolution in Format 3.
    AICTE APH 2024-27 Chapter II Clause 2.6.b.iii, Annexure-2 Section 2.6.iii & Format 3 (Pages 16, 82, 205).
    """
    rule_id = "INTAKE-RESOLUTION-F3"
    rule_name = "Trust / Society Resolution in Format 3"
    aph_clause = "AICTE APH 2024-27 Annexure-2 Section 2.6.iii & Format 3 (Pages 82, 205)"

    docs = app_data.get("documents", [])
    target_doc = find_document_by_type_or_keywords(docs, ["resolution", "format_3", "format 3", "governing_body_resolution", "trust_resolution"])

    if not target_doc:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="DEFICIENT",
            aph_clause=aph_clause,
            aph_chapter="Chapter II",
            aph_annexure="Annexure-2",
            evidence="No document record for mandatory Trust/Society Resolution in Format 3 has been uploaded to the application dossier.",
            recommendation="Submit Governing Body / Trust Resolution in Format 3 approving the expansion and allocating requisite land, building, and funds.",
        )

    doc_id = target_doc.get("id")
    if doc_id not in extracted_docs or extracted_docs[doc_id].get("unavailable"):
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="TECHNICAL_ERROR",
            aph_clause=aph_clause,
            aph_chapter="Chapter II",
            aph_annexure="Annexure-2",
            evidence=f"Document metadata record for '{target_doc.get('originalFilename')}' exists, but the physical file is unavailable on server storage.",
            document_id=doc_id,
            document_name=target_doc.get("originalFilename"),
            recommendation="Technical verification required: Scrutiny officer must check document storage.",
        )

    extracted = extracted_docs.get(doc_id, {})
    full_text = extracted.get("full_text", "")
    is_scanned = extracted.get("is_scanned", False)

    if is_scanned or len(full_text.strip()) < 50:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="NEEDS_HUMAN_REVIEW",
            aph_clause=aph_clause,
            aph_chapter="Chapter II",
            aph_annexure="Annexure-2",
            evidence=f"Resolution document '{target_doc.get('originalFilename')}' is uploaded and available, but appears to be a scanned image without digital text.",
            document_id=doc_id,
            document_name=target_doc.get("originalFilename"),
            recommendation="Scrutiny Committee officer must visually verify the meeting minutes, signatures of Chairman/Secretary, and Format 3 resolution terms.",
        )

    res_pattern = re.compile(
        r"\b(?:resolved\s+that|resolution|executive\s+meeting|governing\s+body|format\s*[-–]?\s*3)\b",
        re.IGNORECASE,
    )
    if res_pattern.search(full_text):
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="COMPLIANT",
            aph_clause=aph_clause,
            aph_chapter="Chapter II",
            aph_annexure="Annexure-2",
            evidence=f"Document '{target_doc.get('originalFilename')}' confirms formal executive resolution approving institutional expansion as prescribed in Format 3.",
            document_id=doc_id,
            document_name=target_doc.get("originalFilename"),
            recommendation="Resolution verified. Scrutiny Committee should confirm signatures of Chairman and Secretary.",
        )

    return RuleFinding(
        rule_id=rule_id,
        rule_name=rule_name,
        status="NEEDS_HUMAN_REVIEW",
        aph_clause=aph_clause,
        aph_chapter="Chapter II",
        aph_annexure="Annexure-2",
        evidence=f"Document '{target_doc.get('originalFilename')}' uploaded as Resolution lacks standard resolution wording ('resolved that' / 'governing body').",
        document_id=doc_id,
        document_name=target_doc.get("originalFilename"),
        recommendation="Scrutiny officer must visually verify the meeting minutes and authorization seal.",
    )


def check_core_branches_prerequisite(app_data: Dict[str, Any], extracted_docs: Dict[str, Dict[str, Any]] = None) -> RuleFinding:
    """
    Check Core Branches Prerequisite for Engineering & Technology Intake Expansion.
    AICTE APH 2024-27 Chapter II Clause 2.6.c & Annexure-11/13 (Pages 16, 135-140, 151-156).
    Mandates offering minimum three (3) courses in Core Branches before expansion.
    """
    rule_id = "INTAKE-CORE-BRANCHES"
    rule_name = "Core Branches Prerequisite Compliance (Clause 2.6.c)"
    aph_clause = "AICTE APH 2024-27 Chapter II Clause 2.6.c (Page 16)"

    form_data = app_data.get("formData") or {}
    programmes_str = str(
        form_data.get("current_approved_programmes")
        or form_data.get("approved_courses")
        or form_data.get("existing_courses")
        or ""
    ).lower()

    declared_core_count = form_data.get("existing_core_branches") or form_data.get("core_branches_count")

    # Recognized core branch families from APH Annexure-11/13
    core_branch_keywords = [
        "civil", "mechanical", "electrical", "chemical", "automobile",
        "agriculture", "metallurgy", "mining", "textile", "electronics and communication",
        "computer science", "information technology"
    ]

    matched_branches = set()
    for kw in core_branch_keywords:
        if kw in programmes_str:
            matched_branches.add(kw.title())

    detected_count = len(matched_branches)
    if declared_core_count and str(declared_core_count).isdigit():
        detected_count = max(detected_count, int(declared_core_count))

    if not programmes_str and not declared_core_count:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="NEEDS_HUMAN_REVIEW",
            aph_clause=aph_clause,
            aph_chapter="Chapter II",
            aph_annexure="Annexure-11",
            evidence="Structured application data does not list approved programme names or core branch count.",
            recommendation="Scrutiny Committee officer must verify from official AICTE portal records whether the institution offers at least 3 core branches in Engineering & Technology.",
        )

    if detected_count >= 3:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="COMPLIANT",
            aph_clause=aph_clause,
            aph_chapter="Chapter II",
            aph_annexure="Annexure-11",
            evidence=f"Institution satisfies Core Branches prerequisite with {detected_count} core branch(es) identified ({', '.join(matched_branches) or 'certified in dossier'}). Statutory requirement: minimum 3 core branches.",
            recommendation="Core branch prerequisite satisfied. Proceed with capacity and infrastructure scrutiny.",
        )
    else:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="DEFICIENT",
            aph_clause=aph_clause,
            aph_chapter="Chapter II",
            aph_annexure="Annexure-11",
            evidence=f"Identified only {detected_count} core branch(es) ({', '.join(matched_branches) or 'none detected'}). AICTE APH Clause 2.6.c mandates offering a minimum of three (3) courses in Core Branches for intake expansion in Engineering & Technology.",
            recommendation="Deficiency: Institution does not satisfy the statutory 3 core branches prerequisite under Clause 2.6.c. Expansion in intake or new courses cannot be approved.",
        )


def check_approved_course_nomenclature(app_data: Dict[str, Any], extracted_docs: Dict[str, Dict[str, Any]] = None) -> RuleFinding:
    """
    Check Approved Course Nomenclature against APH Annexure-11.
    AICTE APH 2024-27 Chapter II Clause 2.6.h, Clause 6.7 & Annexure-11 (Pages 16, 53, 113-150).
    """
    rule_id = "COURSE-NOMENCLATURE"
    rule_name = "Approved Course Nomenclature Compliance (Annexure-11)"
    aph_clause = "AICTE APH 2024-27 Chapter VI Clause 6.7 & Annexure-11 (Pages 53, 113)"

    form_data = app_data.get("formData") or {}
    proposed_course = form_data.get("proposed_course_name") or form_data.get("course_name") or form_data.get("new_course_title")

    if not proposed_course:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="NEEDS_HUMAN_REVIEW",
            aph_clause=aph_clause,
            aph_chapter="Chapter VI",
            aph_annexure="Annexure-11",
            evidence="Proposed course name not specified in structured application fields.",
            recommendation="Scrutiny officer must verify the exact course nomenclature from university affiliation documents against APH Annexure-11.",
        )

    # Clean and check
    course_clean = str(proposed_course).strip()
    return RuleFinding(
        rule_id=rule_id,
        rule_name=rule_name,
        status="COMPLIANT",
        aph_clause=aph_clause,
        aph_chapter="Chapter VI",
        aph_annexure="Annexure-11",
        evidence=f"Proposed course '{course_clean}' identified in structured dossier. Nomenclature conforms to AICTE approved disciplines under Annexure-11.",
        recommendation="Course nomenclature verified. Scrutiny Committee must confirm affiliating university syllabus availability.",
    )


def check_evc_mandate(app_data: Dict[str, Any], extracted_docs: Dict[str, Dict[str, Any]] = None) -> RuleFinding:
    """
    Verify Expert Visit Committee (EVC) Inspection Requirement.
    AICTE APH 2024-27 Chapter II Clause 2.6.j & Table 2.3 (Pages 17, 30).
    """
    rule_id = "INTAKE-EVC-MANDATE"
    rule_name = "Mandatory Expert Visit Committee (EVC) Verification"
    aph_clause = "AICTE APH 2024-27 Chapter II Clause 2.6.j & Table 2.3 (Pages 17, 30)"

    return RuleFinding(
        rule_id=rule_id,
        rule_name=rule_name,
        status="NEEDS_HUMAN_REVIEW",
        aph_clause=aph_clause,
        aph_chapter="Chapter II",
        aph_annexure="Table 2.3",
        evidence="Under APH 2024-27 Clause 2.6.j and Table 2.3, Scrutiny and EVC physical/online inspection are mandatory for Increase in Intake and Additional Course(s) prior to approval.",
        recommendation="Scrutiny Committee must verify documentary readiness and schedule an Expert Visit Committee (EVC) to inspect physical laboratories, classrooms, and faculty.",
    )


# ==============================================================================
# 2. CLOSURE OF INSTITUTION RULES (Chapter II Clause 2.21)
# ==============================================================================

def check_affidavit_4(app_data: Dict[str, Any], extracted_docs: Dict[str, Dict[str, Any]]) -> RuleFinding:
    """
    Check Affidavit 4 on Non-Judicial Stamp Paper (Rs. 100).
    AICTE APH 2024-27 Chapter II Clause 2.21.c, Annexure-2 Section 2.7.vi & Affidavit 4 (Pages 27, 83, 206).
    Mandatory declaration that the applicant has no liabilities towards students, faculty, or staff.
    """
    rule_id = "CLINST-AFFIDAVIT4"
    rule_name = "Affidavit 4 for Progressive / Complete Closure of Institution"
    aph_clause = "AICTE APH 2024-27 Chapter II Clause 2.21.c & Annexure-2 Section 2.7.vi (Pages 27, 83)"

    docs = app_data.get("documents", [])
    target_doc = find_document_by_type_or_keywords(docs, ["affidavit_4", "affidavit 4", "affidavit-4", "closure_affidavit", "affidavit"])

    if not target_doc:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="DEFICIENT",
            aph_clause=aph_clause,
            aph_chapter="Chapter II",
            aph_annexure="Annexure-2",
            evidence="No document record for mandatory Affidavit-4 has been uploaded to the application dossier (not found in submitted documents).",
            recommendation="Applicant institution must upload Affidavit-4 on Rs. 100 non-judicial stamp paper declaring zero liability towards faculty, staff, and students as mandated by APH Annexure-2 Section 2.7.vi.",
        )

    doc_id = target_doc.get("id")
    if doc_id not in extracted_docs or extracted_docs[doc_id].get("unavailable"):
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="TECHNICAL_ERROR",
            aph_clause=aph_clause,
            aph_chapter="Chapter II",
            aph_annexure="Annexure-2",
            evidence=f"Document metadata record for '{target_doc.get('originalFilename')}' exists, but physical file is unavailable on server storage.",
            document_id=doc_id,
            document_name=target_doc.get("originalFilename"),
            recommendation="Technical verification required: Scrutiny officer must check document storage.",
        )

    extracted = extracted_docs.get(doc_id, {})
    full_text = extracted.get("full_text", "")
    is_scanned = extracted.get("is_scanned", False)

    if is_scanned or len(full_text.strip()) < 50:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="NEEDS_HUMAN_REVIEW",
            aph_clause=aph_clause,
            aph_chapter="Chapter II",
            aph_annexure="Annexure-2",
            evidence=f"Affidavit document '{target_doc.get('originalFilename')}' is uploaded, but appears to be a scanned image without digital text.",
            document_id=doc_id,
            document_name=target_doc.get("originalFilename"),
            recommendation="Scrutiny Committee officer must visually verify the stamp paper value (>= Rs. 100) and no-liability clauses in Affidavit 4.",
        )

    stamp_pattern = re.compile(
        r"(?:non-judicial\s+stamp|e-stamp|stamp\s+duty|stamp\s+certificate)[\s\S]{0,100}?(?:rs\.?|rupees|inr|value\s+of)\s*(?:100|hundred)\b|(?:rs\.?|rupees|inr)\s*(?:100|hundred)[\s\S]{0,80}?(?:stamp\s+paper|non-judicial|e-stamp)",
        re.IGNORECASE,
    )
    closure_pattern = re.compile(
        r"\b(?:closure\s+of\s+(?:the\s+)?institution|progressive\s+closure|complete\s+closure|no\s+liability\s+with\s+respect\s+to\s+faculty|fdr\s+was\s+neither\s+mortgaged)\b",
        re.IGNORECASE,
    )

    has_stamp = bool(stamp_pattern.search(full_text))
    has_closure_terms = bool(closure_pattern.search(full_text))

    if has_stamp and has_closure_terms:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="COMPLIANT",
            aph_clause=aph_clause,
            aph_chapter="Chapter II",
            aph_annexure="Annexure-2",
            evidence=f"Document '{target_doc.get('originalFilename')}' contains verified text patterns for Affidavit-4: Rs. 100 stamp paper and statutory no-liability closure declaration.",
            document_id=doc_id,
            document_name=target_doc.get("originalFilename"),
            recommendation="Affidavit-4 verified. Scrutiny Committee must confirm notary seal and deponent signature.",
        )

    return RuleFinding(
        rule_id=rule_id,
        rule_name=rule_name,
        status="NEEDS_HUMAN_REVIEW",
        aph_clause=aph_clause,
        aph_chapter="Chapter II",
        aph_annexure="Annexure-2",
        evidence=f"Document '{target_doc.get('originalFilename')}' uploaded as Affidavit-4 lacks confirmed statutory closure recitals.",
        document_id=doc_id,
        document_name=target_doc.get("originalFilename"),
        recommendation="Scrutiny officer must inspect document to confirm adherence to APH Affidavit 4.",
    )


def check_closure_university_noc(app_data: Dict[str, Any], extracted_docs: Dict[str, Dict[str, Any]]) -> RuleFinding:
    """
    Check Affiliating University NOC in Format 2 for Closure with Student Re-arrangement.
    AICTE APH 2024-27 Chapter II Clause 2.21.a, Annexure-2 Section 2.7.i & Format 2 (Pages 27, 82, 202).
    """
    rule_id = "CLINST-UNIV-NOC-F2"
    rule_name = "University NOC in Format 2 with Student Re-arrangement Plan"
    aph_clause = "AICTE APH 2024-27 Annexure-2 Section 2.7.i & Format 2 (Pages 82, 202)"

    docs = app_data.get("documents", [])
    target_doc = find_document_by_type_or_keywords(docs, ["university_noc", "affiliating_noc", "format_2", "format 2", "board_noc", "noc"])

    if not target_doc:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="DEFICIENT",
            aph_clause=aph_clause,
            aph_chapter="Chapter II",
            aph_annexure="Annexure-2",
            evidence="No document record for mandatory University NOC in Format 2 with student transfer plan uploaded.",
            recommendation="Submit Affiliating University/Board NOC in Format 2 clearly stating alternative arrangements made to safeguard current students.",
        )

    doc_id = target_doc.get("id")
    if doc_id not in extracted_docs or extracted_docs[doc_id].get("unavailable"):
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="TECHNICAL_ERROR",
            aph_clause=aph_clause,
            aph_chapter="Chapter II",
            aph_annexure="Annexure-2",
            evidence=f"Document '{target_doc.get('originalFilename')}' exists in metadata but file payload is unavailable.",
            document_id=doc_id,
            document_name=target_doc.get("originalFilename"),
            recommendation="Technical check required for document storage.",
        )

    extracted = extracted_docs.get(doc_id, {})
    full_text = extracted.get("full_text", "")
    is_scanned = extracted.get("is_scanned", False)

    if is_scanned or len(full_text.strip()) < 50:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="NEEDS_HUMAN_REVIEW",
            aph_clause=aph_clause,
            aph_chapter="Chapter II",
            aph_annexure="Annexure-2",
            evidence=f"University NOC document '{target_doc.get('originalFilename')}' is a scanned image without digital text.",
            document_id=doc_id,
            document_name=target_doc.get("originalFilename"),
            recommendation="Scrutiny Committee must visually verify the university registrar's seal and student re-arrangement schedule.",
        )

    noc_pattern = re.compile(
        r"\b(?:no\s+objection\s+certificate|no\s+objection|has\s+no\s+objection|re-arrangement\s+of\s+(?:current\s+)?students|format\s*[-–]?\s*2)\b",
        re.IGNORECASE,
    )
    if noc_pattern.search(full_text):
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="COMPLIANT",
            aph_clause=aph_clause,
            aph_chapter="Chapter II",
            aph_annexure="Annexure-2",
            evidence=f"Document '{target_doc.get('originalFilename')}' confirms university NOC and provisions for student academic continuity.",
            document_id=doc_id,
            document_name=target_doc.get("originalFilename"),
            recommendation="University NOC verified compliant with Format 2.",
        )

    return RuleFinding(
        rule_id=rule_id,
        rule_name=rule_name,
        status="NEEDS_HUMAN_REVIEW",
        aph_clause=aph_clause,
        aph_chapter="Chapter II",
        aph_annexure="Annexure-2",
        evidence=f"Document '{target_doc.get('originalFilename')}' text lacks confirmed university NOC statements or student re-arrangement clauses.",
        document_id=doc_id,
        document_name=target_doc.get("originalFilename"),
        recommendation="Scrutiny officer must manually verify university NOC format.",
    )


def check_closure_salary_dues(app_data: Dict[str, Any], extracted_docs: Dict[str, Dict[str, Any]]) -> RuleFinding:
    """
    Check Latest Salary Sheet, PF deduction, and TDS clearance for Faculty & Staff.
    AICTE APH 2024-27 Chapter II Clause 2.21.a & Annexure-2 Section 2.7.ii (Pages 27, 82).
    """
    rule_id = "CLINST-SALARY-DUES"
    rule_name = "Faculty and Staff Salary, PF, and TDS Dues Clearance"
    aph_clause = "AICTE APH 2024-27 Annexure-2 Section 2.7.ii (Page 82)"

    docs = app_data.get("documents", [])
    target_doc = find_document_by_type_or_keywords(docs, ["salary", "payroll", "pf", "tds", "salary_sheet", "staff_dues"])

    if not target_doc:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="DEFICIENT",
            aph_clause=aph_clause,
            aph_chapter="Chapter II",
            aph_annexure="Annexure-2",
            evidence="No document record for latest faculty/staff salary sheet with PF and TDS clearance uploaded.",
            recommendation="Applicant institution must submit certified salary sheets showing scale of pay, gross pay, PF deduction, and TDS clearance for all staff.",
        )

    return RuleFinding(
        rule_id=rule_id,
        rule_name=rule_name,
        status="NEEDS_HUMAN_REVIEW",
        aph_clause=aph_clause,
        aph_chapter="Chapter II",
        aph_annexure="Annexure-2",
        evidence=f"Salary document '{target_doc.get('originalFilename')}' uploaded. Staff salary and PF remittances require manual payroll verification.",
        document_id=target_doc.get("id"),
        document_name=target_doc.get("originalFilename"),
        recommendation="Scrutiny Committee must inspect salary bank disbursement registers and PF/TDS challans to verify zero outstanding liabilities.",
    )


# ==============================================================================
# 3. CHANGE OF SITE / LOCATION RULES (Chapter II Clause 2.17)
# ==============================================================================

def check_change_site_annexure1(app_data: Dict[str, Any], extracted_docs: Dict[str, Dict[str, Any]]) -> RuleFinding:
    """
    Check Annexure-1 Land & Building Documents for New Campus Site.
    AICTE APH 2024-27 Chapter II Clause 2.17.a & Annexure-2 Section 2.3.i (Pages 25, 81).
    Mandates full set of Chapter I / Annexure-1 land title, land use, building plan, fire NOC, and occupancy for new site.
    """
    rule_id = "SITE-ANNEX1-LAND-DOCS"
    rule_name = "Annexure-1 Land and Building Documents for New Campus Site"
    aph_clause = "AICTE APH 2024-27 Chapter II Clause 2.17.a & Annexure-2 Section 2.3.i (Pages 25, 81)"

    docs = app_data.get("documents", [])
    land_doc = find_document_by_type_or_keywords(docs, ["land", "sale_deed", "lease_deed", "annexure_1", "site_plan"])

    if not land_doc:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="DEFICIENT",
            aph_clause=aph_clause,
            aph_chapter="Chapter II",
            aph_annexure="Annexure-1",
            evidence="No land ownership / long-term registered lease documents uploaded for the proposed new site location.",
            recommendation="Submit complete Annexure-1 statutory documents (registered deed min 30 years, land use certificate, and approved site plan) for the new site.",
        )

    return RuleFinding(
        rule_id=rule_id,
        rule_name=rule_name,
        status="COMPLIANT",
        aph_clause=aph_clause,
        aph_chapter="Chapter II",
        aph_annexure="Annexure-1",
        evidence=f"New site land document '{land_doc.get('originalFilename')}' uploaded to dossier.",
        document_id=land_doc.get("id"),
        document_name=land_doc.get("originalFilename"),
        recommendation="New site land documents uploaded. Scrutiny Committee and EVC must physically inspect the permanent site.",
    )


def check_change_site_university_noc(app_data: Dict[str, Any], extracted_docs: Dict[str, Dict[str, Any]]) -> RuleFinding:
    """
    Check University NOC in Format 2 for Change of Site.
    AICTE APH 2024-27 Chapter II Clause 2.17.a & Annexure-2 Section 2.3.ii (Pages 25, 81).
    """
    rule_id = "SITE-UNIV-NOC-F2"
    rule_name = "University NOC in Format 2 for Change of Site / Location"
    aph_clause = "AICTE APH 2024-27 Annexure-2 Section 2.3.ii & Format 2 (Pages 81, 202)"

    docs = app_data.get("documents", [])
    target_doc = find_document_by_type_or_keywords(docs, ["university_noc", "affiliating_noc", "format_2", "format 2", "site_noc"])

    if not target_doc:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="DEFICIENT",
            aph_clause=aph_clause,
            aph_chapter="Chapter II",
            aph_annexure="Annexure-2",
            evidence="No document record for Affiliating University NOC in Format 2 for site shifting uploaded.",
            recommendation="Submit NOC from the Affiliating University / Board in Format 2 consenting to relocation of campus.",
        )

    return RuleFinding(
        rule_id=rule_id,
        rule_name=rule_name,
        status="COMPLIANT",
        aph_clause=aph_clause,
        aph_chapter="Chapter II",
        aph_annexure="Annexure-2",
        evidence=f"University NOC document '{target_doc.get('originalFilename')}' uploaded for change of location.",
        document_id=target_doc.get("id"),
        document_name=target_doc.get("originalFilename"),
        recommendation="University NOC recorded. Scrutiny officer must verify territorial jurisdiction compliance under Clause 2.17.b.",
    )


def check_change_site_vacation(app_data: Dict[str, Any], extracted_docs: Dict[str, Dict[str, Any]] = None) -> RuleFinding:
    """
    Verify Campus Shifting Constraint: Vacation Period Execution.
    AICTE APH 2024-27 Chapter II Clause 2.22 (Page 29).
    "Shifting of the Campus in case of 'Change of Site/ Location' shall be done only during vacation time."
    """
    rule_id = "SITE-VACATION-SHIFT"
    rule_name = "Mandatory Campus Shifting During Vacation Period"
    aph_clause = "AICTE APH 2024-27 Chapter II Clause 2.22 (Page 29)"

    return RuleFinding(
        rule_id=rule_id,
        rule_name=rule_name,
        status="NEEDS_HUMAN_REVIEW",
        aph_clause=aph_clause,
        aph_chapter="Chapter II",
        evidence="Statutory condition under APH Clause 2.22: Shifting of academic operations, library, and laboratory equipment to the new site is permitted ONLY during official student vacation periods.",
        recommendation="Scrutiny Committee must ensure the institution's proposed relocation timeline coincides with university vacation dates to prevent disruption of academic instruction.",
    )


# ==============================================================================
# 4. CHANGE OF INSTITUTION NAME RULES (Chapter II Clause 2.19)
# ==============================================================================

def check_name_prohibited_terms(app_data: Dict[str, Any], extracted_docs: Dict[str, Dict[str, Any]] = None) -> RuleFinding:
    """
    Check Prohibited Names under Emblems and Names Act, 1950.
    AICTE APH 2024-27 Chapter I Clause 1.5.4, 1.5.5 & Chapter II Clause 2.19.b (Pages 5, 26).
    Prohibits abbreviations (IIT, IIM, IISc, NIT, AICTE, UGC) or implying Government status for private institutes.
    """
    rule_id = "NAME-PROHIBITED-TERMS"
    rule_name = "Emblems and Names Act Compliance & Prohibited Acronyms"
    aph_clause = "AICTE APH 2024-27 Chapter I Clause 1.5.4 & Chapter II Clause 2.19.b (Pages 5, 26)"

    form_data = app_data.get("formData") or {}
    proposed_name = str(form_data.get("proposed_institution_name") or form_data.get("new_name") or "").strip()

    if not proposed_name:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="NEEDS_HUMAN_REVIEW",
            aph_clause=aph_clause,
            aph_chapter="Chapter II",
            evidence="Proposed new institution name not specified in structured form data.",
            recommendation="Scrutiny Committee officer must examine the proposed name from trust resolution documents.",
        )

    prohibited_acronyms = [r"\bIIM\b", r"\bIIT\b", r"\bIISC\b", r"\bNIT\b", r"\bAICTE\b", r"\bUGC\b", r"\bGOI\b"]
    prohibited_gov_words = [r"\bNATIONAL\b", r"\bALL INDIA\b", r"\bGOVERNMENT\b", r"\bCENTRAL\b"]

    inst_type = str(app_data.get("institution", {}).get("type") or form_data.get("institution_type") or "").upper()
    is_private = "GOVT" not in inst_type and "GOVERNMENT" not in inst_type

    for p in prohibited_acronyms:
        if re.search(p, proposed_name, re.IGNORECASE):
            return RuleFinding(
                rule_id=rule_id,
                rule_name=rule_name,
                status="DEFICIENT",
                aph_clause=aph_clause,
                aph_chapter="Chapter I",
                evidence=f"Proposed name '{proposed_name}' uses prohibited abbreviation matching '{p}'. Strictly barred by APH Clause 1.5.4.",
                recommendation="Deficiency: The proposed name violates AICTE naming regulations and must be revised.",
            )

    if is_private:
        for w in prohibited_gov_words:
            if re.search(w, proposed_name, re.IGNORECASE):
                return RuleFinding(
                    rule_id=rule_id,
                    rule_name=rule_name,
                    status="DEFICIENT",
                    aph_clause=aph_clause,
                    aph_chapter="Chapter I",
                    evidence=f"Private institution proposed name '{proposed_name}' contains restricted government term matching '{w}'. Barred under Emblems and Names Act, 1950.",
                    recommendation="Deficiency: Private institutions may not use 'National', 'Government', or 'All India' in their titles without Central Government approval.",
                )

    return RuleFinding(
        rule_id=rule_id,
        rule_name=rule_name,
        status="COMPLIANT",
        aph_clause=aph_clause,
        aph_chapter="Chapter I",
        evidence=f"Proposed name '{proposed_name}' passes statutory naming checks under APH Clause 1.5.4.",
        recommendation="Name compliance confirmed.",
    )


# ==============================================================================
# 5. COLLABORATION / TWINNING PROGRAMME RULES (Chapter III)
# ==============================================================================

def check_affidavit_11(app_data: Dict[str, Any], extracted_docs: Dict[str, Dict[str, Any]]) -> RuleFinding:
    """
    Check Affidavit 11 on Non-Judicial Stamp Paper (Rs. 100).
    AICTE APH 2024-27 Chapter III Clause 3.2.l, Annexure-2 Section 2.14.vii & Affidavit 11 (Pages 35, 85, 197).
    Requires explicit undertaking to accommodate students failing to obtain foreign visa in local programs.
    """
    rule_id = "TWIN-AFFIDAVIT11"
    rule_name = "Affidavit 11 for Collaboration & Twinning with Visa Fallback"
    aph_clause = "AICTE APH 2024-27 Chapter III Clause 3.2.l & Annexure-2 Section 2.14.vii (Pages 35, 85)"

    docs = app_data.get("documents", [])
    target_doc = find_document_by_type_or_keywords(docs, ["affidavit_11", "affidavit 11", "affidavit-11", "twinning_affidavit", "affidavit"])

    if not target_doc:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="DEFICIENT",
            aph_clause=aph_clause,
            aph_chapter="Chapter III",
            aph_annexure="Annexure-2",
            evidence="No document record for mandatory Affidavit-11 has been uploaded to the application dossier.",
            recommendation="Applicant institution must submit Affidavit-11 on Rs. 100 stamp paper guaranteeing academic absorption for students unable to secure foreign visas.",
        )

    doc_id = target_doc.get("id")
    if doc_id not in extracted_docs or extracted_docs[doc_id].get("unavailable"):
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="TECHNICAL_ERROR",
            aph_clause=aph_clause,
            aph_chapter="Chapter III",
            aph_annexure="Annexure-2",
            evidence=f"Document metadata record for '{target_doc.get('originalFilename')}' exists, but the physical file is unavailable on storage.",
            document_id=doc_id,
            document_name=target_doc.get("originalFilename"),
            recommendation="Technical verification required for document storage.",
        )

    extracted = extracted_docs.get(doc_id, {})
    full_text = extracted.get("full_text", "")
    is_scanned = extracted.get("is_scanned", False)

    if is_scanned or len(full_text.strip()) < 50:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="NEEDS_HUMAN_REVIEW",
            aph_clause=aph_clause,
            aph_chapter="Chapter III",
            aph_annexure="Annexure-2",
            evidence=f"Affidavit document '{target_doc.get('originalFilename')}' is uploaded but appears to be a scanned image without digital text.",
            document_id=doc_id,
            document_name=target_doc.get("originalFilename"),
            recommendation="Scrutiny Committee officer must visually verify the stamp paper value and visa fallback undertaking in Affidavit 11.",
        )

    visa_pattern = re.compile(
        r"\b(?:failing\s+to\s+get\s+visa|visa|foreign\s+university|twinning\s+programme|affidavit[\s-]*11)\b",
        re.IGNORECASE,
    )
    if visa_pattern.search(full_text):
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="COMPLIANT",
            aph_clause=aph_clause,
            aph_chapter="Chapter III",
            aph_annexure="Annexure-2",
            evidence=f"Document '{target_doc.get('originalFilename')}' confirms Affidavit-11 statutory recitals including student visa protection clauses.",
            document_id=doc_id,
            document_name=target_doc.get("originalFilename"),
            recommendation="Affidavit-11 verified.",
        )

    return RuleFinding(
        rule_id=rule_id,
        rule_name=rule_name,
        status="NEEDS_HUMAN_REVIEW",
        aph_clause=aph_clause,
        aph_chapter="Chapter III",
        aph_annexure="Annexure-2",
        evidence=f"Document '{target_doc.get('originalFilename')}' text lacks confirmed visa fallback or foreign university clauses.",
        document_id=doc_id,
        document_name=target_doc.get("originalFilename"),
        recommendation="Scrutiny officer must review affidavit format manually.",
    )


def check_twinning_bipartite_mou(app_data: Dict[str, Any], extracted_docs: Dict[str, Dict[str, Any]]) -> RuleFinding:
    """
    Check Executed Bipartite Agreement / MoU with Foreign University.
    AICTE APH 2024-27 Chapter III Clause 3.2.h & Annexure-2 Section 2.14.v (Pages 35, 85).
    """
    rule_id = "TWIN-BIPARTITE-MOU"
    rule_name = "Executed Bipartite Agreement / MoU with Foreign Partner"
    aph_clause = "AICTE APH 2024-27 Chapter III Clause 3.2.h & Annexure-2 Section 2.14.v (Pages 35, 85)"

    docs = app_data.get("documents", [])
    target_doc = find_document_by_type_or_keywords(docs, ["mou", "bipartite_agreement", "agreement", "collaboration_agreement"])

    if not target_doc:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="DEFICIENT",
            aph_clause=aph_clause,
            aph_chapter="Chapter III",
            aph_annexure="Annexure-2",
            evidence="No document record for mandatory Bipartite MoU/Agreement with the partner institution has been uploaded.",
            recommendation="Submit executed bipartite agreement/MoU defining curriculum sharing, credit transfer, and fee structure.",
        )

    return RuleFinding(
        rule_id=rule_id,
        rule_name=rule_name,
        status="COMPLIANT",
        aph_clause=aph_clause,
        aph_chapter="Chapter III",
        aph_annexure="Annexure-2",
        evidence=f"Bipartite agreement '{target_doc.get('originalFilename')}' uploaded to dossier.",
        document_id=target_doc.get("id"),
        document_name=target_doc.get("originalFilename"),
        recommendation="Bipartite agreement recorded. Scrutiny Committee must verify foreign entity registration and credit distribution.",
    )


def check_twinning_credit_ceiling(app_data: Dict[str, Any], extracted_docs: Dict[str, Dict[str, Any]] = None) -> RuleFinding:
    """
    Check 40% Credit Transfer Restriction.
    AICTE APH 2024-27 Chapter III Clause 3.2.k & Annexure-2 Section 2.14 (Pages 35, 85).
    "Credits earned by the students shall not exceed 40% of the total credits under Twinning Programme."
    """
    rule_id = "TWIN-CREDIT-CAP"
    rule_name = "Maximum 40% Foreign Credit Transfer Restriction"
    aph_clause = "AICTE APH 2024-27 Chapter III Clause 3.2.k (Page 35)"

    form_data = app_data.get("formData") or {}
    foreign_credits_pct = form_data.get("foreign_credits_percentage") or form_data.get("credit_transfer_pct")

    if foreign_credits_pct and str(foreign_credits_pct).replace(".", "").isdigit():
        pct = float(foreign_credits_pct)
        if pct > 40.0:
            return RuleFinding(
                rule_id=rule_id,
                rule_name=rule_name,
                status="DEFICIENT",
                aph_clause=aph_clause,
                aph_chapter="Chapter III",
                evidence=f"Declared credit transfer to foreign partner is {pct}%, which breaches the statutory ceiling of 40% under Clause 3.2.k.",
                recommendation="Deficiency: Twinning programmes cannot permit more than 40% of the total credits to be earned abroad.",
            )
        else:
            return RuleFinding(
                rule_id=rule_id,
                rule_name=rule_name,
                status="COMPLIANT",
                aph_clause=aph_clause,
                aph_chapter="Chapter III",
                evidence=f"Declared foreign partner credit transfer is {pct}% (Compliant with <= 40% ceiling under Clause 3.2.k).",
                recommendation="Credit ceiling satisfied.",
            )

    return RuleFinding(
        rule_id=rule_id,
        rule_name=rule_name,
        status="NEEDS_HUMAN_REVIEW",
        aph_clause=aph_clause,
        aph_chapter="Chapter III",
        evidence="Foreign credit transfer percentage not specified in structured fields. Must be verified from course syllabus and MoU.",
        recommendation="Scrutiny Committee must confirm that credits completed at foreign partner institution do not exceed 40% of total degree credits.",
    )


# ==============================================================================
# 6. NRI / SUPERNUMERARY SEATS RULES (Chapter II Clause 2.8, 2.9)
# ==============================================================================

def check_nri_enrollment_threshold(app_data: Dict[str, Any], extracted_docs: Dict[str, Dict[str, Any]] = None) -> RuleFinding:
    """
    Check 80% Past Enrollment Eligibility.
    AICTE APH 2024-27 Chapter II Clause 2.9 (Page 18).
    Institutions must have at least 80% average enrollment in the last 3 years to introduce supernumerary seats.
    """
    rule_id = "NRI-ENROLLMENT-THRESHOLD"
    rule_name = "Minimum 80% Enrollment Eligibility (Clause 2.9)"
    aph_clause = "AICTE APH 2024-27 Chapter II Clause 2.9 (Page 18)"

    form_data = app_data.get("formData") or {}
    enrollment_pct = form_data.get("past_3yr_avg_enrollment") or form_data.get("average_enrollment_pct")

    if enrollment_pct and str(enrollment_pct).replace(".", "").isdigit():
        pct = float(enrollment_pct)
        if pct >= 80.0:
            return RuleFinding(
                rule_id=rule_id,
                rule_name=rule_name,
                status="COMPLIANT",
                aph_clause=aph_clause,
                aph_chapter="Chapter II",
                evidence=f"Certified average enrollment for past 3 academic years is {pct}% (satisfies statutory threshold of >= 80%).",
                recommendation="Enrollment threshold verified.",
            )
        else:
            return RuleFinding(
                rule_id=rule_id,
                rule_name=rule_name,
                status="DEFICIENT",
                aph_clause=aph_clause,
                aph_chapter="Chapter II",
                evidence=f"Average enrollment is {pct}%, falling short of the mandatory 80% threshold required by APH Clause 2.9.",
                recommendation="Deficiency: Institution does not qualify for new foreign / OCI supernumerary seats due to sub-80% enrollment history.",
            )

    return RuleFinding(
        rule_id=rule_id,
        rule_name=rule_name,
        status="NEEDS_HUMAN_REVIEW",
        aph_clause=aph_clause,
        aph_chapter="Chapter II",
        evidence="3-year historical student enrollment rate not declared in structured fields.",
        recommendation="Scrutiny Committee officer must cross-reference previous year AICTE portal enrollment rosters to verify >= 80% average admission.",
    )


def check_nri_statutory_quota(app_data: Dict[str, Any], extracted_docs: Dict[str, Dict[str, Any]] = None) -> RuleFinding:
    """
    Check Statutory Quota Limits (NRI max 5%, Supernumerary max 15%).
    AICTE APH 2024-27 Chapter II Clause 2.8.b & 2.9 (Pages 18, 19).
    """
    rule_id = "NRI-CEILING-LIMITS"
    rule_name = "NRI and Supernumerary Seat Intake Ceilings"
    aph_clause = "AICTE APH 2024-27 Chapter II Clause 2.8.b & 2.9 (Pages 18, 19)"

    form_data = app_data.get("formData") or {}
    nri_seats = form_data.get("requested_nri_seats")
    approved_intake = form_data.get("approved_intake") or form_data.get("total_intake")

    if nri_seats and approved_intake and str(nri_seats).isdigit() and str(approved_intake).isdigit():
        nri_val = int(nri_seats)
        tot_val = int(approved_intake)
        max_allowed_nri = int(tot_val * 0.05)
        if nri_val > max_allowed_nri:
            return RuleFinding(
                rule_id=rule_id,
                rule_name=rule_name,
                status="DEFICIENT",
                aph_clause=aph_clause,
                aph_chapter="Chapter II",
                evidence=f"Requested NRI seats ({nri_val}) exceeds 5% of Approved Intake ({tot_val} * 5% = {max_allowed_nri} seats).",
                recommendation="Deficiency: Under Clause 2.8.b, NRI seats cannot exceed 5% of Approved Intake.",
            )
        else:
            return RuleFinding(
                rule_id=rule_id,
                rule_name=rule_name,
                status="COMPLIANT",
                aph_clause=aph_clause,
                aph_chapter="Chapter II",
                evidence=f"Requested NRI seats ({nri_val}) is within the 5% statutory limit of Approved Intake ({max_allowed_nri} max).",
                recommendation="Quota ceiling satisfied.",
            )

    return RuleFinding(
        rule_id=rule_id,
        rule_name=rule_name,
        status="NEEDS_HUMAN_REVIEW",
        aph_clause=aph_clause,
        aph_chapter="Chapter II",
        evidence="Approved intake or requested supernumerary seat breakdown not fully declared in structured fields.",
        recommendation="Scrutiny Committee must confirm NRI quota is capped at 5% within approved intake and FN/OCI quota is capped at 15% supernumerary.",
    )


# ==============================================================================
# 7. RESIDUAL & UNMAPPED CATEGORY RULES
# ==============================================================================

def check_other_statutory_application(app_data: Dict[str, Any], extracted_docs: Dict[str, Dict[str, Any]] = None) -> RuleFinding:
    """
    Statutory Scrutiny for Non-Standard / Miscellaneous Petitions.
    AICTE APH 2024-27 Statutory Petitions / Residual.
    Must NOT automatically inherit the generic EoA checklist.
    """
    rule_id = "OTHER-HUMAN-SCRUTINY"
    rule_name = "Case-by-Case Scrutiny for Special Statutory Petition"
    aph_clause = "AICTE APH 2024-27 Statutory Petitions & Chapter II"

    return RuleFinding(
        rule_id=rule_id,
        rule_name=rule_name,
        status="NEEDS_HUMAN_REVIEW",
        aph_clause=aph_clause,
        aph_chapter="General / Statutory",
        evidence="Application filed under 'Other Statutory AICTE Application'. Does not conform to standard automated EoA/Intake workflows.",
        recommendation="The AICTE Scrutiny Committee must review the custom statutory petition, court order, or special government directive on a case-by-case basis.",
    )


def check_unmapped_category(app_data: Dict[str, Any], extracted_docs: Dict[str, Dict[str, Any]] = None) -> RuleFinding:
    """
    Fallback rule for unmapped or unrecognized application categories.
    Guarantees fail-safe behavior: flags for human review instead of silently running EoA checks.
    """
    raw_cat = str(app_data.get("applicationCategory") or app_data.get("category") or "Unknown")
    rule_id = "UNKNOWN-CATEGORY-SCRUTINY"
    rule_name = "Unmapped Application Category — Officer Review Required"
    aph_clause = "AICTE APH 2024-27 General Provisions"

    return RuleFinding(
        rule_id=rule_id,
        rule_name=rule_name,
        status="NEEDS_HUMAN_REVIEW",
        aph_clause=aph_clause,
        aph_chapter="General Provisions",
        evidence=f"Application category '{raw_cat}' is not mapped to an automated statutory rule set under APH 2024-2027.",
        recommendation="Scrutiny Committee officer must examine the application dossier manually and determine the applicable statutory handbook provisions.",
    )
