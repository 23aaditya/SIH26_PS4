import { Router } from "express";
import { applicationController } from "../controllers/application.controller.js";
import { collaborationController } from "../controllers/collaboration.controller.js";
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

// Grievances and appeals (institution side)
router.post("/:id/grievance", requireAuth, denySystemService, applicationController.raiseGrievance);
router.post("/:id/appeals", requireAuth, denySystemService, applicationController.raiseGrievance);

// Collaboration: Work Tree, Contacts, Messages
router.get("/:id/work-tree", requireAuth, denySystemService, collaborationController.getApplicationWorkTree);
router.get("/:id/contacts", requireAuth, denySystemService, collaborationController.getApplicationContacts);
router.get("/:id/messages", requireAuth, denySystemService, collaborationController.getApplicationMessages);
router.post("/:id/messages", requireAuth, denySystemService, collaborationController.sendApplicationMessage);

// Workflow advance, return, decision
router.post("/:id/advance", requireAuth, denySystemService, applicationController.advance);
router.post("/:id/return", requireAuth, denySystemService, applicationController.returnForClarification);
router.post("/:id/decision", requireAuth, denySystemService, applicationController.recordDecision);

export default router;
