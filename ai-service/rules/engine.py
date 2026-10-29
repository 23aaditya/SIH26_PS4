from typing import Dict, Any, List
from models.schemas import RuleFinding, PreCheckResult
from rules.base import normalize_category
from rules.registry import get_applicable_rules

class RuleEngine:
    """
    Deterministic Statutory Scrutiny Engine.
    Dispatches category-specific and common regulatory checks based on
    the authoritative provisions of the AICTE Approval Process Handbook (APH 2024-27).
    """

    def evaluate_application(
        self, app_data: Dict[str, Any], extracted_docs: Dict[str, Dict[str, Any]]
    ) -> PreCheckResult:
        """
        Evaluate any AICTE application against its category-specific statutory rules.
        """
        app_id = app_data.get("id", "")
        app_num = app_data.get("applicationNumber", "")

        canonical_code, display_label, is_supported = normalize_category(app_data)
        applicable_rules = get_applicable_rules(canonical_code, app_data)

        findings: List[RuleFinding] = []
        for rule in applicable_rules:
            finding = rule.evaluate(app_data, extracted_docs)
            findings.append(finding)

        # Determine overall outcome
        has_deficiency = any(f.status == "DEFICIENT" for f in findings)
        has_review_or_tech = any(f.status in ("NEEDS_HUMAN_REVIEW", "TECHNICAL_ERROR") for f in findings)

        if has_deficiency:
            outcome = "DEFICIENCY_SUGGESTED"
            summary_headline = f"Statutory Deficiencies Identified ({display_label})"
        elif has_review_or_tech:
            outcome = "NEEDS_HUMAN_REVIEW"
            summary_headline = f"Pre-Check Completed: Human Scrutiny Officer Verification Required ({display_label})"
        else:
            outcome = "RECOMMEND_ACCEPT"
            summary_headline = f"All Statutory Checks Compliant ({display_label})"

        # Generate structured advisory markdown summary
        summary_lines = [
            f"### AI Scrutiny Advisory Pre-Check: {app_num}",
            f"**Application Category:** {display_label} (`{canonical_code}`)",
            f"**Overall Assessment:** {outcome}",
            f"**Headline:** {summary_headline}",
            "",
            "> [!NOTE]",
            "> **Statutory Notice**: This report was generated automatically by the AI Scrutiny Assistant based on AICTE Approval Process Handbook (APH 2024-27). All findings are purely advisory and strictly require human evaluation by the designated AICTE Scrutiny Committee. The AI service does not issue formal deficiencies or alter application status.",
            "",
        ]

        if not is_supported:
            summary_lines.extend([
                "> [!WARNING]",
                f"> **Unsupported Category**: Application category '{display_label}' does not map to a standard automated rule matrix. Case-by-case manual scrutiny by the Scrutiny Committee is required.",
                "",
            ])

        common_findings = [f for f in findings if f.is_common_check]
        category_findings = [f for f in findings if not f.is_common_check]

        if category_findings:
            summary_lines.append(f"#### Category-Specific Statutory Checks ({display_label}):")
            for idx, f in enumerate(category_findings, 1):
                badge = self._format_status_badge(f.status)
                summary_lines.append(f"{idx}. **{f.rule_name}** — {badge}")
                summary_lines.append(f"   - **APH Citation:** {f.aph_clause}")
                summary_lines.append(f"   - **Evidence:** {f.evidence}")
                summary_lines.append(f"   - **Advisory Recommendation:** {f.recommendation}")
                summary_lines.append("")

        if common_findings:
            summary_lines.append("#### Common Statutory Baseline Checks:")
            for idx, f in enumerate(common_findings, 1):
                badge = self._format_status_badge(f.status)
                summary_lines.append(f"{idx}. **{f.rule_name}** — {badge}")
                summary_lines.append(f"   - **APH Citation:** {f.aph_clause}")
                summary_lines.append(f"   - **Evidence:** {f.evidence}")
                summary_lines.append(f"   - **Advisory Recommendation:** {f.recommendation}")
                summary_lines.append("")

        summary_text = "\n".join(summary_lines)

        return PreCheckResult(
            application_id=app_id,
            application_number=app_num,
            outcome=outcome,
            title=f"AI Scrutiny Pre-Check ({display_label}: {outcome})",
            summary=summary_text,
            findings=findings,
            handbook_version="APH 2024-2027",
            category=canonical_code,
            category_label=display_label,
            unsupported_category=not is_supported,
        )

    def evaluate_eoa(
        self, app_data: Dict[str, Any], extracted_docs: Dict[str, Dict[str, Any]]
    ) -> PreCheckResult:
        """
        Backward-compatible entry point for Extension of Approval (EoA) evaluation.
        """
        data_copy = dict(app_data)
        if not data_copy.get("applicationCategory"):
            data_copy["applicationCategory"] = "extension_of_approval"
        return self.evaluate_application(data_copy, extracted_docs)

    def _format_status_badge(self, status: str) -> str:
        if status == "COMPLIANT":
            return "✅ COMPLIANT"
        elif status == "DEFICIENT":
            return "❌ DEFICIENT"
        elif status == "NOT_APPLICABLE":
            return "⚪ NOT APPLICABLE"
        elif status == "TECHNICAL_ERROR":
            return "⚠️ TECHNICAL PROCESSING ERROR"
        else:
            return "⚠️ NEEDS HUMAN REVIEW"

rule_engine = RuleEngine()
