import prisma from "../db/prisma.js";

export const evcController = {
  async list(req, res, next) {
    try {
      const { regionId } = req.query;
      const where = {};
      if (regionId) where.regionId = regionId;

      const visits = await prisma.eVCVisit.findMany({
        where,
        include: {
          application: { include: { institution: true } },
          experts: true,
        },
        orderBy: { createdAt: "desc" },
      });

      res.json(visits);
    } catch (error) {
      next(error);
    }
  },

  async schedule(req, res, next) {
    try {
      if (!req.user || req.user.accountType === "institution") {
        res.status(403).json({ error: "Only AICTE officials can schedule EVC visits" });
        return;
      }

      const { applicationId, scheduledAt, notes, experts, assignedExperts } = req.body;

      const application = await prisma.application.findUnique({
        where: { id: applicationId },
      });
      if (!application) {
        res.status(404).json({ error: "Application not found" });
        return;
      }

      const expertList = Array.isArray(experts || assignedExperts)
        ? (experts || assignedExperts).map((exp) =>
            typeof exp === "string" ? { name: exp } : exp
          )
        : [];

      const visit = await prisma.eVCVisit.create({
        data: {
          applicationId,
          regionId: application.regionId,
          scheduledAt: new Date(scheduledAt),
          scheduledById: req.user.id,
          status: "scheduled",
          notes,
          experts: {
            create: expertList,
          },
        },
        include: { experts: true },
      });

      // Update application stage to EVC Scheduled
      await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: "pending_evc",
          currentStageId: "evc",
          currentStageName: "EVC Visit Scheduled",
          lastActionAt: new Date(),
        },
      });

      // Audit event
      await prisma.auditEvent.create({
        data: {
          applicationId,
          actorUserId: req.user.id,
          actorRole: req.user.role,
          action: "EVC_VISIT_SCHEDULED",
          fromStage: application.currentStageId,
          toStage: "evc",
          reason: `EVC panel scheduled for ${new Date(scheduledAt).toLocaleDateString()}`,
        },
      });

      res.status(201).json({ success: true, visit });
    } catch (error) {
      next(error);
    }
  },

  async updateStatus(req, res, next) {
    try {
      if (!req.user || req.user.accountType === "institution") {
        res.status(403).json({ error: "Only AICTE officials can update EVC status" });
        return;
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { status, notes, reportDocumentId } = req.body;

      const updated = await prisma.eVCVisit.update({
        where: { id },
        data: {
          status,
          notes: notes || undefined,
          reportDocumentId: reportDocumentId || undefined,
          completedAt: status === "visit_completed" ? new Date() : undefined,
        },
      });

      if (updated.applicationId) {
        await prisma.auditEvent.create({
          data: {
            applicationId: updated.applicationId,
            actorUserId: req.user.id,
            actorRole: req.user.role,
            action: `EVC_STATUS_${status.toUpperCase()}`,
            reason: notes || `EVC visit status updated to ${status}`,
          },
        });
      }

      res.json({ success: true, visit: updated });
    } catch (error) {
      next(error);
    }
  },
};
