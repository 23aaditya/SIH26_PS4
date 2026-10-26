import { Router } from "express";
import { documentController } from "../controllers/document.controller.js";
import { requireAuth } from "../middleware/authenticate.js";
import { denySystemService } from "../middleware/authorize.js";
import { upload } from "../middleware/upload.js";

const router = Router();

router.get("/", documentController.list);
router.post("/upload", requireAuth, denySystemService, upload.single("file"), documentController.uploadFile);
router.get("/:id/download", requireAuth, documentController.download);
router.post("/:id/verify", requireAuth, denySystemService, documentController.verify);

export default router;
