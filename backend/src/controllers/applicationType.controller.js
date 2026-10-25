import prisma from "../db/prisma.js";

export const applicationTypeController = {
  async list(req, res, next) {
    try {
      const types = await prisma.applicationType.findMany({
        where: { active: true },
        orderBy: { displayOrder: "asc" },
        include: {
          _count: {
            select: {
              fieldDefinitions: true,
              documentRequirements: true,
            },
          },
        },
      });

      res.json(types);
    } catch (error) {
      next(error);
    }
  },

  async getForm(req, res, next) {
    try {
      const { id } = req.params;

      const appType = await prisma.applicationType.findFirst({
        where: {
          OR: [{ id }, { code: id }],
          active: true,
        },
        include: {
          fieldDefinitions: {
            where: { active: true },
            orderBy: [{ section: "asc" }, { displayOrder: "asc" }],
          },
          documentRequirements: {
            orderBy: { displayOrder: "asc" },
            include: { documentType: true },
          },
        },
      });

      if (!appType) {
        return res.status(404).json({ error: "Application type configuration not found" });
      }

      // Group fields by section for convenience
      const sections = {
        institute_details: appType.fieldDefinitions.filter((f) => f.section === "institute_details"),
        application_details: appType.fieldDefinitions.filter((f) => f.section === "application_details"),
        academic_infrastructure: appType.fieldDefinitions.filter((f) => f.section === "academic_infrastructure"),
        declaration: appType.fieldDefinitions.filter((f) => f.section === "declaration"),
      };

      res.json({
        ...appType,
        sections,
      });
    } catch (error) {
      next(error);
    }
  },
};
