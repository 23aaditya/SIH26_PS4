import { workflowEligibilityService } from "../services/workflowEligibility.service.js";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import prisma from "../db/prisma.js";
import { applicationService } from "../services/application.service.js";
import { agentEventService } from "../services/agentEvent.service.js";
import { aiPrevalidationService } from "../services/aiPrevalidation.service.js";

export const applicationController = {
  async list(req, res, next) {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const pageSize = Math.max(1, Math.min(100, parseInt(req.query.pageSize) || 20));
      const skip = (page - 1) * pageSize;

      const where = {};

      // Restrict institution to their own
      if (req.user?.accountType === "institution") {
        where.institutionId = req.user.institutionId || "__NO_INSTITUTION__";
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

      // myApplications is strictly scoped to institution accounts
      if (req.user.accountType !== "institution") {
        return res.json([]);
      }

      let institutionId = req.user.institutionId;
      if (!institutionId && req.user.email) {
        const u = await prisma.user.findUnique({ where: { email: req.user.email } });
        institutionId = u?.institutionId;
      }

      if (!institutionId) {
        return res.json([]);
      }

      const rawItems = await prisma.application.findMany({
        where: { institutionId },
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
                  assignedStaff: {
                    select: {
                      id: true,
                      name: true,
                      employeeCode: true,
                      email: true,
                      accountType: true,
                      designation: true,
                    },
                  },
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
      if (req.user?.accountType === "institution") {
        if (!req.user.institutionId || req.user.institutionId !== application.institutionId) {
          res.status(403).json({ error: "Access denied to this application" });
          return;
        }
      }

      // Least-privilege constraint for system_service:
      if (req.user?.accountType === "system_service") {
        const allowedStatuses = ["in_review", "awaiting_institution"];
        const allowedStages = ["scrutiny", "re_scrutiny", "clarification"];

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

      let userInstId = req.user.institutionId;
      if (!userInstId && req.user.email) {
        const u = await prisma.user.findUnique({ where: { email: req.user.email } });
        userInstId = u?.institutionId;
      }
      if (req.user.accountType === "institution" && (!userInstId || userInstId !== application.institutionId)) {
        return res.status(403).json({ error: "Access denied: Unauthorized institution tenant" });
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

      // Resolve authoritative requirement specification from APH manifest
      const authReq = await aiPrevalidationService.resolveAuthoritativeRequirement(
        application,
        documentRequirementId
      );

      let createdDocument = null;
      let previousDocId = null;

      // Transactional Document Replacement & Outbox Insertion
      await prisma.$transaction(async (tx) => {
        let versionNumber = 1;

        if (documentRequirementId) {
          const existing = await tx.applicationDocument.findFirst({
            where: {
              applicationId,
              documentRequirementId,
              isCurrent: true,
            },
          });

          if (existing) {
            previousDocId = existing.id;
            versionNumber = (existing.versionNumber || 1) + 1;

            // Mark previous document as superseded without unlinking physical file
            await tx.applicationDocument.update({
              where: { id: existing.id },
              data: {
                isCurrent: false,
                supersededAt: new Date(),
              },
            });

            // Log historical audit event
            await tx.auditEvent.create({
              data: {
                applicationId,
                action: "DOCUMENT_REPLACED",
                actorUserId: req.user.id || null,
                actorRole: req.user.accountType || "institution",
                reason: `Document '${existing.originalFilename}' (v${existing.versionNumber}) superseded by '${originalFilename}' (v${versionNumber}).`,
                metadataJson: JSON.stringify({
                  previousDocumentId: existing.id,
                  requirementId: documentRequirementId,
                  newOriginalFilename: originalFilename,
                  versionNumber,
                }),
              },
            });
          }
        }

        // Insert new current ApplicationDocument record
        createdDocument = await tx.applicationDocument.create({
          data: {
            applicationId,
            institutionId: application.institutionId,
            documentRequirementId: documentRequirementId || null,
            documentType: documentType || (authReq?.documentName) || "Supporting Document",
            originalFilename,
            storagePath,
            checksum,
            mimeType: file?.mimetype || "application/pdf",
            fileSize: file?.size || 1024 * 100,
            uploadedById: req.user.id || req.user.employeeCode || "inst-user-1",
            verificationStatus: "pending",
            isCurrent: true,
            versionNumber,
            notes,
          },
        });

        // Enqueue prevalidation via Transactional Outbox (draft status only)
        if (application.status === "draft") {
          const outboxPayload = {
            application_id: applicationId,
            document_id: createdDocument.id,
            institution_id: application.institutionId,
            requirement_id: documentRequirementId || "UNMAPPED",
            checksum: checksum || "",
            document_name: originalFilename,
            storage_path: storagePath,
            requirement_description: authReq?.requirementDescription || "",
            aph_clause: authReq?.aphClause || "",
            application_category: authReq?.applicationCategory || "other",
            program_context_hash: "",
            program_context: "",
          };

          await aiPrevalidationService.createOutboxEntry(tx, {
            applicationId,
            documentId: createdDocument.id,
            institutionId: application.institutionId,
            requirementId: documentRequirementId,
            checksum: checksum || "",
            documentName: originalFilename,
            storagePath,
            payload: outboxPayload,
          });
        }
      });

      // Dispatched outside the transaction
      if (application.status !== "draft") {
        agentEventService.dispatchLifecycleEvent("DOCUMENTS_UPDATED", applicationId, { documentId: createdDocument.id, documentType: createdDocument.documentType }, req.user?.id);
      } else {
        // Trigger asynchronous outbox dispatch immediately
        aiPrevalidationService.dispatchPendingOutboxEvents();
        if (previousDocId) {
          aiPrevalidationService.supersedeDocument(applicationId, previousDocId);
        }
      }

      res.status(201).json({ success: true, document: createdDocument });
    } catch (error) {
      next(error);
    }
  },

  async prevalidateDocument(req, res, next) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { id, documentId } = req.params;
      const application = await prisma.application.findUnique({
        where: { id },
        include: { applicationType: true },
      });

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      let userInstId = req.user.institutionId;
      if (!userInstId && req.user.email) {
        const u = await prisma.user.findUnique({ where: { email: req.user.email } });
        userInstId = u?.institutionId;
      }
      if (req.user.accountType === "institution" && (!userInstId || userInstId !== application.institutionId)) {
        return res.status(403).json({ error: "Access denied: Unauthorized institution tenant" });
      }

      const doc = await prisma.applicationDocument.findUnique({
        where: { id: documentId },
      });

      if (!doc || doc.applicationId !== id) {
        return res.status(404).json({ error: "Document not found for this application" });
      }

      if (!doc.isCurrent) {
        return res.status(400).json({ error: "Cannot prevalidate a superseded document" });
      }

      const authReq = await aiPrevalidationService.resolveAuthoritativeRequirement(
        application,
        doc.documentRequirementId
      );

      if (doc.documentRequirementId && !authReq) {
        return res.status(400).json({
          error: "Document requirement does not belong to this application's category",
          code: "INVALID_REQUIREMENT_ASSOCIATION",
        });
      }

      const payload = {
        application_id: application.id,
        document_id: doc.id,
        institution_id: application.institutionId,
        requirement_id: doc.documentRequirementId || "UNMAPPED",
        checksum: doc.checksum || "",
        document_name: doc.originalFilename,
        storage_path: doc.storagePath,
        requirement_description: authReq?.requirementDescription || "",
        aph_clause: authReq?.aphClause || "",
        application_category: authReq?.applicationCategory || "other",
        program_context_hash: "",
        program_context: "",
      };

      await prisma.documentPrevalidationOutbox.create({
        data: {
          applicationId: application.id,
          documentId: doc.id,
          institutionId: application.institutionId,
          requirementId: doc.documentRequirementId || "UNMAPPED",
          checksum: doc.checksum || "",
          documentName: doc.originalFilename,
          storagePath: doc.storagePath || "",
          payloadJson: JSON.stringify(payload),
          status: "PENDING",
        },
      });

      aiPrevalidationService.dispatchPendingOutboxEvents();
      const statusResult = await aiPrevalidationService.getPrevalidationStatus(application.id, doc.id);

      return res.status(202).json({
        success: true,
        status: statusResult.status || "QUEUED",
        jobId: statusResult.jobId || null,
        classification: statusResult.classification || null,
        message: "Pre-validation dispatched successfully",
      });
    } catch (error) {
      next(error);
    }
  },

  async getPrevalidation(req, res, next) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { id, documentId } = req.params;
      const application = await prisma.application.findUnique({
        where: { id },
      });

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      let userInstId = req.user.institutionId;
      if (!userInstId && req.user.email) {
        const u = await prisma.user.findUnique({ where: { email: req.user.email } });
        userInstId = u?.institutionId;
      }
      if (req.user.accountType === "institution" && (!userInstId || userInstId !== application.institutionId)) {
        return res.status(403).json({ error: "Access denied: Unauthorized institution tenant" });
      }

      const doc = await prisma.applicationDocument.findUnique({
        where: { id: documentId },
      });

      if (!doc || doc.applicationId !== id) {
        return res.status(404).json({ error: "Document not found" });
      }

      const statusResult = await aiPrevalidationService.getPrevalidationStatus(application.id, doc.id);
      return res.json(statusResult);
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

      // Mark prevalidation superseded in AI service
      aiPrevalidationService.supersedeDocument(id, documentId);

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
      await workflowEligibilityService.assertCanAdvance(id, req.user);
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
      await workflowEligibilityService.assertCanDecide(id, req.user);

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
