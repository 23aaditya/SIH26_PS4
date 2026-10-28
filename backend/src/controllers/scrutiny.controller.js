import prisma from "../db/prisma.js";

export const scrutinyController = {
  async listApplications(req, res, next) {
    try {
      if (!req.user || req.user.accountType === "institution") {
        return res.status(403).json({ error: "Access denied. Only AICTE Scrutiny Officers can access this queue." });
      }

      const where = {
        OR: [
          { currentStageId: "scrutiny" },
          { status: "in_review" },
          { status: "awaiting_institution" },
        ],
      };

      if (req.query.status && req.query.status !== "all") {
        where.status = req.query.status;
      }
      if (req.query.assignedToMe === "true") {
        where.assignedUserId = req.user.employeeCode || req.user.id;
      }

      const applications = await prisma.application.findMany({
        where,
        orderBy: { submittedAt: "desc" },
        include: {
          institution: true,
          region: true,
          documents: true,
          applicationType: true,
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

      const formatted = applications.map((app) => ({
        ...app,
        formData: app.formDataJson ? JSON.parse(app.formDataJson) : {},
        pendingDeficienciesCount: app.deficiencies?.length || 0,
      }));

      res.json(formatted);
    } catch (error) {
      next(error);
    }
  },

  async getApplicationById(req, res, next) {
    try {
      if (!req.user || req.user.accountType === "institution") {
        return res.status(403).json({ error: "Access denied." });
      }

      const { id } = req.params;
      const application = await prisma.application.findFirst({
        where: {
          OR: [{ id }, { applicationNumber: id }],
        },
        include: {
          institution: true,
          region: true,
          documents: {
            orderBy: { uploadedAt: "desc" },
          },
          fieldValues: true,
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
          auditEvents: {
            orderBy: { createdAt: "desc" },
            include: { actor: true },
          },
          deficiencies: {
            orderBy: { createdAt: "desc" },
          },
          tasks: {
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
                  reports: { include: { submittedBy: { select: { id: true, name: true, employeeCode: true } } } },
                },
              },
            },
          },
        },
      });

      if (!application) {
        return res.status(404).json({ error: "Application not found in scrutiny docket" });
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

  async updateDocumentStatus(req, res, next) {
    try {
      if (!req.user || req.user.accountType === "institution") {
        return res.status(403).json({ error: "Access denied. Only AICTE officers can verify documents." });
      }

      const { id } = req.params;
      const { status, notes } = req.body;

      if (!["verified", "issue_found", "pending"].includes(status?.toLowerCase())) {
        return res.status(400).json({ error: "Invalid status. Allowed values: verified, issue_found, pending." });
      }

      const document = await prisma.applicationDocument.findUnique({
        where: { id },
        include: { application: true },
      });

      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      const updated = await prisma.applicationDocument.update({
        where: { id },
        data: {
          verificationStatus: status.toLowerCase(),
          notes: notes || undefined,
          verifiedById: req.user.id || req.user.employeeCode,
          verifiedAt: new Date(),
        },
      });

      // Audit event
      await prisma.auditEvent.create({
        data: {
          applicationId: document.applicationId,
          actorUserId: req.user.id,
          actorRole: req.user.role || "scrutiny_committee",
          action: status === "verified" ? "DOCUMENT_VERIFIED" : "DOCUMENT_FLAGGED_ISSUE",
          reason: notes || `Document status changed to ${status}`,
          metadataJson: JSON.stringify({
            documentId: id,
            documentType: document.documentType,
            status,
          }),
        },
      });

      res.json({ success: true, document: updated });
    } catch (error) {
      next(error);
    }
  },

  async raiseDeficiency(req, res, next) {
    try {
      if (!req.user || req.user.accountType === "institution") {
        return res.status(403).json({ error: "Access denied." });
      }

      const { id } = req.params;
      const { deficiencyText, deficiencyCategory, relatedDocument, dueDays = 10 } = req.body;

      if (!deficiencyText || !deficiencyText.trim()) {
        return res.status(400).json({ error: "Deficiency description is required." });
      }

      const application = await prisma.application.findFirst({
        where: { OR: [{ id }, { applicationNumber: id }] },
      });

      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }

      const now = new Date();
      const dueDate = new Date(now.getTime() + dueDays * 24 * 60 * 60 * 1000);

      const result = await prisma.$transaction(async (tx) => {
        // 1. Create Deficiency Request
        const deficiency = await tx.deficiencyRequest.create({
          data: {
            applicationId: application.id,
            raisedById: req.user.id || req.user.employeeCode,
            deficiencyText: `${deficiencyCategory ? `[${deficiencyCategory}] ` : ""}${deficiencyText.trim()}${relatedDocument ? ` (Ref Doc: ${relatedDocument})` : ""}`,
            status: "pending",
            dueAt: dueDate,
          },
        });

        // 2. Update Application status
        const updatedApp = await tx.application.update({
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

        // 3. Create Task for Institution
        await tx.workflowTask.create({
          data: {
            applicationId: application.id,
            taskType: "deficiency_response",
            title: `Deficiency Raised: ${application.applicationNumber}`,
            description: deficiencyText.trim(),
            assignedRole: "institution",
            assignedUserId: application.createdById,
            status: "open",
            priority: "high",
            dueAt: dueDate,
            sourceStageId: "clarification",
          },
        });

        // 4. Audit Event
        await tx.auditEvent.create({
          data: {
            applicationId: application.id,
            actorUserId: req.user.id,
            actorRole: req.user.role || "scrutiny_committee",
            action: "DEFICIENCY_RAISED",
            fromStage: application.currentStageId,
            toStage: "clarification",
            reason: deficiencyText.trim(),
          },
        });

        // 5. Notification to Institution
        await tx.notification.create({
          data: {
            recipientUserId: application.createdById,
            applicationId: application.id,
            type: "deficiency_issued",
            title: `Deficiency Raised for ${application.applicationNumber}`,
            message: `Scrutiny Committee requires clarification: "${deficiencyText.trim()}". Statutory response window: ${dueDays} days.`,
            priority: "urgent",
            actionUrl: `/institution/applications/${application.id}`,
            deduplicationKey: `${application.id}:deficiency:${now.getTime()}`,
          },
        });

        return { deficiency, application: updatedApp };
      });

      res.status(201).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },
};
