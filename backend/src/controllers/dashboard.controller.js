import prisma from "../db/prisma.js";

export const dashboardController = {
  async getMetrics(req, res, next) {
    try {
      const institutionId =
        req.user?.accountType === "institution"
          ? req.user.institutionId
          : req.query.institutionId || undefined;

      const where = institutionId ? { institutionId } : {};
      const now = new Date();

      const [
        total,
        inReview,
        pendingScrutiny,
        awaitingInstitution,
        pendingEvc,
        committeeReview,
        approved,
        rejected,
        overdue,
        byRegion,
        byStage,
        undertakingsDueSoon,
        expiringDocuments,
      ] = await Promise.all([
        prisma.application.count({ where }),
        prisma.application.count({ where: { ...where, status: "in_review" } }),
        prisma.application.count({ where: { ...where, currentStageId: "scrutiny" } }),
        prisma.application.count({ where: { ...where, status: "awaiting_institution" } }),
        prisma.application.count({ where: { ...where, status: "pending_evc" } }),
        prisma.application.count({
          where: { ...where, currentStageId: { in: ["committee", "decision"] } },
        }),
        prisma.application.count({ where: { ...where, status: "approved" } }),
        prisma.application.count({ where: { ...where, status: "rejected" } }),
        prisma.application.count({
          where: {
            ...where,
            dueAt: { lt: now },
            status: { notIn: ["approved", "rejected", "closed"] },
          },
        }),
        prisma.application.groupBy({
          by: ["regionId"],
          where,
          _count: { id: true },
        }),
        prisma.application.groupBy({
          by: ["currentStageId", "currentStageName"],
          where,
          _count: { id: true },
        }),
        prisma.undertaking.count({
          where: {
            institutionId: institutionId || undefined,
            status: "pending",
            dueAt: {
              gte: now,
              lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days
            },
          },
        }),
        prisma.applicationDocument.count({
          where: {
            institutionId: institutionId || undefined,
            expiryDate: {
              gte: now,
              lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days
            },
          },
        }),
      ]);

      res.json({
        summary: {
          total,
          inReview,
          pendingScrutiny,
          awaitingInstitution,
          pendingEvc,
          committeeReview,
          approved,
          rejected,
          overdue,
          undertakingsDueSoon,
          expiringDocuments,
        },
        byRegion: byRegion.map((r) => ({ regionId: r.regionId, count: r._count.id })),
        byStage: byStage.map((s) => ({
          stageId: s.currentStageId,
          stageName: s.currentStageName,
          count: s._count.id,
        })),
      });
    } catch (error) {
      next(error);
    }
  },
};
