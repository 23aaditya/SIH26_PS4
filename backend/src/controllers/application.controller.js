import path from "path";
import fs from "fs";
import crypto from "crypto";
import prisma from "../db/prisma.js";
import { applicationService } from "../services/application.service.js";

export const applicationController = {
  async list(req, res, next) {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const pageSize = Math.max(1, Math.min(100, parseInt(req.query.pageSize) || 20));
      const skip = (page - 1) * pageSize;

      const where = {};

      // Restrict institution to their own
      if (req.user?.accountType === "institution") {
        where.institutionId = req.user.institutionId || undefined;
      } else if (req.query.institutionId) {
        where.institutionId = req.query.institutionId;
      }

      if (req.query.regionId) where.regionId = req.query.regionId;
      if (req.query.stageId) where.currentStageId = req.query.stageId;
      if (req.query.status && req.query.status !== "all") where.status = req.query.status;
      if (req.query.category && req.query.category !== "all") where.applicationCategory = req.query.category;
      if (req.query.assignedRole) where.currentAssigneeRole = req.query.assignedRole;
      if (req.query.overdueOnly === "true") {
        where.dueAt = { lt: new Date() };
        where.status = { notIn: ["approved", "rejected", "closed"] };
      }

      const queryTerm = req.query.query || req.query.search;
      if (queryTerm && queryTerm.trim()) {
        const term = queryTerm.trim();
        where.OR = [
          { applicationNumber: { contains: term } },
          { currentStageName: { contains: term } },
          { institution: { institutionName: { contains: term } } },
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
          },
        }),
      ]);

      const items = rawItems.map((app) => ({
        ...app,
        formData: app.formDataJson ? JSON.parse(app.formDataJson) : {},
      }));

      res.json({
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      });
    } catch (error) {
      next(error);
    }
  },

  async myApplications(req, res, next) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      let institutionId = req.user.institutionId;
      if (!institutionId && req.user.email) {
        const u = await prisma.user.findUnique({ where: { email: req.user.email } });
        institutionId = u?.institutionId || "inst-001";
      }

      const rawItems = await prisma.application.findMany({
        where: { institutionId: institutionId || undefined },
        orderBy: { updatedAt: "desc" },
        include: {
          institution: true,
          region: true,
          applicationType: true,
          documents: true,
          deficiencies: {
            where: { status: "pending" },
          },
          workflowInstance: {
            include: {
              stages: {
                include: { assignedStaff: true },
              },
            },
          },
          appeals: {
            orderBy: { createdAt: "desc" },
          },
        },
      });

      const items = rawItems.map((app) => ({
        ...app,
        formData: app.formDataJson ? JSON.parse(app.formDataJson) : {},
      }));

      res.json(items);
    } catch (error) {
      next(error);
    }
  },

  async getById(req, res, next) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      const application = await prisma.application.findFirst({
        where: {
          OR: [{ id }, { applicationNumber: id }],
        },
        include: {
          institution: true,
          region: true,
          createdBy: true,
          applicationType: {
            include: {
              fieldDefinitions: {
                where: { active: true },
                orderBy: { displayOrder: "asc" },
              },
              documentRequirements: {
                orderBy: { displayOrder: "asc" },
              },
            },
          },
          documents: {
            orderBy: { uploadedAt: "desc" },
          },
          fieldValues: true,
          auditEvents: {
            orderBy: { createdAt: "desc" },
            include: { actor: true },
          },
          tasks: {
            orderBy: { createdAt: "desc" },
          },
          deficiencies: {
            orderBy: { createdAt: "desc" },
          },
          evcVisits: {
            include: { experts: true },
            orderBy: { createdAt: "desc" },
          },
          undertakings: {
            include: {
              evidence: { include: { document: true } },
            },
            orderBy: { createdAt: "desc" },
          },
          appeals: {
            orderBy: { createdAt: "desc" },
          },
          decision: true,
          workflowInstance: {
            include: {
              stages: {
                orderBy: { sequenceOrder: "asc" },
                include: {
                  assignedStaff: { select: { id: true, name: true, employeeCode: true, email: true, role: true } },
                  reports: true,
                },
              },
            },
          },
        },
      });

      if (!application) {
        res.status(404).json({ error: "Application not found" });
        return;
      }

      // Authorization check
      if (
        req.user?.accountType === "institution" &&
        req.user.institutionId &&
        req.user.institutionId !== application.institutionId
      ) {
        res.status(403).json({ error: "Access denied to this application" });
        return;
      }

      // Least-privilege constraint for system_service:
      if (req.user?.accountType === "system_service") {
        const allowedStatuses = ["in_review"];
        const allowedStages = ["scrutiny", "re_scrutiny"];

        if (!allowedStatuses.includes(application.status) || !allowedStages.includes(application.currentStageId)) {
          return res.status(403).json({
            error: `Access denied. AI scrutiny service can only access applications actively undergoing scrutiny. Current status: '${application.status}', stage: '${application.currentStageId}'.`,
            code: "INELIGIBLE_APPLICATION_FOR_AI_SCRUTINY",
            currentStatus: application.status,
            currentStageId: application.currentStageId,
          });
        }
      }

      res.json({
        ...application,
        formData: application.formDataJson ? JSON.parse(application.formDataJson) : {},
      });
    } catch (error) {
      next(error);
    }
  },

  async create(req, res, next) {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const created = await applicationService.saveDraft(req.user, req.body);
      res.status(201).json({ success: true, application: created });
    } catch (error) {
      next(error);
    }
  },

  async updateDraft(req, res, next) {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const updated = await applicationService.saveDraft(req.user, req.body, id);
      res.json({ success: true, application: updated });
    } catch (error) {
      next(error);
    }
  },

  async submit(req, res, next) {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const submitted = await applicationService.submitApplication(req.user, id);
      res.json({ success: true, application: submitted });
    } catch (error) {
      next(error);
    }
  },

  async uploadDocument(req, res, next) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const applicationId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const file = req.file;
      const { documentType, documentRequirementId, notes } = req.body;

      if (!file && !req.body.storagePath) {
        return res.status(400).json({ error: "No document file uploaded" });
      }

      const application = await prisma.application.findUnique({
        where: { id: applicationId },
      });
      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      if (
        req.user.accountType === "institution" &&
        req.user.institutionId &&
        application.institutionId !== req.user.institutionId
      ) {
        return res.status(403).json({ error: "Access denied" });
      }

      const originalFilename = file ? file.originalname : req.body.originalFilename || "document.pdf";
      const storagePath = file ? path.relative(process.cwd(), file.path) : req.body.storagePath || `uploads/${originalFilename}`;

      let checksum = req.body.checksum || null;
      if (!checksum) {
        if (file?.path && fs.existsSync(file.path)) {
          const buf = fs.readFileSync(file.path);
          checksum = crypto.createHash("sha256").update(buf).digest("hex");
        } else if (file?.buffer) {
          checksum = crypto.createHash("sha256").update(file.buffer).digest("hex");
        } else if (storagePath) {
          const fullPath = path.resolve(storagePath);
          if (fs.existsSync(fullPath)) {
            const buf = fs.readFileSync(fullPath);
            checksum = crypto.createHash("sha256").update(buf).digest("hex");
          }
        }
      }

      const created = await prisma.applicationDocument.create({
        data: {
          applicationId,
          institutionId: application.institutionId,
          documentRequirementId: documentRequirementId || null,
          documentType: documentType || "Supporting Document",
          originalFilename,
          storagePath,
          checksum,
          mimeType: file?.mimetype || "application/pdf",
          fileSize: file?.size || 1024 * 100,
          uploadedById: req.user.id || req.user.employeeCode || "inst-user-1",
          verificationStatus: "pending",
          notes,
        },
      });

      res.status(201).json({ success: true, document: created });
    } catch (error) {
      next(error);
    }
  },

  async deleteDocument(req, res, next) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { id, documentId } = req.params;
      const doc = await prisma.applicationDocument.findUnique({
        where: { id: documentId },
        include: { application: true },
      });

      if (!doc || doc.applicationId !== id) {
        return res.status(404).json({ error: "Document not found" });
      }

      if (
        req.user.accountType === "institution" &&
        req.user.institutionId &&
        doc.institutionId !== req.user.institutionId
      ) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (doc.application.status !== "draft") {
        return res.status(400).json({ error: "Documents can only be deleted while application is in draft." });
      }

      await prisma.applicationDocument.delete({ where: { id: documentId } });

      if (doc.storagePath) {
        const fullPath = path.resolve(doc.storagePath);
        if (fs.existsSync(fullPath)) {
          try {
            fs.unlinkSync(fullPath);
          } catch {}
        }
      }

      res.json({ success: true, message: "Document removed successfully" });
    } catch (error) {
      next(error);
    }
  },

  async advance(req, res, next) {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { reason } = req.body;
      const updated = await applicationService.advanceStage(req.user, id, reason);

      res.json({ success: true, application: updated });
    } catch (error) {
      next(error);
    }
  },

  async returnForClarification(req, res, next) {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { deficiencyText, notes } = req.body;
      const text = deficiencyText || notes;

      if (!text || !text.trim()) {
        res.status(400).json({ error: "Deficiency text is required" });
        return;
      }

      const updated = await applicationService.returnForClarification(req.user, id, text.trim());
      res.json({ success: true, application: updated });
    } catch (error) {
      next(error);
    }
  },

  async respondToDeficiency(req, res, next) {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { responseText } = req.body;

      if (!responseText || !responseText.trim()) {
        res.status(400).json({ error: "Clarification response text is required" });
        return;
      }

      const updated = await applicationService.respondToDeficiency(
        req.user,
        id,
        responseText.trim()
      );
      res.json({ success: true, application: updated });
    } catch (error) {
      next(error);
    }
  },

  async recordDecision(req, res, next) {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { decision, remarks, conditions } = req.body;

      const normalizedDecision =
        decision === "grant_approval" || decision === "approved" ? "grant_approval" : "reject";

      const updated = await applicationService.recordDecision(
        req.user,
        id,
        normalizedDecision,
        remarks || "Decision recorded per AICTE APH regulations",
        conditions
      );

      res.json({ success: true, application: updated });
    } catch (error) {
      next(error);
    }
  },

  async raiseGrievance(req, res, next) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { groundsText, category, grievanceType } = req.body;

      if (!groundsText || !groundsText.trim()) {
        return res.status(400).json({ error: "Grievance explanation text is required" });
      }

      const application = await prisma.application.findUnique({
        where: { id },
      });
      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      if (
        req.user.accountType === "institution" &&
        req.user.institutionId &&
        req.user.institutionId !== application.institutionId
      ) {
        return res.status(403).json({ error: "Access denied" });
      }

      const appeal = await prisma.appeal.create({
        data: {
          applicationId: id,
          appellantId: req.user.id,
          appealType: grievanceType || "GRIEVANCE_SCRUTINY",
          groundsText: category ? `[${category}] ${groundsText.trim()}` : groundsText.trim(),
          status: "FILED",
        },
      });

      await prisma.auditEvent.create({
        data: {
          applicationId: id,
          actorUserId: req.user.id,
          actorRole: req.user.role || "institution",
          action: "GRIEVANCE_RAISED",
          reason: `Institutional grievance lodged against scrutiny findings: ${groundsText.trim().slice(0, 150)}`,
        },
      });

      // Update application stage action history if workflow instance exists
      const wfInstance = await prisma.workflowInstance.findUnique({
        where: { applicationId: id },
        include: { stages: true },
      });
      if (wfInstance) {
        const activeStage = wfInstance.stages.find(
          (s) => s.stageKey === wfInstance.currentStageKey
        ) || wfInstance.stages[0];
        if (activeStage) {
          await prisma.stageActionHistory.create({
            data: {
              stageInstanceId: activeStage.id,
              applicationId: id,
              action: "GRIEVANCE_FILED",
              actorUserId: req.user.id,
              actorRole: "institution",
              previousStatus: activeStage.stageStatus,
              newStatus: activeStage.stageStatus,
              comments: `Grievance submitted by institution: ${groundsText.trim().slice(0, 150)}`,
            },
          });
        }
      }

      res.status(201).json({
        success: true,
        appeal,
        message: "Grievance successfully registered with AICTE committee.",
      });
    } catch (error) {
      next(error);
    }
  },
};
