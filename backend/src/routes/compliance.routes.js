import { Router } from "express";
import { complianceController } from "../controllers/compliance.controller.js";
import { requireAuth } from "../middleware/authenticate.js";
import { denySystemService } from "../middleware/authorize.js";

const router = Router();

router.get("/", complianceController.list);
router.post("/:id/submit", requireAuth, denySystemService, complianceController.submitEvidence);
router.post("/:id/verify", requireAuth, denySystemService, complianceController.verify);

export default router;
