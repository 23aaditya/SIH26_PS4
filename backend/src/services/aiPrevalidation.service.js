/**
 * AI Document Pre-Validation Service (Phase 2).
 *
 * Coordinates authoritative requirement resolution, transactional outbox dispatch,
 * and status queries between Express and the FastAPI AI Pre-Validation microservice.
 * Enforces strict least privilege, tenant isolation, and durable delivery.
 */

import fs from "fs";
import path from "path";
import prisma from "../db/prisma.js";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";
const AI_BACKEND_SECRET = process.env.AI_BACKEND_SECRET || "aicte_agent_secret_prod_2026_x89f_secure_token";

// Cache canonical APH manifest in memory
let aphManifestCache = null;

function getAphManifest() {
  if (!aphManifestCache) {
    try {
      const manifestPath = path.resolve(process.cwd(), "src/config/aph_2024_2027_manifest.json");
      if (fs.existsSync(manifestPath)) {
        aphManifestCache = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      } else {
        const altPath = path.resolve(process.cwd(), "backend/src/config/aph_2024_2027_manifest.json");
        if (fs.existsSync(altPath)) {
          aphManifestCache = JSON.parse(fs.readFileSync(altPath, "utf8"));
        }
      }
    } catch (e) {
      console.warn("[AIPrevalidationService] Failed to load aph_2024_2027_manifest.json:", e.message);
    }
  }
  return aphManifestCache;
}

export const aiPrevalidationService = {
  /**
   * Resolve authoritative requirement specification from database and canonical APH manifest.
   * Never trusts client-supplied requirement descriptions or clause citations.
   */
  async resolveAuthoritativeRequirement(application, documentRequirementId) {
    if (!documentRequirementId) {
      return {
        requirementId: null,
        documentName: "Supporting Document",
        requirementDescription: "Supplementary or ad-hoc supporting document.",
        aphClause: "APH 2024-2027 General Norms",
        applicationCategory: "other",
        isStatutory: false,
      };
    }

    const reqDoc = await prisma.applicationDocumentRequirement.findUnique({
      where: { id: documentRequirementId },
      include: { applicationType: true },
    });

    if (!reqDoc) {
      return null;
    }

    // Verify requirement belongs to the application's actual category
    if (application.applicationTypeId && reqDoc.applicationTypeId !== application.applicationTypeId) {
      return null;
    }

    const manifest = getAphManifest();
    let aphClause = "APH 2024-2027 Norms";
    let aphChapter = "Chapter II";
    let desc = reqDoc.description || reqDoc.documentName;
    const catCode = reqDoc.applicationType?.code || "other";

    if (manifest && manifest[catCode] && Array.isArray(manifest[catCode].documents)) {
      const match = manifest[catCode].documents.find(
        (d) => d.doc_name?.toLowerCase() === reqDoc.documentName.toLowerCase() ||
               d.doc_code?.toLowerCase() === reqDoc.documentName.toLowerCase()
      );
      if (match) {
        aphClause = match.aph_clause || aphClause;
        aphChapter = match.aph_chapter || aphChapter;
        desc = match.description || desc;
      }
    }

    return {
      requirementId: reqDoc.id,
      documentName: reqDoc.documentName,
      requirementDescription: desc,
      aphClause: `${aphChapter}: ${aphClause}`,
      applicationCategory: catCode,
      isStatutory: true,
    };
  },

  /**
   * Create an Outbox record inside an ongoing Prisma transaction.
   */
  async createOutboxEntry(tx, data) {
    return tx.documentPrevalidationOutbox.create({
      data: {
        applicationId: data.applicationId,
        documentId: data.documentId,
        institutionId: data.institutionId,
        requirementId: data.requirementId || "UNMAPPED",
        checksum: data.checksum,
        documentName: data.documentName,
        storagePath: data.storagePath,
        payloadJson: JSON.stringify(data.payload),
        status: "PENDING",
        attempts: 0,
      },
    });
  },

  /**
   * Dispatch pending outbox records to FastAPI.
   * Guarantees delivery even after Express server restarts.
   */
  async dispatchPendingOutboxEvents() {
    try {
      const pendingItems = await prisma.documentPrevalidationOutbox.findMany({
        where: { status: "PENDING" },
        take: 10,
        orderBy: { createdAt: "asc" },
      });

      for (const item of pendingItems) {
        try {
          const payload = JSON.parse(item.payloadJson);

          const resp = await fetch(`${AI_SERVICE_URL}/api/v1/prevalidate-document`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Service-Authorization": `Bearer ${AI_BACKEND_SECRET}`,
            },
            body: JSON.stringify(payload),
          });

          if (resp.ok || resp.status === 202) {
            const data = await resp.json();
            await prisma.documentPrevalidationOutbox.update({
              where: { id: item.id },
              data: {
                status: "DELIVERED",
                deliveredAt: new Date(),
                lastError: null,
              },
            });
            console.log(`[AIPrevalidationService] Outbox event for doc ${item.documentId} delivered successfully (job: ${data.jobId})`);
          } else {
            const errText = await resp.text();
            await prisma.documentPrevalidationOutbox.update({
              where: { id: item.id },
              data: {
                attempts: item.attempts + 1,
                lastError: `HTTP ${resp.status}: ${errText.substring(0, 300)}`,
              },
            });
          }
        } catch (itemErr) {
          await prisma.documentPrevalidationOutbox.update({
            where: { id: item.id },
            data: {
              attempts: item.attempts + 1,
              lastError: itemErr.message,
            },
          });
        }
      }
    } catch (e) {
      console.warn("[AIPrevalidationService] Outbox dispatcher error:", e.message);
    }
  },

  /**
   * Query the latest pre-validation status from FastAPI.
   */
  async getPrevalidationStatus(applicationId, documentId) {
    try {
      const resp = await fetch(
        `${AI_SERVICE_URL}/api/v1/applications/${applicationId}/documents/${documentId}/prevalidation`,
        {
          headers: {
            "X-Service-Authorization": `Bearer ${AI_BACKEND_SECRET}`,
          },
        }
      );

      if (!resp.ok) {
        return {
          success: false,
          status: "TECHNICAL_FAILURE",
          error: `AI Service returned HTTP ${resp.status}`,
        };
      }

      return await resp.json();
    } catch (e) {
      return {
        success: false,
        status: "TECHNICAL_FAILURE",
        error: `Could not reach AI pre-validation service: ${e.message}`,
      };
    }
  },

  /**
   * Mark prior pre-validation jobs as superseded on replacement.
   */
  async supersedeDocument(applicationId, documentId) {
    try {
      await fetch(
        `${AI_SERVICE_URL}/api/v1/applications/${applicationId}/documents/${documentId}/supersede`,
        {
          method: "POST",
          headers: {
            "X-Service-Authorization": `Bearer ${AI_BACKEND_SECRET}`,
          },
        }
      );
    } catch (e) {
      console.warn(`[AIPrevalidationService] Failed to notify supersede for doc ${documentId}:`, e.message);
    }
  },

  /**
   * Start recurring background outbox recovery timer.
   */
  startOutboxRecoveryWorker() {
    if (this._recoveryInterval) return;
    this._recoveryInterval = setInterval(() => {
      this.dispatchPendingOutboxEvents();
    }, 3500);
    console.log("[AIPrevalidationService] Transactional Outbox background worker started.");
  },
};

// Start background recovery worker on service load
aiPrevalidationService.startOutboxRecoveryWorker();
