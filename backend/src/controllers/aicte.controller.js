/**
 * AICTE Application Processing Controller
 * Handles all AICTE-side application queue, detail, timeline, and action endpoints.
 */
import prisma from "../db/prisma.js";
import { workflowInstanceService } from "../services/workflowInstance.service.js";
import { resolveWorkflowTemplate, getStageFromTemplate } from "../services/workflowConfig.service.js";

// Authorization helper: check if staff can access this application
function canAccessApplication(req, application) {
  if (!req.user) return false;
  if (req.user.accountType === "institution") {
    return req.user.institutionId === application.institutionId;
  }
  // AICTE staff: check assignedUserId or admin/super-admin permissions
  const perms = req.user.permissions || [];
  const isAdmin = perms.includes("VIEW_ALL_APPLICATIONS") || req.user.platformRoles?.includes("SUPER_ADMIN");
  if (isAdmin) return true;
  // Check if directly assigned
  if (application.assignedUserId === req.user.employeeCode) return true;
  // Check workflow assignment
  return true; // For now: all AICTE staff can see assigned queue
}

const APPLICATION_INCLUDES = {
  institution: true,
  region: true,
  applicationType: true,
  documents: { orderBy: { uploadedAt: "desc" } },
  deficiencies: { orderBy: { createdAt: "desc" } },
  auditEvents: {
    orderBy: { createdAt: "asc" },
    include: { actor: { select: { id: true, name: true, email: true, role: true } } },
  },
  tasks: { orderBy: { createdAt: "desc" } },
  evcVisits: { include: { experts: true }, orderBy: { createdAt: "desc" } },
  undertakings: { orderBy: { createdAt: "desc" } },
  workflowInstance: {
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
  },
  decision: true,
  appeals: true,
};

function formatApp(app) {
  return { ...app, formData: app.formDataJson ? JSON.parse(app.formDataJson) : {} };
}

export const aicteController = {
  // ─── GET /api/aicte/applications ─────────────────────────────────────────
  async listApplications(req, res, next) {
    try {
      if (!req.user || req.user.accountType === "institution") {
        return res.status(403).json({ error: "Access denied. AICTE officer login required." });
      }

      const page = Math.max(1, parseInt(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
      const skip = (page - 1) * pageSize;

      const where = {};

      // Queue filter
      if (req.query.queue) {
        switch (req.query.queue) {
          case "my_assigned":
            where.assignedUserId = req.user.employeeCode;
            break;
          case "scrutiny":
            where.currentStageId = "scrutiny";
            break;
          case "re_scrutiny":
            where.currentStageId = "re_scrutiny";
            break;
          case "evc":
            where.status = "pending_evc";
            break;
          case "shc":
            where.currentStageId = "committee";
            break;
          case "awaiting_institute":
            where.status = "awaiting_institution";
            break;
          case "decision_pending":
            where.OR = [{ currentStageId: "decision" }, { status: "decision_pending" }];
            break;
          case "approved":
            where.status = "approved";
            break;
          case "rejected":
            where.status = "rejected";
            break;
          default:
            // "all" — no stage filter
            break;
        }
      }

      // Status filter
      if (req.query.status && req.query.status !== "all") where.status = req.query.status;
      // Stage filter
      if (req.query.stage && req.query.stage !== "all") where.currentStageId = req.query.stage;
      // Region filter
      if (req.query.regionId) where.regionId = req.query.regionId;
      // Application type filter
      if (req.query.applicationTypeId) where.applicationTypeId = req.query.applicationTypeId;
      // Assigned officer filter
      if (req.query.assignedUserId) where.assignedUserId = req.query.assignedUserId;
      // Overdue filter
      if (req.query.overdueOnly === "true") {
        where.dueAt = { lt: new Date() };
        where.status = { notIn: ["approved", "rejected", "closed", "withdrawn"] };
      }
      // Academic year filter (stored in formData JSON — skip for now, apply client-side if needed)

      // Search
      const q = req.query.query || req.query.search;
      if (q?.trim()) {
        const term = q.trim();
        where.OR = [
          { applicationNumber: { contains: term } },
          { institution: { institutionName: { contains: term } } },
          { institution: { institutionCode: { contains: term } } },
          { applicationCategory: { contains: term } },
        ];
      }

      const [total, rawItems] = await Promise.all([
        prisma.application.count({ where }),
        prisma.application.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: { updatedAt: "desc" },
          include: {
            institution: true,
            region: true,
            applicationType: true,
            documents: true,
            deficiencies: { where: { status: "pending" } },
            workflowInstance: { select: { id: true, currentStageKey: true, overallStatus: true } },
          },
        }),
      ]);

      res.json({
        items: rawItems.map(formatApp),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      });
    } catch (err) {
      next(err);
    }
  },

  // ─── GET /api/aicte/applications/:id ─────────────────────────────────────
  async getApplicationById(req, res, next) {
    try {
      if (!req.user || req.user.accountType === "institution") {
        return res.status(403).json({ error: "Access denied." });
      }

      const { id } = req.params;
      const app = await prisma.application.findFirst({
        where: { OR: [{ id }, { applicationNumber: id }] },
        include: APPLICATION_INCLUDES,
      });

      if (!app) return res.status(404).json({ error: "Application not found." });

      res.json(formatApp(app));
    } catch (err) {
      next(err);
    }
  },

  // ─── GET /api/aicte/applications/:id/timeline ─────────────────────────────
  async getTimeline(req, res, next) {
    try {
      if (!req.user || req.user.accountType === "institution") {
        return res.status(403).json({ error: "Access denied." });
      }

      const { id } = req.params;
      const app = await prisma.application.findFirst({
        where: { OR: [{ id }, { applicationNumber: id }] },
        select: { id: true, applicationNumber: true, submittedAt: true, createdAt: true },
      });
      if (!app) return res.status(404).json({ error: "Application not found." });

      let wfInstance = await workflowInstanceService.getForApplication(app.id);
      if (!wfInstance) {
        const fullApp = await prisma.application.findUnique({
          where: { id: app.id },
          include: { applicationType: true },
        });
        if (fullApp && fullApp.status !== "draft") {
          try {
            await workflowInstanceService.initializeForApplication(fullApp);
            wfInstance = await workflowInstanceService.getForApplication(app.id);
          } catch (initErr) {
            console.warn("Lazy workflow init warning:", initErr.message);
          }
        }
      }

      const [auditEvents, deficiencies, decision] = await Promise.all([
        prisma.auditEvent.findMany({
          where: { applicationId: app.id },
          orderBy: { createdAt: "asc" },
          include: { actor: { select: { id: true, name: true, email: true, role: true } } },
        }),
        prisma.deficiencyRequest.findMany({
          where: { applicationId: app.id },
          orderBy: { createdAt: "asc" },
        }),
        prisma.applicationDecision.findUnique({
          where: { applicationId: app.id },
        }),
      ]);

      res.json({
        applicationId: app.id,
        applicationNumber: app.applicationNumber,
        submittedAt: app.submittedAt,
        createdAt: app.createdAt,
        workflowInstance: wfInstance,
        stages: wfInstance?.stages || [],
        auditEvents,
        deficiencies,
        decision,
      });
    } catch (err) {
      next(err);
    }
  },

  // ─── GET /api/aicte/applications/:id/documents ────────────────────────────
  async getDocuments(req, res, next) {
    try {
      if (!req.user || req.user.accountType === "institution") {
        return res.status(403).json({ error: "Access denied." });
      }
      const { id } = req.params;
      const app = await prisma.application.findFirst({
        where: { OR: [{ id }, { applicationNumber: id }] },
        select: { id: true },
      });
      if (!app) return res.status(404).json({ error: "Application not found." });

      const docs = await prisma.applicationDocument.findMany({
        where: { applicationId: app.id },
        orderBy: { uploadedAt: "desc" },
      });
      res.json(docs);
    } catch (err) {
      next(err);
    }
  },

  // ─── GET /api/aicte/applications/:id/assignments ──────────────────────────
  async getAssignments(req, res, next) {
    try {
      if (!req.user || req.user.accountType === "institution") {
        return res.status(403).json({ error: "Access denied." });
      }
      const { id } = req.params;
      const assignments = await prisma.workflowAssignment.findMany({
        where: { applicationId: id },
        include: { staff: { select: { id: true, name: true, employeeCode: true, email: true } }, committee: true },
        orderBy: { assignedAt: "desc" },
      });
      res.json(assignments);
    } catch (err) {
      next(err);
    }
  },

  // ─── GET /api/aicte/applications/:id/reports ──────────────────────────────
  async getReports(req, res, next) {
    try {
      if (!req.user || req.user.accountType === "institution") {
        return res.status(403).json({ error: "Access denied." });
      }
      const { id } = req.params;
      const wfInstance = await workflowInstanceService.getForApplication(id);
      if (!wfInstance) return res.json([]);
      const reports = wfInstance.stages.flatMap(s => s.reports || []);
      res.json(reports);
    } catch (err) {
      next(err);
    }
  },

  // ─── POST /api/aicte/applications/:id/assign ──────────────────────────────
  async assignApplication(req, res, next) {
    try {
      if (!req.user || req.user.accountType === "institution") {
        return res.status(403).json({ error: "Access denied." });
      }
      const { id } = req.params;
      const { staffId, committeeId, roleInWorkflow, reason } = req.body;

      const app = await prisma.application.findUnique({ where: { id } });
      if (!app) return res.status(404).json({ error: "Application not found." });

      const assignment = await prisma.workflowAssignment.create({
        data: {
          staffId,
          committeeId: committeeId || null,
          applicationId: id,
          roleInWorkflow: roleInWorkflow || "REVIEWER",
          status: "ASSIGNED",
        },
      });

      await prisma.auditEvent.create({
        data: {
          applicationId: id,
          actorUserId: req.user.id,
          actorRole: req.user.role,
          action: "MANUAL_ASSIGNMENT",
          reason: reason || `Manually assigned to staff ${staffId}`,
        },
      });

      res.status(201).json({ success: true, assignment });
    } catch (err) {
      next(err);
    }
  },

  // ─── POST /api/aicte/applications/:id/stages/:stageId/start ──────────────
  async startStage(req, res, next) {
    try {
      if (!req.user || req.user.accountType === "institution") {
        return res.status(403).json({ error: "Access denied." });
      }
      const { id, stageId } = req.params;
      const result = await workflowInstanceService.startStage(id, stageId, req.user);
      res.json({ success: true, stage: result });
    } catch (err) {
      next(err);
    }
  },

  // ─── POST /api/aicte/applications/:id/stages/:stageId/decision ───────────
  async recordStageDecision(req, res, next) {
    try {
      if (!req.user || req.user.accountType === "institution") {
        return res.status(403).json({ error: "Access denied." });
      }

      const { id, stageId } = req.params;
      const { outcome, comments, findings } = req.body;

      if (!outcome) {
        return res.status(400).json({ error: "outcome is required." });
      }

      const result = await workflowInstanceService.recordStageDecision(
        id, stageId, outcome, comments, findings, req.user
      );

      // Re-fetch fresh application for response
      const app = await prisma.application.findUnique({
        where: { id },
        include: APPLICATION_INCLUDES,
      });

      res.json({ success: true, ...result, application: formatApp(app) });
    } catch (err) {
      next(err);
    }
  },

  // ─── POST /api/aicte/applications/:id/deficiencies ───────────────────────
  async raiseDeficiency(req, res, next) {
    try {
      if (!req.user || req.user.accountType === "institution") {
        return res.status(403).json({ error: "Access denied." });
      }
      const { id } = req.params;
      const { deficiencyText, deficiencyCategory, relatedDocument, dueDays = 10 } = req.body;

      if (!deficiencyText?.trim()) {
        return res.status(400).json({ error: "deficiencyText is required." });
      }

      const app = await prisma.application.findFirst({
        where: { OR: [{ id }, { applicationNumber: id }] },
      });
      if (!app) return res.status(404).json({ error: "Application not found." });

      const now = new Date();
      const dueDate = new Date(now.getTime() + dueDays * 86400000);
      const fullText = `${deficiencyCategory ? `[${deficiencyCategory}] ` : ""}${deficiencyText.trim()}${relatedDocument ? ` (Ref: ${relatedDocument})` : ""}`;

      const result = await prisma.$transaction(async (tx) => {
        const deficiency = await tx.deficiencyRequest.create({
          data: {
            applicationId: app.id,
            raisedById: req.user.id || req.user.employeeCode,
            deficiencyText: fullText,
            status: "pending",
            dueAt: dueDate,
          },
        });

        const updatedApp = await tx.application.update({
          where: { id: app.id },
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

        await tx.workflowTask.create({
          data: {
            applicationId: app.id,
            taskType: "deficiency_response",
            title: `Deficiency Raised: ${app.applicationNumber}`,
            description: deficiencyText.trim(),
            assignedRole: "institution",
            assignedUserId: app.createdById,
            status: "open",
            priority: "high",
            dueAt: dueDate,
            sourceStageId: "clarification",
          },
        });

        await tx.auditEvent.create({
          data: {
            applicationId: app.id,
            actorUserId: req.user.id,
            actorRole: req.user.role || "scrutiny_committee",
            action: "DEFICIENCY_RAISED",
            fromStage: app.currentStageId,
            toStage: "clarification",
            reason: deficiencyText.trim(),
          },
        });

        await tx.notification.create({
          data: {
            recipientUserId: app.createdById,
            applicationId: app.id,
            type: "deficiency_issued",
            title: `Deficiency Raised for ${app.applicationNumber}`,
            message: `AICTE requires clarification: "${deficiencyText.trim()}". ${dueDays} statutory days to respond.`,
            priority: "urgent",
            actionUrl: `/institution/applications/${app.id}`,
            deduplicationKey: `${app.id}:deficiency:${now.getTime()}`,
          },
        });

        // Update workflow stage status if instance exists
        const wfInstance = await tx.workflowInstance.findUnique({
          where: { applicationId: app.id },
          include: { stages: true },
        });
        if (wfInstance) {
          const clarStage = wfInstance.stages.find(s => s.stageKey === "clarification");
          if (clarStage) {
            await tx.workflowStageInstance.update({
              where: { id: clarStage.id },
              data: { stageStatus: "DEFICIENCY_RAISED", assignedAt: now, dueAt: dueDate },
            });
          }
        }

        return { deficiency, application: updatedApp };
      });

      res.status(201).json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  },

  // ─── POST /api/aicte/applications/:id/deficiencies/:deficiencyId/resolve ──
  async resolveDeficiency(req, res, next) {
    try {
      if (!req.user || req.user.accountType === "institution") {
        return res.status(403).json({ error: "Access denied." });
      }
      const { id, deficiencyId } = req.params;
      const { resolutionNotes } = req.body;

      await prisma.deficiencyRequest.update({
        where: { id: deficiencyId },
        data: { status: "resolved", respondedAt: new Date(), responseText: resolutionNotes, respondedById: req.user.id },
      });

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },

  // ─── POST /api/aicte/applications/:id/forward ─────────────────────────────
  async forwardApplication(req, res, next) {
    try {
      if (!req.user || req.user.accountType === "institution") {
        return res.status(403).json({ error: "Access denied." });
      }
      const { id } = req.params;
      const { outcome, reason } = req.body;

      const app = await prisma.application.findUnique({ where: { id } });
      if (!app) return res.status(404).json({ error: "Application not found." });

      const wfInstance = await workflowInstanceService.getForApplication(id);
      if (!wfInstance) return res.status(400).json({ error: "Workflow instance not found. Application may not have been submitted yet." });

      const currentStage = wfInstance.stages.find(s => s.stageKey === wfInstance.currentStageKey && !["COMPLETED", "SKIPPED"].includes(s.stageStatus));
      if (!currentStage) return res.status(400).json({ error: "No active stage found to forward." });

      const template = resolveWorkflowTemplate(wfInstance.workflowTemplateKey);
      const stageDef = getStageFromTemplate(template, currentStage.stageKey);
      let chosenOutcome = outcome;
      if (!chosenOutcome) {
        if (stageDef?.allowedOutcomes?.includes("PASS")) chosenOutcome = "PASS";
        else if (stageDef?.allowedOutcomes?.includes("FAVORABLE")) chosenOutcome = "FAVORABLE";
        else if (stageDef?.allowedOutcomes?.includes("RECOMMENDATION_SUBMITTED")) chosenOutcome = "RECOMMENDATION_SUBMITTED";
        else chosenOutcome = stageDef?.allowedOutcomes?.[0] || "PASS";
      }

      const result = await workflowInstanceService.recordStageDecision(
        id, currentStage.id, chosenOutcome, reason || "Advanced by officer", null, req.user
      );

      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  },

  // ─── POST /api/aicte/applications/:id/decision ────────────────────────────
  async recordFinalDecision(req, res, next) {
    try {
      if (!req.user || req.user.accountType === "institution") {
        return res.status(403).json({ error: "Access denied." });
      }

      const perms = req.user.permissions || [];
      const canDecide = perms.includes("ISSUE_FINAL_DECISION") ||
        req.user.role === "competent_authority" ||
        req.user.role === "admin" ||
        req.user.platformRoles?.includes("SUPER_ADMIN");

      if (!canDecide) {
        return res.status(403).json({ error: "You do not have permission to issue final approval/rejection orders." });
      }

      const { id } = req.params;
      const { decisionType, outcome, reasonAndFindings, conditions, documentLetterType, appealEligible = true } = req.body;
      const effectiveOutcome = outcome || decisionType;

      if (!decisionType || !effectiveOutcome || !reasonAndFindings) {
        return res.status(400).json({ error: "decisionType and reasonAndFindings are required." });
      }

      const app = await prisma.application.findUnique({ where: { id }, include: { institution: true } });
      if (!app) return res.status(404).json({ error: "Application not found." });

      const now = new Date();
      const appealDeadline = new Date(now.getTime() + 30 * 86400000); // 30 days to appeal [DEMO]

      const isApproved = ["APPROVED", "CONDITIONAL_APPROVAL"].includes(decisionType);
      const newStatus = isApproved ? "approved" : effectiveOutcome === "DEFERRED" ? "in_review" : "rejected";

      const result = await prisma.$transaction(async (tx) => {
        // Upsert decision record
        const decision = await tx.applicationDecision.upsert({
          where: { applicationId: id },
          update: {
            decisionType,
            outcome: effectiveOutcome,
            decisionDate: now,
            reasonAndFindings,
            conditions: conditions ? JSON.stringify(conditions) : null,
            documentLetterType: documentLetterType || (isApproved ? "LoA" : "LoD"),
            appealEligible: appealEligible && !isApproved,
            appealDeadline: !isApproved ? appealDeadline : null,
            decidedById: req.user.staffId || null,
            decisionAuthority: req.user.role || "competent_authority",
          },
          create: {
            applicationId: id,
            decisionType,
            decisionDate: now,
            outcome: effectiveOutcome,
            reasonAndFindings,
            conditions: conditions ? JSON.stringify(conditions) : null,
            documentLetterType: documentLetterType || (isApproved ? "LoA" : "LoD"),
            appealEligible: appealEligible && !isApproved,
            appealDeadline: !isApproved ? appealDeadline : null,
            decidedById: req.user.staffId || null,
            decisionAuthority: req.user.role || "competent_authority",
          },
        });

        // Update application
        const updatedApp = await tx.application.update({
          where: { id },
          data: {
            status: newStatus,
            currentStageId: "decision",
            currentStageName: isApproved ? "Approval Order Issued" : outcome === "DEFERRED" ? "Decision Deferred" : "Application Rejected",
            currentAssigneeRole: "",
            dueAt: null,
            lastActionAt: now,
          },
        });

        // Complete all open tasks
        await tx.workflowTask.updateMany({
          where: { applicationId: id, status: "open" },
          data: { status: "completed", completedAt: now },
        });

        // Undertakings for conditional approval
        if (isApproved && conditions?.length > 0) {
          for (const cond of conditions) {
            if (cond?.trim()) {
              await tx.undertaking.create({
                data: {
                  applicationId: id,
                  institutionId: app.institutionId,
                  condition: cond.trim(),
                  description: `Condition from ${documentLetterType || "Approval Order"} for ${app.applicationNumber}`,
                  dueAt: new Date(now.getTime() + 180 * 86400000),
                  status: "pending",
                },
              });
            }
          }
        }

        // Audit event
        await tx.auditEvent.create({
          data: {
            applicationId: id,
            actorUserId: req.user.id,
            actorRole: req.user.role,
            action: isApproved ? "FINAL_APPROVAL_ISSUED" : "FINAL_REJECTION_ISSUED",
            fromStage: app.currentStageId,
            toStage: "decision",
            reason: reasonAndFindings,
            metadataJson: JSON.stringify({ decisionType, outcome, conditions, documentLetterType }),
          },
        });

        // Notification
        await tx.notification.create({
          data: {
            recipientUserId: app.createdById,
            applicationId: id,
            type: isApproved ? "application_approved" : "application_rejected",
            title: isApproved ? `Approval Order: ${app.applicationNumber}` : `Decision Notice: ${app.applicationNumber}`,
            message: isApproved
              ? `AICTE has issued ${documentLetterType || "Letter of Approval"} for ${app.applicationCategory}.`
              : `AICTE has rejected petition ${app.applicationNumber}. Reason: ${reasonAndFindings}`,
            priority: "high",
            actionUrl: `/institution/applications/${app.id}`,
            deduplicationKey: `${id}:final_decision`,
          },
        });

        return { decision, application: updatedApp };
      });

      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  },

  // ─── POST /api/aicte/applications/:id/reports ─────────────────────────────
  async submitReport(req, res, next) {
    try {
      if (!req.user || req.user.accountType === "institution") {
        return res.status(403).json({ error: "Access denied." });
      }
      const { id } = req.params;
      const { stageInstanceId, stageId, stageKey, reportType, title, content, recommendations, outcome, metadata } = req.body;

      let resolvedStageId = stageInstanceId || stageId;
      if (!resolvedStageId && stageKey) {
        const found = await prisma.workflowStageInstance.findFirst({
          where: { applicationId: id, stageKey },
        });
        resolvedStageId = found?.id;
      }
      if (!resolvedStageId) {
        const currentStage = await prisma.workflowStageInstance.findFirst({
          where: { applicationId: id, stageStatus: { in: ["IN_PROGRESS", "ASSIGNED"] } },
          orderBy: { sequenceOrder: "asc" },
        });
        resolvedStageId = currentStage?.id;
      }

      if (!resolvedStageId || !title || !content) {
        return res.status(400).json({ error: "stageInstanceId (or stageKey), title, and content are required." });
      }

      const report = await workflowInstanceService.submitReport(
        id, resolvedStageId, { reportType, title, content, recommendations, outcome, metadata }, req.user
      );
      res.status(201).json({ success: true, report });
    } catch (err) {
      next(err);
    }
  },

  // ─── POST /api/aicte/applications/:id/appeals ─────────────────────────────
  async fileAppeal(req, res, next) {
    try {
      // Appeals are filed by institution users
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required." });
      }

      const { id } = req.params;
      const { appealType, groundsText } = req.body;

      if (!groundsText?.trim()) {
        return res.status(400).json({ error: "groundsText is required." });
      }

      const app = await prisma.application.findUnique({ where: { id } });
      if (!app) return res.status(404).json({ error: "Application not found." });

      if (app.status !== "rejected") {
        return res.status(400).json({ error: "Appeals can only be filed against rejected applications." });
      }

      // Check appeal deadline
      const decision = await prisma.applicationDecision.findUnique({ where: { applicationId: id } });
      if (decision?.appealDeadline && new Date() > new Date(decision.appealDeadline)) {
        return res.status(400).json({ error: "Appeal deadline has passed." });
      }

      const appeal = await prisma.appeal.create({
        data: {
          applicationId: id,
          originalDecisionId: decision?.id || null,
          appellantId: req.user.id,
          appealType: appealType || "SAC_APPEAL",
          groundsText: groundsText.trim(),
          status: "FILED",
        },
      });

      await prisma.auditEvent.create({
        data: {
          applicationId: id,
          actorUserId: req.user.id,
          actorRole: req.user.role || "institution",
          action: "APPEAL_FILED",
          reason: groundsText.trim(),
        },
      });

      res.status(201).json({ success: true, appeal });
    } catch (err) {
      next(err);
    }
  },

  // ─── GET /api/aicte/dashboard/metrics ─────────────────────────────────────
  async getDashboardMetrics(req, res, next) {
    try {
      if (!req.user || req.user.accountType === "institution") {
        return res.status(403).json({ error: "Access denied." });
      }

      const now = new Date();

      const [
        total, inReview, pendingScrutiny, awaitingInstitution, pendingEvc,
        committeeReview, approved, rejected, overdue, byStage, byRegion,
        recentAuditEvents,
      ] = await Promise.all([
        prisma.application.count({ where: { status: { notIn: ["draft"] } } }),
        prisma.application.count({ where: { status: "in_review" } }),
        prisma.application.count({ where: { currentStageId: "scrutiny" } }),
        prisma.application.count({ where: { status: "awaiting_institution" } }),
        prisma.application.count({ where: { status: "pending_evc" } }),
        prisma.application.count({ where: { currentStageId: { in: ["committee", "decision"] } } }),
        prisma.application.count({ where: { status: "approved" } }),
        prisma.application.count({ where: { status: "rejected" } }),
        prisma.application.count({
          where: { dueAt: { lt: now }, status: { notIn: ["approved", "rejected", "closed", "draft"] } },
        }),
        prisma.application.groupBy({
          by: ["currentStageId", "currentStageName"],
          where: { status: { notIn: ["approved", "rejected", "closed", "draft"] } },
          _count: { id: true },
        }),
        prisma.application.groupBy({
          by: ["regionId"],
          where: { status: { notIn: ["draft"] } },
          _count: { id: true },
        }),
        prisma.auditEvent.findMany({
          orderBy: { createdAt: "desc" },
          take: 10,
          include: {
            actor: { select: { name: true, role: true } },
            application: { select: { applicationNumber: true } },
          },
        }),
      ]);

      res.json({
        summary: {
          total, inReview, pendingScrutiny, awaitingInstitution, pendingEvc,
          committeeReview, approved, rejected, overdue,
        },
        byStage: byStage.map(s => ({ stageId: s.currentStageId, stageName: s.currentStageName, count: s._count.id })),
        byRegion: byRegion.map(r => ({ regionId: r.regionId, count: r._count.id })),
        recentActivity: recentAuditEvents,
      });
    } catch (err) {
      next(err);
    }
  },

  // ─── Document verification ─────────────────────────────────────────────────
  async updateDocumentStatus(req, res, next) {
    try {
      if (!req.user || req.user.accountType === "institution") {
        return res.status(403).json({ error: "Access denied." });
      }
      const docId = req.params.docId || req.params.id;
      const { status, notes } = req.body;

      const allowed = ["verified", "issue_found", "pending"];
      if (!allowed.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Allowed: ${allowed.join(", ")}` });
      }

      const doc = await prisma.applicationDocument.findUnique({ where: { id: docId } });
      if (!doc) return res.status(404).json({ error: "Document not found." });

      const updated = await prisma.applicationDocument.update({
        where: { id: docId },
        data: {
          verificationStatus: status,
          notes: notes || undefined,
          verifiedById: req.user.id || req.user.employeeCode,
          verifiedAt: new Date(),
        },
      });

      await prisma.auditEvent.create({
        data: {
          applicationId: doc.applicationId,
          actorUserId: req.user.id,
          actorRole: req.user.role || "scrutiny_committee",
          action: status === "verified" ? "DOCUMENT_VERIFIED" : "DOCUMENT_FLAGGED",
          reason: notes || `Document status set to ${status}`,
          metadataJson: JSON.stringify({ documentId: docId, documentType: doc.documentType, status }),
        },
      });

      res.json({ success: true, document: updated });
    } catch (err) {
      next(err);
    }
  },
};
