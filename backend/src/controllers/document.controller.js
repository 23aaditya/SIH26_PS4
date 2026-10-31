import path from "path";
import fs from "fs";
import crypto from "crypto";
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

      if (file?.path && fs.existsSync(file.path)) {
        const magicBuf = Buffer.alloc(5);
        const fd = fs.openSync(file.path, "r");
        try {
          fs.readSync(fd, magicBuf, 0, 5, 0);
        } finally {
          fs.closeSync(fd);
        }
        if (magicBuf.toString("ascii") !== "%PDF-") {
          try { fs.unlinkSync(file.path); } catch (e) {}
          res.status(400).json({
            error: `Uploaded file '${file.originalname}' is not a valid PDF document. Please upload a genuine, uncorrupted PDF file.`,
            code: "INVALID_PDF_FILE",
          });
          return;
        }
      }

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
          documentType,
          originalFilename,
          storagePath,
          checksum,
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

      // Least-privilege constraint for system_service:
      // Can ONLY download documents belonging to applications actively undergoing scrutiny
      if (req.user?.accountType === "system_service") {
        const parentApp = doc.application;
        const allowedStatuses = ["in_review", "awaiting_institution"];
        const allowedStages = ["scrutiny", "re_scrutiny", "clarification"];

        if (!parentApp || !allowedStatuses.includes(parentApp.status) || !allowedStages.includes(parentApp.currentStageId)) {
          res.status(403).json({
            error: `Access denied. AI scrutiny service can only download documents for applications actively undergoing scrutiny. Current application status: '${parentApp?.status}', stage: '${parentApp?.currentStageId}'.`,
            code: "INELIGIBLE_DOCUMENT_FOR_AI_SCRUTINY",
            applicationStatus: parentApp?.status,
            applicationStageId: parentApp?.currentStageId,
          });
          return;
        }
      }

      // Check if physical file exists on disk
      if (doc.storagePath) {
        const fullPath = path.resolve(doc.storagePath);
        if (fs.existsSync(fullPath)) {
          const stat = fs.statSync(fullPath);
          const isAttachment = req.query.download === "true" || req.query.download === "1";
          const disposition = isAttachment ? "attachment" : "inline";

          res.setHeader("Content-Type", doc.mimeType || "application/pdf");
          res.setHeader("Content-Length", stat.size);
          res.setHeader(
            "Content-Disposition",
            `${disposition}; filename="${encodeURIComponent(doc.originalFilename)}"`
          );

          const stream = fs.createReadStream(fullPath);
          return stream.pipe(res);
        }
      }

      // If physical file does not exist on disk, return 404 error
      res.status(404).json({
        error: `Document file payload unavailable on server storage. The physical file for '${doc.originalFilename}' could not be found.`,
        code: "DOCUMENT_FILE_NOT_FOUND",
        documentId: doc.id,
        filename: doc.originalFilename,
      });
      return;
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
