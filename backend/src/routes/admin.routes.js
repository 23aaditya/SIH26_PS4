import { Router } from "express";
import { adminController } from "../controllers/admin.controller.js";
import { staffManagementController } from "../controllers/staffManagement.controller.js";
import { requireAuth } from "../middleware/authenticate.js";
import { requirePermission } from "../middleware/authorize.js";

const router = Router();

router.post("/process-deadlines", requireAuth, adminController.processDeadlines);

// Staff Directory & Authority Management (Protected)
router.get("/staff", requireAuth, requirePermission("MANAGE_STAFF_ROLES"), staffManagementController.listStaff);
router.get("/staff/:id", requireAuth, requirePermission("MANAGE_STAFF_ROLES"), staffManagementController.getStaffById);
router.post("/staff/:id/roles", requireAuth, requirePermission("MANAGE_STAFF_ROLES"), staffManagementController.updateStaffRoles);
router.post("/staff/:id/committees", requireAuth, requirePermission("MANAGE_STAFF_ROLES"), staffManagementController.updateStaffCommittees);
router.get("/audit-logs", requireAuth, requirePermission("VIEW_AUDIT_LOGS"), staffManagementController.listAuditLogs);
router.get("/reference-data", requireAuth, staffManagementController.getReferenceData);

export default router;
