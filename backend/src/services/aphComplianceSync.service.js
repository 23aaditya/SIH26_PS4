import fs from "fs";
import path from "path";
import prisma from "../db/prisma.js";

/**
 * Service to synchronize database ApplicationType and ApplicationDocumentRequirement records
 * with the authoritative APH 2024-2027 Declarative Manifest.
 */
export async function syncAphCompliance() {
  const possiblePaths = [
    path.resolve(process.cwd(), "backend/src/config/aph_2024_2027_manifest.json"),
    path.resolve(process.cwd(), "src/config/aph_2024_2027_manifest.json"),
    path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../config/aph_2024_2027_manifest.json"),
  ];
  let manifestPath = possiblePaths.find((p) => fs.existsSync(p));
  if (!manifestPath) {
    throw new Error(`Authoritative manifest not found at any of: ${possiblePaths.join(", ")}`);
  }

  const manifestData = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  console.log(`[APH Sync] Loaded authoritative manifest with ${Object.keys(manifestData).length} categories.`);

  const summary = {
    typesProcessed: 0,
    requirementsCreated: 0,
    requirementsUpdated: 0,
    requirementsDeprecated: 0,
  };

  for (const [categoryCode, categorySpec] of Object.entries(manifestData)) {
    // 1. Ensure ApplicationType exists & matches metadata
    let appType = await prisma.applicationType.findUnique({
      where: { code: categoryCode },
      include: { documentRequirements: true },
    });

    if (!appType) {
      console.log(`[APH Sync] Creating missing ApplicationType: ${categoryCode}`);
      appType = await prisma.applicationType.create({
        data: {
          code: categoryCode,
          name: categorySpec.display_name,
          category: categorySpec.category_group,
          description: `AICTE APH 2024-2027 statutory application for ${categorySpec.display_name}. Governing clause: ${categorySpec.governing_clause}`,
          requiresEvc: categorySpec.requires_evc,
          active: true,
        },
        include: { documentRequirements: true },
      });
    } else {
      await prisma.applicationType.update({
        where: { id: appType.id },
        data: {
          name: categorySpec.display_name,
          category: categorySpec.category_group,
          requiresEvc: categorySpec.requires_evc,
          active: true,
        },
      });
    }
    summary.typesProcessed++;

    const existingReqs = appType.documentRequirements || [];
    const manifestDocs = categorySpec.documents || [];
    const activeReqIds = new Set();

    // 2. Synchronize requirements from manifest
    for (const docSpec of manifestDocs) {
      const targetNameLower = docSpec.doc_name.toLowerCase().trim();

      // Find matching existing requirement by EXACT name or specific distinctive token match
      let existing = existingReqs.find(
        (r) => !activeReqIds.has(r.id) && r.documentName.toLowerCase().trim() === targetNameLower
      );

      // If not exact, check distinctive disambiguating keywords
      if (!existing) {
        existing = existingReqs.find((r) => {
          if (activeReqIds.has(r.id)) return false;
          const rName = r.documentName.toLowerCase();
          if (targetNameLower.includes("affidavit 2") && rName.includes("affidavit 2")) return true;
          if (targetNameLower.includes("affidavit 8") && rName.includes("affidavit 8")) return true;
          if (targetNameLower.includes("affidavit 4") && rName.includes("affidavit 4")) return true;
          if (targetNameLower.includes("affidavit 11") && rName.includes("affidavit 11")) return true;
          if (targetNameLower.includes("format 3") && rName.includes("format 3")) return true;
          if (targetNameLower.includes("foreign university") && rName.includes("foreign")) return true;
          if (targetNameLower.includes("affiliating university") && rName.includes("affiliating")) return true;
          if (targetNameLower.includes("satellite map") && rName.includes("satellite")) return true;
          if (targetNameLower.includes("audited statement") && rName.includes("audited")) return true;
          if (targetNameLower.includes("structural stability") && rName.includes("structural")) return true;
          if (targetNameLower.includes("payment receipt") && rName.includes("payment")) return true;
          return false;
        });
      }

      const description = `${docSpec.description} [APH 2024-27 ${docSpec.aph_annexure || docSpec.aph_clause}]`;

      if (existing) {
        await prisma.applicationDocumentRequirement.update({
          where: { id: existing.id },
          data: {
            documentName: docSpec.doc_name,
            description,
            required: docSpec.required,
            allowedExtensions: docSpec.allowed_extensions,
            maxSizeMb: docSpec.max_size_mb,
            displayOrder: docSpec.display_order,
          },
        });
        activeReqIds.add(existing.id);
        summary.requirementsUpdated++;
      } else {
        const created = await prisma.applicationDocumentRequirement.create({
          data: {
            applicationTypeId: appType.id,
            documentName: docSpec.doc_name,
            description,
            required: docSpec.required,
            allowedExtensions: docSpec.allowed_extensions,
            maxSizeMb: docSpec.max_size_mb,
            displayOrder: docSpec.display_order,
          },
        });
        activeReqIds.add(created.id);
        summary.requirementsCreated++;
      }
    }

    // 3. Mark unprescribed/obsolete requirements (that were NOT in the manifest) as required: false
    for (const req of existingReqs) {
      if (!activeReqIds.has(req.id) && req.required) {
        console.log(`[APH Sync] Deprecating unprescribed mandatory requirement: '${req.documentName}' in category '${categoryCode}'`);
        await prisma.applicationDocumentRequirement.update({
          where: { id: req.id },
          data: {
            required: false,
            description: `[DEPRECATED / UNPRESCRIBED IN APH 2024-27] ${req.description || ""}`,
          },
        });
        summary.requirementsDeprecated++;
      }
    }
  }

  console.log("[APH Sync] Synchronization complete:", summary);
  return summary;
}
