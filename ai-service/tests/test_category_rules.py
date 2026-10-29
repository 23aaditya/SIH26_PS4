import pytest
import hashlib
from rules.base import normalize_category, CANONICAL_APPLICATION_TYPES
from rules.registry import get_applicable_rules, RULE_CATALOG
from rules.engine import rule_engine

# ==============================================================================
# Phase 7 — Comprehensive Category Applicability Matrix Test Suite
# ==============================================================================

ALL_16_CATEGORIES = [
    "extension_of_approval",
    "increase_intake",
    "additional_course",
    "new_programme",
    "change_of_site",
    "change_of_name",
    "change_of_affiliating_university",
    "reduction_in_intake",
    "closure_of_course",
    "closure_of_institution",
    "merger_of_institutions",
    "merger_of_courses",
    "conversion_of_institution_type",
    "nri_supernumerary_seats",
    "collaboration_twinning",
    "other",
]

def test_all_16_canonical_categories_defined():
    """Verify all 16 canonical types exist in registry definitions."""
    for cat in ALL_16_CATEGORIES:
        assert cat in CANONICAL_APPLICATION_TYPES, f"Missing canonical type: {cat}"


def test_category_normalization_aliases():
    """Verify normalization handles UI display labels, uppercase, and aliases."""
    test_cases = [
        ({"applicationCategory": "Extension of Approval — EoA"}, "extension_of_approval"),
        ({"applicationCategory": "Extension of Approval"}, "extension_of_approval"),
        ({"applicationType": {"code": "extension_of_approval"}}, "extension_of_approval"),
        ({"applicationCategory": "Increase in Intake"}, "increase_intake"),
        ({"category": "Intake Variation"}, "increase_intake"),
        ({"applicationCategory": "Additional Course"}, "additional_course"),
        ({"category": "New Course"}, "additional_course"),
        ({"applicationCategory": "New Programme / Level"}, "new_programme"),
        ({"applicationCategory": "Change of Site / Location"}, "change_of_site"),
        ({"category": "Campus Relocation"}, "change_of_site"),
        ({"applicationCategory": "Change of Institution Name"}, "change_of_name"),
        ({"applicationCategory": "Change of Affiliating University / Board"}, "change_of_affiliating_university"),
        ({"applicationCategory": "Reduction in Intake"}, "reduction_in_intake"),
        ({"applicationCategory": "Closure of Course / Programme"}, "closure_of_course"),
        ({"applicationCategory": "Closure of Institution"}, "closure_of_institution"),
        ({"category": "Closure"}, "closure_of_institution"),
        ({"applicationCategory": "Merger of Institutions"}, "merger_of_institutions"),
        ({"applicationCategory": "Merger of Courses"}, "merger_of_courses"),
        ({"applicationCategory": "Conversion of Institution Type"}, "conversion_of_institution_type"),
        ({"applicationCategory": "NRI / Supernumerary Seat Allocation"}, "nri_supernumerary_seats"),
        ({"category": "Quota & Seats"}, "nri_supernumerary_seats"),
        ({"applicationCategory": "Collaboration / Twinning Programme"}, "collaboration_twinning"),
        ({"category": "International"}, "collaboration_twinning"),
        ({"applicationCategory": "Other Statutory AICTE Application"}, "other"),
        ({"category": "Statutory Petitions"}, "other"),
    ]

    for app_data, expected_code in test_cases:
        code, label, is_supported = normalize_category(app_data)
        assert code == expected_code, f"Failed for {app_data}: got {code}, expected {expected_code}"
        assert is_supported is True


def test_unknown_category_fails_safely():
    """Unknown categories must fail safely and request human review rather than defaulting to EoA."""
    app_data = {"applicationCategory": "NonExistentSpecialApplicationCategoryXYZ"}
    code, label, is_supported = normalize_category(app_data)
    assert code == "unknown"
    assert is_supported is False

    rules = get_applicable_rules(code, app_data)
    rule_ids = [r.rule_id for r in rules]
    assert "UNKNOWN-CATEGORY-SCRUTINY" in rule_ids
    assert "EOA-ANNEX2-AFFIDAVIT2" not in rule_ids

    result = rule_engine.evaluate_application(app_data, {})
    assert result.outcome == "NEEDS_HUMAN_REVIEW"
    assert result.unsupported_category is True
    assert any("not mapped" in f.evidence for f in result.findings)


# ==============================================================================
# Category-Specific Rule Selection Verification
# ==============================================================================

def test_eoa_rule_selection():
    """EoA must select the standard 5 statutory baseline checks."""
    app_data = {"applicationCategory": "Extension of Approval"}
    rules = get_applicable_rules("extension_of_approval", app_data)
    rule_ids = [r.rule_id for r in rules]

    assert "EOA-ANNEX2-AFFIDAVIT2" in rule_ids
    assert "EOA-ANNEX3-FIRE-NOC" in rule_ids
    assert "EOA-ANNEX3-OCCUPANCY-CERT" in rule_ids
    assert "EOA-ANNEX3-LAND-FSI" in rule_ids
    assert "EOA-ANNEX5-FSR" in rule_ids
    # Must NOT contain category rules belonging to other categories
    assert "INTAKE-AFFIDAVIT8" not in rule_ids
    assert "CLINST-AFFIDAVIT4" not in rule_ids
    assert "TWIN-AFFIDAVIT11" not in rule_ids


def test_increase_intake_rule_selection():
    """Increase in Intake must select Affidavit-8, Format-3, Core Branches, Fire, Occupancy, FSR, and EVC."""
    app_data = {"applicationCategory": "Increase in Intake"}
    rules = get_applicable_rules("increase_intake", app_data)
    rule_ids = [r.rule_id for r in rules]

    assert "INTAKE-AFFIDAVIT8" in rule_ids
    assert "INTAKE-RESOLUTION-F3" in rule_ids
    assert "INTAKE-CORE-BRANCHES" in rule_ids
    assert "EOA-ANNEX3-FIRE-NOC" in rule_ids
    assert "EOA-ANNEX3-OCCUPANCY-CERT" in rule_ids
    assert "EOA-ANNEX5-FSR" in rule_ids
    assert "INTAKE-EVC-MANDATE" in rule_ids
    # Must NOT require Affidavit 2 or Affidavit 4
    assert "EOA-ANNEX2-AFFIDAVIT2" not in rule_ids
    assert "CLINST-AFFIDAVIT4" not in rule_ids


def test_closure_of_institution_rule_selection():
    """Closure must select Affidavit 4, University NOC with student transfer, Resolution, Salary Dues."""
    app_data = {"applicationCategory": "Closure of Institution"}
    rules = get_applicable_rules("closure_of_institution", app_data)
    rule_ids = [r.rule_id for r in rules]

    assert "CLINST-AFFIDAVIT4" in rule_ids
    assert "CLINST-UNIV-NOC-F2" in rule_ids
    assert "INTAKE-RESOLUTION-F3" in rule_ids
    assert "CLINST-SALARY-DUES" in rule_ids
    # Crucial: Affidavit-2, Fire Safety NOC, Land FSI, FSR are NOT required for closing an institution!
    assert "EOA-ANNEX2-AFFIDAVIT2" not in rule_ids
    assert "EOA-ANNEX3-FIRE-NOC" not in rule_ids
    assert "EOA-ANNEX3-LAND-FSI" not in rule_ids


def test_collaboration_twinning_rule_selection():
    """Collaboration & Twinning must select Affidavit-11, Bipartite MoU, Credit Cap, EVC."""
    app_data = {"applicationCategory": "Collaboration / Twinning Programme"}
    rules = get_applicable_rules("collaboration_twinning", app_data)
    rule_ids = [r.rule_id for r in rules]

    assert "TWIN-AFFIDAVIT11" in rule_ids
    assert "TWIN-BIPARTITE-MOU" in rule_ids
    assert "TWIN-CREDIT-CAP" in rule_ids
    assert "INTAKE-EVC-MANDATE" in rule_ids
    assert "EOA-ANNEX2-AFFIDAVIT2" not in rule_ids
    assert "EOA-ANNEX3-FIRE-NOC" not in rule_ids


def test_change_of_site_rule_selection():
    """Change of site must select Annexure-1 docs, University NOC, Resolution, Vacation Shift, Fire, Occupancy, EVC."""
    app_data = {"applicationCategory": "Change of Site / Location"}
    rules = get_applicable_rules("change_of_site", app_data)
    rule_ids = [r.rule_id for r in rules]

    assert "SITE-ANNEX1-LAND-DOCS" in rule_ids
    assert "SITE-UNIV-NOC-F2" in rule_ids
    assert "INTAKE-RESOLUTION-F3" in rule_ids
    assert "SITE-VACATION-SHIFT" in rule_ids
    assert "EOA-ANNEX3-FIRE-NOC" in rule_ids
    assert "EOA-ANNEX3-OCCUPANCY-CERT" in rule_ids
    assert "INTAKE-EVC-MANDATE" in rule_ids


def test_change_of_name_rule_selection():
    """Change of name must check prohibited terms and resolution, but NOT fire safety or occupancy."""
    app_data = {"applicationCategory": "Change of Institution Name"}
    rules = get_applicable_rules("change_of_name", app_data)
    rule_ids = [r.rule_id for r in rules]

    assert "NAME-PROHIBITED-TERMS" in rule_ids
    assert "INTAKE-RESOLUTION-F3" in rule_ids
    assert "EOA-ANNEX3-FIRE-NOC" not in rule_ids
    assert "EOA-ANNEX3-OCCUPANCY-CERT" not in rule_ids
    assert "INTAKE-EVC-MANDATE" not in rule_ids


def test_nri_seats_rule_selection():
    """NRI Supernumerary seats must check resolution, 80% enrollment threshold, and seat ceilings."""
    app_data = {"applicationCategory": "NRI / Supernumerary Seat Allocation"}
    rules = get_applicable_rules("nri_supernumerary_seats", app_data)
    rule_ids = [r.rule_id for r in rules]

    assert "INTAKE-RESOLUTION-F3" in rule_ids
    assert "NRI-ENROLLMENT-THRESHOLD" in rule_ids
    assert "NRI-CEILING-LIMITS" in rule_ids


# ==============================================================================
# Functional Evaluation Scenarios
# ==============================================================================

def test_increase_intake_compliant_scenario():
    """Increase in intake with valid Affidavit 8, Resolution, Core Branches, Fire, Occupancy, and FSR."""
    app_data = {
        "id": "app-increase-01",
        "applicationNumber": "AICTE-2026-INT-001",
        "applicationCategory": "Increase in Intake",
        "formData": {
            "current_approved_programmes": "B.Tech Computer Science and Engineering, B.Tech Civil Engineering, B.Tech Mechanical Engineering, B.Tech Electrical Engineering",
            "approved_intake": 120,
            "faculty_strength": 30,
            "duration_years": 4,
            "course_level": "UG",
        },
        "documents": [
            {"id": "d1", "documentType": "affidavit_8", "originalFilename": "Affidavit_8_Intake.pdf"},
            {"id": "d2", "documentType": "resolution", "originalFilename": "Trust_Resolution_F3.pdf"},
            {"id": "d3", "documentType": "fire_noc", "originalFilename": "Fire_Safety_NOC.pdf"},
            {"id": "d4", "documentType": "occupancy", "originalFilename": "Occupancy_Certificate.pdf"},
        ],
    }

    extracted_docs = {
        "d1": {
            "full_text": "Non-Judicial Stamp Paper Rs. 100. Affidavit 8. Solemnly affirm for Increase in Intake and additional facilities.",
            "is_scanned": False,
        },
        "d2": {
            "full_text": "Executive Meeting of Society. Resolved that intake be increased and funds allocated as per Format 3.",
            "is_scanned": False,
        },
        "d3": {
            "full_text": "Fire & Emergency Services Department. Valid up to 31/12/2028. No Objection Certificate.",
            "is_scanned": False,
        },
        "d4": {
            "full_text": "Municipal Corporation Town Planning. Building Occupancy Certificate fit for educational occupation.",
            "is_scanned": False,
        },
    }

    result = rule_engine.evaluate_application(app_data, extracted_docs)
    assert result.category == "increase_intake"

    findings_by_id = {f.rule_id: f for f in result.findings}
    assert findings_by_id["INTAKE-AFFIDAVIT8"].status == "COMPLIANT"
    assert findings_by_id["INTAKE-RESOLUTION-F3"].status == "COMPLIANT"
    assert findings_by_id["INTAKE-CORE-BRANCHES"].status == "COMPLIANT"
    assert findings_by_id["EOA-ANNEX3-FIRE-NOC"].status == "COMPLIANT"
    assert findings_by_id["EOA-ANNEX3-OCCUPANCY-CERT"].status == "COMPLIANT"
    assert findings_by_id["EOA-ANNEX5-FSR"].status == "COMPLIANT"
    assert findings_by_id["INTAKE-EVC-MANDATE"].status == "NEEDS_HUMAN_REVIEW"

    # Outcome should be NEEDS_HUMAN_REVIEW because EVC is required before grant
    assert result.outcome == "NEEDS_HUMAN_REVIEW"


def test_increase_intake_deficient_core_branches():
    """Increase in intake fails if institution does NOT have 3 core branches."""
    app_data = {
        "id": "app-increase-fail-core",
        "applicationNumber": "AICTE-2026-INT-002",
        "applicationCategory": "Increase in Intake",
        "formData": {
            "current_approved_programmes": "B.Tech Computer Science and Engineering",  # Only 1 branch!
            "approved_intake": 120,
            "faculty_strength": 24,
            "duration_years": 4,
            "course_level": "UG",
        },
        "documents": [],
    }

    result = rule_engine.evaluate_application(app_data, {})
    findings_by_id = {f.rule_id: f for f in result.findings}

    # Breaches Clause 2.6.c
    assert findings_by_id["INTAKE-CORE-BRANCHES"].status == "DEFICIENT"
    assert "Clause 2.6.c" in findings_by_id["INTAKE-CORE-BRANCHES"].aph_clause
    assert result.outcome == "DEFICIENCY_SUGGESTED"


def test_closure_of_institution_compliant_scenario():
    """Closure with valid Affidavit 4, University NOC, Resolution, and Salary clearance."""
    app_data = {
        "id": "app-closure-01",
        "applicationNumber": "AICTE-2026-CLOS-001",
        "applicationCategory": "Closure of Institution",
        "documents": [
            {"id": "d1", "documentType": "affidavit_4", "originalFilename": "Affidavit_4_Closure.pdf"},
            {"id": "d2", "documentType": "university_noc", "originalFilename": "University_NOC_Format2.pdf"},
            {"id": "d3", "documentType": "resolution", "originalFilename": "Trust_Resolution_Closure.pdf"},
            {"id": "d4", "documentType": "salary_sheet", "originalFilename": "Payroll_Clearance.pdf"},
        ],
    }

    extracted_docs = {
        "d1": {
            "full_text": "Rs. 100 Non-Judicial Stamp Paper. Affidavit 4. Progressive closure of the institution. No liability with respect to faculty, staff, or students.",
            "is_scanned": False,
        },
        "d2": {
            "full_text": "Format 2 Affiliating University No Objection Certificate. Re-arrangement of current students to nearby approved institutions confirmed.",
            "is_scanned": False,
        },
        "d3": {
            "full_text": "Governing Body Resolution in Format 3. Resolved that institution be closed progressively without liabilities.",
            "is_scanned": False,
        },
        "d4": {
            "full_text": "Salary disbursement registers. All faculty dues and PF remittances settled.",
            "is_scanned": False,
        },
    }

    result = rule_engine.evaluate_application(app_data, extracted_docs)
    assert result.category == "closure_of_institution"

    findings_by_id = {f.rule_id: f for f in result.findings}
    assert findings_by_id["CLINST-AFFIDAVIT4"].status == "COMPLIANT"
    assert findings_by_id["CLINST-UNIV-NOC-F2"].status == "COMPLIANT"
    assert findings_by_id["INTAKE-RESOLUTION-F3"].status == "COMPLIANT"
    assert findings_by_id["CLINST-SALARY-DUES"].status == "NEEDS_HUMAN_REVIEW"  # Officer must audit payroll records

    # Did NOT evaluate irrelevant Affidavit 2 or Fire safety NOC
    assert "EOA-ANNEX2-AFFIDAVIT2" not in findings_by_id
    assert "EOA-ANNEX3-FIRE-NOC" not in findings_by_id


def test_closure_missing_affidavit4_is_deficient():
    """Missing Affidavit-4 for Closure is DEFICIENT under Annexure-2 Section 2.7.vi."""
    app_data = {
        "id": "app-closure-missing-aff",
        "applicationNumber": "AICTE-2026-CLOS-002",
        "applicationCategory": "Closure of Institution",
        "documents": [],
    }

    result = rule_engine.evaluate_application(app_data, {})
    findings_by_id = {f.rule_id: f for f in result.findings}

    assert findings_by_id["CLINST-AFFIDAVIT4"].status == "DEFICIENT"
    assert "Affidavit-4" in findings_by_id["CLINST-AFFIDAVIT4"].evidence


def test_collaboration_twinning_visa_fallback_check():
    """Twinning without visa fallback in Affidavit 11 requires human review or fails."""
    app_data = {
        "id": "app-twinning-01",
        "applicationNumber": "AICTE-2026-TWIN-001",
        "applicationCategory": "Collaboration / Twinning Programme",
        "formData": {
            "foreign_credits_percentage": 50,  # Breaches 40% cap!
        },
        "documents": [
            {"id": "d1", "documentType": "affidavit_11", "originalFilename": "Affidavit_11.pdf"},
            {"id": "d2", "documentType": "mou", "originalFilename": "Foreign_University_MoU.pdf"},
        ],
    }

    extracted_docs = {
        "d1": {
            "full_text": "Non-Judicial Stamp Paper Rs. 100. Solemnly declare collaboration with University of Melbourne.",  # Missing visa fallback clause
            "is_scanned": False,
        },
        "d2": {
            "full_text": "Executed bipartite agreement between Indian College and University of Melbourne.",
            "is_scanned": False,
        },
    }

    result = rule_engine.evaluate_application(app_data, extracted_docs)
    findings_by_id = {f.rule_id: f for f in result.findings}

    # Breaches 40% credit transfer cap
    assert findings_by_id["TWIN-CREDIT-CAP"].status == "DEFICIENT"
    assert "Clause 3.2.k" in findings_by_id["TWIN-CREDIT-CAP"].aph_clause
    assert result.outcome == "DEFICIENCY_SUGGESTED"


def test_change_of_name_prohibited_terms():
    """Institution proposing 'National Indian Institute of Technology' must fail under Clause 1.5.4."""
    app_data = {
        "id": "app-name-01",
        "applicationNumber": "AICTE-2026-NAME-001",
        "applicationCategory": "Change of Institution Name",
        "formData": {
            "proposed_institution_name": "National Indian Institute of Technology",
            "institution_type": "PRIVATE_UNAIDED",
        },
        "documents": [],
    }

    result = rule_engine.evaluate_application(app_data, {})
    findings_by_id = {f.rule_id: f for f in result.findings}

    assert findings_by_id["NAME-PROHIBITED-TERMS"].status == "DEFICIENT"
    assert "Emblems and Names Act" in findings_by_id["NAME-PROHIBITED-TERMS"].evidence


def test_category_change_changes_evaluated_rules():
    """Demonstrate that changing application category changes the evaluated rule set deterministically."""
    app_eoa = {"applicationCategory": "Extension of Approval"}
    app_close = {"applicationCategory": "Closure of Institution"}
    app_twin = {"applicationCategory": "Collaboration / Twinning Programme"}

    rules_eoa = [r.rule_id for r in get_applicable_rules("extension_of_approval", app_eoa)]
    rules_close = [r.rule_id for r in get_applicable_rules("closure_of_institution", app_close)]
    rules_twin = [r.rule_id for r in get_applicable_rules("collaboration_twinning", app_twin)]

    # Assert completely different, tailored sets
    assert "EOA-ANNEX2-AFFIDAVIT2" in rules_eoa
    assert "EOA-ANNEX2-AFFIDAVIT2" not in rules_close
    assert "EOA-ANNEX2-AFFIDAVIT2" not in rules_twin

    assert "CLINST-AFFIDAVIT4" in rules_close
    assert "CLINST-AFFIDAVIT4" not in rules_eoa
    assert "CLINST-AFFIDAVIT4" not in rules_twin

    assert "TWIN-AFFIDAVIT11" in rules_twin
    assert "TWIN-AFFIDAVIT11" not in rules_eoa
    assert "TWIN-AFFIDAVIT11" not in rules_close
