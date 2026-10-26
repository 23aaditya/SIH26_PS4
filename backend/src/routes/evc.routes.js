import { Router } from "express";
import { evcController } from "../controllers/evc.controller.js";
import { requireAuth } from "../middleware/authenticate.js";
import { denySystemService } from "../middleware/authorize.js";

const router = Router();

router.get("/", evcController.list);
router.post("/", requireAuth, denySystemService, evcController.schedule);
router.patch("/:id", requireAuth, denySystemService, evcController.updateStatus);

export default router;
