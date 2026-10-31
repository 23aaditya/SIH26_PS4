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


# ==============================================================================
# Phase 4.2 — Change of Affiliating University / Board (APH Section 2.11) Tests
# ==============================================================================

def test_change_of_affiliating_university_rule_selection():
    """
    Phase 4.2: Change of Affiliating University/Board must select Section 2.11 rules:
    - AFFIL-UNIV-NOC-F2 (NOC from affiliating University in Format 2)
    - AFFIL-RESOLUTION-F3 (Trust/Society Resolution in Format 3, Section 2.11)
    Must NOT select INTAKE-RESOLUTION-F3 (Section 2.6 — Increase in Intake rule).
    Must NOT select INTAKE-AFFIDAVIT8 or INTAKE-CORE-BRANCHES (intake-expansion rules).
    Must NOT select INTAKE-EVC-MANDATE, SITE-ANNEX1-LAND-DOCS, or CLINST-AFFIDAVIT4.
    """
    app_data = {"applicationCategory": "Change of Affiliating University / Board"}
    rules = get_applicable_rules("change_of_affiliating_university", app_data)
    rule_ids = [r.rule_id for r in rules]

    # Must include the two Section 2.11 rules
    assert "AFFIL-UNIV-NOC-F2" in rule_ids, "Missing NOC Format 2 rule for affiliation change"
    assert "AFFIL-RESOLUTION-F3" in rule_ids, "Missing Resolution Format 3 rule for affiliation change"

    # Must NOT include the Section 2.6 Intake/Additional Course resolution rule
    assert "INTAKE-RESOLUTION-F3" not in rule_ids, (
        "INTAKE-RESOLUTION-F3 (Section 2.6 — Increase in Intake) must NOT apply to "
        "Change of Affiliating University/Board"
    )

    # Must NOT include intake-expansion-specific rules
    assert "INTAKE-AFFIDAVIT8" not in rule_ids
    assert "INTAKE-CORE-BRANCHES" not in rule_ids
    assert "INTAKE-EVC-MANDATE" not in rule_ids

    # Must NOT include site-change or closure rules
    assert "SITE-ANNEX1-LAND-DOCS" not in rule_ids
    assert "CLINST-AFFIDAVIT4" not in rule_ids
    assert "CLINST-SALARY-DUES" not in rule_ids


def test_change_of_affiliating_university_uses_section_2_11_citation():
    """
    Phase 4.2: Verify both Section 2.11 rules carry the correct APH clause citation.
    Neither rule must reference Section 2.6 (Intake Expansion).
    """
    catalog = RULE_CATALOG

    noc_rule = catalog.get("AFFIL-UNIV-NOC-F2")
    assert noc_rule is not None, "AFFIL-UNIV-NOC-F2 not found in RULE_CATALOG"
    assert "2.11" in noc_rule.aph_clause, f"NOC rule must cite Section 2.11, got: {noc_rule.aph_clause}"
    assert "2.6" not in noc_rule.aph_clause, (
        f"NOC rule must NOT cite Section 2.6 (Increase in Intake), got: {noc_rule.aph_clause}"
    )

    res_rule = catalog.get("AFFIL-RESOLUTION-F3")
    assert res_rule is not None, "AFFIL-RESOLUTION-F3 not found in RULE_CATALOG"
    assert "2.11" in res_rule.aph_clause, f"Resolution rule must cite Section 2.11, got: {res_rule.aph_clause}"
    assert "2.6" not in res_rule.aph_clause, (
        f"Resolution rule must NOT cite Section 2.6 (Increase in Intake), got: {res_rule.aph_clause}"
    )


def test_increase_intake_retains_section_2_6_rules():
    """
    Phase 4.2 regression: Fixing affiliation-change rules must not affect Increase in Intake.
    Increase in Intake must still have its Section 2.6 rules (INTAKE-RESOLUTION-F3, INTAKE-AFFIDAVIT8).
    """
    app_data = {"applicationCategory": "Increase in Intake"}
    rules = get_applicable_rules("increase_intake", app_data)
    rule_ids = [r.rule_id for r in rules]

    # Section 2.6 rules must remain for Intake
    assert "INTAKE-RESOLUTION-F3" in rule_ids
    assert "INTAKE-AFFIDAVIT8" in rule_ids
    assert "INTAKE-CORE-BRANCHES" in rule_ids

    # Section 2.11 rules must NOT appear for Intake
    assert "AFFIL-UNIV-NOC-F2" not in rule_ids
    assert "AFFIL-RESOLUTION-F3" not in rule_ids

    # Verify Section 2.6 citation is preserved on the intake rule
    intake_res_rule = RULE_CATALOG.get("INTAKE-RESOLUTION-F3")
    assert "2.6" in intake_res_rule.aph_clause, (
        f"INTAKE-RESOLUTION-F3 must still cite Section 2.6, got: {intake_res_rule.aph_clause}"
    )


def test_additional_course_retains_section_2_6_rules():
    """
    Phase 4.2 regression: Additional Course must retain its Section 2.6 rules unchanged.
    """
    app_data = {"applicationCategory": "Additional Course"}
    rules = get_applicable_rules("additional_course", app_data)
    rule_ids = [r.rule_id for r in rules]

    assert "INTAKE-RESOLUTION-F3" in rule_ids
    assert "INTAKE-AFFIDAVIT8" in rule_ids
    assert "AFFIL-UNIV-NOC-F2" not in rule_ids
    assert "AFFIL-RESOLUTION-F3" not in rule_ids


def test_affiliation_change_deficient_when_no_documents():
    """
    Phase 4.2: Change of Affiliating University/Board with no documents must yield DEFICIENT
    for both Section 2.11 required documents, with correct APH 2.11 citation wording.
    """
    app_data = {
        "id": "app-affil-no-docs",
        "applicationNumber": "AICTE-2026-CHAN-001",
        "applicationCategory": "Change of Affiliating University / Board",
        "documents": [],
    }

    result = rule_engine.evaluate_application(app_data, {})
    assert result.category == "change_of_affiliating_university"

    findings_by_id = {f.rule_id: f for f in result.findings}

    # Both Section 2.11 documents are missing → DEFICIENT
    assert "AFFIL-UNIV-NOC-F2" in findings_by_id, "NOC rule must be evaluated"
    assert "AFFIL-RESOLUTION-F3" in findings_by_id, "Resolution rule must be evaluated"

    noc_finding = findings_by_id["AFFIL-UNIV-NOC-F2"]
    res_finding = findings_by_id["AFFIL-RESOLUTION-F3"]

    assert noc_finding.status == "DEFICIENT"
    assert res_finding.status == "DEFICIENT"

    # Citations must reference Section 2.11, NOT Section 2.6
    assert "2.11" in noc_finding.aph_clause, f"NOC finding must cite 2.11, got: {noc_finding.aph_clause}"
    assert "2.6" not in noc_finding.aph_clause, f"NOC finding must NOT cite 2.6, got: {noc_finding.aph_clause}"
    assert "2.11" in res_finding.aph_clause, f"Res finding must cite 2.11, got: {res_finding.aph_clause}"
    assert "2.6" not in res_finding.aph_clause, f"Res finding must NOT cite 2.6, got: {res_finding.aph_clause}"

    # Corrective action wording must be about affiliation change, NOT intake expansion / land allocation
    assert "expansion" not in res_finding.recommendation.lower() or "affiliat" in res_finding.recommendation.lower()
    assert "land, building" not in res_finding.recommendation.lower()
    assert "affiliat" in res_finding.recommendation.lower() or "university" in res_finding.recommendation.lower()

    # INTAKE-RESOLUTION-F3 must NOT appear
    assert "INTAKE-RESOLUTION-F3" not in findings_by_id, (
        "Section 2.6 INTAKE-RESOLUTION-F3 must NOT be evaluated for Change of Affiliating University/Board"
    )

    # Outcome must flag deficiency
    assert result.outcome == "DEFICIENCY_SUGGESTED"


def test_affiliation_change_placeholder_pdfs_detected():
    """
    Phase 4.2: Synthetic placeholder PDFs (verification stubs) for affiliation-change documents
    must be detected as DEFICIENT — not treated as substantive uploaded evidence.
    The placeholder header 'Official AICTE Regulatory Document Verification Copy' with no
    real document body must trigger DEFICIENT status, not COMPLIANT or NEEDS_HUMAN_REVIEW.
    """
    PLACEHOLDER_TEXT = (
        "Official AICTE Regulatory Document Verification Copy\n\n"
        "Document ID: cmvpd2xty0051uc1o1dz8e1xx\n"
        "Type: NOC from Affiliating University\n"
        "Original Filename: University_NOC_Format2.pdf\n"
        "Uploaded By: inst-user-1\n"
        "Verification Status: pending\n"
    )

    app_data = {
        "id": "app-affil-placeholder",
        "applicationNumber": "AICTE-2026-CHAN-002",
        "applicationCategory": "Change of Affiliating University / Board",
        "documents": [
            {"id": "d-noc", "documentType": "university_noc", "originalFilename": "University_NOC_Format2.pdf"},
            {"id": "d-res", "documentType": "resolution", "originalFilename": "Trust_Resolution_F3.pdf"},
        ],
    }

    extracted_docs = {
        "d-noc": {"full_text": PLACEHOLDER_TEXT, "is_scanned": False},
        "d-res": {
            "full_text": (
                "Official AICTE Regulatory Document Verification Copy\n\n"
                "Document ID: cmvpd2xuc0053uc1o-res\n"
                "Type: Trust Resolution Format 3\n"
                "Verification Status: pending\n"
            ),
            "is_scanned": False,
        },
    }

    result = rule_engine.evaluate_application(app_data, extracted_docs)
    findings_by_id = {f.rule_id: f for f in result.findings}

    # Both placeholder documents must be flagged as DEFICIENT
    assert findings_by_id["AFFIL-UNIV-NOC-F2"].status == "DEFICIENT", (
        "Placeholder NOC stub must be DEFICIENT, not treated as a genuine document"
    )
    assert findings_by_id["AFFIL-RESOLUTION-F3"].status == "DEFICIENT", (
        "Placeholder Resolution stub must be DEFICIENT, not treated as genuine"
    )

    # Evidence text must explicitly mention placeholder/stub content
    assert "placeholder" in findings_by_id["AFFIL-UNIV-NOC-F2"].evidence.lower() or \
           "stub" in findings_by_id["AFFIL-UNIV-NOC-F2"].evidence.lower() or \
           "verification copy" in findings_by_id["AFFIL-UNIV-NOC-F2"].evidence.lower()


def test_affiliation_change_compliant_with_genuine_documents():
    """
    Phase 4.2: Affiliation change with genuine (non-placeholder) NOC and Resolution documents
    must yield COMPLIANT findings with Section 2.11 citations.
    """
    app_data = {
        "id": "app-affil-compliant",
        "applicationNumber": "AICTE-2026-CHAN-003",
        "applicationCategory": "Change of Affiliating University / Board",
        "documents": [
            {"id": "d-noc", "documentType": "university_noc", "originalFilename": "University_NOC_Format2.pdf"},
            {"id": "d-res", "documentType": "resolution", "originalFilename": "Trust_Resolution_F3.pdf"},
        ],
    }

    extracted_docs = {
        "d-noc": {
            "full_text": (
                "No Objection Certificate — Format 2\n"
                "The Registrar, XYZ University, hereby grants no objection to the change of "
                "affiliating university/board for ABC Institute of Technology as per AICTE norms. "
                "Sealed and signed by the Registrar on behalf of the University."
            ),
            "is_scanned": False,
        },
        "d-res": {
            "full_text": (
                "Governing Body Resolution — Format 3\n"
                "Executive Meeting of ABC Educational Trust. Resolved that the Trust approves the "
                "change of affiliating university from XYZ University to PQR University as per the "
                "provisions of AICTE Approval Process Handbook 2024-27 Clause 2.11."
            ),
            "is_scanned": False,
        },
    }

    result = rule_engine.evaluate_application(app_data, extracted_docs)
    assert result.category == "change_of_affiliating_university"

    findings_by_id = {f.rule_id: f for f in result.findings}
    assert findings_by_id["AFFIL-UNIV-NOC-F2"].status == "COMPLIANT"
    assert findings_by_id["AFFIL-RESOLUTION-F3"].status == "COMPLIANT"

    # Citations must be Section 2.11
    assert "2.11" in findings_by_id["AFFIL-UNIV-NOC-F2"].aph_clause
    assert "2.11" in findings_by_id["AFFIL-RESOLUTION-F3"].aph_clause

    # INTAKE-RESOLUTION-F3 must not appear
    assert "INTAKE-RESOLUTION-F3" not in findings_by_id


def test_groq_observations_not_automatically_statutory_deficiencies():
    """
    Phase 4.2: Groq advisory observations (e.g., Faculty Cadre Allocation, Layout Plan)
    must NOT automatically appear as statutory deficiency findings for
    Change of Affiliating University/Board applications.

    The deterministic rule engine must only return rules applicable to
    change_of_affiliating_university. Faculty Cadre and Layout Plan are
    Increase-in-Intake/Additional-Course concepts — NOT required for affiliation change.
    Validate that no deterministic rule for change_of_affiliating_university
    references "faculty cadre" or "carpet area" / "layout plan".
    """
    app_data = {"applicationCategory": "Change of Affiliating University / Board"}
    rules = get_applicable_rules("change_of_affiliating_university", app_data)

    for rule in rules:
        evidence_lower = rule.evidence_requirements.lower()
        assert "faculty cadre" not in evidence_lower, (
            f"Rule {rule.rule_id} must not require 'faculty cadre' for affiliation change"
        )
        assert "carpet area" not in evidence_lower, (
            f"Rule {rule.rule_id} must not require 'carpet area' for affiliation change"
        )
        assert "layout plan" not in evidence_lower, (
            f"Rule {rule.rule_id} must not require 'layout plan' for affiliation change"
        )
        assert "instructional area" not in evidence_lower, (
            f"Rule {rule.rule_id} must not require 'instructional area' for affiliation change"
        )


def test_affil_change_resolution_wording_not_expansion():
    """
    Phase 4.2: The AFFIL-RESOLUTION-F3 evidence_requirements must not contain
    expansion-specific or land/building-allocation wording that belongs to Section 2.6.
    """
    rule = RULE_CATALOG.get("AFFIL-RESOLUTION-F3")
    assert rule is not None

    ev = rule.evidence_requirements.lower()
    # Must NOT say "expansion" in the context of intake/land/building
    assert "expansion" not in ev or "affiliat" in ev, (
        "AFFIL-RESOLUTION-F3 evidence_requirements must not use intake-expansion language"
    )
    assert "allocating land" not in ev
    assert "land, building and funds" not in ev
    assert "additional infrastructure" not in ev

    # Must reference affiliation change
    assert "affiliat" in ev or "university" in ev


def test_resolution_format3_across_all_16_categories():
    """
    Phase 4.2 Comprehensive Matrix Test:
    Verify that check_resolution_format_3 dynamically maps to the exact verified
    Annexure-2 section and Format 3 clause for all categories requiring a resolution.
    Strictly enforce that ONLY increase_intake and additional_course receive Section 2.6.iii
    or intake expansion / land / building / funds wording.
    All other categories must NEVER receive Section 2.6 wording.
    """
    from rules.category_rules import check_resolution_format_3, CATEGORY_RESOLUTION_CONFIG

    expansion_categories = {"increase_intake", "additional_course"}

    for cat_code, display_name in CANONICAL_APPLICATION_TYPES.items():
        app_data = {"applicationCategory": display_name}
        finding = check_resolution_format_3(app_data, {})

        if cat_code in CATEGORY_RESOLUTION_CONFIG:
            # Must have finding
            assert finding.status == "DEFICIENT"
            rec_lower = finding.recommendation.lower()
            clause_lower = finding.aph_clause.lower()

            if cat_code in expansion_categories:
                assert "2.6" in finding.aph_clause, f"{cat_code} must reference Section 2.6"
                assert "clause x" in clause_lower or "clause 2.6" in clause_lower
            else:
                assert "2.6" not in finding.aph_clause, (
                    f"Category {cat_code} must NOT reference Section 2.6, got: {finding.aph_clause}"
                )
                assert "allocating requisite land, building, and funds" not in rec_lower, (
                    f"Category {cat_code} must NOT have intake expansion land/funds text, got: {finding.recommendation}"
                )
                assert "expansion" not in rec_lower or "affiliat" in rec_lower, (
                    f"Category {cat_code} must not contain generic intake expansion text: {finding.recommendation}"
                )

            # Specific verified APH checks per category
            if cat_code == "change_of_affiliating_university":
                assert "2.11" in finding.aph_clause
                assert "xvi" in clause_lower
                assert "84" in finding.aph_clause
                assert "205" in finding.aph_clause
            elif cat_code == "change_of_name":
                assert "2.10" in finding.aph_clause
                assert "xiv" in clause_lower
            elif cat_code == "closure_of_institution":
                assert "2.7" in finding.aph_clause
                assert "xi" in clause_lower
            elif cat_code == "merger_of_institutions":
                assert "2.4" in finding.aph_clause
                assert "viii" in clause_lower
            elif cat_code == "new_programme":
                assert "2.3" in finding.aph_clause
                assert "vii" in clause_lower
            elif cat_code == "change_of_site":
                assert "2.3" in finding.aph_clause
                assert "iv" in clause_lower
            elif cat_code in ("reduction_in_intake", "closure_of_course", "merger_of_courses"):
                assert "2.9" in finding.aph_clause
                assert "xiii" in clause_lower
            elif cat_code == "conversion_of_institution_type":
                assert "2.8" in finding.aph_clause
                assert "xii" in clause_lower
            elif cat_code == "nri_supernumerary_seats":
                assert "2.2" in finding.aph_clause
                assert "iii" in clause_lower


def test_change_of_affiliating_university_citations_exact_pages():
    """
    Phase 4.2: Verify that Change of Affiliating University rules strictly cite
    APH 2024-2027 Section 2.11 (Page 84), Format 2 Clause xiv (Page 202),
    and Format 3 Clause xvi (Page 205).
    """
    app_data = {"applicationCategory": "Change of Affiliating University / Board"}
    rules = get_applicable_rules("change_of_affiliating_university", app_data)
    rule_map = {r.rule_id: r for r in rules}

    assert "AFFIL-UNIV-NOC-F2" in rule_map
    assert "AFFIL-RESOLUTION-F3" in rule_map
    assert "AFFIL-PROPOSED-CONSENT" in rule_map
    assert "INTAKE-RESOLUTION-F3" not in rule_map

    # Check NOC Format 2
    noc_rule = rule_map["AFFIL-UNIV-NOC-F2"]
    assert "2.11" in noc_rule.aph_clause
    assert "84" in noc_rule.aph_clause or "84" in noc_rule.aph_annexure
    assert "202" in noc_rule.aph_clause or "202" in noc_rule.aph_annexure
    assert "xiv" in noc_rule.aph_clause.lower() or "xiv" in noc_rule.aph_annexure.lower()

    # Check Resolution Format 3
    res_rule = rule_map["AFFIL-RESOLUTION-F3"]
    assert "2.11" in res_rule.aph_clause
    assert "84" in res_rule.aph_clause or "84" in res_rule.aph_annexure
    assert "205" in res_rule.aph_clause or "205" in res_rule.aph_annexure
    assert "xvi" in res_rule.aph_clause.lower() or "xvi" in res_rule.aph_annexure.lower()

    # Check Proposed University Consent
    prop_rule = rule_map["AFFIL-PROPOSED-CONSENT"]
    assert "2.11" in prop_rule.aph_clause or "2.11" in prop_rule.aph_annexure
    assert "205" in prop_rule.aph_clause or "205" in prop_rule.aph_annexure


def test_change_of_affiliating_university_synthetic_stubs_flagged_deficient():
    """
    Phase 4.2: Synthetic verification stubs in document fixtures must be flagged DEFICIENT
    as placeholders, not accepted or silently treated as compliant.
    """
    app_data = {
        "id": "app-test-affil",
        "applicationCategory": "Change of Affiliating University / Board",
        "documents": [
            {"id": "doc-noc", "documentType": "university_noc", "originalFilename": "NOC_Current_University.pdf"},
            {"id": "doc-prop", "documentType": "proposed_university_consent", "originalFilename": "Consent_Proposed_University.pdf"},
        ],
    }
    stub_text = (
        "Official AICTE Regulatory Document Verification Copy\n"
        "Application: AICTE-2026-CHAN-452393\n"
        "Hash: abc"
    )
    extracted_docs = {
        "doc-noc": {"full_text": stub_text, "is_scanned": False, "is_placeholder": True},
        "doc-prop": {"full_text": stub_text, "is_scanned": False, "is_placeholder": True},
    }

    res = rule_engine.evaluate_application(app_data, extracted_docs)
    findings = {f.rule_id: f for f in res.findings}

    assert findings["AFFIL-UNIV-NOC-F2"].status == "DEFICIENT"
    assert "placeholder" in findings["AFFIL-UNIV-NOC-F2"].evidence.lower() or "stub" in findings["AFFIL-UNIV-NOC-F2"].evidence.lower()

    assert findings["AFFIL-PROPOSED-CONSENT"].status == "DEFICIENT"
    assert "placeholder" in findings["AFFIL-PROPOSED-CONSENT"].evidence.lower() or "stub" in findings["AFFIL-PROPOSED-CONSENT"].evidence.lower()

    assert findings["AFFIL-RESOLUTION-F3"].status == "DEFICIENT"
    assert "2.6" not in findings["AFFIL-RESOLUTION-F3"].aph_clause
