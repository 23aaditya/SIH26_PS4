import prisma from "../db/prisma.js";
import { staffAuthService } from "../services/staffAuth.service.js";

export const staffManagementController = {
  /**
   * List staff directory with filters and pagination
   */
  async listStaff(req, res, next) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const search = (req.query.search || "").trim();
      const roleFilter = (req.query.role || "").trim();
      const committeeFilter = (req.query.committee || "").trim();

      const where = {};

      if (search) {
        where.OR = [
          { name: { contains: search } },
          { employeeCode: { contains: search } },
          { email: { contains: search } },
        ];
      }

      if (roleFilter) {
        where.roleAssignments = {
          some: {
            role: { code: roleFilter },
            active: true,
          },
        };
      }

      if (committeeFilter) {
        where.committeeMembers = {
          some: {
            committee: { code: committeeFilter },
            status: "ACTIVE",
          },
        };
      }

      const [total, staffList] = await Promise.all([
        prisma.staff.count({ where }),
        prisma.staff.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          include: {
            designation: true,
            organizationUnit: true,
            reportsTo: {
              select: { id: true, employeeCode: true, name: true },
            },
            roleAssignments: {
              where: { active: true },
              include: { role: true },
            },
            committeeMembers: {
              where: { status: "ACTIVE" },
              include: { committee: true },
            },
          },
          orderBy: { employeeCode: "asc" },
        }),
      ]);

      const formatted = staffList.map((s) => ({
        id: s.id,
        employeeCode: s.employeeCode,
        name: s.name,
        email: s.email,
        accountType: s.accountType,
        employmentStatus: s.employmentStatus,
        accountStatus: s.accountStatus,
        isVerified: s.isVerified,
        designation: s.designation?.title,
        organizationUnit: s.organizationUnit?.name,
        reportsTo: s.reportsTo ? `${s.reportsTo.employeeCode} — ${s.reportsTo.name}` : null,
        platformRoles: s.roleAssignments.map((ra) => ra.role.code),
        committeeMemberships: s.committeeMembers.map((cm) => ({
          committeeCode: cm.committee.code,
          committeeName: cm.committee.name,
          role: cm.committeeRole,
          docket: cm.docketNumber,
        })),
      }));

      res.json({
        total,
        page,
        totalPages: Math.ceil(total / limit),
        staff: formatted,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get single staff profile with audit history
   */
  async getStaffById(req, res, next) {
    try {
      const { id } = req.params;
      const authority = await staffAuthService.resolveStaffAuthority(id);

      if (!authority) {
        return res.status(404).json({ error: "Staff member not found" });
      }

      // Load audit logs where target is this staff
      const auditLogs = await prisma.staffAuditLog.findMany({
        where: { targetStaffId: authority.id },
        include: {
          actorStaff: {
            select: { id: true, employeeCode: true, name: true },
          },
        },
        orderBy: { timestamp: "desc" },
        take: 20,
      });

      res.json({
        staff: authority,
        auditLogs: auditLogs.map((log) => ({
          id: log.id,
          actionType: log.actionType,
          previousValue: log.previousValue,
          newValue: log.newValue,
          reason: log.reason,
          timestamp: log.timestamp,
          actor: log.actorStaff ? `${log.actorStaff.employeeCode} — ${log.actorStaff.name}` : "SYSTEM",
        })),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Assign or update staff platform roles (Super Admin)
   */
  async updateStaffRoles(req, res, next) {
    try {
      const { id } = req.params;
      const { roles, reason } = req.body; // array of role codes, e.g. ["REVIEWING_OFFICER", "READ_ONLY_AUDITOR"]

      if (!Array.isArray(roles)) {
        return res.status(400).json({ error: "Roles must be an array of role codes" });
      }

      const staff = await prisma.staff.findFirst({
        where: { OR: [{ id }, { employeeCode: id }] },
        include: {
          roleAssignments: {
            where: { active: true },
            include: { role: true },
          },
        },
      });

      if (!staff) {
        return res.status(404).json({ error: "Staff member not found" });
      }

      const previousRoles = staff.roleAssignments.map((ra) => ra.role.code);

      // Verify that all role codes exist
      const validRoles = await prisma.platformRole.findMany({
        where: { code: { in: roles } },
      });

      if (validRoles.length !== roles.length) {
        const foundCodes = validRoles.map((r) => r.code);
        const missing = roles.filter((rc) => !foundCodes.includes(rc));
        return res.status(400).json({ error: `Invalid role codes: ${missing.join(", ")}` });
      }

      // Execute update in transaction
      await prisma.$transaction(async (tx) => {
        // Deactivate existing assignments
        await tx.staffRoleAssignment.deleteMany({
          where: { staffId: staff.id },
        });

        // Add new assignments
        for (const role of validRoles) {
          await tx.staffRoleAssignment.create({
            data: {
              staffId: staff.id,
              roleId: role.id,
              assignedById: req.staff?.id || null,
              active: true,
            },
          });
        }

        // Log audit event
        await tx.staffAuditLog.create({
          data: {
            actorStaffId: req.staff?.id || null,
            targetStaffId: staff.id,
            actionType: "UPDATE_PLATFORM_ROLES",
            previousValue: previousRoles.join("; "),
            newValue: roles.join("; "),
            reason: reason || "Administrative role reassignment by Super Admin",
          },
        });
      });

      const updatedAuthority = await staffAuthService.resolveStaffAuthority(staff.id);

      res.json({
        success: true,
        message: `Platform roles updated for ${staff.name} (${staff.employeeCode})`,
        staff: updatedAuthority,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Assign or update committee memberships (Super Admin)
   */
  async updateStaffCommittees(req, res, next) {
    try {
      const { id } = req.params;
      const { committees, reason } = req.body;
      // committees: array of { committeeCode, committeeRole, docketNumber }

      if (!Array.isArray(committees)) {
        return res.status(400).json({ error: "Committees must be an array of membership objects" });
      }

      const staff = await prisma.staff.findFirst({
        where: { OR: [{ id }, { employeeCode: id }] },
        include: {
          committeeMembers: {
            where: { status: "ACTIVE" },
            include: { committee: true },
          },
        },
      });

      if (!staff) {
        return res.status(404).json({ error: "Staff member not found" });
      }

      const previousCommittees = staff.committeeMembers.map(
        (cm) => `${cm.committee.code}:${cm.committeeRole} [${cm.docketNumber || ""}]`
      );

      // Verify all committee codes
      const committeeCodes = committees.map((c) => c.committeeCode);
      const validCommittees = await prisma.committee.findMany({
        where: { code: { in: committeeCodes } },
      });
      const commMap = {};
      validCommittees.forEach((c) => (commMap[c.code] = c.id));

      const newCommitteesFormatted = committees.map(
        (c) => `${c.committeeCode}:${c.committeeRole || "MEMBER"} [${c.docketNumber || ""}]`
      );

      await prisma.$transaction(async (tx) => {
        // Clear existing active memberships
        await tx.committeeMembership.deleteMany({
          where: { staffId: staff.id },
        });

        // Insert new memberships
        for (const c of committees) {
          const committeeId = commMap[c.committeeCode];
          if (committeeId) {
            await tx.committeeMembership.create({
              data: {
                committeeId,
                staffId: staff.id,
                committeeRole: c.committeeRole || "MEMBER",
                docketNumber: c.docketNumber || null,
                status: "ACTIVE",
              },
            });
          }
        }

        // Log audit event
        await tx.staffAuditLog.create({
          data: {
            actorStaffId: req.staff?.id || null,
            targetStaffId: staff.id,
            actionType: "UPDATE_COMMITTEE_MEMBERSHIPS",
            previousValue: previousCommittees.join("; "),
            newValue: newCommitteesFormatted.join("; "),
            reason: reason || "Committee membership reassignment by Super Admin",
          },
        });
      });

      const updatedAuthority = await staffAuthService.resolveStaffAuthority(staff.id);

      res.json({
        success: true,
        message: `Committee memberships updated for ${staff.name} (${staff.employeeCode})`,
        staff: updatedAuthority,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * List platform audit logs
   */
  async listAuditLogs(req, res, next) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 25;

      const [total, logs] = await Promise.all([
        prisma.staffAuditLog.count(),
        prisma.staffAuditLog.findMany({
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { timestamp: "desc" },
          include: {
            actorStaff: {
              select: { id: true, employeeCode: true, name: true },
            },
            targetStaff: {
              select: { id: true, employeeCode: true, name: true },
            },
          },
        }),
      ]);

      const formatted = logs.map((log) => ({
        id: log.id,
        actionType: log.actionType,
        actor: log.actorStaff ? `${log.actorStaff.employeeCode} — ${log.actorStaff.name}` : "SYSTEM",
        target: log.targetStaff ? `${log.targetStaff.employeeCode} — ${log.targetStaff.name}` : "SYSTEM",
        previousValue: log.previousValue,
        newValue: log.newValue,
        reason: log.reason,
        timestamp: log.timestamp,
      }));

      res.json({
        total,
        page,
        totalPages: Math.ceil(total / limit),
        logs: formatted,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Reference data for Admin UI
   */
  async getReferenceData(req, res, next) {
    try {
      const [roles, committees, designations, units] = await Promise.all([
        prisma.platformRole.findMany({ orderBy: { name: "asc" } }),
        prisma.committee.findMany({ orderBy: { name: "asc" } }),
        prisma.designation.findMany({ orderBy: { title: "asc" } }),
        prisma.organizationUnit.findMany({ orderBy: { name: "asc" } }),
      ]);

      res.json({
        roles,
        committees,
        designations,
        organizationUnits: units,
      });
    } catch (error) {
      next(error);
    }
  },
};
