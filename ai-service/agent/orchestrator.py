"""
Agent Orchestrator for AICTE Application Lifecycle Automation.
Implements an event-driven, bounded state machine with policy-controlled tool execution,
human approval gates, and resumption.
"""

import json
import logging
from typing import Dict, Any, Optional, List

from agent.models import (
    LifecycleEventType,
    AgentState,
    ActionType,
    ActionStatus,
    AgentExecutionResponse,
    AgentActionResponse,
)
from agent.store import (
    create_execution,
    get_execution,
    get_execution_by_correlation_id,
    update_execution,
    create_action,
    update_action,
    get_action,
    get_actions_for_execution,
    get_actions_for_application,
)
from agent.tools import (
    tool_get_application_state,
    tool_get_document_dossier,
    tool_run_deterministic_scrutiny,
    tool_run_qualitative_scrutiny,
    tool_reconcile_resubmission_findings,
    tool_submit_advisory_report,
    tool_create_internal_notification,
    tool_propose_deficiency_notice,
    tool_propose_forward_to_next_stage,
    tool_propose_human_review,
    tool_execute_approved_action,
    ToolExecutionError,
)

logger = logging.getLogger("agent_orchestrator")

MAX_ACTIONS_PER_EVENT = 5


class LifecycleAgentOrchestrator:
    """
    Bounded, event-driven orchestrator for AICTE application lifecycle management.
    Never executes arbitrary actions; only dispatches policy-approved, registered tools.
    """

    async def handle_event(
        self,
        event_type: str,
        application_id: str,
        payload: Optional[Dict[str, Any]] = None,
        actor: Optional[str] = None,
        correlation_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Main entry point for processing a lifecycle event.
        Guarantees idempotency via correlation_id.
        """
        payload = payload or {}
        logger.info(
            f"Agent received event '{event_type}' for application '{application_id}' "
            f"(correlation: {correlation_id}, actor: {actor})"
        )

        # 1. Idempotency Check
        if correlation_id:
            existing = get_execution_by_correlation_id(correlation_id)
            if existing and existing["status"] in ("COMPLETED", "WAITING_FOR_APPROVAL", "RUNNING"):
                logger.info(
                    f"Duplicate event suppressed for correlation '{correlation_id}'. "
                    f"Returning existing execution '{existing['execution_id']}' in state '{existing['status']}'."
                )
                actions = get_actions_for_execution(existing["execution_id"])
                return self._format_execution_response(existing, actions)

        # 2. Create durable execution record
        execution = create_execution(
            application_id=application_id,
            event_type=event_type,
            correlation_id=correlation_id,
            payload=payload,
        )
        execution_id = execution["execution_id"]
        update_execution(execution_id, status=AgentState.RUNNING.value, current_step="INITIALIZING")

        try:
            # 3. Route according to event type
            if event_type in (LifecycleEventType.APPLICATION_SUBMITTED.value, LifecycleEventType.SCRUTINY_COMPLETED.value):
                return await self._handle_application_submitted(execution_id, application_id, payload)

            elif event_type == LifecycleEventType.RESUBMISSION_RECEIVED.value:
                return await self._handle_resubmission_received(execution_id, application_id, payload)

            elif event_type == LifecycleEventType.DOCUMENTS_UPDATED.value:
                return await self._handle_documents_updated(execution_id, application_id, payload)

            elif event_type == LifecycleEventType.ACTION_APPROVED.value:
                return await self._handle_action_approved(execution_id, application_id, payload)

            elif event_type == LifecycleEventType.ACTION_REJECTED.value:
                return await self._handle_action_rejected(execution_id, application_id, payload)

            elif event_type == LifecycleEventType.DEADLINE_APPROACHING.value:
                return await self._handle_deadline_approaching(execution_id, application_id, payload)

            else:
                # Unsupported event type: fail safely without corrupting application state
                logger.warning(f"Unhandled or unknown lifecycle event type: '{event_type}'")
                updated_exec = update_execution(
                    execution_id,
                    status=AgentState.COMPLETED.value,
                    current_step="UNHANDLED_EVENT",
                    result={"note": f"Event type '{event_type}' recorded but no automated action required."},
                )
                return self._format_execution_response(updated_exec, [])

        except Exception as e:
            logger.error(f"Execution {execution_id} failed with error: {str(e)}", exc_info=True)
            updated_exec = update_execution(
                execution_id,
                status=AgentState.FAILED.value,
                error_message=str(e),
            )
            actions = get_actions_for_execution(execution_id)
            return self._format_execution_response(updated_exec, actions)

    async def _handle_application_submitted(
        self,
        execution_id: str,
        application_id: str,
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Handle APPLICATION_SUBMITTED lifecycle flow:
        1. Fetch authorized application state & verify category.
        2. Download dossier & compute SHA-256 checksums.
        3. Run Phase 3.5 deterministic statutory scrutiny rules.
        4. Run advisory Groq qualitative scrutiny.
        5. Submit pre-check report with version hash.
        6. Send notification to responsible officer.
        7. If deficiencies detected, create human approval gate for official deficiency notice.
        """
        step_count = 0

        # Step 1: Load Application State
        update_execution(execution_id, current_step="FETCH_APPLICATION_STATE")
        app_state = await tool_get_application_state(application_id)
        step_count += 1

        # Step 2: Fetch Dossier & Verify Checksums
        update_execution(execution_id, current_step="FETCH_DOSSIER")
        dossier = await tool_get_document_dossier(application_id, app_state["raw"])
        step_count += 1

        # Step 3: Run Deterministic Scrutiny (Category-aware APH 2024-2027)
        update_execution(execution_id, current_step="RUN_DETERMINISTIC_SCRUTINY")
        pre_check = tool_run_deterministic_scrutiny(
            application_id=application_id,
            app_data=app_state["raw"],
            extracted_docs=dossier["extracted_docs"],
        )
        step_count += 1

        # Step 4: Run Advisory Qualitative Scrutiny (Groq LLM)
        update_execution(execution_id, current_step="RUN_QUALITATIVE_SCRUTINY")
        llm_result = await tool_run_qualitative_scrutiny(
            application_id=application_id,
            app_data=app_state["raw"],
            extracted_docs=dossier["extracted_docs"],
            deterministic_findings=pre_check["findings_raw"],
        )
        step_count += 1

        # Step 5: Submit Advisory Report
        update_execution(execution_id, current_step="SUBMIT_ADVISORY_REPORT")
        report_res = await tool_submit_advisory_report(
            application_id=application_id,
            pre_check_dict=pre_check,
            llm_result_dict=llm_result,
            resubmission_diff=[],
            version_hash=dossier["version_hash"],
            execution_id=execution_id,
            is_resubmission=False,
        )

        # Step 6: Notify Assigned Scrutiny Officer
        officer_id = app_state.get("assignedUserId") or "DEMO-AIC-034"
        await tool_create_internal_notification(
            application_id=application_id,
            recipient_id=officer_id,
            title=f"AI Scrutiny Pre-Check Complete: {app_state['applicationNumber']}",
            message=(
                f"Statutory scrutiny pre-check completed for {app_state.get('institutionName')}. "
                f"Outcome: {pre_check['outcome']}. Human verification required."
            ),
            priority="normal",
            action_url=f"/aicte/scrutiny/{application_id}",
            deduplication_key=f"{application_id}:scrutiny_complete:{dossier['version_hash'][:10]}",
        )

        # Determine Appropriate Next-Action Proposal for Current Dossier Version
        # Outcome A: Statutory Deficiencies Flagged -> PROPOSE_DEFICIENCY_NOTICE
        deficient_items = [f for f in pre_check["findings"] if f.get("status") == "DEFICIENT"]
        if deficient_items or pre_check.get("outcome") in ("DEFICIENT", "DEFICIENCY_SUGGESTED"):
            update_execution(execution_id, current_step="PROPOSE_DEFICIENCY_NOTICE")
            deficiency_proposal = tool_propose_deficiency_notice(
                execution_id=execution_id,
                application_id=application_id,
                deficiency_items=deficient_items or pre_check["findings"],
                rationale=(
                    f"Agent detected {len(deficient_items)} statutory deficiency(ies) in "
                    f"{app_state.get('applicationCategory')} submission per APH 2024-2027."
                ),
                app_state=app_state,
                version_hash=dossier["version_hash"],
            )
            await tool_create_internal_notification(
                application_id=application_id,
                recipient_id=officer_id,
                title=f"Action Approval Required: Deficiency Notice for {app_state['applicationNumber']}",
                message=(
                    f"AI Assistant proposed an official deficiency notice ({len(deficient_items)} items). "
                    f"Officer authorization required to issue notice."
                ),
                priority="high",
                action_url=f"/aicte/scrutiny/{application_id}",
                deduplication_key=f"{application_id}:approval_req:{deficiency_proposal['action_id']}",
            )
            updated_exec = update_execution(
                execution_id,
                status=AgentState.WAITING_FOR_APPROVAL.value,
                current_step="WAITING_FOR_HUMAN_APPROVAL",
                result={
                    "outcome": pre_check["outcome"],
                    "report_id": report_res["report_id"],
                    "version_hash": dossier["version_hash"],
                    "pending_action_id": deficiency_proposal["action_id"],
                    "deficiencies_flagged": len(deficient_items),
                },
            )
            actions = get_actions_for_execution(execution_id)
            return self._format_execution_response(updated_exec, actions)

        # Outcome B: All Statutory Requirements Satisfied -> PROPOSE_FORWARD_TO_NEXT_STAGE
        elif pre_check.get("outcome") in ("COMPLIANT", "RECOMMEND_ACCEPT"):
            update_execution(execution_id, current_step="PROPOSE_FORWARD_TO_NEXT_STAGE")
            transition_proposal = tool_propose_forward_to_next_stage(
                execution_id=execution_id,
                application_id=application_id,
                compliant_items=pre_check["findings"],
                rationale=(
                    f"Agent verified all {len(pre_check['findings'])} statutory criteria compliant in "
                    f"{app_state.get('applicationCategory')} submission per APH 2024-2027. Forward progression proposed."
                ),
                app_state=app_state,
                version_hash=dossier["version_hash"],
            )
            await tool_create_internal_notification(
                application_id=application_id,
                recipient_id=officer_id,
                title=f"Action Approval Required: Stage Advancement for {app_state['applicationNumber']}",
                message=(
                    f"AI Assistant verified all statutory requirements satisfied. "
                    f"Officer authorization required to advance stage to {transition_proposal['recommended_stage']}."
                ),
                priority="high",
                action_url=f"/aicte/scrutiny/{application_id}",
                deduplication_key=f"{application_id}:approval_req:{transition_proposal['action_id']}",
            )
            updated_exec = update_execution(
                execution_id,
                status=AgentState.WAITING_FOR_APPROVAL.value,
                current_step="WAITING_FOR_HUMAN_APPROVAL",
                result={
                    "outcome": pre_check["outcome"],
                    "report_id": report_res["report_id"],
                    "version_hash": dossier["version_hash"],
                    "pending_action_id": transition_proposal["action_id"],
                    "verified_requirements_count": len(pre_check["findings"]),
                },
            )
            actions = get_actions_for_execution(execution_id)
            return self._format_execution_response(updated_exec, actions)

        # Outcome C: Insufficient Evidence or Ambiguous Norms -> REQUEST_HUMAN_REVIEW
        else:
            review_items = [f for f in pre_check["findings"] if f.get("status") in ("NEEDS_HUMAN_REVIEW", "PENDING_MANUAL_VERIFICATION", "INSUFFICIENT_EVIDENCE")] or pre_check["findings"]
            update_execution(execution_id, current_step="REQUEST_HUMAN_REVIEW")
            review_proposal = tool_propose_human_review(
                execution_id=execution_id,
                application_id=application_id,
                review_items=review_items,
                rationale=(
                    f"Agent identified {len(review_items)} item(s) requiring human inspection or discretionary verification in "
                    f"{app_state.get('applicationCategory')} submission per APH 2024-2027."
                ),
                app_state=app_state,
                version_hash=dossier["version_hash"],
            )
            await tool_create_internal_notification(
                application_id=application_id,
                recipient_id=officer_id,
                title=f"Manual Scrutiny Required: {app_state['applicationNumber']}",
                message=(
                    f"AI Assistant flagged {len(review_items)} item(s) requiring officer inspection. "
                    f"Manual human review required."
                ),
                priority="high",
                action_url=f"/aicte/scrutiny/{application_id}",
                deduplication_key=f"{application_id}:review_req:{review_proposal['action_id']}",
            )
            updated_exec = update_execution(
                execution_id,
                status=AgentState.WAITING_FOR_APPROVAL.value,
                current_step="WAITING_FOR_HUMAN_APPROVAL",
                result={
                    "outcome": pre_check["outcome"],
                    "report_id": report_res["report_id"],
                    "version_hash": dossier["version_hash"],
                    "pending_action_id": review_proposal["action_id"],
                    "items_flagged_count": len(review_items),
                },
            )
            actions = get_actions_for_execution(execution_id)
            return self._format_execution_response(updated_exec, actions)

    async def _handle_resubmission_received(
        self,
        execution_id: str,
        application_id: str,
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Handle RESUBMISSION_RECEIVED lifecycle flow:
        1. Fetch updated dossier.
        2. Re-evaluate deterministic rules.
        3. Compute discrepancy diff vs prior report (RESOLVED, STILL_OUTSTANDING, NEEDS_HUMAN_REVIEW).
        4. Submit updated advisory report with diff.
        5. Notify officer with resubmission audit summary.
        """
        update_execution(execution_id, current_step="FETCH_APPLICATION_STATE")
        app_state = await tool_get_application_state(application_id)

        update_execution(execution_id, current_step="FETCH_DOSSIER")
        dossier = await tool_get_document_dossier(application_id, app_state["raw"])

        update_execution(execution_id, current_step="RUN_DETERMINISTIC_SCRUTINY")
        pre_check = tool_run_deterministic_scrutiny(
            application_id=application_id,
            app_data=app_state["raw"],
            extracted_docs=dossier["extracted_docs"],
        )

        # Run Reconciliation Diff
        update_execution(execution_id, current_step="RECONCILE_FINDINGS")
        reconciled = await tool_reconcile_resubmission_findings(
            application_id=application_id,
            current_findings=pre_check["findings_raw"],
        )

        # Run Advisory LLM Qualitative Scrutiny on resubmitted material
        update_execution(execution_id, current_step="RUN_QUALITATIVE_SCRUTINY")
        llm_result = await tool_run_qualitative_scrutiny(
            application_id=application_id,
            app_data=app_state["raw"],
            extracted_docs=dossier["extracted_docs"],
            deterministic_findings=pre_check["findings_raw"],
        )

        # Submit Updated Advisory Report with Reconciliation Diff
        update_execution(execution_id, current_step="SUBMIT_ADVISORY_REPORT")
        report_res = await tool_submit_advisory_report(
            application_id=application_id,
            pre_check_dict=pre_check,
            llm_result_dict=llm_result,
            resubmission_diff=reconciled["resubmission_diff"],
            version_hash=dossier["version_hash"],
            execution_id=execution_id,
            is_resubmission=True,
        )

        # Notify Scrutiny Officer of Resubmission Audit
        officer_id = app_state.get("assignedUserId") or "DEMO-AIC-034"
        await tool_create_internal_notification(
            application_id=application_id,
            recipient_id=officer_id,
            title=f"Resubmission Scrutiny Diff: {app_state['applicationNumber']}",
            message=(
                f"Institution submitted clarification. Audit diff: "
                f"{reconciled['resolved_count']} resolved, "
                f"{reconciled['outstanding_count']} still outstanding, "
                f"{reconciled['review_count']} needs officer review."
            ),
            priority="high",
            action_url=f"/aicte/scrutiny/{application_id}",
            deduplication_key=f"{application_id}:resubmit_diff:{dossier['version_hash'][:10]}",
        )

        # Determine Next Action on Resubmission:
        # If deficiencies remain outstanding -> propose deficiency notice
        deficient_items = [f for f in pre_check["findings"] if f.get("status") == "DEFICIENT"]
        if deficient_items or reconciled.get("outstanding_count", 0) > 0 or pre_check.get("outcome") in ("DEFICIENT", "DEFICIENCY_SUGGESTED"):
            update_execution(execution_id, current_step="PROPOSE_DEFICIENCY_NOTICE")
            deficiency_proposal = tool_propose_deficiency_notice(
                execution_id=execution_id,
                application_id=application_id,
                deficiency_items=deficient_items or pre_check["findings"],
                rationale=(
                    f"Agent detected {reconciled.get('outstanding_count', len(deficient_items))} outstanding deficiency(ies) "
                    f"following institutional resubmission."
                ),
                app_state=app_state,
                version_hash=dossier["version_hash"],
            )
            await tool_create_internal_notification(
                application_id=application_id,
                recipient_id=officer_id,
                title=f"Action Approval Required: Deficiency Notice (Resubmission) for {app_state['applicationNumber']}",
                message=f"Outstanding deficiencies detected following institutional response. Authorization required to issue notice.",
                priority="high",
                action_url=f"/aicte/scrutiny/{application_id}",
                deduplication_key=f"{application_id}:approval_req:{deficiency_proposal['action_id']}",
            )
            updated_exec = update_execution(
                execution_id,
                status=AgentState.WAITING_FOR_APPROVAL.value,
                current_step="WAITING_FOR_HUMAN_APPROVAL",
                result={
                    "outcome": pre_check["outcome"],
                    "report_id": report_res["report_id"],
                    "version_hash": dossier["version_hash"],
                    "pending_action_id": deficiency_proposal["action_id"],
                    "outstanding_count": reconciled.get("outstanding_count", 0),
                    "resolved_count": reconciled.get("resolved_count", 0),
                },
            )
            actions = get_actions_for_execution(execution_id)
            return self._format_execution_response(updated_exec, actions)

        elif pre_check.get("outcome") in ("COMPLIANT", "RECOMMEND_ACCEPT") and reconciled.get("outstanding_count", 0) == 0:
            update_execution(execution_id, current_step="PROPOSE_FORWARD_TO_NEXT_STAGE")
            transition_proposal = tool_propose_forward_to_next_stage(
                execution_id=execution_id,
                application_id=application_id,
                compliant_items=pre_check["findings"],
                rationale="All previous statutory deficiencies successfully resolved via institutional rejoinder. Stage advancement proposed.",
                app_state=app_state,
                version_hash=dossier["version_hash"],
            )
            await tool_create_internal_notification(
                application_id=application_id,
                recipient_id=officer_id,
                title=f"Action Approval Required: Advance Stage (Deficiencies Resolved) for {app_state['applicationNumber']}",
                message=f"Institutional rejoinder resolved all outstanding objections. Officer authorization required to advance stage.",
                priority="high",
                action_url=f"/aicte/scrutiny/{application_id}",
                deduplication_key=f"{application_id}:approval_req:{transition_proposal['action_id']}",
            )
            updated_exec = update_execution(
                execution_id,
                status=AgentState.WAITING_FOR_APPROVAL.value,
                current_step="WAITING_FOR_HUMAN_APPROVAL",
                result={
                    "outcome": pre_check["outcome"],
                    "report_id": report_res["report_id"],
                    "version_hash": dossier["version_hash"],
                    "pending_action_id": transition_proposal["action_id"],
                    "resolved_count": reconciled.get("resolved_count", 0),
                    "outstanding_count": reconciled.get("outstanding_count", 0),
                },
            )
            actions = get_actions_for_execution(execution_id)
            return self._format_execution_response(updated_exec, actions)

        else:
            review_items = [f for f in pre_check["findings"] if f.get("status") in ("NEEDS_HUMAN_REVIEW", "PENDING_MANUAL_VERIFICATION")] or pre_check["findings"]
            update_execution(execution_id, current_step="REQUEST_HUMAN_REVIEW")
            review_proposal = tool_propose_human_review(
                execution_id=execution_id,
                application_id=application_id,
                review_items=review_items,
                rationale="Resubmitted evidence requires manual officer verification to confirm resolution.",
                app_state=app_state,
                version_hash=dossier["version_hash"],
            )
            await tool_create_internal_notification(
                application_id=application_id,
                recipient_id=officer_id,
                title=f"Manual Scrutiny Required (Resubmission): {app_state['applicationNumber']}",
                message="Resubmitted documents require manual inspection to confirm deficiency resolution.",
                priority="high",
                action_url=f"/aicte/scrutiny/{application_id}",
                deduplication_key=f"{application_id}:review_req:{review_proposal['action_id']}",
            )
            updated_exec = update_execution(
                execution_id,
                status=AgentState.WAITING_FOR_APPROVAL.value,
                current_step="WAITING_FOR_HUMAN_APPROVAL",
                result={
                    "outcome": pre_check["outcome"],
                    "report_id": report_res["report_id"],
                    "version_hash": dossier["version_hash"],
                    "pending_action_id": review_proposal["action_id"],
                    "review_count": reconciled.get("review_count", 0),
                },
            )
            actions = get_actions_for_execution(execution_id)
            return self._format_execution_response(updated_exec, actions)

    async def _handle_documents_updated(
        self,
        execution_id: str,
        application_id: str,
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Handle DOCUMENTS_UPDATED lifecycle event:
        Re-extracts newly uploaded document, verifies checksum, and checks if pre-check cache is invalidated.
        """
        update_execution(execution_id, current_step="FETCH_APPLICATION_STATE")
        app_state = await tool_get_application_state(application_id)

        update_execution(execution_id, current_step="FETCH_DOSSIER")
        dossier = await tool_get_document_dossier(application_id, app_state["raw"])

        # If application is in scrutiny or re-scrutiny, re-run deterministic pre-check
        if app_state["status"] in ("in_review", "awaiting_institution"):
            update_execution(execution_id, current_step="RUN_DETERMINISTIC_SCRUTINY")
            pre_check = tool_run_deterministic_scrutiny(
                application_id=application_id,
                app_data=app_state["raw"],
                extracted_docs=dossier["extracted_docs"],
            )
            update_execution(execution_id, current_step="SUBMIT_ADVISORY_REPORT")
            report_res = await tool_submit_advisory_report(
                application_id=application_id,
                pre_check_dict=pre_check,
                llm_result_dict={"status": "SKIPPED"},
                resubmission_diff=[],
                version_hash=dossier["version_hash"],
                execution_id=execution_id,
                is_resubmission=False,
            )
            result = {"recalculated": True, "version_hash": dossier["version_hash"]}
        else:
            result = {"recalculated": False, "version_hash": dossier["version_hash"]}

        updated_exec = update_execution(
            execution_id,
            status=AgentState.COMPLETED.value,
            current_step="COMPLETED",
            result=result,
        )
        actions = get_actions_for_execution(execution_id)
        return self._format_execution_response(updated_exec, actions)

    async def _handle_action_approved(
        self,
        execution_id: str,
        application_id: str,
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Handle ACTION_APPROVED event:
        A human officer has granted authorization for a pending agent action.
        Executes the authorized action and transitions execution to COMPLETED.
        """
        action_id = payload.get("action_id")
        approver_id = payload.get("approved_by") or "OFFICER"
        approval_notes = payload.get("approval_notes")
        official_notice_id = payload.get("official_notice_id")
        deficiency_cycle = payload.get("deficiency_cycle")

        if not action_id:
            raise ToolExecutionError("Action approval requires 'action_id' in payload.")

        action = get_action(action_id)
        if not action:
            raise ToolExecutionError(f"Action '{action_id}' not found.")

        update_execution(execution_id, current_step="EXECUTING_APPROVED_ACTION")
        exec_res = tool_execute_approved_action(
            action_id=action_id,
            approver_id=approver_id,
            approval_notes=approval_notes,
            official_notice_id=official_notice_id,
            deficiency_cycle=deficiency_cycle,
        )

        updated_exec = update_execution(
            execution_id,
            status=AgentState.COMPLETED.value,
            current_step="COMPLETED",
            result={"approved_action_executed": action_id, "approver": approver_id},
        )
        actions = get_actions_for_execution(execution_id)
        return self._format_execution_response(updated_exec, actions)

    async def _handle_action_rejected(
        self,
        execution_id: str,
        application_id: str,
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Handle ACTION_REJECTED event:
        A human officer has declined a proposed action.
        Marks action REJECTED and completes execution safely without side effects.
        """
        action_id = payload.get("action_id")
        rejector_id = payload.get("rejected_by") or "OFFICER"
        rejection_reason = payload.get("rejection_reason") or "Officer declined proposed action."

        if not action_id:
            raise ToolExecutionError("Action rejection requires 'action_id' in payload.")

        update_action(
            action_id=action_id,
            status=ActionStatus.REJECTED.value,
            rejection_reason=rejection_reason,
        )

        updated_exec = update_execution(
            execution_id,
            status=AgentState.COMPLETED.value,
            current_step="ACTION_REJECTED_BY_OFFICER",
            result={"rejected_action": action_id, "reason": rejection_reason},
        )
        actions = get_actions_for_execution(execution_id)
        return self._format_execution_response(updated_exec, actions)

    async def _handle_deadline_approaching(
        self,
        execution_id: str,
        application_id: str,
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Handle DEADLINE_APPROACHING event:
        Sends scheduled reminder notifications to responsible officer and institution.
        """
        app_state = await tool_get_application_state(application_id)
        officer_id = app_state.get("assignedUserId") or "DEMO-AIC-034"
        days_left = payload.get("days_remaining", 3)

        await tool_create_internal_notification(
            application_id=application_id,
            recipient_id=officer_id,
            title=f"Statutory Deadline Approaching: {app_state['applicationNumber']}",
            message=f"Application has statutory deadline in {days_left} day(s). Stage: {app_state['currentStageName']}.",
            priority="urgent" if days_left <= 2 else "high",
            action_url=f"/aicte/scrutiny/{application_id}",
            deduplication_key=f"{application_id}:deadline_reminder:{days_left}d",
        )

        updated_exec = update_execution(
            execution_id,
            status=AgentState.COMPLETED.value,
            current_step="REMINDER_SENT",
            result={"reminder_delivered": True, "recipient": officer_id},
        )
        return self._format_execution_response(updated_exec, [])

    def _format_execution_response(
        self,
        execution: Dict[str, Any],
        actions: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Format an execution dictionary to a clean response structure."""
        return {
            "execution_id": execution["execution_id"],
            "application_id": execution["application_id"],
            "event_type": execution["event_type"],
            "correlation_id": execution.get("correlation_id"),
            "status": execution["status"],
            "current_step": execution.get("current_step"),
            "actions": [
                {
                    "action_id": a["action_id"],
                    "execution_id": a["execution_id"],
                    "application_id": a["application_id"],
                    "action_type": a["action_type"],
                    "status": a["status"],
                    "requires_approval": a.get("requires_approval", False),
                    "rationale": a.get("rationale"),
                    "input_payload": a.get("input_payload", {}),
                    "output_payload": a.get("output_payload"),
                    "approved_by": a.get("approved_by"),
                    "approved_at": a.get("approved_at"),
                    "rejection_reason": a.get("rejection_reason"),
                    "error_message": a.get("error_message"),
                    "created_at": a["created_at"],
                    "updated_at": a["updated_at"],
                }
                for a in actions
            ],
            "result": json.loads(execution.get("result_json") or "{}") if execution.get("result_json") else None,
            "error_message": execution.get("error_message"),
            "created_at": execution["created_at"],
            "updated_at": execution["updated_at"],
            "completed_at": execution.get("completed_at"),
        }


agent_orchestrator = LifecycleAgentOrchestrator()
