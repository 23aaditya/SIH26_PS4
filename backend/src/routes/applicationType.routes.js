import { Router } from "express";
import { applicationTypeController } from "../controllers/applicationType.controller.js";

const router = Router();

router.get("/", applicationTypeController.list);
router.get("/:id/form", applicationTypeController.getForm);
router.get("/:id", applicationTypeController.getForm);

export default router;
