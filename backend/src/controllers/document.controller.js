import path from "path";
import fs from "fs";
import prisma from "../db/prisma.js";

export const documentController = {
  async list(req, res, next) {
    try {
      const { applicationId, institutionId } = req.query;

      const where = {};
      if (applicationId) where.applicationId = applicationId;
      if (institutionId) {
        where.institutionId = institutionId;
      } else if (req.user?.accountType === "institution") {
        where.institutionId = req.user.institutionId || undefined;
      }

      const docs = await prisma.applicationDocument.findMany({
        where,
        orderBy: { uploadedAt: "desc" },
        include: { application: true },
      });

      res.json(docs);
    } catch (error) {
      next(error);
    }
  },

  async uploadFile(req, res, next) {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const file = req.file;
      const { applicationId, documentType, notes, expiryDate, documentDate } = req.body;

      if (!applicationId || !documentType) {
        res.status(400).json({ error: "applicationId and documentType are required" });
        return;
      }

      const application = await prisma.application.findUnique({
        where: { id: applicationId },
      });
      if (!application) {
        res.status(404).json({ error: "Associated application not found" });
        return;
      }

      // Check ownership
      if (
        req.user.accountType === "institution" &&
        req.user.institutionId !== application.institutionId
      ) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      const originalFilename = file ? file.originalname : req.body.originalFilename || "uploaded_document.pdf";
      const storagePath = file ? path.relative(process.cwd(), file.path) : req.body.storagePath || `uploads/${originalFilename}`;

      const created = await prisma.applicationDocument.create({
        data: {
          applicationId,
          institutionId: application.institutionId,
          documentType,
          originalFilename,
          storagePath,
          mimeType: file?.mimetype || "application/pdf",
          fileSize: file?.size || 1024 * 100,
          documentDate: documentDate ? new Date(documentDate) : undefined,
          expiryDate: expiryDate ? new Date(expiryDate) : undefined,
          uploadedById: req.user.id,
          verificationStatus: "pending",
          notes,
        },
      });

      res.status(201).json({ success: true, document: created });
    } catch (error) {
      next(error);
    }
  },

  async download(req, res, next) {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      const doc = await prisma.applicationDocument.findUnique({
        where: { id },
        include: { application: true },
      });

      if (!doc) {
        res.status(404).json({ error: "Document not found" });
        return;
      }

      // Permission check
      if (
        req.user?.accountType === "institution" &&
        req.user.institutionId !== doc.institutionId
      ) {
        res.status(403).json({ error: "Access denied to this document" });
        return;
      }

      // Check if physical file exists on disk
      if (doc.storagePath) {
        const fullPath = path.resolve(doc.storagePath);
        if (fs.existsSync(fullPath)) {
          res.download(fullPath, doc.originalFilename);
          return;
        }
      }

      // If simulated or demo seed document, serve placeholder text representation
      res.setHeader("Content-Disposition", `attachment; filename="${doc.originalFilename}"`);
      res.setHeader("Content-Type", doc.mimeType || "application/pdf");
      res.send(`Official AICTE Regulatory Document Verification Copy\n\nDocument ID: ${doc.id}\nType: ${doc.documentType}\nOriginal Filename: ${doc.originalFilename}\nUploaded By: ${doc.uploadedById}\nVerification Status: ${doc.verificationStatus}`);
    } catch (error) {
      next(error);
    }
  },

  async verify(req, res, next) {
    try {
      if (!req.user || req.user.accountType === "institution") {
        res.status(403).json({ error: "Only AICTE officials can verify documents" });
        return;
      }

      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { status, notes } = req.body;

      const updated = await prisma.applicationDocument.update({
        where: { id },
        data: {
          verificationStatus: status,
          verifiedById: req.user.id,
          verifiedAt: new Date(),
          notes: notes || undefined,
        },
      });

      // Record audit event
      await prisma.auditEvent.create({
        data: {
          applicationId: updated.applicationId,
          actorUserId: req.user.id,
          actorRole: req.user.role,
          action: status === "verified" ? "DOCUMENT_VERIFIED" : "DOCUMENT_FLAGGED_DEFICIENT",
          reason: notes || `Document status changed to ${status}`,
          metadataJson: JSON.stringify({ documentId: id, documentType: updated.documentType }),
        },
      });

      res.json({ success: true, document: updated });
    } catch (error) {
      next(error);
    }
  },
};
