import { Router } from "express";
import { collaborationController } from "../controllers/collaboration.controller.js";
import { requireAuth } from "../middleware/authenticate.js";
import { denySystemService } from "../middleware/authorize.js";

const router = Router();

router.use(requireAuth);
router.use(denySystemService);

router.get("/", collaborationController.getDelegations);
router.get("/eligible-users", collaborationController.getEligibleDelegationUsers);
router.post("/", collaborationController.createDelegation);
router.patch("/:id/accept", collaborationController.acceptDelegation);
router.patch("/:id/decline", collaborationController.declineDelegation);
router.patch("/:id/start", collaborationController.startDelegation);
router.patch("/:id/complete", collaborationController.completeDelegation);
router.patch("/:id/cancel", collaborationController.cancelDelegation);

export default router;
