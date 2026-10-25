import { Router } from "express";
import { complianceController } from "../controllers/compliance.controller.js";
import { requireAuth } from "../middleware/authenticate.js";

const router = Router();

router.get("/", complianceController.list);
router.post("/:id/submit", requireAuth, complianceController.submitEvidence);
router.post("/:id/verify", requireAuth, complianceController.verify);

export default router;
