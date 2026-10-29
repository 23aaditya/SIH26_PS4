import re
import math
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from models.schemas import RuleFinding
from rules.base import parse_date_safely, find_document_by_type_or_keywords

def check_affidavit_2(app_data: Dict[str, Any], extracted_docs: Dict[str, Dict[str, Any]]) -> RuleFinding:
    """
    Check Affidavit 2 (on Non-Judicial Stamp Paper / E-Stamp >= Rs. 100).
    AICTE APH 2024-27 Chapter II Clause 2.1, 2.3.4.b, 6.39 & Annexure-2 Section 2.1.i (Page 81).
    Applicable to Chapter I, II, IV applications EXCEPT Closure of Institution.
    """
    rule_id = "EOA-ANNEX2-AFFIDAVIT2"
    rule_name = "Affidavit 2 on Non-Judicial Stamp Paper (Annexure-2)"
    aph_clause = "AICTE APH 2024-27 Chapter II Clause 2.1, 2.3.4.b & Annexure-2 Section 2.1.i (Page 81)"

    docs = app_data.get("documents", [])
    target_doc = find_document_by_type_or_keywords(docs, ["affidavit_2", "affidavit 2", "affidavit-2", "affidavit"])

    # State 1: No corresponding document record uploaded
    if not target_doc:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="DEFICIENT",
            aph_clause=aph_clause,
            evidence="No document record for mandatory Affidavit-2 has been uploaded to the application dossier (not found in submitted documents).",
            recommendation="Applicant institution must upload Affidavit-2 on minimum Rs. 100 non-judicial stamp paper as prescribed in APH Annexure-2 Section 2.1.i.",
            is_common_check=True,
            aph_chapter="Chapter II",
            aph_annexure="Annexure-2",
        )

    doc_id = target_doc.get("id")

    # State 2: Document record exists in metadata, but physical file is unavailable
    if doc_id not in extracted_docs or extracted_docs[doc_id].get("unavailable"):
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="TECHNICAL_ERROR",
            aph_clause=aph_clause,
            evidence=f"Document metadata record for '{target_doc.get('originalFilename')}' ({target_doc.get('documentType')}) exists, but the physical file is unavailable on server storage for inspection.",
            document_id=doc_id,
            document_name=target_doc.get("originalFilename"),
            recommendation="Technical verification required: Scrutiny officer must verify document file storage and request applicant to re-upload if file is missing. This is a technical issue and does not constitute substantive regulatory non-compliance.",
            is_common_check=True,
            aph_chapter="Chapter II",
            aph_annexure="Annexure-2",
        )

    extracted = extracted_docs.get(doc_id, {})
    full_text = extracted.get("full_text", "")
    is_scanned = extracted.get("is_scanned", False)

    # State 3: File exists but is unreadable (scanned image or empty text layer)
    if is_scanned or len(full_text.strip()) < 50:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="NEEDS_HUMAN_REVIEW",
            aph_clause=aph_clause,
            evidence=f"Affidavit document '{target_doc.get('originalFilename')}' is uploaded and available, but appears to be a scanned image without an embedded digital text layer. Substantive compliance could not be verified automatically.",
            document_id=doc_id,
            document_name=target_doc.get("originalFilename"),
            recommendation="Scrutiny officer must visually verify the stamp paper value (>= Rs. 100), signature, and notary seal on the document.",
            is_common_check=True,
            aph_chapter="Chapter II",
            aph_annexure="Annexure-2",
        )

    # Targeted regex checks
    stamp_pattern = re.compile(
        r"(?:non-judicial\s+stamp|e-stamp|stamp\s+duty|stamp\s+certificate)[\s\S]{0,100}?(?:rs\.?|rupees|inr|value\s+of)\s*(?:100|hundred)\b|(?:rs\.?|rupees|inr)\s*(?:100|hundred)[\s\S]{0,80}?(?:stamp\s+paper|non-judicial|e-stamp)",
        re.IGNORECASE,
    )
    deponent_pattern = re.compile(
        r"\b(?:solemnly\s+(?:affirm|declare)|do\s+hereby\s+solemnly|sworn\s+on\s+oath|deponent\s+do\s+hereby)\b",
        re.IGNORECASE,
    )
    aicte_pattern = re.compile(
        r"\b(?:aicte|all\s+india\s+council\s+for\s+technical\s+education|approval\s+process\s+handbook)\b",
        re.IGNORECASE,
    )

    has_stamp = bool(stamp_pattern.search(full_text))
    has_deponent = bool(deponent_pattern.search(full_text))
    has_aicte = bool(aicte_pattern.search(full_text))

    if has_stamp and has_deponent and has_aicte:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="COMPLIANT",
            aph_clause=aph_clause,
            evidence=f"Document '{target_doc.get('originalFilename')}' contains verified text patterns for Affidavit-2: Rs. 100 non-judicial stamp paper recital, solemn affirmation, and AICTE statutory declaration.",
            document_id=doc_id,
            document_name=target_doc.get("originalFilename"),
            recommendation="Text criteria satisfied. Advisory note: Verification of genuine stamp paper seal, notary stamp, and physical signatures must be conducted by Scrutiny Committee.",
            is_common_check=True,
            aph_chapter="Chapter II",
            aph_annexure="Annexure-2",
        )
    else:
        missing = []
        if not has_stamp:
            missing.append("Targeted Rs. 100 Non-Judicial Stamp Paper recital")
        if not has_deponent:
            missing.append("Deponent solemn affirmation clause")
        if not has_aicte:
            missing.append("AICTE statutory declaration")

        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="NEEDS_HUMAN_REVIEW",
            aph_clause=aph_clause,
            evidence=f"Document contains extractable text but lacks confirmed statutory recitals: {', '.join(missing)}.",
            document_id=doc_id,
            document_name=target_doc.get("originalFilename"),
            recommendation="Scrutiny officer must inspect the physical/notarized format to ensure statutory compliance with Annexure-2.",
            is_common_check=True,
            aph_chapter="Chapter II",
            aph_annexure="Annexure-2",
        )


def check_fire_safety_noc(app_data: Dict[str, Any], extracted_docs: Dict[str, Dict[str, Any]]) -> RuleFinding:
    """
    Check Fire Safety Certificate / NOC.
    AICTE APH 2024-27 Chapter VI Clause 6.17.i, Annexure-2 Section 2.1.v & Annexure-3 Clause 3.1.d (Pages 57, 81, 86).
    """
    rule_id = "EOA-ANNEX3-FIRE-NOC"
    rule_name = "Fire Safety NOC / Certificate"
    aph_clause = "AICTE APH 2024-27 Chapter VI Clause 6.17.i & Annexure-2 Section 2.1.v (Pages 57, 81)"

    docs = app_data.get("documents", [])
    target_doc = find_document_by_type_or_keywords(docs, ["fire_noc", "fire_safety", "fire certificate", "fire noc", "fire"])

    # State 1: No corresponding document record uploaded
    if not target_doc:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="DEFICIENT",
            aph_clause=aph_clause,
            evidence="No document record for mandatory Fire Safety Certificate / NOC has been uploaded to the application dossier (not found in submitted documents).",
            recommendation="Applicant institution must obtain and upload a valid Fire Safety Certificate issued by the competent Fire and Emergency Services authority as required by APH Clause 6.17.i.",
            is_common_check=True,
            aph_chapter="Chapter VI",
            aph_annexure="Annexure-3",
        )

    doc_id = target_doc.get("id")

    # State 2: Document record exists in metadata, but physical file is unavailable
    if doc_id not in extracted_docs or extracted_docs[doc_id].get("unavailable"):
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="TECHNICAL_ERROR",
            aph_clause=aph_clause,
            evidence=f"Document metadata record for '{target_doc.get('originalFilename')}' exists, but the physical file is unavailable on server storage for inspection.",
            document_id=doc_id,
            document_name=target_doc.get("originalFilename"),
            recommendation="Technical verification required: Scrutiny officer must verify document file storage and request applicant to re-upload if file is missing. Does not indicate substantive non-compliance.",
            is_common_check=True,
            aph_chapter="Chapter VI",
            aph_annexure="Annexure-3",
        )

    now = datetime.now(timezone.utc)

    # 1. Evaluate database metadata expiry date
    expiry_date_str = target_doc.get("expiryDate")
    if expiry_date_str:
        try:
            exp_date = datetime.fromisoformat(expiry_date_str.replace("Z", "+00:00"))
            if exp_date < now:
                return RuleFinding(
                    rule_id=rule_id,
                    rule_name=rule_name,
                    status="DEFICIENT",
                    aph_clause=aph_clause,
                    evidence=f"Inspected Fire Safety Certificate has expired on {exp_date.strftime('%Y-%m-%d')} (recorded in document metadata).",
                    document_id=doc_id,
                    document_name=target_doc.get("originalFilename"),
                    recommendation="The Fire Safety Certificate has expired. A valid renewed Fire Safety Certificate must be submitted.",
                    is_common_check=True,
                    aph_chapter="Chapter VI",
                    aph_annexure="Annexure-3",
                )
        except Exception:
            pass

    extracted = extracted_docs.get(doc_id, {})
    full_text = extracted.get("full_text", "")
    is_scanned = extracted.get("is_scanned", False)

    # State 3: File exists but is unreadable (scanned image or empty text layer)
    if is_scanned or len(full_text.strip()) < 50:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="NEEDS_HUMAN_REVIEW",
            aph_clause=aph_clause,
            evidence=f"Fire NOC document '{target_doc.get('originalFilename')}' is uploaded and available, but appears to be a scanned image without an embedded digital text layer. Automated clearance cannot be verified.",
            document_id=doc_id,
            document_name=target_doc.get("originalFilename"),
            recommendation="Scrutiny Committee officer must visually verify the validity period and issuing fire officer's seal.",
            is_common_check=True,
            aph_chapter="Chapter VI",
            aph_annexure="Annexure-3",
        )

    # 2. Competent authority verification
    authority_pattern = re.compile(
        r"\b(?:fire\s+(?:(?:and|&)\s+emergency\s+services|services\s+department|safety\s+officer|brigade|directorate)|director\s+general\s+of\s+fire|chief\s+fire\s+officer)\b",
        re.IGNORECASE,
    )
    has_fire_authority = bool(authority_pattern.search(full_text))

    if not has_fire_authority:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="NEEDS_HUMAN_REVIEW",
            aph_clause=aph_clause,
            evidence="Document text mentions fire safety terms but does not identify issuance by a competent state/UT Fire and Emergency Services authority.",
            document_id=doc_id,
            document_name=target_doc.get("originalFilename"),
            recommendation="Human officer must inspect the issuing authority seal on the Fire NOC.",
            is_common_check=True,
            aph_chapter="Chapter VI",
            aph_annexure="Annexure-3",
        )

    # 3. Extract and validate text validity dates
    date_regex = re.compile(
        r"(?:valid\s+(?:up\s*to|upto|till|through|until)|expiry\s+date|date\s+of\s+expiry)[:\s]+(\d{1,2}[-/\.]\d{1,2}[-/\.]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,]+\d{2,4})",
        re.IGNORECASE,
    )
    match = date_regex.search(full_text)
    if match:
        extracted_date_str = match.group(1)
        parsed_dt = parse_date_safely(extracted_date_str)
        if parsed_dt:
            if parsed_dt < now:
                return RuleFinding(
                    rule_id=rule_id,
                    rule_name=rule_name,
                    status="DEFICIENT",
                    aph_clause=aph_clause,
                    evidence=f"Fire Safety Certificate text indicates validity expired on {parsed_dt.strftime('%Y-%m-%d')} ('{match.group(0)}').",
                    document_id=doc_id,
                    document_name=target_doc.get("originalFilename"),
                    recommendation="The Fire Safety Certificate has expired. A valid renewed Fire Safety Certificate must be submitted.",
                    is_common_check=True,
                    aph_chapter="Chapter VI",
                    aph_annexure="Annexure-3",
                )
            else:
                return RuleFinding(
                    rule_id=rule_id,
                    rule_name=rule_name,
                    status="COMPLIANT",
                    aph_clause=aph_clause,
                    evidence=f"Document '{target_doc.get('originalFilename')}' confirms Fire Safety authority clearance with validity verified through {parsed_dt.strftime('%Y-%m-%d')}.",
                    document_id=doc_id,
                    document_name=target_doc.get("originalFilename"),
                    recommendation="Fire safety clearance verified unexpired. Advisory note: Human scrutiny officer must verify official stamp.",
                    is_common_check=True,
                    aph_chapter="Chapter VI",
                    aph_annexure="Annexure-3",
                )

    return RuleFinding(
        rule_id=rule_id,
        rule_name=rule_name,
        status="NEEDS_HUMAN_REVIEW",
        aph_clause=aph_clause,
        evidence=f"Document '{target_doc.get('originalFilename')}' contains Fire Services authority text, but an explicit unexpired validity date could not be deterministically extracted from the text layer.",
        document_id=doc_id,
        document_name=target_doc.get("originalFilename"),
        recommendation="Human officer must visually inspect the certificate validity period and official fire officer signature/seal.",
        is_common_check=True,
        aph_chapter="Chapter VI",
        aph_annexure="Annexure-3",
    )


def check_occupancy_certificate(app_data: Dict[str, Any], extracted_docs: Dict[str, Dict[str, Any]]) -> RuleFinding:
    """
    Check Building Occupancy / Completion Certificate.
    AICTE APH 2024-27 Chapter VI Clause 6.17.g, Annexure-2 Section 2.1.iii & Annexure-3 Clause 3.1.c (Pages 57, 81, 86).
    """
    rule_id = "EOA-ANNEX3-OCCUPANCY-CERT"
    rule_name = "Building Occupancy / Completion Certificate"
    aph_clause = "AICTE APH 2024-27 Chapter VI Clause 6.17.g & Annexure-2 Section 2.1.iii (Pages 57, 81)"

    docs = app_data.get("documents", [])
    target_doc = find_document_by_type_or_keywords(docs, ["occupancy", "completion", "building_license", "form_d", "occupancy_certificate"])

    if not target_doc:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="DEFICIENT",
            aph_clause=aph_clause,
            evidence="No document record for mandatory Building Occupancy / Completion Certificate has been uploaded among submitted documents.",
            recommendation="Submit Occupancy / Building Completion Certificate issued by the competent municipal/local authority as mandated by APH Clause 6.17.g.",
            is_common_check=True,
            aph_chapter="Chapter VI",
            aph_annexure="Annexure-3",
        )

    doc_id = target_doc.get("id")

    # State 2: Document record exists in metadata, but physical file is unavailable
    if doc_id not in extracted_docs or extracted_docs[doc_id].get("unavailable"):
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="TECHNICAL_ERROR",
            aph_clause=aph_clause,
            evidence=f"Document metadata record for '{target_doc.get('originalFilename')}' ({target_doc.get('documentType')}) exists, but the physical file is unavailable on server storage for inspection.",
            document_id=doc_id,
            document_name=target_doc.get("originalFilename"),
            recommendation="Technical verification required: Scrutiny officer must verify document file storage and request applicant to re-upload if file is missing.",
            is_common_check=True,
            aph_chapter="Chapter VI",
            aph_annexure="Annexure-3",
        )

    extracted = extracted_docs.get(doc_id, {})
    full_text = extracted.get("full_text", "")
    is_scanned = extracted.get("is_scanned", False)

    # State 3: File exists but is unreadable (scanned image or empty text layer)
    if is_scanned or len(full_text.strip()) < 50:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="NEEDS_HUMAN_REVIEW",
            aph_clause=aph_clause,
            evidence=f"Occupancy Certificate document '{target_doc.get('originalFilename')}' is uploaded and available, but appears to be a scanned image without an embedded digital text layer. Automated clearance cannot be verified.",
            document_id=doc_id,
            document_name=target_doc.get("originalFilename"),
            recommendation="Scrutiny Committee officer must visually verify the building completion details and municipal authority seal.",
            is_common_check=True,
            aph_chapter="Chapter VI",
            aph_annexure="Annexure-3",
        )

    clearance_pattern = re.compile(
        r"\b(?:occupancy\s+certificate|building\s+completion\s+certificate|certificate\s+of\s+occupancy|permission\s+to\s+occupy|fit\s+for\s+occupation|completion\s+cum\s+occupancy|form\s+d)\b",
        re.IGNORECASE,
    )
    authority_pattern = re.compile(
        r"\b(?:municipal\s+corporation|town\s+planning|development\s+authority|gram\s+panchayat|collector\s+office|competent\s+local\s+authority|pwd)\b",
        re.IGNORECASE,
    )

    has_clearance = bool(clearance_pattern.search(full_text))
    has_authority = bool(authority_pattern.search(full_text))

    if has_clearance and has_authority:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="COMPLIANT",
            aph_clause=aph_clause,
            evidence=f"Document '{target_doc.get('originalFilename')}' confirms building occupancy clearance and identifies competent local planning authority.",
            document_id=doc_id,
            document_name=target_doc.get("originalFilename"),
            recommendation="Occupancy certificate clearance patterns confirmed. Advisory note: Human scrutiny officer must verify building survey numbers, total constructed area, and municipal official signature.",
            is_common_check=True,
            aph_chapter="Chapter VI",
            aph_annexure="Annexure-3",
        )

    return RuleFinding(
        rule_id=rule_id,
        rule_name=rule_name,
        status="NEEDS_HUMAN_REVIEW",
        aph_clause=aph_clause,
        evidence=f"Document '{target_doc.get('originalFilename')}' does not contain explicit building occupancy clearance phrases and competent issuing municipal authority details.",
        document_id=doc_id,
        document_name=target_doc.get("originalFilename"),
        recommendation="Human officer must inspect the physical/scanned occupancy certificate and issuing municipal seal.",
        is_common_check=True,
        aph_chapter="Chapter VI",
        aph_annexure="Annexure-3",
    )


def check_land_and_fsi(app_data: Dict[str, Any], extracted_docs: Dict[str, Dict[str, Any]]) -> RuleFinding:
    """
    Check Land and FSI/FAR Norms.
    AICTE APH 2024-27 Chapter VI Clause 6.17 & Annexure-3 Clause 3.1 (Pages 56, 86).
    Under APH 2024-27, uniform acreage requirements were replaced by local FSI/FAR norms.
    """
    rule_id = "EOA-ANNEX3-LAND-FSI"
    rule_name = "Land and Floor Space Index (FSI/FAR) Compliance"
    aph_clause = "AICTE APH 2024-27 Chapter VI Clause 6.17 & Annexure-3 Clause 3.1 (Pages 56, 86)"

    form_data = app_data.get("formData") or {}
    land_area = form_data.get("land_area") or form_data.get("total_land_area") or form_data.get("campus_area") or "Declared in portal"

    return RuleFinding(
        rule_id=rule_id,
        rule_name=rule_name,
        status="NEEDS_HUMAN_REVIEW",
        aph_clause=aph_clause,
        evidence=f"Declared land/campus area: {land_area}. Under APH 2024-27 Clause 3.1, uniform land acreage requirements were replaced by prevailing local authority FSI/FAR norms.",
        recommendation="Scrutiny Committee officer must verify whether the constructed built-up area complies with the competent local municipal FSI/FAR limits and approved building plan.",
        is_common_check=True,
        aph_chapter="Chapter VI",
        aph_annexure="Annexure-3",
    )


def check_faculty_student_ratio(app_data: Dict[str, Any], extracted_docs: Dict[str, Dict[str, Any]] = None) -> RuleFinding:
    """
    Check Faculty-Student Ratio (FSR) & Cadre Norms.
    AICTE APH 2024-27 Chapter VI Clause 6.14, 6.15 & Annexure-5 Clause 5.1/5.2/5.3 (Pages 55, 95, 96):
    Total Student Strength S = Annual Intake x Programme Duration in Years (N).
    UG Engineering: N = 4 years, FSR = 1:20.
    Diploma: N = 3 years, FSR = 1:25.
    PG Engineering / MBA / MCA: N = 2 years, FSR = 1:20.
    """
    rule_id = "EOA-ANNEX5-FSR"
    rule_name = "Faculty-Student Ratio and Cadre Norms"
    aph_clause = "AICTE APH 2024-27 Chapter VI Clause 6.14 & Annexure-5 (Pages 55, 95)"

    form_data = app_data.get("formData") or {}
    field_values = {fv.get("fieldDefinitionId"): fv.get("value") for fv in app_data.get("fieldValues", [])}

    # 1. Extract intake
    intake = (
        form_data.get("requested_intake")
        or form_data.get("approved_intake")
        or form_data.get("existing_intake")
        or form_data.get("total_intake")
        or form_data.get("current_approved_intake")
    )
    if not intake:
        for f_id, val in field_values.items():
            if "intake" in str(f_id).lower() and str(val).isdigit():
                intake = int(val)
                break

    # 2. Extract faculty count
    faculty_count = (
        form_data.get("total_faculty")
        or form_data.get("faculty_count")
        or form_data.get("faculty_strength")
    )
    if not faculty_count:
        for f_id, val in field_values.items():
            if "faculty" in str(f_id).lower() and str(val).isdigit():
                faculty_count = int(val)
                break

    # 3. Determine program duration and statutory ratio
    duration_years: Optional[int] = None
    statutory_ratio = 20.0

    raw_duration = form_data.get("duration_years") or form_data.get("programme_duration")
    if raw_duration and str(raw_duration).isdigit():
        duration_years = int(raw_duration)

    course_level = str(form_data.get("course_level") or form_data.get("level") or "").upper()
    programme = str(form_data.get("programme") or form_data.get("discipline") or "").upper()
    app_category = str(app_data.get("applicationCategory") or "").upper()

    if not duration_years:
        if "DIPLOMA" in course_level or "DIPLOMA" in programme or "DIPLOMA" in app_category:
            duration_years = 3
            statutory_ratio = 25.0
        elif "UG" in course_level or "UNDERGRADUATE" in course_level or "BACHELOR" in course_level or "B.TECH" in programme:
            duration_years = 4
            statutory_ratio = 20.0
        elif "PG" in course_level or "POSTGRADUATE" in course_level or "MASTER" in course_level or "MBA" in programme or "MCA" in programme or "M.TECH" in programme:
            duration_years = 2
            statutory_ratio = 20.0

    # If duration, intake, or faculty count cannot be established unambiguously
    if not duration_years or not intake or not faculty_count:
        missing_inputs = []
        if not intake:
            missing_inputs.append("Approved Annual Intake")
        if not duration_years:
            missing_inputs.append("Programme Duration / Level (UG/PG/Diploma)")
        if not faculty_count:
            missing_inputs.append("Declared Total Faculty Count")

        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="NEEDS_HUMAN_REVIEW",
            aph_clause=aph_clause,
            evidence=f"Structured application data lacks verified inputs: {', '.join(missing_inputs)}. Multi-year total student enrollment cannot be calculated deterministically.",
            recommendation="Human Scrutiny officer must cross-reference the approved faculty list with the statutory cadre requirement (1:2:6 cadre ratio) and calculate multi-year FSR manually.",
            is_common_check=True,
            aph_chapter="Chapter VI",
            aph_annexure="Annexure-5",
        )

    try:
        intake_val = int(intake)
        fac_val = int(faculty_count)

        if intake_val <= 0 or fac_val <= 0:
            return RuleFinding(
                rule_id=rule_id,
                rule_name=rule_name,
                status="NEEDS_HUMAN_REVIEW",
                aph_clause=aph_clause,
                evidence=f"Intake ({intake_val}) or faculty count ({fac_val}) declared as zero or non-positive.",
                recommendation="Scrutiny officer must verify actual enrollment and faculty appointments.",
                is_common_check=True,
                aph_chapter="Chapter VI",
                aph_annexure="Annexure-5",
            )

        total_students = intake_val * duration_years
        computed_ratio = total_students / fac_val
        min_required_faculty = math.ceil(total_students / statutory_ratio)

        if computed_ratio <= statutory_ratio:
            return RuleFinding(
                rule_id=rule_id,
                rule_name=rule_name,
                status="COMPLIANT",
                aph_clause=aph_clause,
                evidence=(
                    f"Annual Intake: {intake_val}, Duration: {duration_years} years (Total Student Enrollment S = {total_students}). "
                    f"Declared Faculty F = {fac_val}. Computed multi-year FSR is 1:{computed_ratio:.1f} (Statutory Norm: 1:{int(statutory_ratio)})."
                ),
                recommendation="Total faculty count satisfies multi-year statutory FSR norm. Advisory note: Scrutiny Committee must verify cadre ratio of 1 Professor : 2 Associate Professors : 6 Assistant Professors.",
                is_common_check=True,
                aph_chapter="Chapter VI",
                aph_annexure="Annexure-5",
            )
        else:
            return RuleFinding(
                rule_id=rule_id,
                rule_name=rule_name,
                status="DEFICIENT",
                aph_clause=aph_clause,
                evidence=(
                    f"Annual Intake: {intake_val}, Duration: {duration_years} years (Total Student Enrollment S = {total_students}). "
                    f"Declared Faculty F = {fac_val}. Computed multi-year FSR is 1:{computed_ratio:.1f}, which breaches the statutory maximum norm of 1:{int(statutory_ratio)}. "
                    f"Minimum required faculty count for {total_students} students is {min_required_faculty}."
                ),
                recommendation=f"Deficiency in faculty strength. Institution requires minimum {min_required_faculty} qualified faculty members to satisfy the 1:{int(statutory_ratio)} ratio mandated by Annexure-5.",
                is_common_check=True,
                aph_chapter="Chapter VI",
                aph_annexure="Annexure-5",
            )

    except Exception as e:
        return RuleFinding(
            rule_id=rule_id,
            rule_name=rule_name,
            status="NEEDS_HUMAN_REVIEW",
            aph_clause=aph_clause,
            evidence=f"Calculation error during FSR evaluation: {str(e)}",
            recommendation="Scrutiny officer must calculate FSR manually from certified institutional payroll rosters.",
            is_common_check=True,
            aph_chapter="Chapter VI",
            aph_annexure="Annexure-5",
        )
