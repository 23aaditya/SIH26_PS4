import { Router } from "express";
import { applicationController } from "../controllers/application.controller.js";
import { requireAuth } from "../middleware/authenticate.js";
import { upload } from "../middleware/upload.js";

const router = Router();

router.get("/my", requireAuth, applicationController.myApplications);
router.get("/", applicationController.list);
router.post("/", requireAuth, applicationController.create);
router.get("/:id", applicationController.getById);
router.patch("/:id", requireAuth, applicationController.updateDraft);
router.post("/:id/submit", requireAuth, applicationController.submit);

// Document upload & deletion for applications
router.post("/:id/documents", requireAuth, upload.single("file"), applicationController.uploadDocument);
router.delete("/:id/documents/:documentId", requireAuth, applicationController.deleteDocument);

// Deficiency responses
router.post("/:id/deficiency-response", requireAuth, applicationController.respondToDeficiency);
router.post("/:id/clarification", requireAuth, applicationController.respondToDeficiency);

// Workflow advance, return, decision
router.post("/:id/advance", requireAuth, applicationController.advance);
router.post("/:id/return", requireAuth, applicationController.returnForClarification);
router.post("/:id/decision", requireAuth, applicationController.recordDecision);

export default router;
