import prisma from "../db/prisma.js";
import bcrypt from "bcryptjs";

export const staffAuthService = {
  /**
   * Resolve complete authority envelope for a staff member by ID or employeeCode
   */
  async resolveStaffAuthority(staffIdOrCode, activeCommitteeWorkspace = null) {
    const staff = await prisma.staff.findFirst({
      where: {
        OR: [
          { id: staffIdOrCode },
          { employeeCode: staffIdOrCode },
          { email: staffIdOrCode.toLowerCase().trim() },
        ],
      },
      include: {
        designation: true,
        organizationUnit: true,
        reportsTo: {
          select: { id: true, employeeCode: true, name: true },
        },
        roleAssignments: {
          where: { active: true },
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
        committeeMembers: {
          where: { status: "ACTIVE" },
          include: {
            committee: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    if (!staff) {
      return null;
    }

    // 1. Extract platform roles
    const platformRoles = staff.roleAssignments.map((ra) => ra.role.code);

    // 2. Extract committee memberships
    const committeeMemberships = staff.committeeMembers.map((cm) => ({
      committeeId: cm.committee.id,
      committeeCode: cm.committee.code,
      committeeName: cm.committee.name,
      committeeRole: cm.committeeRole,
      docketNumber: cm.docketNumber,
      status: cm.status,
    }));

    // 3. Resolve permissions
    const permissionsSet = new Set();

    // From Platform Roles
    for (const ra of staff.roleAssignments) {
      for (const rp of ra.role.permissions) {
        if (rp.permission?.code) {
          permissionsSet.add(rp.permission.code);
        }
      }
    }

    // From Committees
    for (const cm of staff.committeeMembers) {
      // If a specific workspace is selected, only apply permissions from that committee,
      // otherwise include all assigned committee permissions
      if (!activeCommitteeWorkspace || activeCommitteeWorkspace === "ALL" || activeCommitteeWorkspace === cm.committee.code) {
        for (const crp of cm.committee.rolePermissions) {
          if (crp.committeeRole === cm.committeeRole && crp.permission?.code) {
            permissionsSet.add(crp.permission.code);
          }
        }
      }
    }

    // If staff has SUPER_ADMIN role, ensure they have MANAGE_STAFF_ROLES and VIEW_AUDIT_LOGS
    if (platformRoles.includes("SUPER_ADMIN")) {
      permissionsSet.add("VIEW_DASHBOARD");
      permissionsSet.add("VIEW_ALL_APPLICATIONS");
      permissionsSet.add("VIEW_ASSIGNED_APPLICATIONS");
      permissionsSet.add("VERIFY_DOCUMENTS");
      permissionsSet.add("CONDUCT_SCRUTINY");
      permissionsSet.add("SCHEDULE_EVC");
      permissionsSet.add("CONDUCT_EVC");
      permissionsSet.add("CONDUCT_SHC");
      permissionsSet.add("CONDUCT_SAC");
      permissionsSet.add("CONDUCT_SCSC");
      permissionsSet.add("MANAGE_STAFF_ROLES");
      permissionsSet.add("VIEW_AUDIT_LOGS");
      permissionsSet.add("MANAGE_WORKFLOW");
    }

    // 4. Derive dynamic dashboard modules
    const permissions = Array.from(permissionsSet);
    const dashboardModules = [];

    if (permissionsSet.has("VIEW_ALL_APPLICATIONS") || permissionsSet.has("VIEW_ASSIGNED_APPLICATIONS")) {
      dashboardModules.push("applications");
    }
    if (permissionsSet.has("VERIFY_DOCUMENTS")) {
      dashboardModules.push("document_verification");
    }
    if (permissionsSet.has("CONDUCT_SCRUTINY") || activeCommitteeWorkspace === "SCRUTINY") {
      dashboardModules.push("scrutiny");
    }
    if (permissionsSet.has("SCHEDULE_EVC") || permissionsSet.has("CONDUCT_EVC") || activeCommitteeWorkspace === "EVC") {
      dashboardModules.push("evc_tasks");
    }
    if (permissionsSet.has("CONDUCT_SHC") || activeCommitteeWorkspace === "SHC") {
      dashboardModules.push("shc_tasks");
    }
    if (permissionsSet.has("CONDUCT_SAC") || activeCommitteeWorkspace === "SAC") {
      dashboardModules.push("sac_tasks");
    }
    if (permissionsSet.has("CONDUCT_SCSC") || activeCommitteeWorkspace === "SCSC") {
      dashboardModules.push("scsc_tasks");
    }
    if (permissionsSet.has("MANAGE_STAFF_ROLES")) {
      dashboardModules.push("user_management");
    }
    if (permissionsSet.has("VIEW_AUDIT_LOGS")) {
      dashboardModules.push("audit_logs");
    }

    // Determine primary display role
    const primaryRole = platformRoles.includes("SUPER_ADMIN")
      ? "SUPER_ADMIN"
      : platformRoles[0] || (committeeMemberships.length > 0 ? "COMMITTEE_MEMBER" : "AICTE_STAFF");

    return {
      id: staff.id,
      employeeCode: staff.employeeCode,
      name: staff.name,
      displayName: staff.name,
      email: staff.email,
      accountType: staff.accountType,
      role: primaryRole.toLowerCase(),
      employmentStatus: staff.employmentStatus,
      accountStatus: staff.accountStatus,
      isVerified: staff.isVerified,
      designation: staff.designation ? {
        id: staff.designation.id,
        code: staff.designation.code,
        title: staff.designation.title,
      } : null,
      organizationUnit: staff.organizationUnit ? {
        id: staff.organizationUnit.id,
        code: staff.organizationUnit.code,
        name: staff.organizationUnit.name,
        unitType: staff.organizationUnit.unitType,
      } : null,
      reportsTo: staff.reportsTo ? {
        id: staff.reportsTo.id,
        employeeCode: staff.reportsTo.employeeCode,
        name: staff.reportsTo.name,
      } : null,
      platformRoles,
      committeeMemberships,
      activeWorkspace: activeCommitteeWorkspace || (committeeMemberships.length > 0 ? committeeMemberships[0].committeeCode : "GENERAL"),
      permissions,
      dashboardModules,
    };
  },

  /**
   * Authenticate AICTE Member (staff001@aicte-demo.test or DEMO-AIC-001)
   */
  async authenticateStaff(identifier, password) {
    const cleanId = (identifier || "").trim();
    if (!cleanId || !password) {
      throw new Error("Staff identifier (email or employee code) and password are required");
    }

    const staff = await prisma.staff.findFirst({
      where: {
        OR: [
          { email: cleanId.toLowerCase() },
          { employeeCode: cleanId.toUpperCase() },
        ],
      },
    });

    if (!staff) {
      return null;
    }

    // Verify password
    let isValid = false;
    const cleanPassword = (password || "").trim();
    if (staff.passwordHash) {
      isValid = await bcrypt.compare(password, staff.passwordHash);
      if (!isValid && cleanPassword !== password) {
        isValid = await bcrypt.compare(cleanPassword, staff.passwordHash);
      }
    }
    // Demo fallback password
    if (!isValid && (cleanPassword === "password123" || cleanPassword === "demo123" || password === "password123")) {
      isValid = true;
    }

    if (!isValid) {
      return null;
    }

    return this.resolveStaffAuthority(staff.id);
  },
};
