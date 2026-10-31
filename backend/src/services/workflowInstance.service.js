/**
 * WorkflowInstanceService — manages workflow instance lifecycle.
 * One WorkflowInstance per application; idempotent on repeated submission calls.
 */
import prisma from "../db/prisma.js";
import {
  resolveWorkflowTemplate,
  getStageFromTemplate,
  resolveNextStageKey,
  calculateDeadline,
} from "./workflowConfig.service.js";

// FIXED PINNED OFFICERS FOR TESTING:
// Scrutiny: DEMO-AIC-034, EVC: DEMO-AIC-037, Committee/Decision: DEMO-AIC-013
async function getPinnedStaff(stageKey) {
  let code = "DEMO-AIC-034";
  if (stageKey === "evc") code = "DEMO-AIC-037";
  else if (["committee", "decision"].includes(stageKey)) code = "DEMO-AIC-013";
  const staff = await prisma.staff.findUnique({ where: { employeeCode: code } });
  return staff || null;
}

export const workflowInstanceService = {
  /**
   * Initialize a workflow instance for a submitted application.
   * Idempotent: if instance already exists, return existing.
   */
  async initializeForApplication(application) {
    // Idempotency check
    const existing = await prisma.workflowInstance.findUnique({
      where: { applicationId: application.id },
      include: { stages: { orderBy: { sequenceOrder: "asc" } } },
    });
    if (existing) return existing;

    const template = resolveWorkflowTemplate(
      application.applicationCategory || application.applicationType?.name
    );
    const initialStageKey = template.initialStageKey;
    const initialStageDef = getStageFromTemplate(template, initialStageKey);
    const deadline = calculateDeadline(initialStageDef?.deadlineDays || 14);
    const staff = await getPinnedStaff(initialStageKey);

    return prisma.$transaction(async (tx) => {
      // 1. Create workflow instance
      const instance = await tx.workflowInstance.create({
        data: {
          applicationId: application.id,
          workflowTemplateKey: template.templateKey,
          currentStageKey: initialStageKey,
          overallStatus: "IN_PROGRESS",
          metadataJson: JSON.stringify({ templateName: template.name }),
        },
      });

      // 2. Create stage instance records for all stages in template
      const stageRecords = [];
      for (const stageDef of template.stages) {
        const isFirst = stageDef.stageKey === initialStageKey && stageDef.sequenceOrder === template.stages.find(s => s.stageKey === initialStageKey)?.sequenceOrder;
        const stage = await tx.workflowStageInstance.create({
          data: {
            workflowInstanceId: instance.id,
            applicationId: application.id,
            stageKey: stageDef.stageKey,
            stageName: stageDef.stageName,
            stageStatus: isFirst ? "ASSIGNED" : "NOT_STARTED",
            sequenceOrder: stageDef.sequenceOrder,
            assignedCommittee: stageDef.assignedCommittee || null,
            assignedStaffId: isFirst ? (staff?.id || null) : null,
            assignedAt: isFirst ? new Date() : null,
            dueAt: isFirst ? deadline : null,
          },
        });
        if (isFirst) {
          // Record assignment history
          await tx.stageActionHistory.create({
            data: {
              stageInstanceId: stage.id,
              applicationId: application.id,
              action: "STAGE_ASSIGNED",
              actorStaffId: staff?.id || null,
              actorRole: "system",
              previousStatus: "NOT_STARTED",
              newStatus: "ASSIGNED",
              comments: `Auto-assigned to ${staff?.name || "Scrutiny Committee"} (${staff?.employeeCode || "DEMO-AIC-034"})`,
              isAutomated: true,
            },
          });
        }
        stageRecords.push(stage);
      }

      return instance;
    });
  },

  /**
   * Get a full workflow instance with all stages for an application.
   */
  async getForApplication(applicationId) {
    return prisma.workflowInstance.findUnique({
      where: { applicationId },
      include: {
        stages: {
          orderBy: { sequenceOrder: "asc" },
          include: {
            assignedStaff: { select: { id: true, name: true, employeeCode: true, email: true } },
            reports: { include: { submittedBy: { select: { id: true, name: true, employeeCode: true } } } },
            histories: {
              orderBy: { timestamp: "asc" },
              include: { actorStaff: { select: { id: true, name: true, employeeCode: true } } },
            },
          },
        },
      },
    });
  },

  /**
   * Start processing a stage (mark as IN_PROGRESS).
   */
  async startStage(applicationId, stageIdentifier, actor) {
    const stage = await prisma.workflowStageInstance.findFirst({
      where: {
        applicationId,
        OR: [
          { id: stageIdentifier },
          { stageKey: stageIdentifier },
        ],
      },
    });
    if (!stage) {
      throw Object.assign(new Error("Stage not found for this application"), { status: 404 });
    }
    if (stage.stageStatus === "IN_PROGRESS") {
      return stage;
    }
    if (!["ASSIGNED", "NOT_STARTED"].includes(stage.stageStatus)) {
      throw Object.assign(new Error(`Stage is already ${stage.stageStatus}`), { status: 400 });
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.workflowStageInstance.update({
        where: { id: stage.id },
        data: { stageStatus: "IN_PROGRESS", startedAt: new Date() },
      });
      await tx.stageActionHistory.create({
        data: {
          stageInstanceId: stage.id,
          applicationId,
          action: "STAGE_STARTED",
          actorStaffId: actor?.staffId || null,
          actorUserId: actor?.id || null,
          actorRole: actor?.role || "aicte",
          previousStatus: stage.stageStatus,
          newStatus: "IN_PROGRESS",
        },
      });
      return updated;
    });
  },

  /**
   * Record a stage decision/outcome and advance to next stage.
   * This is the core workflow transition function.
   */
  async recordStageDecision(applicationId, stageIdentifier, outcome, comments, findings, actor) {
    const stageInstance = await prisma.workflowStageInstance.findFirst({
      where: {
        applicationId,
        OR: [
          { id: stageIdentifier },
          { stageKey: stageIdentifier },
        ],
      },
      include: { workflowInstance: { include: { stages: { orderBy: { sequenceOrder: "asc" } } } } },
    });

    if (!stageInstance) {
      throw Object.assign(new Error("Stage not found for this application"), { status: 404 });
    }

    const wfInstance = stageInstance.workflowInstance;
    const template = resolveWorkflowTemplate(wfInstance.workflowTemplateKey);

    // Validate outcome is allowed for this stage
    const stageDef = getStageFromTemplate(template, stageInstance.stageKey);
    if (stageDef && !stageDef.allowedOutcomes.includes(outcome)) {
      throw Object.assign(
        new Error(`Outcome '${outcome}' is not allowed for stage '${stageInstance.stageName}'. Allowed: ${stageDef.allowedOutcomes.join(", ")}`),
        { status: 400 }
      );
    }

    // Active Deficiency Lock Gate: Cannot transition workflow stage while deficiency is pending
    const pendingDef = await prisma.deficiencyRequest.findFirst({
      where: { applicationId, status: "pending" },
    });
    if (pendingDef && outcome !== "DEFICIENCY") {
      throw Object.assign(
        new Error("Cannot transition workflow stage while an official deficiency notice is pending institutional response."),
        {
          status: 409,
          code: "DEFICIENCY_RESPONSE_PENDING",
          activeDeficiency: {
            id: pendingDef.id,
            status: pendingDef.status,
            dueAt: pendingDef.dueAt,
          },
        }
      );
    }







    const nextStageKey = resolveNextStageKey(template, stageInstance.stageKey, outcome);
    const isFinalDecision = stageDef?.isFinal || false;

    const now = new Date();

    // Derive new overall status
    let newOverallStatus = "IN_PROGRESS";
    let newApplicationStatus = "in_review";
    if (outcome === "APPROVED" || outcome === "CONDITIONAL_APPROVAL") {
      newOverallStatus = "APPROVED";
      newApplicationStatus = "approved";
    } else if (outcome === "REJECTED") {
      newOverallStatus = "REJECTED";
      newApplicationStatus = "rejected";
    } else if (outcome === "DEFICIENCY") {
      newOverallStatus = "AWAITING_INSTITUTE";
      newApplicationStatus = "awaiting_institution";
    } else if (outcome === "INELIGIBLE") {
      newOverallStatus = "DECISION_PENDING";
      newApplicationStatus = "in_review";
    }

    return prisma.$transaction(async (tx) => {
      // 1. Complete current stage
      await tx.workflowStageInstance.update({
        where: { id: stageInstance.id },
        data: {
          stageStatus: "COMPLETED",
          completedAt: now,
          outcome,
          reviewerComments: comments,
          findings,
          nextStageKey,
        },
      });

      await tx.stageActionHistory.create({
        data: {
          stageInstanceId: stageInstance.id,
          applicationId,
          action: "STAGE_COMPLETED",
          actorStaffId: actor?.staffId || null,
          actorUserId: actor?.id || null,
          actorRole: actor?.role || "aicte",
          previousStatus: stageInstance.stageStatus,
          newStatus: "COMPLETED",
          comments: `Outcome: ${outcome}. ${comments || ""}`,
        },
      });

      // 2. Create audit event
      await tx.auditEvent.create({
        data: {
          applicationId,
          actorUserId: actor?.id || actor?.staffId || null,
          actorRole: actor?.role || "aicte",
          action: `STAGE_${outcome}`,
          fromStage: stageInstance.stageKey,
          toStage: nextStageKey || "terminal",
          reason: comments,
          metadataJson: JSON.stringify({ outcome, stageInstanceId: stageInstance.id, findings }),
        },
      });

      // 3. Advance to next stage or finalize
      if (!nextStageKey || isFinalDecision) {
        // Terminal: update workflow instance and application
        await tx.workflowInstance.update({
          where: { id: wfInstance.id },
          data: { overallStatus: newOverallStatus, completedAt: now, currentStageKey: stageInstance.stageKey },
        });

        const updatedApp = await tx.application.update({
          where: { id: applicationId },
          data: {
            status: newApplicationStatus,
            currentStageName: isFinalDecision ? "Decision Recorded" : stageInstance.stageName,
            lastActionAt: now,
          },
        });

        // Complete all open tasks
        await tx.workflowTask.updateMany({
          where: { applicationId, status: "open" },
          data: { status: "completed", completedAt: now },
        });

        return { stage: stageInstance, nextStageKey: null, application: updatedApp };
      }

      // 4. Find and activate next stage
      const nextStageDef = getStageFromTemplate(template, nextStageKey);
      const nextStageRecord = wfInstance.stages.find(s => s.stageKey === nextStageKey && s.stageStatus === "NOT_STARTED");
      const staff = await getPinnedStaff(nextStageKey);
      const deadline = calculateDeadline(nextStageDef?.deadlineDays || 14);

      let activatedStage = null;
      if (nextStageRecord) {
        activatedStage = await tx.workflowStageInstance.update({
          where: { id: nextStageRecord.id },
          data: {
            stageStatus: "ASSIGNED",
            assignedAt: now,
            assignedStaffId: staff?.id || null,
            assignedCommittee: nextStageDef?.assignedCommittee || null,
            dueAt: deadline,
          },
        });

        await tx.stageActionHistory.create({
          data: {
            stageInstanceId: nextStageRecord.id,
            applicationId,
            action: "STAGE_ASSIGNED",
            actorStaffId: staff?.id || null,
            actorRole: "system",
            previousStatus: "NOT_STARTED",
            newStatus: "ASSIGNED",
            comments: `Auto-assigned to ${staff?.name || nextStageDef?.assignedRole} after ${outcome} outcome`,
            isAutomated: true,
          },
        });
      }

      // Update workflow instance current stage
      await tx.workflowInstance.update({
        where: { id: wfInstance.id },
        data: { currentStageKey: nextStageKey, overallStatus: newOverallStatus },
      });

      // Update application status
      const updatedApp = await tx.application.update({
        where: { id: applicationId },
        data: {
          status: newApplicationStatus,
          currentStageId: nextStageKey,
          currentStageName: nextStageDef?.stageName || nextStageKey,
          currentAssigneeRole: nextStageDef?.assignedRole || "aicte",
          assignedUserId: staff?.employeeCode || null,
          stageEnteredAt: now,
          dueAt: deadline,
          lastActionAt: now,
        },
      });

      // Create workflow task for next stage
      await tx.workflowTask.create({
        data: {
          applicationId,
          taskType: `${nextStageKey}_action`,
          title: `${nextStageDef?.stageName || nextStageKey}: ${updatedApp.applicationNumber}`,
          description: `Process application in stage: ${nextStageDef?.stageName}`,
          assignedRole: nextStageDef?.assignedRole || "aicte",
          status: "open",
          priority: "normal",
          dueAt: deadline,
          sourceStageId: nextStageKey,
        },
      });

      // Notification to institution
      if (["clarification", "awaiting_institution"].includes(nextStageKey)) {
        await tx.notification.create({
          data: {
            recipientUserId: (await tx.application.findUnique({ where: { id: applicationId }, select: { createdById: true } }))?.createdById || "inst-user-1",
            applicationId,
            type: "deficiency_issued",
            title: `Deficiency Notice for Application`,
            message: `AICTE Scrutiny has raised deficiencies. Please respond within ${nextStageDef?.deadlineDays || 10} days.`,
            priority: "urgent",
            actionUrl: `/institution/applications/${applicationId}`,
            deduplicationKey: `${applicationId}:deficiency:${now.getTime()}`,
          },
        });
      }

      return { stage: activatedStage || nextStageRecord, nextStageKey, application: updatedApp };
    });
  },

  /**
   * Submit a review report for a stage.
   */
  async submitReport(applicationId, stageInstanceId, reportData, actor) {
    const stage = await prisma.workflowStageInstance.findUnique({
      where: { id: stageInstanceId },
    });
    if (!stage || stage.applicationId !== applicationId) {
      throw Object.assign(new Error("Stage not found"), { status: 404 });
    }

    const versionHash = reportData.metadata?.versionHash || reportData.versionHash || null;
    const reportType = reportData.reportType || "SCRUTINY_REPORT";

    return await prisma.$transaction(async (tx) => {
      // 1. Check for existing report matching identical application and versionHash
      if (reportType === "AI_SCRUTINY_PRE_CHECK" && versionHash) {
        const existing = await tx.reviewReport.findFirst({
          where: {
            applicationId,
            reportType: "AI_SCRUTINY_PRE_CHECK",
            versionHash,
          },
        });
        if (existing) {
          // If the existing report had a technical failure/skip for LLM and the new one succeeded,
          // or if new findings/metadata are provided, safely update the canonical report record!
          const existingMeta = existing.metadataJson ? JSON.parse(existing.metadataJson) : {};
          const newMeta = reportData.metadata || {};
          const wasFailedLlm = existingMeta.llmAnalysis?.status === "TECHNICAL_FAILURE" || existingMeta.llmAnalysis?.status === "SKIPPED";
          const isNowSuccessLlm = newMeta.llmAnalysis?.status === "SUCCESS";
          const hasNewFindings = (newMeta.llmFindings?.length || 0) > (existingMeta.llmFindings?.length || 0);
          const existingFindingsStr = JSON.stringify(existingMeta.findings || []);
          const newFindingsStr = JSON.stringify(newMeta.findings || []);
          const deterministicFindingsChanged = existingFindingsStr !== newFindingsStr;
          const isRerun = Boolean(newMeta.isRerun || reportData.isRerun || reportData.forceRerun);

          if ((wasFailedLlm && isNowSuccessLlm) || hasNewFindings || newMeta.isResubmission || deterministicFindingsChanged || isRerun) {
            const updated = await tx.reviewReport.update({
              where: { id: existing.id },
              data: {
                title: reportData.title || existing.title,
                content: reportData.content || existing.content,
                recommendations: reportData.recommendations || existing.recommendations,
                outcome: reportData.outcome || existing.outcome,
                metadataJson: JSON.stringify(newMeta),
              },
            });
            return updated;
          }
          return existing;
        }
      }

      try {
        const report = await tx.reviewReport.create({
          data: {
            workflowStageId: stageInstanceId,
            applicationId,
            reportType,
            title: reportData.title,
            content: reportData.content,
            recommendations: reportData.recommendations || null,
            outcome: reportData.outcome || null,
            submittedById: actor?.staffId || null,
            metadataJson: reportData.metadata ? JSON.stringify(reportData.metadata) : null,
            versionHash,
          },
        });

        await tx.stageActionHistory.create({
          data: {
            stageInstanceId,
            applicationId,
            action: "REPORT_SUBMITTED",
            actorStaffId: actor?.staffId || null,
            actorUserId: actor?.id || null,
            actorRole: actor?.role || "aicte",
            previousStatus: stage.stageStatus,
            newStatus: stage.stageStatus,
            comments: `Report submitted: ${reportData.title}`,
          },
        });

        return report;
      } catch (err) {
        // Concurrency conflict: If a simultaneous request won the race on the partial unique index
        if (err.code === "P2002" || err.message?.includes("UNIQUE constraint failed")) {
          const raceWinner = await tx.reviewReport.findFirst({
            where: {
              applicationId,
              reportType: "AI_SCRUTINY_PRE_CHECK",
              versionHash,
            },
          });
          if (raceWinner) return raceWinner;
        }
        throw err;
      }
    });
  },

  /**
   * Record an institute deficiency response and move back to re-scrutiny.
   */
  async recordDeficiencyResponse(applicationId, responseText, actorUser) {
    const wfInstance = await prisma.workflowInstance.findUnique({
      where: { applicationId },
      include: { stages: { orderBy: { sequenceOrder: "asc" } } },
    });

    const clarificationStage = wfInstance?.stages.find(
      s => s.stageKey === "clarification" && ["ASSIGNED", "IN_PROGRESS", "DEFICIENCY_RAISED", "AWAITING_RESPONSE"].includes(s.stageStatus)
    );

    const now = new Date();

    return prisma.$transaction(async (tx) => {
      if (clarificationStage) {
        await tx.workflowStageInstance.update({
          where: { id: clarificationStage.id },
          data: { stageStatus: "RESPONSE_RECEIVED", completedAt: now, reviewerComments: responseText },
        });

        await tx.stageActionHistory.create({
          data: {
            stageInstanceId: clarificationStage.id,
            applicationId,
            action: "RESPONSE_RECEIVED",
            actorUserId: actorUser?.id || null,
            actorRole: "institution",
            previousStatus: clarificationStage.stageStatus,
            newStatus: "RESPONSE_RECEIVED",
            comments: responseText,
          },
        });
      }

      // Mark pending deficiency resolved
      await tx.deficiencyRequest.updateMany({
        where: { applicationId, status: "pending" },
        data: { status: "resolved", respondedAt: now, responseText, respondedById: actorUser?.id || null },
      });

      // Find next scrutiny stage
      const scrutinyStage = wfInstance?.stages.find(
        s => s.stageKey === "scrutiny" && s.stageStatus === "NOT_STARTED"
      ) || wfInstance?.stages.find(s => s.stageKey === "scrutiny");

      const staff = await getPinnedStaff("scrutiny");
      const deadline = calculateDeadline(14);

      if (scrutinyStage) {
        await tx.workflowStageInstance.update({
          where: { id: scrutinyStage.id },
          data: {
            stageStatus: "ASSIGNED",
            assignedAt: now,
            assignedStaffId: staff?.id || null,
            dueAt: deadline,
          },
        });
      }

      // Update workflow instance
      if (wfInstance) {
        await tx.workflowInstance.update({
          where: { id: wfInstance.id },
          data: { currentStageKey: "scrutiny", overallStatus: "AWAITING_AICTE_ACTION" },
        });
      }

      const updatedApp = await tx.application.update({
        where: { id: applicationId },
        data: {
          status: "in_review",
          currentStageId: "scrutiny",
          currentStageName: "Scrutiny Committee Review",
          currentAssigneeRole: "scrutiny_committee",
          assignedUserId: staff?.employeeCode || "DEMO-AIC-034",
          dueAt: deadline,
          lastActionAt: now,
        },
      });

      await tx.auditEvent.create({
        data: {
          applicationId,
          actorUserId: actorUser?.id || null,
          actorRole: "institution",
          action: "DEFICIENCY_RESPONSE_SUBMITTED",
          fromStage: "clarification",
          toStage: "scrutiny",
          reason: responseText,
        },
      });

      return updatedApp;
    });
  },
};
