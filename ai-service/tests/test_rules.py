import pytest
from datetime import datetime, timedelta, timezone
from rules.eoa_rules import (
    check_affidavit_2,
    check_fire_safety_noc,
    check_occupancy_certificate,
    check_land_and_fsi,
    check_faculty_student_ratio,
)
from rules.engine import rule_engine

# --- Affidavit 2 Tests ---

def test_affidavit_2_missing():
    app_data = {"documents": []}
    finding = check_affidavit_2(app_data, {})
    assert finding.status == "DEFICIENT"
    assert "not found" in finding.evidence

def test_affidavit_2_scanned():
    app_data = {"documents": [{"id": "d1", "documentType": "affidavit_2", "originalFilename": "affidavit.pdf"}]}
    extracted = {"d1": {"full_text": "", "is_scanned": True}}
    finding = check_affidavit_2(app_data, extracted)
    assert finding.status == "NEEDS_HUMAN_REVIEW"
    assert "scanned image" in finding.evidence

def test_affidavit_2_broad_number_false_positive_avoided():
    """Text mentioning '100' in unrelated context (page 100, pin code) must NOT pass as compliant."""
    app_data = {"documents": [{"id": "d1", "documentType": "affidavit_2", "originalFilename": "affidavit.pdf"}]}
    extracted = {
        "d1": {
            "full_text": "AICTE Application Form. Page 100 of 120. Pin code 411100. Submitted by Secretary.",
            "is_scanned": False,
        }
    }
    finding = check_affidavit_2(app_data, extracted)
    assert finding.status == "NEEDS_HUMAN_REVIEW"
    assert "Rs. 100 Non-Judicial Stamp Paper" in finding.evidence

def test_affidavit_2_compliant():
    app_data = {"documents": [{"id": "d1", "documentType": "affidavit_2", "originalFilename": "affidavit.pdf"}]}
    extracted = {
        "d1": {
            "full_text": (
                "Certificate of E-Stamp of Value of Rs. 100. Non-Judicial Stamp Paper. "
                "I, Dr. Sharma, Secretary, do hereby solemnly affirm and state on oath before "
                "All India Council for Technical Education (AICTE) as per Approval Process Handbook..."
            ),
            "is_scanned": False,
        }
    }
    finding = check_affidavit_2(app_data, extracted)
    assert finding.status == "COMPLIANT"
    assert "verified text patterns" in finding.evidence

# --- Fire Safety NOC Tests ---

def test_fire_noc_missing():
    app_data = {"documents": []}
    finding = check_fire_safety_noc(app_data, {})
    assert finding.status == "DEFICIENT"

def test_fire_noc_irrelevant_document_rejected():
    """Invoice or manual mentioning fire alarms without competent fire services authority must NOT pass."""
    app_data = {"documents": [{"id": "d2", "documentType": "fire_noc", "originalFilename": "fire_extinguisher_bill.pdf"}]}
    extracted = {
        "d2": {
            "full_text": "Invoice for supply of ABC dry powder fire extinguishers and safety signage to campus.",
            "is_scanned": False,
        }
    }
    finding = check_fire_safety_noc(app_data, extracted)
    assert finding.status == "NEEDS_HUMAN_REVIEW"
    assert "does not identify issuance by a competent" in finding.evidence

def test_fire_noc_metadata_expired():
    expired_date = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
    app_data = {"documents": [{"id": "d2", "documentType": "fire_noc", "originalFilename": "fire.pdf", "expiryDate": expired_date}]}
    extracted = {"d2": {"full_text": "Fire Services Department NOC valid", "is_scanned": False}}
    finding = check_fire_safety_noc(app_data, extracted)
    assert finding.status == "DEFICIENT"
    assert "expired" in finding.evidence

def test_fire_noc_text_date_expired():
    app_data = {"documents": [{"id": "d2", "documentType": "fire_noc", "originalFilename": "fire.pdf"}]}
    extracted = {
        "d2": {
            "full_text": (
                "Office of the Chief Fire Officer, Fire & Emergency Services Department. "
                "No Objection Certificate. Valid up to 01/01/2020. Satisfactory inspection."
            ),
            "is_scanned": False,
        }
    }
    finding = check_fire_safety_noc(app_data, extracted)
    assert finding.status == "DEFICIENT"
    assert "expired on 2020-01-01" in finding.evidence

def test_fire_noc_missing_validity_date_needs_human_review():
    app_data = {"documents": [{"id": "d2", "documentType": "fire_noc", "originalFilename": "fire.pdf"}]}
    extracted = {
        "d2": {
            "full_text": "Government Fire & Emergency Services Directorate. Provisional clearance issued.",
            "is_scanned": False,
        }
    }
    finding = check_fire_safety_noc(app_data, extracted)
    assert finding.status == "NEEDS_HUMAN_REVIEW"
    assert "unexpired validity date could not be deterministically extracted" in finding.evidence

def test_fire_noc_compliant_with_future_date():
    future_date = (datetime.now(timezone.utc) + timedelta(days=365)).strftime("%d/%m/%Y")
    app_data = {"documents": [{"id": "d2", "documentType": "fire_noc", "originalFilename": "fire.pdf"}]}
    extracted = {
        "d2": {
            "full_text": (
                "Directorate of Fire and Emergency Services. Fire Safety Clearance Certificate. "
                f"Inspected and found compliant. Valid up to: {future_date}."
            ),
            "is_scanned": False,
        }
    }
    finding = check_fire_safety_noc(app_data, extracted)
    assert finding.status == "COMPLIANT"

# --- Occupancy Certificate Tests ---

def test_occupancy_cert_missing():
    app_data = {"documents": []}
    finding = check_occupancy_certificate(app_data, {})
    assert finding.status == "DEFICIENT"

def test_occupancy_cert_incidental_mention_rejected():
    """Document mentioning corporation without building completion/occupancy clearance must NOT pass."""
    app_data = {"documents": [{"id": "d3", "documentType": "occupancy_cert", "originalFilename": "occupancy_notes.pdf"}]}
    extracted = {
        "d3": {
            "full_text": "Correspondence with Municipal Corporation regarding water pipeline connection.",
            "is_scanned": False,
        }
    }
    finding = check_occupancy_certificate(app_data, extracted)
    assert finding.status == "NEEDS_HUMAN_REVIEW"
    assert "does not contain explicit building occupancy clearance phrases" in finding.evidence

def test_occupancy_cert_compliant():
    app_data = {"documents": [{"id": "d3", "documentType": "occupancy_cert", "originalFilename": "occupancy.pdf"}]}
    extracted = {
        "d3": {
            "full_text": (
                "City Municipal Corporation, Town Planning Department. "
                "Certificate of Occupancy. Permission to occupy institutional building granted."
            ),
            "is_scanned": False,
        }
    }
    finding = check_occupancy_certificate(app_data, extracted)
    assert finding.status == "COMPLIANT"

# --- Land & FSI Tests ---

def test_land_and_fsi_advisory_review():
    app_data = {"formData": {"land_area": "4.5 Acres"}}
    finding = check_land_and_fsi(app_data, {})
    assert finding.status == "NEEDS_HUMAN_REVIEW"
    assert "FSI/FAR" in finding.evidence

# --- Faculty-Student Ratio (FSR) Multi-Year Tests ---

def test_fsr_ug_engineering_multi_year_deficient():
    """
    Annual intake: 180, Duration: 4 years -> Total students: 720.
    Faculty: 10. Actual ratio: 72:1 (Severe violation of 1:20 norm).
    The old single-year calculation (180/10=18.0) falsely marked this compliant!
    The new multi-year calculation MUST flag this as DEFICIENT.
    """
    app_data = {
        "formData": {
            "requested_intake": 180,
            "duration_years": 4,
            "course_level": "UG",
            "total_faculty": 10,
        }
    }
    finding = check_faculty_student_ratio(app_data)
    assert finding.status == "DEFICIENT"
    assert "breaches the statutory maximum" in finding.evidence
    assert "Minimum required faculty count for 720 students is 36" in finding.evidence

def test_fsr_ug_engineering_multi_year_compliant():
    """
    Annual intake: 60, Duration: 4 years -> Total students: 240.
    Faculty: 12. Ratio: 240 / 12 = 20:1 -> COMPLIANT.
    """
    app_data = {
        "formData": {
            "requested_intake": 60,
            "duration_years": 4,
            "course_level": "UG",
            "total_faculty": 12,
        }
    }
    finding = check_faculty_student_ratio(app_data)
    assert finding.status == "COMPLIANT"
    assert "1:20.0" in finding.evidence

def test_fsr_diploma_multi_year_compliant():
    """
    Diploma: 3 years, Norm: 1:25.
    Annual intake: 100, Total students: 300.
    Faculty: 12. Ratio: 300 / 12 = 25:1 -> COMPLIANT.
    """
    app_data = {
        "formData": {
            "requested_intake": 100,
            "course_level": "Diploma",
            "total_faculty": 12,
        }
    }
    finding = check_faculty_student_ratio(app_data)
    assert finding.status == "COMPLIANT"
    assert "1:25.0" in finding.evidence

def test_fsr_pg_mba_multi_year_compliant():
    """
    PG / MBA: 2 years, Norm: 1:20.
    Annual intake: 60, Total students: 120.
    Faculty: 6. Ratio: 120 / 6 = 20:1 -> COMPLIANT.
    """
    app_data = {
        "formData": {
            "requested_intake": 60,
            "course_level": "PG",
            "programme": "Management (MBA)",
            "total_faculty": 6,
        }
    }
    finding = check_faculty_student_ratio(app_data)
    assert finding.status == "COMPLIANT"
    assert "1:20.0" in finding.evidence

def test_fsr_missing_inputs_needs_human_review():
    """If programme duration, level, or faculty count cannot be determined, must return NEEDS_HUMAN_REVIEW."""
    app_data = {
        "formData": {
            "requested_intake": 120,
            # Missing duration, level, and faculty count
        }
    }
    finding = check_faculty_student_ratio(app_data)
    assert finding.status == "NEEDS_HUMAN_REVIEW"
    assert "lacks verified inputs" in finding.evidence
