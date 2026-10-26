import { Router } from "express";
import { applicationController } from "../controllers/application.controller.js";
import { requireAuth } from "../middleware/authenticate.js";
import { denySystemService } from "../middleware/authorize.js";
import { upload } from "../middleware/upload.js";

const router = Router();

router.get("/my", requireAuth, denySystemService, applicationController.myApplications);
router.get("/", applicationController.list);
router.post("/", requireAuth, denySystemService, applicationController.create);
router.get("/:id", applicationController.getById);
router.patch("/:id", requireAuth, denySystemService, applicationController.updateDraft);
router.post("/:id/submit", requireAuth, denySystemService, applicationController.submit);

// Document upload & deletion for applications
router.post("/:id/documents", requireAuth, denySystemService, upload.single("file"), applicationController.uploadDocument);
router.delete("/:id/documents/:documentId", requireAuth, denySystemService, applicationController.deleteDocument);

// Deficiency responses
router.post("/:id/deficiency-response", requireAuth, denySystemService, applicationController.respondToDeficiency);
router.post("/:id/clarification", requireAuth, denySystemService, applicationController.respondToDeficiency);

// Workflow advance, return, decision
router.post("/:id/advance", requireAuth, denySystemService, applicationController.advance);
router.post("/:id/return", requireAuth, denySystemService, applicationController.returnForClarification);
router.post("/:id/decision", requireAuth, denySystemService, applicationController.recordDecision);

export default router;
