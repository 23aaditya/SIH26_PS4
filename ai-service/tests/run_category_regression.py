import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from rules.base import normalize_category, CANONICAL_APPLICATION_TYPES
from rules.registry import get_applicable_rules
from rules.engine import rule_engine
from main import compute_application_version_hash

results = {}

# Test 1: EoA
app_eoa = {"applicationCategory": "Extension of Approval"}
rules_eoa = [r.rule_id for r in get_applicable_rules("extension_of_approval", app_eoa)]
assert "EOA-ANNEX2-AFFIDAVIT2" in rules_eoa
assert "EOA-ANNEX3-FIRE-NOC" in rules_eoa
assert "EOA-ANNEX3-OCCUPANCY-CERT" in rules_eoa
assert "EOA-ANNEX3-LAND-FSI" in rules_eoa
assert "EOA-ANNEX5-FSR" in rules_eoa
assert "INTAKE-AFFIDAVIT8" not in rules_eoa
assert "CLINST-AFFIDAVIT4" not in rules_eoa
results["test1"] = True

# Test 2: Increase in Intake
app_intake = {
    "applicationCategory": "Increase in Intake",
    "formData": {
        "current_approved_programmes": "Civil Engineering, Mechanical Engineering, Electrical Engineering",
        "approved_intake": 120,
        "faculty_strength": 30,
        "duration_years": 4,
    },
    "documents": [{"id": "d1", "documentType": "affidavit_8", "originalFilename": "Affidavit_8.pdf"}],
}
res_intake = rule_engine.evaluate_application(app_intake, {
    "d1": {"full_text": "Rs. 100 Non-Judicial Stamp Paper. Affidavit 8 for increase in intake and additional facilities. Deponent.", "is_scanned": False}
})
r_ids_intake = [f.rule_id for f in res_intake.findings]
assert "INTAKE-AFFIDAVIT8" in r_ids_intake
assert "INTAKE-RESOLUTION-F3" in r_ids_intake
assert "INTAKE-CORE-BRANCHES" in r_ids_intake
assert "EOA-ANNEX2-AFFIDAVIT2" not in r_ids_intake
assert "CLINST-AFFIDAVIT4" not in r_ids_intake
f_core = next(f for f in res_intake.findings if f.rule_id == "INTAKE-CORE-BRANCHES")
assert f_core.status == "COMPLIANT"
results["test2"] = True

# Test 3: Additional Course
app_course = {
    "applicationCategory": "Additional Course",
    "formData": {
        "proposed_course_name": "Artificial Intelligence and Machine Learning",
        "current_approved_programmes": "Mechanical, Electrical, Civil",
    },
    "documents": [],
}
res_course = rule_engine.evaluate_application(app_course, {})
r_ids_course = [f.rule_id for f in res_course.findings]
assert "INTAKE-AFFIDAVIT8" in r_ids_course
assert "COURSE-NOMENCLATURE" in r_ids_course
assert "INTAKE-CORE-BRANCHES" in r_ids_course
f_aff8 = next(f for f in res_course.findings if f.rule_id == "INTAKE-AFFIDAVIT8")
assert f_aff8.status == "DEFICIENT"
assert "Annexure-2 Section 2.6.i" in f_aff8.aph_clause
results["test3"] = True

# Test 4: Change of Site
app_site = {"applicationCategory": "Change of Site / Location"}
rules_site = [r.rule_id for r in get_applicable_rules("change_of_site", app_site)]
assert "SITE-ANNEX1-LAND-DOCS" in rules_site
assert "SITE-UNIV-NOC-F2" in rules_site
assert "SITE-VACATION-SHIFT" in rules_site
assert "EOA-ANNEX3-FIRE-NOC" in rules_site
results["test4"] = True

# Test 5: Closure of Institution
app_close = {
    "applicationCategory": "Closure of Institution",
    "documents": [{"id": "c1", "documentType": "affidavit_4", "originalFilename": "Affidavit_4.pdf"}],
}
res_close = rule_engine.evaluate_application(app_close, {
    "c1": {"full_text": "Rs. 100 Non-Judicial Stamp Paper. Affidavit 4. Progressive closure. No liability to students or faculty.", "is_scanned": False}
})
r_ids_close = [f.rule_id for f in res_close.findings]
assert "CLINST-AFFIDAVIT4" in r_ids_close
assert "CLINST-UNIV-NOC-F2" in r_ids_close
assert "INTAKE-RESOLUTION-F3" in r_ids_close
assert "CLINST-SALARY-DUES" in r_ids_close
assert "EOA-ANNEX2-AFFIDAVIT2" not in r_ids_close
assert "EOA-ANNEX3-FIRE-NOC" not in r_ids_close
assert "EOA-ANNEX3-LAND-FSI" not in r_ids_close
assert "EOA-ANNEX5-FSR" not in r_ids_close
results["test5"] = True

# Test 6: Collaboration & Twinning
app_twin = {
    "applicationCategory": "Collaboration / Twinning Programme",
    "formData": {"foreign_credits_percentage": 30.0},
    "documents": [
        {"id": "t1", "documentType": "affidavit_11", "originalFilename": "Affidavit_11.pdf"},
        {"id": "t2", "documentType": "mou", "originalFilename": "MoU.pdf"}
    ]
}
res_twin = rule_engine.evaluate_application(app_twin, {
    "t1": {"full_text": "Rs. 100 Non-Judicial Stamp. Affidavit 11. Foreign university students failing to get visa accommodated in parent institution.", "is_scanned": False},
    "t2": {"full_text": "Bipartite agreement between Indian and foreign institution.", "is_scanned": False}
})
r_ids_twin = [f.rule_id for f in res_twin.findings]
assert "TWIN-AFFIDAVIT11" in r_ids_twin
assert "TWIN-BIPARTITE-MOU" in r_ids_twin
assert "TWIN-CREDIT-CAP" in r_ids_twin
f_aff11 = next(f for f in res_twin.findings if f.rule_id == "TWIN-AFFIDAVIT11")
assert f_aff11.status == "COMPLIANT"
f_cap = next(f for f in res_twin.findings if f.rule_id == "TWIN-CREDIT-CAP")
assert f_cap.status == "COMPLIANT"
results["test6"] = True

# Test 7: Other Statutory Applications
app_other = {"applicationCategory": "Other Statutory AICTE Application"}
res_other = rule_engine.evaluate_application(app_other, {})
assert res_other.outcome == "NEEDS_HUMAN_REVIEW"
f_other = res_other.findings[0]
assert f_other.rule_id == "OTHER-HUMAN-SCRUTINY"
assert "Case-by-Case" in f_other.rule_name
results["test7"] = True

# Test 8: Unsupported Category
app_unsupp = {"applicationCategory": "CompletelyUnrecognizedCategory123"}
res_unsupp = rule_engine.evaluate_application(app_unsupp, {})
assert res_unsupp.unsupported_category is True
assert res_unsupp.outcome == "NEEDS_HUMAN_REVIEW"
assert "UNKNOWN-CATEGORY-SCRUTINY" in [f.rule_id for f in res_unsupp.findings]
results["test8"] = True

# Test 9: Category Switch Version Hash Difference
app_base = {"id": "app-test-hash", "updatedAt": "2026-10-28T12:00:00Z", "documents": []}
hash1 = compute_application_version_hash({**app_base, "applicationCategory": "Extension of Approval"}, {})
hash2 = compute_application_version_hash({**app_base, "applicationCategory": "Closure of Institution"}, {})
assert hash1 != hash2, "Changing application category must alter the version hash"
results["test9"] = True

# Test 10: Change of Affiliating University / Board (APH Section 2.11)
app_affil = {"applicationCategory": "Change of Affiliating University / Board", "documents": []}
rules_affil = [r.rule_id for r in get_applicable_rules("change_of_affiliating_university", app_affil)]
assert "AFFIL-UNIV-NOC-F2" in rules_affil, "Missing NOC Format 2 rule for affiliation change"
assert "AFFIL-RESOLUTION-F3" in rules_affil, "Missing Resolution Format 3 rule for affiliation change"
assert "AFFIL-PROPOSED-CONSENT" in rules_affil, "Missing Proposed University Consent rule for affiliation change"
assert "INTAKE-RESOLUTION-F3" not in rules_affil, "Section 2.6 intake resolution must NOT apply to affiliation change"
assert "INTAKE-AFFIDAVIT8" not in rules_affil, "Affidavit 8 must NOT apply to affiliation change"
assert "INTAKE-CORE-BRANCHES" not in rules_affil, "Core branches must NOT apply to affiliation change"

res_affil = rule_engine.evaluate_application(app_affil, {})
f_noc = next(f for f in res_affil.findings if f.rule_id == "AFFIL-UNIV-NOC-F2")
f_res = next(f for f in res_affil.findings if f.rule_id == "AFFIL-RESOLUTION-F3")
assert f_noc.status == "DEFICIENT"
assert "2.11" in f_noc.aph_clause and "2.6" not in f_noc.aph_clause
assert f_res.status == "DEFICIENT"
assert "2.11" in f_res.aph_clause and "2.6" not in f_res.aph_clause
assert "expansion" not in f_res.recommendation.lower() or "affiliat" in f_res.recommendation.lower()
results["test10"] = True

print(json.dumps(results))
