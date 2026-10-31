import { Router } from "express";
import { scrutinyController } from "../controllers/scrutiny.controller.js";
import { aicteController } from "../controllers/aicte.controller.js";
import { requireAuth } from "../middleware/authenticate.js";
import { denySystemService } from "../middleware/authorize.js";

const router = Router();

router.use(requireAuth);

router.get("/applications", scrutinyController.listApplications);
router.get("/applications/:id", scrutinyController.getApplicationById);
router.get("/applications/:id/eligibility", aicteController.getEligibility);
router.patch("/documents/:id/status", denySystemService, scrutinyController.updateDocumentStatus);
router.post("/applications/:id/deficiencies", denySystemService, scrutinyController.raiseDeficiency);

export default router;
