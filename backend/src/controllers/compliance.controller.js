import prisma from "../db/prisma.js";

export const complianceController = {
  async list(req, res, next) {
    try {
      const where = {};
      if (req.user?.accountType === "institution") {
        where.institutionId = req.user.institutionId || undefined;
      } else if (req.query.institutionId) {
        where.institutionId = req.query.institutionId;
      }

      const undertakings = await prisma.undertaking.findMany({
        where,
        include: {
          application: true,
          institution: true,
          evidence: {
            include: { document: true },
          },
        },
        orderBy: { dueAt: "asc" },
      });

      res.json(undertakings);
    } catch (error) {
      next(error);
    }
  },

  async submitEvidence(req, res, next) {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { documentId } = req.body;

      if (!documentId) {
        res.status(400).json({ error: "Document ID required" });
        return;
      }

      const undertaking = await prisma.undertaking.findUnique({
        where: { id },
      });
      if (!undertaking) {
        res.status(404).json({ error: "Undertaking not found" });
        return;
      }

      // Check ownership
      if (
        req.user.accountType === "institution" &&
        req.user.institutionId !== undertaking.institutionId
      ) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      const updated = await prisma.$transaction(async (tx) => {
        // Ensure evidence link exists or dummy document if simulated
        let doc = await tx.applicationDocument.findUnique({ where: { id: documentId } });
        if (!doc) {
          doc = await tx.applicationDocument.create({
            data: {
              id: documentId,
              applicationId: undertaking.applicationId,
              institutionId: undertaking.institutionId,
              documentType: "Compliance Proof Evidence",
              originalFilename: "Compliance_Proof_Document.pdf",
              storagePath: `uploads/compliance_${documentId}.pdf`,
              uploadedById: req.user.id,
              verificationStatus: "pending",
            },
          });
        }

        await tx.undertakingEvidence.create({
          data: {
            undertakingId: id,
            documentId: doc.id,
            submittedById: req.user.id,
          },
        });

        return tx.undertaking.update({
          where: { id },
          data: {
            status: "submitted",
            submittedAt: new Date(),
          },
          include: {
            evidence: { include: { document: true } },
          },
        });
      });

      res.json({ success: true, undertaking: updated });
    } catch (error) {
      next(error);
    }
  },

  async verify(req, res, next) {
    try {
      if (!req.user || req.user.accountType === "institution") {
        res.status(403).json({ error: "Only AICTE officials can verify compliance" });
        return;
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      const updated = await prisma.undertaking.update({
        where: { id },
        data: {
          status: "verified",
          verifiedAt: new Date(),
          verifiedById: req.user.id,
        },
      });

      res.json({ success: true, undertaking: updated });
    } catch (error) {
      next(error);
    }
  },
};
