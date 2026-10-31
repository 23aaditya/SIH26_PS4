import { Router } from "express";
import { aicteController } from "../controllers/aicte.controller.js";
import { collaborationController } from "../controllers/collaboration.controller.js";
import { requireAuth } from "../middleware/authenticate.js";
import { denySystemService } from "../middleware/authorize.js";

const router = Router();

// Require authenticated user for all AICTE processing endpoints
router.use(requireAuth);

// My Work System & Summary
router.get("/my-work/summary", denySystemService, collaborationController.getMyWorkSummary);
router.get("/my-work", denySystemService, collaborationController.getMyWorkList);

// Work Tree (Global & Application-specific)
router.get("/work-tree", denySystemService, collaborationController.getWorkTree);
router.get("/applications/:id/work-tree", denySystemService, collaborationController.getApplicationWorkTree);
router.get("/applications/:id/contacts", denySystemService, collaborationController.getApplicationContacts);

// Application-linked Communication
router.get("/applications/:id/messages", denySystemService, collaborationController.getApplicationMessages);
router.post("/applications/:id/messages", denySystemService, collaborationController.sendApplicationMessage);

// Temporary Work Delegation
router.get("/delegations", denySystemService, collaborationController.getDelegations);
router.get("/delegations/eligible-users", denySystemService, collaborationController.getEligibleDelegationUsers);
router.post("/delegations", denySystemService, collaborationController.createDelegation);
router.patch("/delegations/:id/accept", denySystemService, collaborationController.acceptDelegation);
router.patch("/delegations/:id/decline", denySystemService, collaborationController.declineDelegation);
router.patch("/delegations/:id/start", denySystemService, collaborationController.startDelegation);
router.patch("/delegations/:id/complete", denySystemService, collaborationController.completeDelegation);
router.patch("/delegations/:id/cancel", denySystemService, collaborationController.cancelDelegation);

// Supervisor Team Workload
router.get("/team-workload", denySystemService, collaborationController.getTeamWorkload);

// Staff Availability & Continuity
router.get("/availability", denySystemService, collaborationController.getAvailability);
router.post("/availability", denySystemService, collaborationController.updateAvailability);

// Dashboard metrics (Human only)
router.get("/dashboard/metrics", denySystemService, aicteController.getDashboardMetrics);

// Applications queue & listings
router.get("/applications", aicteController.listApplications);
router.get("/applications/:id", aicteController.getApplicationById);
router.get("/applications/:id/eligibility", aicteController.getEligibility);
router.post("/applications/:id/reconcile-deficiency", denySystemService, aicteController.reconcileDeficiencyState);
router.get("/applications/:id/timeline", aicteController.getTimeline);
router.get("/applications/:id/documents", aicteController.getDocuments);
router.get("/applications/:id/assignments", aicteController.getAssignments);
router.get("/applications/:id/reports", aicteController.getReports);
router.post("/applications/:id/trigger-ai", aicteController.triggerAiScrutiny);
router.get("/applications/:id/ai-job-status/:jobId", aicteController.getAiJobStatus);

// Stage and assignment actions (Strictly Human only)
router.post("/applications/:id/assign", denySystemService, aicteController.assignApplication);
router.post("/applications/:id/stages/:stageId/start", denySystemService, aicteController.startStage);
router.post("/applications/:id/stages/:stageId/decision", denySystemService, aicteController.recordStageDecision);

// Deficiency management (Strictly Human only)
router.post("/applications/:id/deficiencies", denySystemService, aicteController.raiseDeficiency);
router.post("/applications/:id/deficiencies/:deficiencyId/resolve", denySystemService, aicteController.resolveDeficiency);

// Transitions and reports
router.post("/applications/:id/forward", denySystemService, aicteController.forwardApplication);
router.post("/applications/:id/decision", denySystemService, aicteController.recordFinalDecision);
router.post("/applications/:id/reports", aicteController.submitReport);
router.post("/applications/:id/appeals", denySystemService, aicteController.fileAppeal);

// Document verification status (Strictly Human only)
router.patch("/documents/:id/status", denySystemService, aicteController.updateDocumentStatus);

export default router;
