import { Router } from "express";
import { scrutinyController } from "../controllers/scrutiny.controller.js";
import { requireAuth } from "../middleware/authenticate.js";

const router = Router();

router.use(requireAuth);

router.get("/applications", scrutinyController.listApplications);
router.get("/applications/:id", scrutinyController.getApplicationById);
router.patch("/documents/:id/status", scrutinyController.updateDocumentStatus);
router.post("/applications/:id/deficiencies", scrutinyController.raiseDeficiency);

export default router;
