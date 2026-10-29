import re
from datetime import datetime, timezone
from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional, Callable, Tuple
from models.schemas import RuleFinding

# Canonical application type codes and their display labels
CANONICAL_APPLICATION_TYPES = {
    "extension_of_approval": "Extension of Approval (EoA)",
    "increase_intake": "Increase in Intake",
    "additional_course": "Additional Course",
    "new_programme": "New Programme / Level",
    "change_of_site": "Change of Site / Location",
    "change_of_name": "Change of Institution Name",
    "change_of_affiliating_university": "Change of Affiliating University / Board",
    "reduction_in_intake": "Reduction in Intake",
    "closure_of_course": "Closure of Course / Programme",
    "closure_of_institution": "Closure of Institution",
    "merger_of_institutions": "Merger of Institutions",
    "merger_of_courses": "Merger of Courses",
    "conversion_of_institution_type": "Conversion of Institution Type",
    "nri_supernumerary_seats": "NRI / Supernumerary Seat Allocation",
    "collaboration_twinning": "Collaboration / Twinning Programme",
    "other": "Other Statutory AICTE Application",
}

# Normalization alias map
CATEGORY_ALIASES = {
    # EoA aliases
    "extension_of_approval": "extension_of_approval",
    "eoa": "extension_of_approval",
    "extension of approval": "extension_of_approval",
    "extension of approval — eoa": "extension_of_approval",
    "extension of approval - eoa": "extension_of_approval",
    # Increase intake
    "increase_intake": "increase_intake",
    "increase in intake": "increase_intake",
    "intake variation": "increase_intake",
    "intake_variation": "increase_intake",
    # Additional course
    "additional_course": "additional_course",
    "additional course": "additional_course",
    "new course": "additional_course",
    "new_course": "additional_course",
    # New programme / level
    "new_programme": "new_programme",
    "new programme": "new_programme",
    "new programme / level": "new_programme",
    "new program": "new_programme",
    "expansion": "new_programme",
    # Change of site / location
    "change_of_site": "change_of_site",
    "change of site": "change_of_site",
    "change of site / location": "change_of_site",
    "campus relocation": "change_of_site",
    "change of location": "change_of_site",
    # Change of name
    "change_of_name": "change_of_name",
    "change of name": "change_of_name",
    "change of institution name": "change_of_name",
    "change in the name of the institution": "change_of_name",
    # Change of affiliating university
    "change_of_affiliating_university": "change_of_affiliating_university",
    "change of affiliating university": "change_of_affiliating_university",
    "change of affiliating university / board": "change_of_affiliating_university",
    "change in the name of the affiliating university/board": "change_of_affiliating_university",
    # Reduction in intake
    "reduction_in_intake": "reduction_in_intake",
    "reduction in intake": "reduction_in_intake",
    # Closure of course
    "closure_of_course": "closure_of_course",
    "closure of course": "closure_of_course",
    "closure of course / programme": "closure_of_course",
    "closure of programme": "closure_of_course",
    # Closure of institution
    "closure_of_institution": "closure_of_institution",
    "closure of institution": "closure_of_institution",
    "closure": "closure_of_institution",
    # Merger of institutions
    "merger_of_institutions": "merger_of_institutions",
    "merger of institutions": "merger_of_institutions",
    # Merger of courses
    "merger_of_courses": "merger_of_courses",
    "merger of courses": "merger_of_courses",
    # Conversion of institution type
    "conversion_of_institution_type": "conversion_of_institution_type",
    "conversion of institution type": "conversion_of_institution_type",
    "conversion": "conversion_of_institution_type",
    # NRI / Supernumerary seats
    "nri_supernumerary_seats": "nri_supernumerary_seats",
    "nri / supernumerary seat allocation": "nri_supernumerary_seats",
    "nri_seats": "nri_supernumerary_seats",
    "nri seats": "nri_supernumerary_seats",
    "quota & seats": "nri_supernumerary_seats",
    # Collaboration / Twinning
    "collaboration_twinning": "collaboration_twinning",
    "collaboration / twinning programme": "collaboration_twinning",
    "collaboration and twinning": "collaboration_twinning",
    "twinning": "collaboration_twinning",
    "international": "collaboration_twinning",
    # Other
    "other": "other",
    "other statutory aicte application": "other",
    "statutory petitions": "other",
}

def normalize_category(app_data: Dict[str, Any]) -> Tuple[str, str, bool]:
    """
    Extract and normalize the application category from an application dossier.
    Inspects applicationType.code, applicationCategory, category, and formData.
    Returns (canonical_code, display_label, is_supported).
    """
    raw_candidates = [
        app_data.get("applicationType", {}).get("code") if isinstance(app_data.get("applicationType"), dict) else None,
        app_data.get("applicationTypeCode"),
        app_data.get("applicationCategory"),
        app_data.get("category"),
        app_data.get("applicationType", {}).get("name") if isinstance(app_data.get("applicationType"), dict) else None,
        app_data.get("formData", {}).get("application_category") if isinstance(app_data.get("formData"), dict) else None,
    ]

    for raw in raw_candidates:
        if not raw or not isinstance(raw, str):
            continue
        cleaned = raw.strip().lower()
        if cleaned in CATEGORY_ALIASES:
            canonical = CATEGORY_ALIASES[cleaned]
            label = CANONICAL_APPLICATION_TYPES[canonical]
            return canonical, label, True

    # Check for substring matches if exact key wasn't matched
    for raw in raw_candidates:
        if not raw or not isinstance(raw, str):
            continue
        cleaned = raw.strip().lower()
        if "eoa" in cleaned or "extension" in cleaned:
            return "extension_of_approval", CANONICAL_APPLICATION_TYPES["extension_of_approval"], True
        if "increase" in cleaned:
            return "increase_intake", CANONICAL_APPLICATION_TYPES["increase_intake"], True
        if "additional" in cleaned:
            return "additional_course", CANONICAL_APPLICATION_TYPES["additional_course"], True
        if "new prog" in cleaned:
            return "new_programme", CANONICAL_APPLICATION_TYPES["new_programme"], True
        if "site" in cleaned or "location" in cleaned:
            return "change_of_site", CANONICAL_APPLICATION_TYPES["change_of_site"], True
        if "affiliat" in cleaned or "board" in cleaned:
            return "change_of_affiliating_university", CANONICAL_APPLICATION_TYPES["change_of_affiliating_university"], True
        if "name" in cleaned:
            return "change_of_name", CANONICAL_APPLICATION_TYPES["change_of_name"], True
        if "reduction" in cleaned:
            return "reduction_in_intake", CANONICAL_APPLICATION_TYPES["reduction_in_intake"], True
        if "closure of inst" in cleaned or (cleaned.startswith("closure") and "course" not in cleaned and "prog" not in cleaned):
            return "closure_of_institution", CANONICAL_APPLICATION_TYPES["closure_of_institution"], True
        if "closure of course" in cleaned or "closure of prog" in cleaned or "course closure" in cleaned:
            return "closure_of_course", CANONICAL_APPLICATION_TYPES["closure_of_course"], True
        if "merger" in cleaned and "course" in cleaned:
            return "merger_of_courses", CANONICAL_APPLICATION_TYPES["merger_of_courses"], True
        if "merger" in cleaned:
            return "merger_of_institutions", CANONICAL_APPLICATION_TYPES["merger_of_institutions"], True
        if "conversion" in cleaned:
            return "conversion_of_institution_type", CANONICAL_APPLICATION_TYPES["conversion_of_institution_type"], True
        if "nri" in cleaned or "supernumerary" in cleaned:
            return "nri_supernumerary_seats", CANONICAL_APPLICATION_TYPES["nri_supernumerary_seats"], True
        if "twin" in cleaned or "collab" in cleaned:
            return "collaboration_twinning", CANONICAL_APPLICATION_TYPES["collaboration_twinning"], True
        if "other" in cleaned or "petition" in cleaned:
            return "other", CANONICAL_APPLICATION_TYPES["other"], True

    raw_fallback = str(app_data.get("applicationCategory") or app_data.get("category") or "Unknown")
    return "unknown", f"Unmapped Category ({raw_fallback})", False


@dataclass
class RuleDefinition:
    """
    Authoritative definition of a deterministic statutory scrutiny rule
    grounded in the AICTE Approval Process Handbook (APH 2024-27).
    """
    rule_id: str
    rule_name: str
    applicable_application_types: List[str]
    aph_chapter: str
    aph_clause: str
    aph_annexure: Optional[str] = None
    handbook_version: str = "APH 2024-2027"
    required_document_types: List[str] = field(default_factory=list)
    required_application_fields: List[str] = field(default_factory=list)
    is_common_check: bool = False
    evidence_requirements: str = ""
    human_review_conditions: str = ""
    applicability_predicate: Optional[Callable[[Dict[str, Any]], bool]] = None
    evaluation_function: Optional[Callable[[Dict[str, Any], Dict[str, Dict[str, Any]]], RuleFinding]] = None

    def is_applicable(self, app_data: Dict[str, Any], category_code: str) -> bool:
        if category_code not in self.applicable_application_types and "*" not in self.applicable_application_types:
            return False
        if self.applicability_predicate:
            try:
                return self.applicability_predicate(app_data)
            except Exception:
                return True
        return True

    def evaluate(self, app_data: Dict[str, Any], extracted_docs: Dict[str, Dict[str, Any]]) -> RuleFinding:
        if not self.evaluation_function:
            return RuleFinding(
                rule_id=self.rule_id,
                rule_name=self.rule_name,
                status="NEEDS_HUMAN_REVIEW",
                aph_clause=self.aph_clause,
                aph_chapter=self.aph_chapter,
                aph_annexure=self.aph_annexure,
                is_common_check=self.is_common_check,
                evidence=self.evidence_requirements or "Manual Scrutiny Committee evaluation required.",
                recommendation="Scrutiny Committee must inspect documents to establish compliance.",
            )
        try:
            finding = self.evaluation_function(app_data, extracted_docs)
            # Ensure metadata consistency
            finding.aph_chapter = self.aph_chapter
            finding.aph_annexure = self.aph_annexure
            finding.is_common_check = self.is_common_check
            return finding
        except Exception as err:
            return RuleFinding(
                rule_id=self.rule_id,
                rule_name=self.rule_name,
                status="TECHNICAL_ERROR",
                aph_clause=self.aph_clause,
                aph_chapter=self.aph_chapter,
                aph_annexure=self.aph_annexure,
                is_common_check=self.is_common_check,
                evidence=f"Technical evaluation error encountered: {str(err)}",
                recommendation="Scrutiny Committee must review the source inputs manually due to an automated processing exception.",
            )


def parse_date_safely(date_str: str) -> Optional[datetime]:
    """Safely parse common Indian and ISO date formats."""
    if not date_str:
        return None
    cleaned = date_str.strip().replace(",", " ").replace(".", "/")
    formats = [
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%d/%m/%y",
        "%d-%m-%y",
        "%d %b %Y",
        "%d %B %Y",
        "%Y/%m/%d",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(cleaned, fmt)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def find_document_by_type_or_keywords(docs: List[Dict[str, Any]], keywords: List[str]) -> Optional[Dict[str, Any]]:
    """Helper to locate an uploaded document by type or filename keywords (picks latest upload if multiple)."""
    matches = []
    for d in docs:
        dtype = (d.get("documentType") or "").lower()
        fname = (d.get("originalFilename") or "").lower()
        dname = (d.get("documentName") or "").lower()
        combined = f"{dtype} {fname} {dname}"
        if any(kw.lower() in combined for kw in keywords):
            matches.append(d)
    if not matches:
        return None
    matches.sort(
        key=lambda x: str(x.get("uploadedAt") or x.get("createdAt") or x.get("id") or ""),
        reverse=True,
    )
    return matches[0]
