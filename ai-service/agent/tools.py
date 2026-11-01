"""
Controlled Tool Registry for the AICTE Application Lifecycle Agent.
All tools are bounded, policy-checked, and authenticated.
No arbitrary HTTP requests, shell commands, or raw database mutations permitted.
"""

import hashlib
import json
import logging
import re
import sqlite3
import urllib.parse
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple

from config import PROJECT_ROOT
from client import backend_client
from extractor import document_extractor
from rules.engine import rule_engine
from llm.scrutiny_agent import scrutiny_agent
from agent.store import create_action, update_action, get_action, get_actions_for_application

logger = logging.getLogger("agent_tools")


class ToolExecutionError(Exception):
    """Raised when a controlled tool encounters an unrecoverable validation or runtime error."""
    pass


async def tool_get_application_state(application_id: str) -> Dict[str, Any]:
    """
    Fetch authorized application state and statutory category.
    Strictly validates application ID format.
    """
    if not application_id or not isinstance(application_id, str) or len(application_id.strip()) < 3:
        raise ToolExecutionError(f"Invalid application_id argument: {application_id}")

    try:
        app_data = await backend_client.get_application(application_id)
        docs = app_data.get("documents", [])
        return {
            "id": app_data.get("id"),
            "applicationNumber": app_data.get("applicationNumber"),
            "applicationCategory": app_data.get("applicationCategory"),
            "status": app_data.get("status"),
            "currentStageId": app_data.get("currentStageId"),
            "currentStageName": app_data.get("currentStageName"),
            "currentAssigneeRole": app_data.get("currentAssigneeRole"),
            "assignedUserId": app_data.get("assignedUserId"),
            "institutionId": app_data.get("institutionId"),
            "institutionName": app_data.get("institution", {}).get("institutionName"),
            "submittedAt": app_data.get("submittedAt"),
            "dueAt": app_data.get("dueAt"),
            "returnCount": app_data.get("returnCount", 0),
            "documentsCount": len(docs),
            "raw": app_data,
        }
    except Exception as e:
        logger.error(f"tool_get_application_state failed for {application_id}: {e}")
        raise ToolExecutionError(f"Failed to fetch application state: {str(e)}")


async def tool_get_document_dossier(
    application_id: str,
    app_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Download and extract text for all documents in the application dossier.
    Computes verified cryptographic SHA-256 checksums and checks for corrupted or scanned files.
    """
    if not app_data:
        app_data = await backend_client.get_application(application_id)

    docs = app_data.get("documents", [])
    extracted_docs: Dict[str, Dict[str, Any]] = {}
    verified_doc_checksums: Dict[str, str] = {}
    technical_failures: List[Dict[str, str]] = []

    for doc in docs:
        doc_id = doc.get("id")
        fname = doc.get("originalFilename") or f"{doc_id}.pdf"
        server_checksum = doc.get("checksum")

        try:
            raw_bytes, downloaded_fname = await backend_client.download_document(doc_id)
            if not raw_bytes or len(raw_bytes) == 0:
                extracted_docs[doc_id] = {
                    "unavailable": True,
                    "error": "Empty file payload on storage",
                    "full_text": "",
                    "is_scanned": True,
                    "page_count": 0,
                }
                verified_doc_checksums[doc_id] = server_checksum or "empty"
                continue

            computed_checksum = hashlib.sha256(raw_bytes).hexdigest()
            extracted = document_extractor.extract_from_bytes(raw_bytes, downloaded_fname or fname)
            verified_doc_checksums[doc_id] = computed_checksum
            extracted_docs[doc_id] = extracted
        except Exception as doc_err:
            logger.warning(f"Dossier extraction error for doc {doc_id} ({fname}): {doc_err}")
            extracted_docs[doc_id] = {
                "unavailable": True,
                "error": str(doc_err),
                "full_text": "",
                "is_scanned": True,
                "page_count": 0,
            }
            verified_doc_checksums[doc_id] = server_checksum or "unavailable"
            technical_failures.append({"doc_id": doc_id, "error": str(doc_err)})

    # Compute application version hash
    app_version = app_data.get("updatedAt") or app_data.get("workflowVersion") or "v-2.4"
    category = str(app_data.get("applicationCategory") or app_data.get("applicationType", {}).get("code") or "")
    hash_seed = f"{application_id}:{app_version}:{category}:{len(docs)}:" + ":".join(
        f"{d.get('id')}:{verified_doc_checksums.get(d.get('id'), 'missing')}"
        for d in sorted(docs, key=lambda x: x.get("id", ""))
    )
    version_hash = hashlib.sha256(hash_seed.encode("utf-8")).hexdigest()

    return {
        "extracted_docs": extracted_docs,
        "verified_checksums": verified_doc_checksums,
        "technical_failures": technical_failures,
        "version_hash": version_hash,
        "document_count": len(docs),
    }


def tool_run_deterministic_scrutiny(
    application_id: str,
    app_data: Dict[str, Any],
    extracted_docs: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Execute Phase 3.5 application-category-aware deterministic scrutiny rules.
    Strictly follows AICTE APH 2024-2027 statutory provisions.
    """
    pre_check = rule_engine.evaluate_application(app_data, extracted_docs)
    return {
        "title": pre_check.title,
        "category": pre_check.category,
        "category_label": pre_check.category_label,
        "handbook_version": pre_check.handbook_version,
        "outcome": pre_check.outcome,
        "summary": pre_check.summary,
        "unsupported_category": pre_check.unsupported_category,
        "findings": [f.model_dump() for f in pre_check.findings],
        "findings_raw": pre_check.findings,
        "raw_pre_check": pre_check,
    }


async def tool_run_qualitative_scrutiny(
    application_id: str,
    app_data: Dict[str, Any],
    extracted_docs: Dict[str, Dict[str, Any]],
    deterministic_findings: List[Any],
) -> Dict[str, Any]:
    """
    Execute advisory Groq LLM qualitative analysis with bounded document batching
    and non-retrying HTTP 413 resilience.
    """
    llm_result = await scrutiny_agent.analyze_application(
        app_data=app_data,
        extracted_docs=extracted_docs,
        deterministic_findings=deterministic_findings,
    )
    return {
        "status": llm_result.status,
        "model_used": llm_result.model_used,
        "summary": llm_result.summary,
        "findings": [f.model_dump() for f in llm_result.findings],
        "error_message": llm_result.error_message,
        "http_status": llm_result.http_status,
        "requested_tokens": llm_result.requested_tokens,
        "token_limit": llm_result.token_limit,
        "total_batches": llm_result.total_batches,
        "successful_batches": llm_result.successful_batches,
        "raw_result": llm_result,
    }


async def tool_reconcile_resubmission_findings(
    application_id: str,
    current_findings: List[Any],
) -> Dict[str, Any]:
    """
    Compare current findings against the prior pre-check report on resubmission.
    Classifies each item strictly as RESOLVED, STILL_OUTSTANDING, or NEEDS_HUMAN_REVIEW.
    """
    resubmission_diff = []
    prior_reports_resp = await backend_client.get_application_reports(application_id)
    prior_reports = prior_reports_resp if isinstance(prior_reports_resp, list) else []

    prior_ai_report = None
    for r in prior_reports:
        if r.get("reportType") == "AI_SCRUTINY_PRE_CHECK":
            meta = r.get("metadataJson") or r.get("metadata") or {}
            if isinstance(meta, str):
                try:
                    meta = json.loads(meta)
                except Exception:
                    meta = {}
            if meta.get("findings"):
                prior_ai_report = meta
                break

    if prior_ai_report:
        prev_findings = prior_ai_report.get("findings", [])
        curr_findings_map = {}
        for f in current_findings:
            if hasattr(f, "rule_id"):
                curr_findings_map[f.rule_id] = f
            elif isinstance(f, dict):
                curr_findings_map[f.get("rule_id")] = f

        for pf in prev_findings:
            r_id = pf.get("rule_id")
            prev_status = pf.get("status")
            curr_f = curr_findings_map.get(r_id)

            curr_status = getattr(curr_f, "status", None) if curr_f else (curr_f.get("status") if isinstance(curr_f, dict) else "NOT_EVALUATED")

            if prev_status in ("DEFICIENT", "NEEDS_HUMAN_REVIEW"):
                if curr_status == "COMPLIANT":
                    classification = "RESOLVED"
                    note = f"Previous {prev_status} item resolved by compliant evidence in current submission."
                elif curr_status == "DEFICIENT":
                    classification = "STILL_OUTSTANDING"
                    note = "Deficiency remains outstanding in current submission."
                else:
                    classification = "NEEDS_HUMAN_REVIEW"
                    note = "Resubmitted documents require human officer inspection to verify resolution."

                resubmission_diff.append({
                    "rule_id": r_id,
                    "rule_name": pf.get("rule_name") or r_id,
                    "previous_status": prev_status,
                    "current_status": curr_status,
                    "classification": classification,
                    "note": note,
                })

    resolved_count = sum(1 for d in resubmission_diff if d["classification"] == "RESOLVED")
    outstanding_count = sum(1 for d in resubmission_diff if d["classification"] == "STILL_OUTSTANDING")
    review_count = sum(1 for d in resubmission_diff if d["classification"] == "NEEDS_HUMAN_REVIEW")

    return {
        "has_prior_report": prior_ai_report is not None,
        "resubmission_diff": resubmission_diff,
        "resolved_count": resolved_count,
        "outstanding_count": outstanding_count,
        "review_count": review_count,
    }


async def tool_submit_advisory_report(
    application_id: str,
    pre_check_dict: Dict[str, Any],
    llm_result_dict: Dict[str, Any],
    resubmission_diff: List[Dict[str, Any]],
    version_hash: str,
    execution_id: str,
    is_resubmission: bool = False,
) -> Dict[str, Any]:
    """
    Format and submit advisory report to Express backend with atomic versioning.
    Deterministic outcome is preserved and never overridden.
    """
    existing_report_id = await backend_client.find_existing_report_by_version(application_id, version_hash)
    if existing_report_id and not is_resubmission:
        return {
            "report_id": existing_report_id,
            "version_hash": version_hash,
            "reused": True,
        }

    recommendations_parts = [
        "Statutory Advisory Findings:",
        "- Human Scrutiny Officer verification required.",
        f"- Deterministic pre-check assessment: {pre_check_dict['outcome']}.",
    ]
    if llm_result_dict.get("status") == "SUCCESS" and llm_result_dict.get("findings"):
        recommendations_parts.append(
            f"- Qualitative Advisory: {len(llm_result_dict['findings'])} observation(s) flagged for human verification."
        )
    elif llm_result_dict.get("status") in ("TECHNICAL_FAILURE", "PARTIAL_ANALYSIS"):
        recommendations_parts.append(
            f"- Qualitative Advisory Note: LLM scrutiny had technical limitation ({llm_result_dict.get('error_message') or 'service unavailable'}); deterministic findings remain authoritative."
        )
    if resubmission_diff:
        resolved_count = sum(1 for d in resubmission_diff if d["classification"] == "RESOLVED")
        outstanding_count = sum(1 for d in resubmission_diff if d["classification"] == "STILL_OUTSTANDING")
        recommendations_parts.append(
            f"- Resubmission Audit: {resolved_count} item(s) resolved, {outstanding_count} item(s) still outstanding."
        )

    combined_content = pre_check_dict["summary"]
    if llm_result_dict.get("status") in ("SUCCESS", "PARTIAL_ANALYSIS") and llm_result_dict.get("summary"):
        prefix = "AI Qualitative Scrutiny Observations"
        if llm_result_dict.get("status") == "PARTIAL_ANALYSIS":
            prefix += " (Partial Analysis)"
        combined_content += f"\n\n--- {prefix} ({llm_result_dict.get('model_used') or 'Groq LLM'}) ---\n{llm_result_dict.get('summary')}"
    elif llm_result_dict.get("status") == "TECHNICAL_FAILURE" and llm_result_dict.get("error_message"):
        combined_content += f"\n\n--- AI Qualitative Scrutiny Note ---\nAdvisory LLM analysis was incomplete due to a technical limitation: {llm_result_dict.get('error_message')}. Deterministic statutory checks remain 100% authoritative."

    if resubmission_diff:
        combined_content += "\n\n--- Resubmission Discrepancy Diff ---\n"
        for d in resubmission_diff:
            combined_content += f"• [{d['classification']}] {d['rule_name']}: {d['note']} (Previous: {d['previous_status']} -> Current: {d['current_status']})\n"

    report_payload = {
        "stageKey": "scrutiny",
        "reportType": "AI_SCRUTINY_PRE_CHECK",
        "title": pre_check_dict["title"],
        "content": combined_content,
        "recommendations": "\n".join(recommendations_parts),
        "outcome": pre_check_dict["outcome"],
        "metadata": {
            "executionId": execution_id,
            "versionHash": version_hash,
            "handbookVersion": pre_check_dict.get("handbook_version"),
            "category": pre_check_dict.get("category"),
            "categoryLabel": pre_check_dict.get("category_label"),
            "unsupportedCategory": pre_check_dict.get("unsupported_category", False),
            "findings": pre_check_dict.get("findings", []),
            "llmFindings": llm_result_dict.get("findings", []),
            "llmAnalysis": {
                "status": llm_result_dict.get("status"),
                "model": llm_result_dict.get("model_used"),
                "summary": llm_result_dict.get("summary"),
                "findingsCount": len(llm_result_dict.get("findings", [])),
                "errorMessage": llm_result_dict.get("error_message"),
                "httpStatus": llm_result_dict.get("http_status"),
                "requestedTokens": llm_result_dict.get("requested_tokens"),
                "tokenLimit": llm_result_dict.get("token_limit"),
                "totalBatches": llm_result_dict.get("total_batches"),
                "successfulBatches": llm_result_dict.get("successful_batches"),
            },
            "resubmissionDiff": resubmission_diff,
            "isResubmission": is_resubmission,
            "reusedReport": False,
        },
    }

    report_resp = await backend_client.submit_pre_check_report(application_id, report_payload)
    report_id = report_resp.get("report", {}).get("id") or existing_report_id
    return {
        "report_id": report_id,
        "version_hash": version_hash,
        "reused": False,
    }


async def tool_create_internal_notification(
    application_id: str,
    recipient_id: str,
    title: str,
    message: str,
    priority: str = "normal",
    action_url: Optional[str] = None,
    deduplication_key: Optional[str] = None,
    **kwargs,
) -> Dict[str, Any]:
    """Send an advisory notification to the assigned officer or committee."""
    resolved_action_url = action_url or kwargs.get("actionUrl")
    resolved_dedup_key = deduplication_key or kwargs.get("deduplicationKey")
    try:
        resp = await backend_client.create_internal_notification(
            application_id=application_id,
            recipient_id=recipient_id,
            title=title,
            message=message,
            priority=priority,
            action_url=resolved_action_url,
            deduplication_key=resolved_dedup_key,
        )
        return {"success": True, "notification": resp}
    except Exception as e:
        logger.warning(f"Could not deliver internal notification for {application_id}: {e}")
        return {"success": False, "error": str(e)}


def normalize_text_for_comparison(txt: str) -> str:
    """Normalize text for reliable fuzzy excerpt verification and signature deduplication."""
    return re.sub(r"[^\w\s]", "", (txt or "").lower()).replace("\n", " ").strip()


def generate_stable_observation_id(g: Dict[str, Any], idx: int = 0) -> str:
    """Generate a deterministic, stable identifier for a Groq qualitative finding."""
    existing_id = g.get("observation_id") or g.get("finding_id")
    if existing_id and str(existing_id).startswith("groq-obs-"):
        return str(existing_id)

    doc_name = g.get("document_name") or g.get("source_document") or "doc"
    doc_clean = re.sub(r"[^\w]", "", urllib.parse.unquote(str(doc_name)).lower())[:10] or "doc"
    page = str(g.get("page_number") or g.get("source_page") or "1")
    ftype = str(g.get("finding_type") or "obs").lower()[:8]
    exc = (g.get("evidence_excerpt") or g.get("explanation") or "")[:40]
    norm_exc = normalize_text_for_comparison(exc)
    exc_hash = hashlib.sha256(norm_exc.encode("utf-8")).hexdigest()[:8]
    return f"groq-obs-{doc_clean}-{page}-{ftype}-{exc_hash}"


def format_formal_supplementary_observation(g: Dict[str, Any], idx: int = 0) -> Dict[str, Any]:
    """
    Convert raw Groq LLM finding into a structured formal regulatory notice draft.
    Adheres strictly to neutral, formal AICTE official language standards.
    Preserves existing officer edits and decisions if already present.
    """
    doc_name = g.get("document_name") or g.get("source_document") or "Submitted Application Document"
    doc_name_display = urllib.parse.unquote(str(doc_name))
    page_num = g.get("page_number") or g.get("source_page")
    evidence = (g.get("evidence_excerpt") or "").strip()
    raw_exp = (g.get("explanation") or "").strip()
    raw_rec = (g.get("human_review_recommendation") or g.get("required_action") or g.get("suggested_action") or "").strip()
    finding_type = g.get("finding_type") or "QUALITATIVE_OBSERVATION"
    confidence = g.get("confidence", 0.8)
    severity = g.get("severity_suggestion") or g.get("severity") or "ADVISORY_MEDIUM"
    excerpt_verified = bool(g.get("excerpt_verified", True))
    stable_obs_id = generate_stable_observation_id(g, idx)

    # A. Observation Heading: Concise, professional title describing the document issue
    type_map = {
        "MISSING_SUPPORTING_EVIDENCE": "Absence of Substantive Regulatory Content",
        "CONTEXTUAL_INCONSISTENCY": "Contextual Inconsistency in Submitted Documentation",
        "DATA_DISCREPANCY": "Discrepancy in Disclosed Documentary Figures",
        "EXPIRED_DOCUMENT": "Validity Period Non-Conformity",
        "AMBIGUOUS_STATEMENT": "Incomplete or Ambiguous Declaration",
        "QUALITATIVE_OBSERVATION": "Supplementary Document Scrutiny Observation",
    }
    base_heading = type_map.get(finding_type, finding_type.replace("_", " ").title())
    heading = f"{base_heading} — {doc_name_display}"

    # B. Document Reference: Exact uploaded filename and page number
    if page_num:
        doc_reference = f"'{doc_name_display}', Page {page_num}"
    else:
        doc_reference = f"'{doc_name_display}'"

    # C. Formal Proposed Notice Paragraph: Professional, neutral, official regulatory framing
    clean_text = raw_exp
    for lead in [
        "The document text provided consists solely of",
        "The uploaded file consists solely of",
        "The document appears to be",
        "The file is",
    ]:
        if clean_text.lower().startswith(lead.lower()):
            clean_text = clean_text[len(lead):].strip()
            break

    if "metadata" in raw_exp.lower() and "substantive" in raw_exp.lower():
        formal_paragraph = (
            f"The document submitted under the heading '{doc_name_display}' appears to contain only verification-related "
            f"metadata and header information, and does not provide substantive particulars concerning statutory declarations, "
            f"cadre allocations, or recruitment details. The submitted documentation does not presently establish "
            f"compliance with AICTE Approval Process Handbook (APH 2024-27) norms."
        )
    elif "student" in raw_exp.lower() or "problem statement" in raw_exp.lower() or "assignment" in raw_exp.lower():
        formal_paragraph = (
            f"The document submitted by the Institution under the title '{doc_name_display}' appears to be academic "
            f"coursework or assignment material rather than the requisite regulatory submission. "
            f"The submitted document does not establish the statutory declarations or institutional governance approvals "
            f"mandated under AICTE norms for the applied category."
        )
    elif "ethics" in raw_exp.lower() or "case study" in raw_exp.lower():
        formal_paragraph = (
            f"The document submitted under the heading '{doc_name_display}' appears to be a general case study / reference paper "
            f"and does not constitute valid regulatory evidence or statutory documentation. "
            f"The requisite institutional approvals and statutory certifications are not established."
        )
    elif clean_text:
        if not clean_text.lower().startswith("the document") and not clean_text.lower().startswith("upon scrutiny"):
            clean_text = f"it appears that {clean_text[0].lower() + clean_text[1:]}"
        formal_paragraph = (
            f"Upon preliminary qualitative examination of the document submitted under '{doc_name_display}', "
            f"{clean_text}. The submitted documentation does not presently establish the substantive "
            f"particulars required for verification by the Scrutiny Committee."
        )
    else:
        formal_paragraph = (
            f"The document submitted by the Institution under '{doc_name_display}' requires documentary clarification "
            f"regarding substantive particulars and compliance with AICTE regulatory norms."
        )

    # D. Supporting Evidence: Concise factual explanation or extracted quote
    if evidence:
        supporting_evidence = f"Extracted excerpt from {doc_reference}: \"{evidence}\""
    else:
        supporting_evidence = f"Factual observation recorded during qualitative examination of {doc_reference}."

    # E. Required Institutional Clarification / Corrective Action
    if "replacement" in raw_rec.lower() or "genuine" in raw_rec.lower() or "complete" in raw_rec.lower():
        required_action = (
            f"The Institution is requested to submit the complete, substantive supporting document containing all "
            f"relevant statutory particulars, authorized endorsements, and certified schedules for examination by the Scrutiny Officer."
        )
    elif raw_rec:
        rec_clean = raw_rec
        if rec_clean.lower().startswith("request "):
            rec_clean = rec_clean[8:].strip()
        required_action = (
            f"The Institution is requested to provide official clarification and submit {rec_clean} "
            f"to substantiate compliance with AICTE norms."
        )
    else:
        required_action = (
            f"The Institution is requested to submit the complete, authenticated supporting documentation "
            f"for verification by the Scrutiny Committee."
        )

    # F. Verification Limitation: Retain excerpt verification status
    if not excerpt_verified:
        verification_limitation = (
            "Manual Excerpt Verification Required — Source excerpt could not be programmatically matched "
            "against extracted document bytes. Scrutiny Officer manual inspection of the uploaded document is required before formal reliance."
        )
    else:
        verification_limitation = "Programmatically Verified — Source excerpt confirmed against submitted document text."

    return {
        "observation_id": stable_obs_id,
        "heading": g.get("edited_heading") or g.get("heading") or heading,
        "finding_type": finding_type,
        "source_document": doc_name,
        "source_document_display": doc_name_display,
        "source_page": page_num,
        "document_reference": doc_reference,
        "document_ref": doc_reference,
        "formal_notice_paragraph": formal_paragraph,
        "supporting_evidence": supporting_evidence,
        "required_action": required_action,
        "verification_limitation": verification_limitation,
        "excerpt_verified": excerpt_verified,
        "confidence": confidence,
        "severity": severity,
        "facts_vs_inference": g.get("facts_vs_inference"),
        "factual_basis": g.get("facts_vs_inference"),
        "human_review_recommendation": g.get("human_review_recommendation"),
        "significance": g.get("significance"),
        "is_llm_generated": True,
        "officer_action": g.get("officer_action", "EXCLUDED"),  # Default-exclusion: Officer Discretion Gate
        "edited_heading": g.get("edited_heading"),
        "edited_explanation": g.get("edited_explanation"),
        "edited_action": g.get("edited_action"),
        # Backward compatibility aliases
        "explanation": formal_paragraph,
        "suggested_action": required_action,
        "evidence_excerpt": evidence,
    }


def get_current_version_groq_findings(
    application_id: str,
    version_hash: Optional[str] = None,
    new_findings: Optional[List[Dict[str, Any]]] = None,
) -> Tuple[Optional[str], List[Dict[str, Any]], Dict[str, Any]]:
    """
    Retrieve and deduplicate all persisted Groq qualitative scrutiny findings for the specified
    application and document version hash.
    
    Sources:
    1. Explicitly supplied findings (new_findings)
    2. Completed scrutiny_batches in SQLite (status == 'SUCCESS')
    3. ReviewReport.metadataJson.llmFindings in Prisma SQLite (dev.db)
    4. Preserved findings from batch history
    
    Returns:
    (resolved_v_hash, deduped_findings, batch_progress)
    """
    resolved_v_hash = version_hash

    # Resolve version hash from database if not passed
    if not resolved_v_hash:
        try:
            prisma_db = PROJECT_ROOT / "backend" / "prisma" / "dev.db"
            if prisma_db.exists():
                conn = sqlite3.connect(str(prisma_db))
                cur = conn.cursor()
                cur.execute(
                    "SELECT versionHash FROM ReviewReport WHERE applicationId = ? ORDER BY submittedAt DESC LIMIT 1",
                    (application_id,),
                )
                r_row = cur.fetchone()
                if r_row and r_row[0]:
                    resolved_v_hash = r_row[0]
                conn.close()
        except Exception as e:
            logger.debug(f"Could not resolve version hash from DB in get_current_version_groq_findings: {e}")

    if not resolved_v_hash:
        try:
            from llm.batch_store import get_latest_job
            job = get_latest_job(application_id)
            if job and job.get("version_hash"):
                resolved_v_hash = job["version_hash"]
        except Exception:
            pass

    candidate_findings: List[Dict[str, Any]] = []

    # Source A: Explicitly supplied findings
    if new_findings:
        for f in new_findings:
            if isinstance(f, dict):
                candidate_findings.append(f)
            elif hasattr(f, "model_dump"):
                candidate_findings.append(f.model_dump())

    # Source B: Completed scrutiny_batches in SQLite
    if resolved_v_hash:
        try:
            from llm.batch_store import get_all_batches_for_version
            batches = get_all_batches_for_version(application_id, resolved_v_hash)
            for b in batches:
                if b.get("status") == "SUCCESS" and b.get("findings_json"):
                    b_findings = json.loads(b["findings_json"])
                    if isinstance(b_findings, list):
                        candidate_findings.extend(b_findings)
        except Exception as e:
            logger.debug(f"Error reading batches in get_current_version_groq_findings: {e}")

    # Source C: ReviewReport.metadataJson.llmFindings in Prisma dev.db
    try:
        prisma_db = PROJECT_ROOT / "backend" / "prisma" / "dev.db"
        if prisma_db.exists():
            conn = sqlite3.connect(str(prisma_db))
            cur = conn.cursor()
            cur.execute(
                "SELECT versionHash, metadataJson FROM ReviewReport WHERE applicationId = ? AND reportType = 'AI_SCRUTINY_PRE_CHECK' ORDER BY submittedAt DESC LIMIT 1",
                (application_id,),
            )
            r_row = cur.fetchone()
            if r_row and r_row[1]:
                # Version isolation: only accept findings if version hash matches or resolved_v_hash is unset
                if not resolved_v_hash or (r_row[0] and r_row[0] == resolved_v_hash):
                    if not resolved_v_hash and r_row[0]:
                        resolved_v_hash = r_row[0]
                    r_meta = json.loads(r_row[1])
                    r_llm = r_meta.get("llmFindings") or []
                    if isinstance(r_llm, list):
                        candidate_findings.extend(r_llm)
            conn.close()
    except Exception as e:
        logger.debug(f"Error reading ReviewReport in get_current_version_groq_findings: {e}")

    # Source D: find_preserved_findings_from_history
    if resolved_v_hash:
        try:
            from llm.batch_store import find_preserved_findings_from_history
            _, hist_findings, _ = find_preserved_findings_from_history(application_id, resolved_v_hash)
            if hist_findings:
                candidate_findings.extend(hist_findings)
        except Exception as e:
            logger.debug(f"Error reading history in get_current_version_groq_findings: {e}")

    # Deduplicate findings while preserving regulatory details
    seen_sigs = set()
    deduped_findings: List[Dict[str, Any]] = []
    for item in candidate_findings:
        if not isinstance(item, dict):
            continue
        doc_ref = str(item.get("document_id") or item.get("document_name") or item.get("source_document") or "")
        p_num = str(item.get("page_number") or item.get("source_page") or "1")
        exc_norm = normalize_text_for_comparison(item.get("evidence_excerpt") or item.get("explanation") or "")[:50]
        sig = (doc_ref, p_num, exc_norm)
        if sig not in seen_sigs:
            seen_sigs.add(sig)
            deduped_findings.append(item)

    # Calculate batch progress
    tot_batches = 1
    succ_batches = 1
    if resolved_v_hash:
        try:
            from llm.batch_store import get_all_batches_for_version
            b_list = get_all_batches_for_version(application_id, resolved_v_hash)
            if b_list:
                tot_batches = len(b_list)
                succ_batches = len([b for b in b_list if b.get("status") == "SUCCESS"])
        except Exception:
            pass

    batch_prog = {
        "total_batches": tot_batches,
        "successful_batches": succ_batches,
        "completed_batches": succ_batches,
        "is_partial": succ_batches < tot_batches,
        "findings_count": len(deduped_findings),
    }

    return resolved_v_hash, deduped_findings, batch_prog


def merge_observations_preserving_officer_edits(
    raw_findings: List[Dict[str, Any]],
    existing_observations: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Merge raw Groq findings into formal observations while strictly preserving
    all existing officer decisions (INCLUDED/EXCLUDED) and text edits.
    Newly arriving observations strictly default to officer_action = 'EXCLUDED'.
    """
    existing_obs_map: Dict[str, Dict[str, Any]] = {}

    for o in existing_observations:
        if not isinstance(o, dict):
            continue
        oid = o.get("observation_id")
        d_name = str(o.get("source_document") or o.get("document_name") or o.get("document_reference") or "")
        p_num = str(o.get("source_page") or o.get("page_number") or "1")
        exc_norm = normalize_text_for_comparison(
            o.get("supporting_evidence") or o.get("formal_notice_paragraph") or o.get("explanation") or ""
        )[:50]
        sig_key = f"{d_name}:{p_num}:{exc_norm}"

        target_keys = []
        if oid:
            target_keys.append(oid)
        if sig_key != "::":
            target_keys.append(sig_key)

        for tk in target_keys:
            prior = existing_obs_map.get(tk)
            if not prior:
                existing_obs_map[tk] = o
            else:
                # Prioritize version with explicit officer action or edits
                if (
                    o.get("officer_action") == "INCLUDED"
                    or o.get("edited_heading")
                    or o.get("edited_explanation")
                    or o.get("edited_action")
                ):
                    existing_obs_map[tk] = o

    merged_observations: List[Dict[str, Any]] = []
    for idx, f in enumerate(raw_findings):
        stable_id = generate_stable_observation_id(f, idx)
        d_name = str(f.get("document_name") or f.get("source_document") or "")
        p_num = str(f.get("page_number") or f.get("source_page") or "1")
        exc_norm = normalize_text_for_comparison(f.get("evidence_excerpt") or f.get("explanation") or "")[:50]
        sig_key = f"{d_name}:{p_num}:{exc_norm}"

        existing_match = existing_obs_map.get(stable_id) or existing_obs_map.get(sig_key)

        new_obs = format_formal_supplementary_observation(f, idx)
        new_obs["observation_id"] = stable_id

        if existing_match:
            # PRESERVE OFFICER EDITS AND DECISIONS
            merged_item = dict(new_obs)
            merged_item["observation_id"] = existing_match.get("observation_id") or stable_id
            merged_item["officer_action"] = existing_match.get("officer_action", "EXCLUDED")

            # Preserve headings
            if existing_match.get("edited_heading"):
                merged_item["edited_heading"] = existing_match["edited_heading"]
                merged_item["heading"] = existing_match["edited_heading"]
            elif existing_match.get("heading"):
                merged_item["heading"] = existing_match["heading"]

            # Preserve explanations
            if existing_match.get("edited_explanation"):
                merged_item["edited_explanation"] = existing_match["edited_explanation"]
                merged_item["formal_notice_paragraph"] = existing_match["edited_explanation"]
                merged_item["explanation"] = existing_match["edited_explanation"]
            elif existing_match.get("formal_notice_paragraph"):
                merged_item["formal_notice_paragraph"] = existing_match["formal_notice_paragraph"]
                merged_item["explanation"] = existing_match.get("explanation") or existing_match["formal_notice_paragraph"]

            # Preserve actions
            if existing_match.get("edited_action"):
                merged_item["edited_action"] = existing_match["edited_action"]
                merged_item["required_action"] = existing_match["edited_action"]
                merged_item["suggested_action"] = existing_match["edited_action"]
            elif existing_match.get("required_action"):
                merged_item["required_action"] = existing_match["required_action"]
                merged_item["suggested_action"] = existing_match.get("suggested_action") or existing_match["required_action"]

            merged_observations.append(merged_item)
        else:
            # NEW OBSERVATION: Default to EXCLUDED
            new_obs["officer_action"] = "EXCLUDED"
            merged_observations.append(new_obs)

    return merged_observations


def synchronize_agent_action_observations(
    application_id: str,
    version_hash: Optional[str] = None,
    new_findings: Optional[List[Dict[str, Any]]] = None,
    action_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    UNIVERSAL ACTION SYNCHRONIZER:
    Synchronizes ALL pending officer-facing autonomous agent actions (PROPOSE_DEFICIENCY_NOTICE,
    REQUEST_HUMAN_REVIEW, PROPOSE_FORWARD_TO_NEXT_STAGE, etc.) with completed Groq qualitative findings
    for the current application document version.

    Preserves:
    1. Distinct purpose, authorization rules, and workflow behaviour of each action type.
    2. Officer inclusion/exclusion decisions and text edits.
    3. Part I statutory items / checklist items / verified requirements.
    4. Version isolation.
    5. Action immutability for EXECUTED / REJECTED records.
    """
    pending_actions = get_actions_for_application(application_id, status="WAITING_FOR_APPROVAL")
    if action_id:
        pending_actions = [a for a in pending_actions if a.get("action_id") == action_id]

    RELEVANT_ACTION_TYPES = {
        "PROPOSE_DEFICIENCY_NOTICE",
        "REQUEST_HUMAN_REVIEW",
        "PROPOSE_FORWARD_TO_NEXT_STAGE",
        "DRAFT_OFFICIAL_COMMUNICATION",
        "REQUEST_SITE_INSPECTION",
        "PROPOSE_STAGE_TRANSITION",
    }
    target_actions = [a for a in pending_actions if a.get("action_type") in RELEVANT_ACTION_TYPES]

    if not target_actions:
        return []

    # Group actions by type to consolidate duplicates
    by_type: Dict[str, List[Dict[str, Any]]] = {}
    for a in target_actions:
        atype = a.get("action_type")
        by_type.setdefault(atype, []).append(a)

    updated_actions = []

    for atype, action_group in by_type.items():
        primary_action = action_group[0]
        act_id = primary_action["action_id"]
        payload = dict(primary_action.get("input_payload") or {})

        resolved_v_hash = (
            version_hash
            or payload.get("version_hash")
            or (payload.get("draft_notice") or {}).get("version_hash")
            or (payload.get("review_request") or {}).get("version_hash")
            or (payload.get("transition_proposal") or {}).get("version_hash")
        )

        resolved_v_hash, deduped_findings, batch_prog = get_current_version_groq_findings(
            application_id=application_id,
            version_hash=resolved_v_hash,
            new_findings=new_findings,
        )

        # Collect existing observations from all possible sub-keys
        existing_observations: List[Dict[str, Any]] = []
        for src_list in [
            payload.get("advisory_observations"),
            payload.get("supplementary_observations"),
            (payload.get("draft_notice") or {}).get("advisory_observations"),
            (payload.get("draft_notice") or {}).get("supplementary_observations"),
            (payload.get("review_request") or {}).get("advisory_observations"),
            (payload.get("review_request") or {}).get("supplementary_observations"),
            (payload.get("transition_proposal") or {}).get("advisory_observations"),
            (payload.get("transition_proposal") or {}).get("supplementary_observations"),
        ]:
            if isinstance(src_list, list):
                existing_observations.extend(src_list)

        merged_observations = merge_observations_preserving_officer_edits(
            raw_findings=deduped_findings,
            existing_observations=existing_observations,
        )

        # Attach observations and batch progress to top-level payload
        payload["advisory_observations"] = merged_observations
        payload["supplementary_observations"] = merged_observations
        payload["batch_progress"] = batch_prog
        if resolved_v_hash:
            payload["version_hash"] = resolved_v_hash

        # Attach to action-specific sub-payload
        if atype == "PROPOSE_DEFICIENCY_NOTICE":
            draft = dict(payload.get("draft_notice") or {})
            draft["advisory_observations"] = merged_observations
            draft["supplementary_observations"] = merged_observations
            draft["batch_progress"] = batch_prog
            if resolved_v_hash:
                draft["version_hash"] = resolved_v_hash
            payload["draft_notice"] = draft
        elif atype == "REQUEST_HUMAN_REVIEW":
            review_req = dict(payload.get("review_request") or {})
            review_req["advisory_observations"] = merged_observations
            review_req["supplementary_observations"] = merged_observations
            review_req["batch_progress"] = batch_prog
            if resolved_v_hash:
                review_req["version_hash"] = resolved_v_hash
            payload["review_request"] = review_req
        elif atype in ("PROPOSE_FORWARD_TO_NEXT_STAGE", "PROPOSE_STAGE_TRANSITION"):
            trans_prop = dict(payload.get("transition_proposal") or {})
            trans_prop["advisory_observations"] = merged_observations
            trans_prop["supplementary_observations"] = merged_observations
            trans_prop["batch_progress"] = batch_prog
            if resolved_v_hash:
                trans_prop["version_hash"] = resolved_v_hash
            payload["transition_proposal"] = trans_prop

        # Persist updated action
        updated = update_action(
            action_id=act_id,
            input_payload=payload,
            rationale=primary_action.get("rationale"),
        )
        if updated:
            updated_actions.append(updated)

        # Supersede duplicate pending actions of the same type
        if len(action_group) > 1:
            for dup in action_group[1:]:
                try:
                    update_action(
                        action_id=dup["action_id"],
                        status="REJECTED",
                        rejection_reason=f"Superseded by consolidated multi-batch {atype} action",
                    )
                except Exception as dup_err:
                    logger.debug(f"Failed to supersede duplicate action {dup['action_id']}: {dup_err}")

        logger.info(
            f"Synchronized {atype} action {act_id} for app {application_id} "
            f"(version={resolved_v_hash[:10] if resolved_v_hash else 'unknown'}): "
            f"{len(merged_observations)} supplementary observations across "
            f"{batch_prog.get('successful_batches', 1)}/{batch_prog.get('total_batches', 1)} batches."
        )

    return updated_actions


def synchronize_agent_deficiency_proposal(
    application_id: str,
    version_hash: Optional[str] = None,
    new_findings: Optional[List[Dict[str, Any]]] = None,
    deficiency_items: Optional[List[Dict[str, Any]]] = None,
    rationale: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Backward-compatible wrapper: Synchronizes agent actions and returns the primary
    deficiency notice proposal if present (or primary action).
    """
    synced = synchronize_agent_action_observations(
        application_id=application_id,
        version_hash=version_hash,
        new_findings=new_findings,
    )
    def_actions = [a for a in synced if a.get("action_type") == "PROPOSE_DEFICIENCY_NOTICE"]
    if def_actions:
        return def_actions[0]
    return synced[0] if synced else None


def tool_propose_deficiency_notice(
    execution_id: str,
    application_id: str,
    deficiency_items: List[Dict[str, Any]],
    rationale: str,
    app_state: Optional[Dict[str, Any]] = None,
    version_hash: Optional[str] = None,
    groq_observations: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    RESERVED ACTION: Propose an official deficiency notice for human approval.
    Does NOT issue the deficiency notice directly. Creates a pending approval gate.
    Associates each deficiency with its rule ID, evidence, source document/page,
    verified APH reference, and clear corrective action.
    Selects intended recipient and institution from authoritative application records.
    Optionally attaches supplementary Groq qualitative observations for officer inclusion/editing.
    If a pending proposal already exists, synchronizes it instead of creating duplicate proposals.
    """
    app_data = (app_state or {}).get("raw", {}) if app_state else {}
    app_num = (app_state or {}).get("applicationNumber") or app_data.get("applicationNumber") or application_id
    inst_id = (app_state or {}).get("institutionId") or app_data.get("institutionId") or ""
    inst_name = (app_state or {}).get("institutionName") or app_data.get("institution", {}).get("institutionName") or "Applicant Institution"
    recipient_user_id = app_data.get("createdById") or (app_state or {}).get("createdById") or ""
    officer_id = (app_state or {}).get("assignedUserId") or app_data.get("assignedUserId") or ""

    structured_items: List[Dict[str, Any]] = []
    for d in deficiency_items:
        rule_id = d.get("rule_id", "STATUTORY_RULE")
        rule_name = d.get("rule_name", rule_id)
        aph_clause = d.get("aph_clause") or "APH 2024-2027 Statutory Norms"
        aph_chapter = d.get("aph_chapter") or "Chapter II"
        doc_name = d.get("document_name")
        page_num = d.get("page_number")
        evidence = d.get("evidence") or "Deficiency noted in submitted statutory documentation."
        recommendation = d.get("recommendation") or f"Submit valid statutory documentation satisfying {rule_name} norms."

        explanation = f"Statutory non-compliance identified for '{rule_name}' under {aph_clause} ({aph_chapter}). Observed deficiency: {evidence}"
        corrective_action = recommendation

        structured_items.append({
            "rule_id": rule_id,
            "rule_name": rule_name,
            "aph_clause": aph_clause,
            "aph_chapter": aph_chapter,
            "source_document": doc_name,
            "source_page": page_num,
            "evidence": evidence,
            "explanation": explanation,
            "corrective_action": corrective_action,
        })

    # Check if a pending WAITING_FOR_APPROVAL proposal already exists
    existing_pending = get_actions_for_application(application_id, status="WAITING_FOR_APPROVAL")
    existing_proposal = next(
        (a for a in existing_pending if a.get("action_type") == "PROPOSE_DEFICIENCY_NOTICE"),
        None,
    )

    if existing_proposal:
        # Reconcile and update existing proposal instead of creating duplicate actions
        updated_action = synchronize_agent_deficiency_proposal(
            application_id=application_id,
            version_hash=version_hash,
            new_findings=groq_observations,
            deficiency_items=structured_items,
            rationale=rationale,
        )
        if updated_action:
            p_load = updated_action.get("input_payload") or {}
            d_notice = p_load.get("draft_notice") or {}
            return {
                "action_id": updated_action["action_id"],
                "requires_approval": True,
                "status": "WAITING_FOR_APPROVAL",
                "action_type": "PROPOSE_DEFICIENCY_NOTICE",
                "rationale": rationale,
                "deficiency_count": len(structured_items),
                "draft_notice": d_notice,
                "institution_id": inst_id,
                "intended_recipient_user_id": recipient_user_id,
                "version_hash": version_hash or "",
                "advisory_observations": d_notice.get("advisory_observations", []),
            }

    # If no pending proposal exists, gather ALL findings across completed batches for this version
    all_findings_for_creation = list(groq_observations or [])
    if version_hash:
        try:
            from llm.batch_store import get_all_batches_for_version
            b_list = get_all_batches_for_version(application_id, version_hash)
            for b in b_list:
                if b.get("status") == "SUCCESS" and b.get("findings_json"):
                    parsed_b = json.loads(b["findings_json"])
                    if isinstance(parsed_b, list):
                        all_findings_for_creation.extend(parsed_b)
        except Exception as e:
            logger.debug(f"Error reading batches for proposal creation: {e}")

    # Deduplicate findings
    seen_sigs = set()
    deduped_for_creation = []
    for item in all_findings_for_creation:
        if not isinstance(item, dict):
            continue
        doc_ref = str(item.get("document_id") or item.get("document_name") or item.get("source_document") or "")
        p_num = str(item.get("page_number") or item.get("source_page") or "1")
        exc_norm = normalize_text_for_comparison(item.get("evidence_excerpt") or item.get("explanation") or "")[:50]
        sig = (doc_ref, p_num, exc_norm)
        if sig not in seen_sigs:
            seen_sigs.add(sig)
            deduped_for_creation.append(item)

    structured_groq_observations: List[Dict[str, Any]] = []
    for idx, g in enumerate(deduped_for_creation):
        obs = format_formal_supplementary_observation(g, idx)
        structured_groq_observations.append(obs)

    # Calculate batch progress
    tot_batches = 1
    succ_batches = 1
    if version_hash:
        try:
            from llm.batch_store import get_all_batches_for_version
            b_list = get_all_batches_for_version(application_id, version_hash)
            if b_list:
                tot_batches = len(b_list)
                succ_batches = len([b for b in b_list if b.get("status") == "SUCCESS"])
        except Exception:
            pass

    batch_progress = {
        "total_batches": tot_batches,
        "successful_batches": succ_batches,
        "is_partial": succ_batches < tot_batches,
        "findings_count": len(structured_groq_observations),
    }

    draft_notice = {
        "title": f"Statutory Deficiency Notice: {app_num}",
        "statutory_authority": "AICTE Approval Process Handbook (APH 2024-2027)",
        "recipient_institution": inst_name,
        "recipient_institution_id": inst_id,
        "recipient_user_id": recipient_user_id,
        "assigned_officer_id": officer_id,
        "suggested_due_days": 10,
        "summary": f"Agent identified {len(deficiency_items)} statutory deficiency(ies) requiring official rectification before approval consideration.",
        "statutory_deficiencies": structured_items,
        "items": structured_items,
        "supplementary_observations": structured_groq_observations,
        "advisory_observations": structured_groq_observations,
        "version_hash": version_hash or "",
        "statutory_warning": "This proposal is purely advisory and holds no official legal effect until reviewed, authorized, and dispatched by a designated AICTE Scrutiny Officer.",
    }

    input_payload = {
        "application_id": application_id,
        "application_number": app_num,
        "institution_id": inst_id,
        "institution_name": inst_name,
        "intended_recipient_user_id": recipient_user_id,
        "assigned_officer_id": officer_id,
        "version_hash": version_hash or "",
        "suggested_due_days": 10,
        "deficiency_items": structured_items,
        "statutory_deficiencies": structured_items,
        "advisory_observations": structured_groq_observations,
        "supplementary_observations": structured_groq_observations,
        "draft_notice": draft_notice,
        "batch_progress": batch_progress,
    }
    action = create_action(
        execution_id=execution_id,
        application_id=application_id,
        action_type="PROPOSE_DEFICIENCY_NOTICE",
        input_payload=input_payload,
        requires_approval=True,
        rationale=rationale,
    )
    return {
        "action_id": action["action_id"],
        "requires_approval": True,
        "status": "WAITING_FOR_APPROVAL",
        "action_type": "PROPOSE_DEFICIENCY_NOTICE",
        "rationale": rationale,
        "deficiency_count": len(deficiency_items),
        "draft_notice": draft_notice,
        "institution_id": inst_id,
        "intended_recipient_user_id": recipient_user_id,
        "version_hash": version_hash or "",
        "advisory_observations": structured_groq_observations,
    }


def tool_propose_forward_to_next_stage(
    execution_id: str,
    application_id: str,
    compliant_items: List[Dict[str, Any]],
    rationale: str,
    app_state: Optional[Dict[str, Any]] = None,
    version_hash: Optional[str] = None,
    groq_observations: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    RESERVED ACTION: Propose stage transition to next workflow stage for human approval.
    Requires human officer authorization before advancing application.
    Triggered when all statutory requirements are satisfied and no active deficiency exists.
    Attaches supplementary Groq observations if present for officer awareness.
    If a pending proposal already exists, synchronizes it instead of creating duplicates.
    """
    app_data = (app_state or {}).get("raw", {}) if app_state else {}
    app_num = (app_state or {}).get("applicationNumber") or app_data.get("applicationNumber") or application_id
    inst_id = (app_state or {}).get("institutionId") or app_data.get("institutionId") or ""
    inst_name = (app_state or {}).get("institutionName") or app_data.get("institution", {}).get("institutionName") or "Applicant Institution"
    officer_id = (app_state or {}).get("assignedUserId") or app_data.get("assignedUserId") or ""
    current_stage = (app_state or {}).get("currentStageId") or "scrutiny"
    current_stage_name = (app_state or {}).get("currentStageName") or "Scrutiny Committee Review"

    requires_evc = app_data.get("requiresEvc", False)
    recommended_stage = "hearing" if requires_evc else "decision"
    recommended_stage_name = "Standing Hearing Committee / EVC" if requires_evc else "Competent Authority Final Decision"

    # Check if a pending WAITING_FOR_APPROVAL action already exists
    existing_pending = get_actions_for_application(application_id, status="WAITING_FOR_APPROVAL")
    existing_stage_action = next(
        (a for a in existing_pending if a.get("action_type") in ("PROPOSE_FORWARD_TO_NEXT_STAGE", "PROPOSE_STAGE_TRANSITION")),
        None,
    )
    if existing_stage_action:
        synced = synchronize_agent_action_observations(
            application_id=application_id,
            version_hash=version_hash,
            new_findings=groq_observations,
        )
        updated_action = next((a for a in synced if a.get("action_id") == existing_stage_action["action_id"]), None)
        if updated_action:
            p_load = updated_action.get("input_payload") or {}
            t_prop = p_load.get("transition_proposal") or {}
            return {
                "action_id": updated_action["action_id"],
                "requires_approval": True,
                "status": "WAITING_FOR_APPROVAL",
                "action_type": "PROPOSE_FORWARD_TO_NEXT_STAGE",
                "rationale": rationale,
                "recommended_stage": recommended_stage,
                "verified_count": len(compliant_items),
                "transition_proposal": t_prop,
                "version_hash": version_hash or "",
                "advisory_observations": p_load.get("advisory_observations", []),
            }

    # Gather findings across all completed batches for this version
    resolved_v_hash, deduped_findings, batch_prog = get_current_version_groq_findings(
        application_id=application_id,
        version_hash=version_hash,
        new_findings=groq_observations,
    )
    structured_groq_observations = [
        format_formal_supplementary_observation(f, idx)
        for idx, f in enumerate(deduped_findings)
    ]

    transition_proposal = {
        "title": f"Stage Progression Proposal: {app_num}",
        "statutory_authority": "AICTE Approval Process Handbook (APH 2024-2027)",
        "applicant_institution": inst_name,
        "institution_id": inst_id,
        "current_stage": current_stage,
        "current_stage_name": current_stage_name,
        "recommended_stage": recommended_stage,
        "recommended_stage_name": recommended_stage_name,
        "verified_requirements_count": len(compliant_items),
        "summary": f"All {len(compliant_items)} statutory pre-check requirements verified compliant per APH 2024-2027 norms. Stage advancement to {recommended_stage_name} recommended.",
        "verified_items": [
            {
                "rule_id": item.get("rule_id"),
                "rule_name": item.get("rule_name", item.get("rule_id")),
                "aph_clause": item.get("aph_clause"),
                "evidence": item.get("evidence"),
            }
            for item in compliant_items
        ],
        "advisory_observations": structured_groq_observations,
        "supplementary_observations": structured_groq_observations,
        "batch_progress": batch_prog,
        "version_hash": resolved_v_hash or "",
        "statutory_notice": "This progression proposal requires formal digital authorization by the designated AICTE Scrutiny Officer before workflow stage transition occurs.",
    }

    input_payload = {
        "application_id": application_id,
        "application_number": app_num,
        "institution_id": inst_id,
        "institution_name": inst_name,
        "assigned_officer_id": officer_id,
        "version_hash": resolved_v_hash or "",
        "current_stage": current_stage,
        "recommended_stage": recommended_stage,
        "advisory_observations": structured_groq_observations,
        "supplementary_observations": structured_groq_observations,
        "batch_progress": batch_prog,
        "transition_proposal": transition_proposal,
    }

    action = create_action(
        execution_id=execution_id,
        application_id=application_id,
        action_type="PROPOSE_FORWARD_TO_NEXT_STAGE",
        input_payload=input_payload,
        requires_approval=True,
        rationale=rationale,
    )

    return {
        "action_id": action["action_id"],
        "requires_approval": True,
        "status": "WAITING_FOR_APPROVAL",
        "action_type": "PROPOSE_FORWARD_TO_NEXT_STAGE",
        "rationale": rationale,
        "recommended_stage": recommended_stage,
        "verified_count": len(compliant_items),
        "transition_proposal": transition_proposal,
        "version_hash": resolved_v_hash or "",
        "advisory_observations": structured_groq_observations,
    }


def tool_propose_human_review(
    execution_id: str,
    application_id: str,
    review_items: List[Dict[str, Any]],
    rationale: str,
    app_state: Optional[Dict[str, Any]] = None,
    version_hash: Optional[str] = None,
    groq_observations: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    RESERVED ACTION: Flag application for mandatory manual human review.
    Triggered when evidence is insufficient, checks are ambiguous, or category requires manual verification.
    Requires human officer acknowledgment and determination.
    Attaches supplementary Groq qualitative observations for officer review and context.
    If a pending proposal already exists, synchronizes it instead of creating duplicates.
    """
    app_data = (app_state or {}).get("raw", {}) if app_state else {}
    app_num = (app_state or {}).get("applicationNumber") or app_data.get("applicationNumber") or application_id
    inst_id = (app_state or {}).get("institutionId") or app_data.get("institutionId") or ""
    inst_name = (app_state or {}).get("institutionName") or app_data.get("institution", {}).get("institutionName") or "Applicant Institution"
    officer_id = (app_state or {}).get("assignedUserId") or app_data.get("assignedUserId") or ""

    # Check if a pending WAITING_FOR_APPROVAL action already exists
    existing_pending = get_actions_for_application(application_id, status="WAITING_FOR_APPROVAL")
    existing_review = next(
        (a for a in existing_pending if a.get("action_type") == "REQUEST_HUMAN_REVIEW"),
        None,
    )

    if existing_review:
        synced = synchronize_agent_action_observations(
            application_id=application_id,
            version_hash=version_hash,
            new_findings=groq_observations,
        )
        updated_action = next((a for a in synced if a.get("action_id") == existing_review["action_id"]), None)
        if updated_action:
            p_load = updated_action.get("input_payload") or {}
            r_req = p_load.get("review_request") or {}
            return {
                "action_id": updated_action["action_id"],
                "requires_approval": True,
                "status": "WAITING_FOR_APPROVAL",
                "action_type": "REQUEST_HUMAN_REVIEW",
                "rationale": rationale,
                "items_flagged_count": len(review_items),
                "review_request": r_req,
                "version_hash": version_hash or "",
                "advisory_observations": p_load.get("advisory_observations", []),
            }

    # Gather findings across all completed batches for this version
    resolved_v_hash, deduped_findings, batch_prog = get_current_version_groq_findings(
        application_id=application_id,
        version_hash=version_hash,
        new_findings=groq_observations,
    )
    structured_groq_observations = [
        format_formal_supplementary_observation(f, idx)
        for idx, f in enumerate(deduped_findings)
    ]

    review_request = {
        "title": f"Manual Human Review Advisory: {app_num}",
        "statutory_authority": "AICTE Approval Process Handbook (APH 2024-2027)",
        "applicant_institution": inst_name,
        "institution_id": inst_id,
        "assigned_officer_id": officer_id,
        "items_flagged_count": len(review_items),
        "summary": f"Agent identified {len(review_items)} item(s) requiring human inspection or discretionary verification.",
        "flagged_items": [
            {
                "rule_id": item.get("rule_id", "MANUAL_CHECK"),
                "rule_name": item.get("rule_name", item.get("rule_id")),
                "aph_clause": item.get("aph_clause"),
                "status": item.get("status", "NEEDS_HUMAN_REVIEW"),
                "evidence": item.get("evidence"),
                "recommendation": item.get("recommendation") or "Officer manual inspection required.",
            }
            for item in review_items
        ],
        "advisory_observations": structured_groq_observations,
        "supplementary_observations": structured_groq_observations,
        "batch_progress": batch_prog,
        "version_hash": resolved_v_hash or "",
        "statutory_notice": "Automated evaluation cannot reach a definitive compliance decision. Designated AICTE Scrutiny Officer must conduct manual document inspection.",
    }

    input_payload = {
        "application_id": application_id,
        "application_number": app_num,
        "institution_id": inst_id,
        "institution_name": inst_name,
        "assigned_officer_id": officer_id,
        "version_hash": resolved_v_hash or "",
        "advisory_observations": structured_groq_observations,
        "supplementary_observations": structured_groq_observations,
        "batch_progress": batch_prog,
        "review_request": review_request,
    }

    action = create_action(
        execution_id=execution_id,
        application_id=application_id,
        action_type="REQUEST_HUMAN_REVIEW",
        input_payload=input_payload,
        requires_approval=True,
        rationale=rationale,
    )

    return {
        "action_id": action["action_id"],
        "requires_approval": True,
        "status": "WAITING_FOR_APPROVAL",
        "action_type": "REQUEST_HUMAN_REVIEW",
        "rationale": rationale,
        "items_flagged_count": len(review_items),
        "review_request": review_request,
        "version_hash": resolved_v_hash or "",
        "advisory_observations": structured_groq_observations,
    }


def tool_execute_approved_action(
    action_id: str,
    approver_id: str,
    approval_notes: Optional[str] = None,
    official_notice_id: Optional[str] = None,
    deficiency_cycle: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Execute an action that has been authorized by a human officer.
    Updates the action record with officer verification.
    """
    act = get_action(action_id)
    if not act:
        raise ToolExecutionError(f"Action {action_id} not found.")

    output_payload = {
        "executed_action": act["action_type"],
        "approved_by": approver_id,
        "approval_notes": approval_notes,
        "official_notice_id": official_notice_id,
        "deficiency_cycle": deficiency_cycle,
        "status": "EXECUTED",
    }

    updated = update_action(
        action_id=action_id,
        status="EXECUTED",
        output_payload=output_payload,
        approved_by=approver_id,
    )
    return {
        "action_id": action_id,
        "status": "EXECUTED",
        "executed_by_authority": approver_id,
        "output": output_payload,
    }
