from typing import Dict, Any, List
from models.schemas import RuleFinding, PreCheckResult
from rules.eoa_rules import (
    check_affidavit_2,
    check_fire_safety_noc,
    check_occupancy_certificate,
    check_land_and_fsi,
    check_faculty_student_ratio,
)

class RuleEngine:
    def evaluate_eoa(self, app_data: Dict[str, Any], extracted_docs: Dict[str, Dict[str, Any]]) -> PreCheckResult:
        """
        Evaluate an Extension of Approval (EoA) application against AICTE APH 2024-27 statutory rules.
        All findings are deterministic, evidence-backed, and advisory.
        """
        app_id = app_data.get("id", "")
        app_num = app_data.get("applicationNumber", "")

        findings: List[RuleFinding] = []

        # 1. Affidavit 2 Check
        findings.append(check_affidavit_2(app_data, extracted_docs))

        # 2. Fire Safety NOC Check
        findings.append(check_fire_safety_noc(app_data, extracted_docs))

        # 3. Occupancy Certificate Check
        findings.append(check_occupancy_certificate(app_data, extracted_docs))

        # 4. Land & FSI Norms Check
        findings.append(check_land_and_fsi(app_data, extracted_docs))

        # 5. Faculty-Student Ratio & Cadre Norms Check
        findings.append(check_faculty_student_ratio(app_data))

        # Determine overall outcome
        has_deficiency = any(f.status == "DEFICIENT" for f in findings)
        has_review = any(f.status == "NEEDS_HUMAN_REVIEW" for f in findings)

        if has_deficiency:
            outcome = "DEFICIENCY_SUGGESTED"
            summary_headline = "Deficiencies Identified in Self-Disclosure Documents"
        elif has_review:
            outcome = "NEEDS_HUMAN_REVIEW"
            summary_headline = "Pre-Check Completed: Human Officer Verification Required"
        else:
            outcome = "RECOMMEND_ACCEPT"
            summary_headline = "All Statutory Pre-Checks Compliant"

        # Generate human-readable advisory markdown summary
        summary_lines = [
            f"### AI Scrutiny Advisory Pre-Check: {app_num}",
            f"**Overall Assessment:** {outcome}",
            f"**Headline:** {summary_headline}",
            "",
            "> [!NOTE]",
            "> **Statutory Notice**: This report was generated automatically by the AI Scrutiny Assistant based on AICTE Approval Process Handbook (APH 2024-27). All findings are purely advisory and strictly require human evaluation by the designated AICTE Scrutiny Committee. The AI service does not issue formal deficiencies or alter application status.",
            "",
            "#### Findings Breakdown:",
        ]

        for idx, f in enumerate(findings, 1):
            badge = "✅ COMPLIANT" if f.status == "COMPLIANT" else ("⚠️ NEEDS HUMAN REVIEW" if f.status == "NEEDS_HUMAN_REVIEW" else "❌ DEFICIENT")
            summary_lines.append(f"{idx}. **{f.rule_name}** — {badge}")
            summary_lines.append(f"   - **APH Clause:** {f.aph_clause}")
            summary_lines.append(f"   - **Evidence:** {f.evidence}")
            summary_lines.append(f"   - **Advisory Recommendation:** {f.recommendation}")
            summary_lines.append("")

        summary_text = "\n".join(summary_lines)

        return PreCheckResult(
            application_id=app_id,
            application_number=app_num,
            outcome=outcome,
            title=f"AI Scrutiny Pre-Check ({outcome})",
            summary=summary_text,
            findings=findings,
            handbook_version="APH 2024-2027",
        )

rule_engine = RuleEngine()
