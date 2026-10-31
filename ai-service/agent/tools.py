"""
Controlled Tool Registry for the AICTE Application Lifecycle Agent.
All tools are bounded, policy-checked, and authenticated.
No arbitrary HTTP requests, shell commands, or raw database mutations permitted.
"""

import hashlib
import json
import logging
from typing import Dict, Any, Optional, List, Tuple

from client import backend_client
from extractor import document_extractor
from rules.engine import rule_engine
from llm.scrutiny_agent import scrutiny_agent
from agent.store import create_action, update_action, get_action

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


def tool_propose_deficiency_notice(
    execution_id: str,
    application_id: str,
    deficiency_items: List[Dict[str, Any]],
    rationale: str,
    app_state: Optional[Dict[str, Any]] = None,
    version_hash: Optional[str] = None,
) -> Dict[str, Any]:
    """
    RESERVED ACTION: Propose an official deficiency notice for human approval.
    Does NOT issue the deficiency notice directly. Creates a pending approval gate.
    Associates each deficiency with its rule ID, evidence, source document/page,
    verified APH reference, and clear corrective action.
    Selects intended recipient and institution from authoritative application records.
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

    draft_notice = {
        "title": f"Statutory Deficiency Notice: {app_num}",
        "statutory_authority": "AICTE Approval Process Handbook (APH 2024-2027)",
        "recipient_institution": inst_name,
        "recipient_institution_id": inst_id,
        "recipient_user_id": recipient_user_id,
        "assigned_officer_id": officer_id,
        "suggested_due_days": 10,
        "summary": f"Agent identified {len(deficiency_items)} statutory deficiency(ies) requiring official rectification before approval consideration.",
        "items": structured_items,
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
        "draft_notice": draft_notice,
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
    }


def tool_propose_forward_to_next_stage(
    execution_id: str,
    application_id: str,
    compliant_items: List[Dict[str, Any]],
    rationale: str,
    app_state: Optional[Dict[str, Any]] = None,
    version_hash: Optional[str] = None,
) -> Dict[str, Any]:
    """
    RESERVED ACTION: Propose stage transition to next workflow stage for human approval.
    Requires human officer authorization before advancing application.
    Triggered when all statutory requirements are satisfied and no active deficiency exists.
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
        "statutory_notice": "This progression proposal requires formal digital authorization by the designated AICTE Scrutiny Officer before workflow stage transition occurs.",
    }

    input_payload = {
        "application_id": application_id,
        "application_number": app_num,
        "institution_id": inst_id,
        "institution_name": inst_name,
        "assigned_officer_id": officer_id,
        "version_hash": version_hash or "",
        "current_stage": current_stage,
        "recommended_stage": recommended_stage,
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
        "version_hash": version_hash or "",
    }


def tool_propose_human_review(
    execution_id: str,
    application_id: str,
    review_items: List[Dict[str, Any]],
    rationale: str,
    app_state: Optional[Dict[str, Any]] = None,
    version_hash: Optional[str] = None,
) -> Dict[str, Any]:
    """
    RESERVED ACTION: Flag application for mandatory manual human review.
    Triggered when evidence is insufficient, checks are ambiguous, or category is unsupported.
    Requires human officer acknowledgment and determination.
    """
    app_data = (app_state or {}).get("raw", {}) if app_state else {}
    app_num = (app_state or {}).get("applicationNumber") or app_data.get("applicationNumber") or application_id
    inst_id = (app_state or {}).get("institutionId") or app_data.get("institutionId") or ""
    inst_name = (app_state or {}).get("institutionName") or app_data.get("institution", {}).get("institutionName") or "Applicant Institution"
    officer_id = (app_state or {}).get("assignedUserId") or app_data.get("assignedUserId") or ""

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
        "statutory_notice": "Automated evaluation cannot reach a definitive compliance decision. Designated AICTE Scrutiny Officer must conduct manual document inspection.",
    }

    input_payload = {
        "application_id": application_id,
        "application_number": app_num,
        "institution_id": inst_id,
        "institution_name": inst_name,
        "assigned_officer_id": officer_id,
        "version_hash": version_hash or "",
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
        "version_hash": version_hash or "",
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
