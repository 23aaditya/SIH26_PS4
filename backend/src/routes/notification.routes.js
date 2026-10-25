import { Router } from "express";
import { notificationController } from "../controllers/notification.controller.js";
import { requireAuth } from "../middleware/authenticate.js";

const router = Router();

router.get("/", requireAuth, notificationController.list);
router.patch("/", requireAuth, notificationController.markRead);
router.post("/read-all", requireAuth, notificationController.markAllRead);

export default router;
