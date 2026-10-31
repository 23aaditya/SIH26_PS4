import { Router } from "express";
import { agentController } from "../controllers/agent.controller.js";
import { requireAuth } from "../middleware/authenticate.js";
import { denySystemService } from "../middleware/authorize.js";

const router = Router();

// Require authenticated user for all agent routes
router.use(requireAuth);

// Agent Action Management
router.get("/applications/:id/actions", agentController.listActions);
router.post("/applications/:id/actions/:actionId/approve", denySystemService, agentController.approveAction);
router.post("/applications/:id/actions/:actionId/reject", denySystemService, agentController.rejectAction);

// Internal Notification Dispatch (M2M permitted)
router.post("/notifications", agentController.createNotification);

export default router;
