import { Router } from "express";
import { aicteController } from "../controllers/aicte.controller.js";
import { requireAuth } from "../middleware/authenticate.js";

const router = Router();

// Require authenticated user for all AICTE processing endpoints
router.use(requireAuth);

// Dashboard metrics
router.get("/dashboard/metrics", aicteController.getDashboardMetrics);

// Applications queue & listings
router.get("/applications", aicteController.listApplications);
router.get("/applications/:id", aicteController.getApplicationById);
router.get("/applications/:id/timeline", aicteController.getTimeline);
router.get("/applications/:id/documents", aicteController.getDocuments);
router.get("/applications/:id/assignments", aicteController.getAssignments);
router.get("/applications/:id/reports", aicteController.getReports);

// Stage and assignment actions
router.post("/applications/:id/assign", aicteController.assignApplication);
router.post("/applications/:id/stages/:stageId/start", aicteController.startStage);
router.post("/applications/:id/stages/:stageId/decision", aicteController.recordStageDecision);

// Deficiency management
router.post("/applications/:id/deficiencies", aicteController.raiseDeficiency);
router.post("/applications/:id/deficiencies/:deficiencyId/resolve", aicteController.resolveDeficiency);

// Transitions and reports
router.post("/applications/:id/forward", aicteController.forwardApplication);
router.post("/applications/:id/decision", aicteController.recordFinalDecision);
router.post("/applications/:id/reports", aicteController.submitReport);
router.post("/applications/:id/appeals", aicteController.fileAppeal);

// Document verification status
router.patch("/documents/:id/status", aicteController.updateDocumentStatus);

export default router;
