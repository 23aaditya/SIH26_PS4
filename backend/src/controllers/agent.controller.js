import prisma from "../db/prisma.js";
import { workflowEligibilityService } from "../services/workflowEligibility.service.js";
import { workflowInstanceService } from "../services/workflowInstance.service.js";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";
const AI_BACKEND_SECRET = process.env.AI_BACKEND_SECRET || "aicte_agent_secret_prod_2026_x89f_secure_token";

export const agentController = {
  /**
   * List all agent actions for a specific application.
   * Scoped to authorized officers or the application owner.
   */
  async listActions(req, res, next) {
    try {
      const { id } = req.params;
      const application = await prisma.application.findFirst({
        where: { OR: [{ id }, { applicationNumber: id }] },
      });

      if (!application) {
        return res.status(404).json({ error: "Application not found." });
      }

      // Check institution ownership
      if (req.user?.accountType === "institution" && application.institutionId !== req.user.institutionId) {
        return res.status(403).json({ error: "Access denied to application agent actions." });
      }

      const statusQuery = req.query.status ? `?status=${encodeURIComponent(req.query.status)}` : "";
      const aiResp = await fetch(`${AI_SERVICE_URL}/api/v1/agent/applications/${application.id}/actions${statusQuery}`, {
        headers: {
          "X-Service-Authorization": `Bearer ${AI_BACKEND_SECRET}`,
        },
      });

      if (!aiResp.ok) {
        return res.status(aiResp.status).json({ error: "Failed to retrieve actions from AI agent service." });
      }

      const actions = await aiResp.json();

      // Enrich actions with linked official deficiency notice and cycle metadata
      const [deficiencies, auditEvents] = await Promise.all([
        prisma.deficiencyRequest.findMany({
          where: { applicationId: application.id },
          orderBy: { createdAt: "desc" },
        }),
        prisma.auditEvent.findMany({
          where: {
            applicationId: application.id,
            action: { in: ["AGENT_PROPOSED_DEFICIENCY_OFFICIALLY_APPROVED", "DEFICIENCY_RAISED"] },
          },
          orderBy: { createdAt: "desc" },
        }),
      ]);

      const enrichedActions = actions.map((act) => {
        if (act.action_type === "PROPOSE_DEFICIENCY_NOTICE") {
          const outPayload = act.output_payload || {};
          let officialNoticeId = outPayload.official_notice_id || outPayload.deficiency_id || null;
          let cycleNumber = outPayload.cycle_number || outPayload.deficiency_cycle || null;

          if (!officialNoticeId && act.status === "EXECUTED") {
            const matchedAudit = auditEvents.find((ae) => ae.metadataJson && ae.metadataJson.includes(act.action_id));
            if (deficiencies.length > 0) {
              officialNoticeId = deficiencies[0].id;
              cycleNumber = application.returnCount || 1;
            }
          }

          const matchedDef = deficiencies.find((d) => d.id === officialNoticeId) || (act.status === "EXECUTED" ? deficiencies[0] : null);

          return {
            ...act,
            official_notice_id: officialNoticeId,
            deficiency_cycle: cycleNumber || (matchedDef ? application.returnCount || 1 : null),
            deficiency_status: matchedDef?.status || (act.status === "EXECUTED" ? "pending" : null),
            deficiency_due_at: matchedDef?.dueAt || null,
          };
        }
        return act;
      });

      res.json(enrichedActions);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Human Officer Approval Gate:
   * Officially authorize and execute an agent-proposed action.
   * Strictly restricted to human AICTE officers.
   */
  async approveAction(req, res, next) {
    try {
      if (!req.user || req.user.accountType !== "aicte") {
        return res.status(403).json({
          error: "Access denied: Only human AICTE officers have legal authority to approve agent actions.",
        });
      }

      const { id, actionId } = req.params;
      const { notes } = req.body || {};
      let createdDefId = null;

      const application = await prisma.application.findFirst({
        where: { OR: [{ id }, { applicationNumber: id }] },
        include: { institution: true },
      });

      if (!application) {
        return res.status(404).json({ error: "Application not found." });
      }

      // 1. Fetch action details from AI service
      const actionResp = await fetch(`${AI_SERVICE_URL}/api/v1/agent/applications/${application.id}/actions`, {
        headers: { "X-Service-Authorization": `Bearer ${AI_BACKEND_SECRET}` },
      });
      if (!actionResp.ok) {
        return res.status(502).json({ error: "Unable to reach AI Agent service." });
      }

      const allActions = await actionResp.json();
      const targetAction = allActions.find((a) => a.action_id === actionId);

      if (!targetAction) {
        return res.status(404).json({ error: `Agent action '${actionId}' not found.` });
      }

      if (targetAction.status !== "WAITING_FOR_APPROVAL") {
        return res.status(400).json({
          error: `Action cannot be approved because its current status is '${targetAction.status}'.`,
          code: "ACTION_NOT_WAITING_APPROVAL",
        });
      }

      const existingPending = await prisma.deficiencyRequest.findFirst({
        where: { applicationId: application.id, status: "pending" },
      });
      if (existingPending && targetAction.action_type === "PROPOSE_DEFICIENCY_NOTICE") {
        return res.status(400).json({
          error: "An official deficiency notice is already pending institutional response. Cannot execute duplicate notice.",
          code: "DUPLICATE_DEFICIENCY_NOTICE_PREVENTED",
        });
      }

      const officerId = req.user.employeeCode || req.user.id;
      const now = new Date();

      // 2. If action is PROPOSE_DEFICIENCY_NOTICE, execute the statutory deficiency officially under human officer authority
      if (targetAction.action_type === "PROPOSE_DEFICIENCY_NOTICE") {
        const inputPayload = targetAction.input_payload || {};
        const draft = inputPayload.draft_notice || {};
        const deficiencyItems = req.body.approved_items || draft.statutory_deficiencies || draft.items || inputPayload.deficiency_items || [];
        const approvedObservations = req.body.approved_observations ||
          (draft.supplementary_observations || draft.advisory_observations || []).filter((o) => o.officer_action === 'INCLUDED');
        const dueDays = inputPayload.suggested_due_days || 10;
        const dueDate = new Date(now.getTime() + dueDays * 24 * 60 * 60 * 1000);

        const appNum = application.applicationNumber || application.id;
        const officerName = req.user.name || officerId;
        const dueDaysStr = `${dueDays} Calendar Days`;
        const dueDateStr = dueDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
        const issueDateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

        // SECTION 1: Statutory Deficiencies Mandating Rectification
        let section1Text = deficiencyItems.map((item, idx) => {
          const rule = item.rule_name || item.rule_id || "Statutory Requirement";
          const clause = item.aph_clause ? `(${item.aph_clause})` : "(APH 2024-2027)";
          const docRef = (item.source_document || item.document_name)
            ? `\n  • Document Reference: ${item.source_document || item.document_name}${item.source_page || item.page_number ? ` (Page ${item.source_page || item.page_number})` : ""}`
            : "";
          const observedDefect = item.evidence
            ? `\n  • Observed Statutory Defect: ${item.evidence}`
            : "";
          const actionReq = (item.corrective_action || item.recommendation)
            ? `\n  • Mandatory Corrective Action: ${item.corrective_action || item.recommendation}`
            : "";
          return `Item 1.${idx + 1}: ${rule} ${clause}${docRef}${observedDefect}${actionReq}`;
        }).join("\n\n");

        if (!section1Text) {
          section1Text = "None. All deterministic statutory checklist criteria satisfied.";
        }

        // SECTION 2: Supplementary Document Observations / Clarifications (Officer Approved)
        let section2Text = "";
        if (approvedObservations.length > 0) {
          section2Text = approvedObservations.map((obs, idx) => {
            const heading = obs.edited_heading || obs.heading || obs.finding_type?.replace(/_/g, " ") || "Supplementary Document Observation";
            const docRef = obs.document_reference || (obs.source_document ? `${obs.source_document}${obs.source_page ? ` (Page ${obs.source_page})` : ""}` : "Submitted Application Dossier");
            const formalPara = obs.edited_explanation || obs.formal_notice_paragraph || obs.explanation || "Supplementary observation requiring institutional clarification.";
            const evidence = (obs.supporting_evidence || obs.evidence_excerpt) ? `\n  • Supporting Evidence: "${obs.supporting_evidence || obs.evidence_excerpt}"` : "";
            const actionReq = (obs.edited_action || obs.required_action || obs.suggested_action) ? `\n  • Required Clarification / Corrective Action: ${obs.edited_action || obs.required_action || obs.suggested_action}` : "";
            const verLim = obs.verification_limitation || (obs.excerpt_verified === false ? "Manual Excerpt Verification Required — direct document verification needed" : "Programmatically Verified against document bytes");
            const verLimText = `\n  • Verification Status: ${verLim}`;

            return `Item 2.${idx + 1}: ${heading}\n  • Document Reference: ${docRef}\n  • Observation: ${formalPara}${evidence}${actionReq}${verLimText}`;
          }).join("\n\n");
        }

        let fullDeficiencyText = `================================================================================\n` +
          `AICTE OFFICIAL DEFICIENCY NOTICE — STATUTORY RECTIFICATION & CLARIFICATION ORDER\n` +
          `Application Number: ${appNum}\n` +
          `Authorized By: AICTE Scrutiny Officer (${officerName})\n` +
          `Date of Issuance: ${issueDateStr}\n` +
          `Compliance Response Window: ${dueDaysStr} (Due Date: ${dueDateStr})\n` +
          `Statutory Authority: AICTE Approval Process Handbook (APH 2024-2027)\n` +
          `================================================================================\n\n` +
          `PART I — STATUTORY DEFICIENCIES MANDATING RECTIFICATION\n` +
          `(Deficiencies identified under mandatory deterministic AICTE APH regulations)\n\n` +
          `${section1Text}\n\n`;

        if (section2Text) {
          fullDeficiencyText += `--------------------------------------------------------------------------------\n` +
            `PART II — SUPPLEMENTARY DOCUMENT OBSERVATIONS & CLARIFICATIONS\n` +
            `(Officer-reviewed and authorized qualitative observations requiring institutional explanation)\n\n` +
            `${section2Text}\n\n`;
        }

        fullDeficiencyText += `================================================================================\n` +
          `INSTRUCTIONS TO APPLICANT INSTITUTION:\n` +
          `Please review the statutory deficiencies and supplementary observations specified above. ` +
          `The Institution is required to provide itemized rejoinders and upload all necessary replacement ` +
          `or supporting documents through the AICTE Web Portal prior to the stipulated compliance due date.\n` +
          `================================================================================`;

        if (notes && notes.trim()) {
          fullDeficiencyText += `\n\nAdditional Officer Instructions:\n${notes.trim()}`;
        }

        const summaryText = deficiencyItems.map((d) => d.rule_name || d.rule_id || "Statutory Requirement").join("; ");

        await prisma.$transaction(async (tx) => {
          // A. Create official deficiency request
          const createdDefReq = await tx.deficiencyRequest.create({
            data: {
              applicationId: application.id,
              raisedById: officerId,
              deficiencyText: fullDeficiencyText,
              status: "pending",
              dueAt: dueDate,
            },
          });
          createdDefId = createdDefReq.id;

          // B. Update application status
          await tx.application.update({
            where: { id: application.id },
            data: {
              status: "awaiting_institution",
              currentStageId: "clarification",
              currentStageName: "Deficiency Resolution Required",
              currentAssigneeRole: "institution",
              dueAt: dueDate,
              lastActionAt: now,
              returnCount: { increment: 1 },
            },
          });

          // C. Create Task for institution
          await tx.workflowTask.create({
            data: {
              applicationId: application.id,
              taskType: "deficiency_response",
              title: `Deficiency Raised: ${application.applicationNumber}`,
              description: fullDeficiencyText,
              assignedRole: "institution",
              assignedUserId: application.createdById,
              status: "open",
              priority: "high",
              dueAt: dueDate,
              sourceStageId: "clarification",
            },
          });

          // D. Audit event preserving immutable originals and officer-approved selections
          await tx.auditEvent.create({
            data: {
              applicationId: application.id,
              actorUserId: req.user.id || officerId,
              actorRole: req.user.role || "scrutiny_committee",
              action: "AGENT_PROPOSED_DEFICIENCY_OFFICIALLY_APPROVED",
              fromStage: application.currentStageId,
              toStage: "clarification",
              reason: fullDeficiencyText,
              metadataJson: JSON.stringify({
                actionId,
                actionType: targetAction.action_type,
                approvedBy: officerId,
                notes,
                deficiencyItemsCount: deficiencyItems.length,
                approvedObservationsCount: approvedObservations.length,
                original_observations: inputPayload.advisory_observations || inputPayload.supplementary_observations || [],
                officer_approved_observations: approvedObservations,
              }),
            },
          });

          // E. Notification to applicant institution (safely upserted via deduplicationKey)
          const notifKey = `${application.id}:agent_approved_deficiency:${actionId}`;
          const existingNotif = await tx.notification.findUnique({
            where: { deduplicationKey: notifKey },
          });
          if (existingNotif) {
            await tx.notification.update({
              where: { deduplicationKey: notifKey },
              data: {
                message: `AICTE Scrutiny Officer (${req.user.name || officerId}) issued official deficiency notice (${deficiencyItems.length} items): "${summaryText}". Statutory response window: ${dueDays} days.`,
                priority: "urgent",
              },
            });
          } else {
            await tx.notification.create({
              data: {
                recipientUserId: application.createdById,
                applicationId: application.id,
                type: "deficiency_issued",
                title: `Deficiency Raised for ${application.applicationNumber}`,
                message: `AICTE Scrutiny Officer (${req.user.name || officerId}) issued official deficiency notice (${deficiencyItems.length} items): "${summaryText}". Statutory response window: ${dueDays} days.`,
                priority: "urgent",
                actionUrl: `/institution/applications/${application.id}`,
                deduplicationKey: notifKey,
              },
            });
          }
        });
      } else if (targetAction.action_type === "PROPOSE_FORWARD_TO_NEXT_STAGE") {
        // Enforce Phase 4.3 eligibility gate
        await workflowEligibilityService.assertCanAdvance(application.id, req.user);

        // Advance stage under officer authority
        await workflowInstanceService.recordStageDecision(
          application.id,
          application.currentStageId || "scrutiny",
          "PASS",
          notes || "Officer approved stage advancement proposed by autonomous agent.",
          null,
          req.user
        );

        await prisma.auditEvent.create({
          data: {
            applicationId: application.id,
            actorUserId: req.user.id || officerId,
            actorRole: req.user.role || "scrutiny_committee",
            action: "AGENT_PROPOSED_STAGE_ADVANCEMENT_OFFICIALLY_APPROVED",
            reason: notes || "Officer approved agent-proposed forward stage progression.",
            metadataJson: JSON.stringify({
              actionId,
              actionType: targetAction.action_type,
              approvedBy: officerId,
              notes,
            }),
          },
        });
      } else if (targetAction.action_type === "REQUEST_HUMAN_REVIEW") {
        const approvedObservations = req.body.approved_observations || [];
        await prisma.auditEvent.create({
          data: {
            applicationId: application.id,
            actorUserId: req.user.id || officerId,
            actorRole: req.user.role || "scrutiny_committee",
            action: "AGENT_HUMAN_REVIEW_ACKNOWLEDGED",
            reason: notes || "Officer acknowledged autonomous agent request for manual scrutiny.",
            metadataJson: JSON.stringify({
              actionId,
              actionType: targetAction.action_type,
              acknowledgedBy: officerId,
              notes,
              flaggedItemsCount: (req.body.approved_items || []).length,
              acknowledgedObservationsCount: approvedObservations.length,
              acknowledged_observations: approvedObservations,
            }),
          },
        });
      } else {
        // Generic audited action approval
        await prisma.auditEvent.create({
          data: {
            applicationId: application.id,
            actorUserId: req.user.id || officerId,
            actorRole: req.user.role || "scrutiny_committee",
            action: "AGENT_ACTION_APPROVED",
            reason: notes || `Approved action ${targetAction.action_type}`,
            metadataJson: JSON.stringify({
              actionId,
              actionType: targetAction.action_type,
              approvedBy: officerId,
              notes,
            }),
          },
        });
      }

      // 3. Notify AI service of approval to resume execution
      const resumeResp = await fetch(`${AI_SERVICE_URL}/api/v1/agent/actions/${actionId}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Service-Authorization": `Bearer ${AI_BACKEND_SECRET}`,
        },
        body: JSON.stringify({
          action_id: actionId,
          approved_by: officerId,
          approval_notes: notes || "Approved by official AICTE officer.",
          official_notice_id: createdDefId,
          deficiency_cycle: (application.returnCount || 0) + 1,
        }),
      });

      const resumeData = resumeResp.ok ? await resumeResp.json() : null;

      res.json({
        success: true,
        message: "Action approved and officially executed.",
        actionId,
        approvedBy: officerId,
        agentExecution: resumeData,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Human Officer Rejection Gate:
   * Declines a proposed agent action.
   */
  async rejectAction(req, res, next) {
    try {
      if (!req.user || req.user.accountType !== "aicte") {
        return res.status(403).json({
          error: "Access denied: Only human AICTE officers can review agent proposals.",
        });
      }

      const { id, actionId } = req.params;
      const { reason } = req.body || {};

      if (!reason || !reason.trim()) {
        return res.status(400).json({ error: "Mandatory 'reason' required for action rejection." });
      }

      const application = await prisma.application.findFirst({
        where: { OR: [{ id }, { applicationNumber: id }] },
      });

      if (!application) {
        return res.status(404).json({ error: "Application not found." });
      }

      const officerId = req.user.employeeCode || req.user.id;

      // 1. Audit event in Prisma
      await prisma.auditEvent.create({
        data: {
          applicationId: application.id,
          actorUserId: req.user.id || officerId,
          actorRole: req.user.role || "scrutiny_committee",
          action: "AGENT_ACTION_REJECTED",
          reason: reason.trim(),
          metadataJson: JSON.stringify({
            actionId,
            rejectedBy: officerId,
            reason: reason.trim(),
          }),
        },
      });

      // 2. Notify AI service of rejection
      const rejectResp = await fetch(`${AI_SERVICE_URL}/api/v1/agent/actions/${actionId}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Service-Authorization": `Bearer ${AI_BACKEND_SECRET}`,
        },
        body: JSON.stringify({
          action_id: actionId,
          rejected_by: officerId,
          rejection_reason: reason.trim(),
        }),
      });

      const rejectData = rejectResp.ok ? await rejectResp.json() : null;

      res.json({
        success: true,
        message: "Agent proposed action declined.",
        actionId,
        rejectedBy: officerId,
        agentExecution: rejectData,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Internal M2M notification creation endpoint.
   * Allows AI agent service to dispatch advisory notifications.
   */
  async createNotification(req, res, next) {
    try {
      const {
        applicationId,
        recipientUserId,
        title,
        message,
        priority = "normal",
        actionUrl,
        deduplicationKey,
      } = req.body;

      if (!recipientUserId || !title || !message) {
        return res.status(400).json({ error: "Missing required notification fields." });
      }

      // Check deduplication
      if (deduplicationKey) {
        const existing = await prisma.notification.findUnique({
          where: { deduplicationKey },
        });
        if (existing) {
          return res.json({ success: true, notification: existing, duplicated: true });
        }
      }

      // Resolve recipient if given employeeCode or fallback to user
      let targetUserId = recipientUserId;
      const staffUser = await prisma.user.findFirst({
        where: {
          OR: [{ id: recipientUserId }, { email: { contains: recipientUserId.toLowerCase() } }],
        },
      });
      if (staffUser) {
        targetUserId = staffUser.id;
      }

      const notif = await prisma.notification.create({
        data: {
          recipientUserId: targetUserId,
          applicationId: applicationId || null,
          type: "agent_advisory",
          title,
          message,
          priority,
          actionUrl,
          deduplicationKey,
        },
      });

      res.status(201).json({ success: true, notification: notif });
    } catch (error) {
      next(error);
    }
  },
};
