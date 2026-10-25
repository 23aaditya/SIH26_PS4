import { Router } from "express";
import { evcController } from "../controllers/evc.controller.js";
import { requireAuth } from "../middleware/authenticate.js";

const router = Router();

router.get("/", evcController.list);
router.post("/", requireAuth, evcController.schedule);
router.patch("/:id", requireAuth, evcController.updateStatus);

export default router;
