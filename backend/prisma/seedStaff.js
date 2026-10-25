import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function seedStaff(prisma) {
  console.log("Seeding AICTE Staff Directory from synthetic CSV...");

  // 1. Clear staff-related tables
  await prisma.staffAuditLog.deleteMany();
  await prisma.workflowAssignment.deleteMany();
  await prisma.committeeMembership.deleteMany();
  await prisma.committeeRolePermission.deleteMany();
  await prisma.committee.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.staffRoleAssignment.deleteMany();
  await prisma.platformRole.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.designation.deleteMany();
  await prisma.organizationUnit.deleteMany();

  // 2. Define Permissions
  const permissionsData = [
    { code: "VIEW_DASHBOARD", name: "View Dashboard", category: "SYSTEM", description: "Access AICTE portal and dashboard views" },
    { code: "VIEW_ALL_APPLICATIONS", name: "View All Applications", category: "WORKFLOW", description: "View applications across all bureaus and regions" },
    { code: "VIEW_ASSIGNED_APPLICATIONS", name: "View Assigned Applications", category: "WORKFLOW", description: "View applications assigned to officer or committee" },
    { code: "VERIFY_DOCUMENTS", name: "Verify Documents", category: "WORKFLOW", description: "Verify uploaded compliance and institutional documents" },
    { code: "CONDUCT_SCRUTINY", name: "Conduct Scrutiny", category: "COMMITTEES", description: "Review scrutiny dossiers and raise deficiencies" },
    { code: "SCHEDULE_EVC", name: "Schedule EVC", category: "COMMITTEES", description: "Schedule Expert Visit Committee and assign experts" },
    { code: "CONDUCT_EVC", name: "Conduct EVC Inspection", category: "COMMITTEES", description: "Perform EVC visit and submit inspection reports" },
    { code: "CONDUCT_SHC", name: "Conduct Standing Hearing", category: "COMMITTEES", description: "Review and conduct Standing Hearing Committee cases" },
    { code: "CONDUCT_SAC", name: "Conduct Standing Appellate", category: "COMMITTEES", description: "Review and decide Standing Appellate Committee cases" },
    { code: "CONDUCT_SCSC", name: "Conduct Standing Complaints", category: "COMMITTEES", description: "Review Standing Complaint & Special Committee matters" },
    { code: "MANAGE_STAFF_ROLES", name: "Manage Staff Roles & Committees", category: "SYSTEM", description: "Super Admin authority to assign/revoke roles and committee memberships" },
    { code: "VIEW_AUDIT_LOGS", name: "View Audit Logs", category: "AUDIT", description: "Access platform security, authority and workflow audit logs" },
    { code: "MANAGE_WORKFLOW", name: "Manage Workflow Stages", category: "WORKFLOW", description: "Override stage transitions and workflow assignments" },
  ];

  const permMap = {};
  for (const p of permissionsData) {
    const created = await prisma.permission.create({ data: p });
    permMap[created.code] = created.id;
  }

  // 3. Define Platform Roles
  const rolesData = [
    { code: "SUPER_ADMIN", name: "Super Administrator", description: "Master platform authority with complete management access" },
    { code: "GOVERNANCE_AUTHORITY", name: "Governance Authority", description: "Apex executive leadership (Chairperson, Vice-Chairperson, Member Secretary)" },
    { code: "UNIT_HEAD", name: "Bureau Unit Head", description: "Advisors, Directors and Section Heads managing bureau operations" },
    { code: "REGIONAL_OFFICER", name: "Regional Officer", description: "Regional leadership overseeing jurisdictional approvals and EVC coordination" },
    { code: "REVIEWING_OFFICER", name: "Reviewing Officer", description: "Approval, Technical and Programme officers processing workflow stages" },
    { code: "COMMITTEE_MEMBER", name: "Committee Member", description: "Internal or external experts serving on evaluation committees" },
    { code: "READ_ONLY_AUDITOR", name: "Read-Only Auditor", description: "Internal vigilance and compliance audit officers" },
    { code: "SUPPORT_STAFF", name: "Support Staff", description: "IT systems, legal and operational support personnel" },
  ];

  const roleMap = {};
  for (const r of rolesData) {
    const created = await prisma.platformRole.create({ data: r });
    roleMap[created.code] = created.id;
  }

  // 4. Role Permissions Mapping
  const rolePerms = {
    SUPER_ADMIN: Object.keys(permMap),
    GOVERNANCE_AUTHORITY: ["VIEW_DASHBOARD", "VIEW_ALL_APPLICATIONS", "VIEW_AUDIT_LOGS", "VIEW_ASSIGNED_APPLICATIONS"],
    UNIT_HEAD: ["VIEW_DASHBOARD", "VIEW_ALL_APPLICATIONS", "VIEW_ASSIGNED_APPLICATIONS", "VERIFY_DOCUMENTS", "VIEW_AUDIT_LOGS", "MANAGE_WORKFLOW"],
    REGIONAL_OFFICER: ["VIEW_DASHBOARD", "VIEW_ALL_APPLICATIONS", "VIEW_ASSIGNED_APPLICATIONS", "VERIFY_DOCUMENTS", "SCHEDULE_EVC"],
    REVIEWING_OFFICER: ["VIEW_DASHBOARD", "VIEW_ASSIGNED_APPLICATIONS", "VERIFY_DOCUMENTS"],
    COMMITTEE_MEMBER: ["VIEW_DASHBOARD", "VIEW_ASSIGNED_APPLICATIONS"],
    READ_ONLY_AUDITOR: ["VIEW_DASHBOARD", "VIEW_ALL_APPLICATIONS", "VIEW_AUDIT_LOGS"],
    SUPPORT_STAFF: ["VIEW_DASHBOARD", "VIEW_ASSIGNED_APPLICATIONS"],
  };

  for (const [roleCode, perms] of Object.entries(rolePerms)) {
    const roleId = roleMap[roleCode];
    if (!roleId) continue;
    for (const permCode of perms) {
      const permissionId = permMap[permCode];
      if (permissionId) {
        await prisma.rolePermission.create({
          data: { roleId, permissionId },
        });
      }
    }
  }

  // 5. Define Committees
  const committeesData = [
    { code: "EXECUTIVE_COMMITTEE", name: "Executive Committee (EC)", committeeType: "APEX_GOVERNANCE", description: "Executive decision committee on major policies and approvals" },
    { code: "COUNCIL", name: "AICTE Council", committeeType: "APEX_GOVERNANCE", description: "Highest statutory governing body of AICTE" },
    { code: "SCRUTINY", name: "Scrutiny Committee", committeeType: "EVALUATION", description: "Document and norm verification panel for institution applications" },
    { code: "EVC", name: "Expert Visit Committee", committeeType: "INSPECTION", description: "Physical/Virtual infrastructure and academic inspection panel" },
    { code: "SHC", name: "Standing Hearing Committee", committeeType: "HEARING", description: "Quasi-judicial hearing panel for deficient or disputed applications" },
    { code: "SAC", name: "Standing Appellate Committee", committeeType: "APPELLATE", description: "Appellate hearing panel for appeals against SHC decisions" },
    { code: "SCSC", name: "Standing Complaint & Special Committee", committeeType: "SPECIAL", description: "Investigative panel for complaints, grievances and vigilance cases" },
  ];

  const committeeMap = {};
  for (const c of committeesData) {
    const created = await prisma.committee.create({ data: c });
    committeeMap[created.code] = created.id;
  }

  // 6. Committee Role Permissions Mapping
  const committeePerms = [
    { comm: "SCRUTINY", role: "MEMBER", perms: ["CONDUCT_SCRUTINY", "VERIFY_DOCUMENTS", "VIEW_ASSIGNED_APPLICATIONS"] },
    { comm: "SCRUTINY", role: "CHAIRPERSON", perms: ["CONDUCT_SCRUTINY", "VERIFY_DOCUMENTS", "VIEW_ASSIGNED_APPLICATIONS"] },
    { comm: "EVC", role: "MEMBER", perms: ["CONDUCT_EVC", "SCHEDULE_EVC", "VIEW_ASSIGNED_APPLICATIONS"] },
    { comm: "EVC", role: "CHAIRPERSON", perms: ["CONDUCT_EVC", "SCHEDULE_EVC", "VIEW_ASSIGNED_APPLICATIONS"] },
    { comm: "SHC", role: "MEMBER", perms: ["CONDUCT_SHC", "VIEW_ASSIGNED_APPLICATIONS"] },
    { comm: "SHC", role: "CHAIRPERSON", perms: ["CONDUCT_SHC", "VIEW_ASSIGNED_APPLICATIONS"] },
    { comm: "SAC", role: "MEMBER", perms: ["CONDUCT_SAC", "VIEW_ASSIGNED_APPLICATIONS"] },
    { comm: "SAC", role: "CHAIRPERSON", perms: ["CONDUCT_SAC", "VIEW_ASSIGNED_APPLICATIONS"] },
    { comm: "SCSC", role: "MEMBER", perms: ["CONDUCT_SCSC", "VIEW_ASSIGNED_APPLICATIONS"] },
    { comm: "SCSC", role: "CHAIRPERSON", perms: ["CONDUCT_SCSC", "VIEW_ASSIGNED_APPLICATIONS"] },
    { comm: "EXECUTIVE_COMMITTEE", role: "MEMBER", perms: ["VIEW_ALL_APPLICATIONS", "VIEW_AUDIT_LOGS"] },
    { comm: "COUNCIL", role: "MEMBER", perms: ["VIEW_ALL_APPLICATIONS", "VIEW_AUDIT_LOGS"] },
  ];

  for (const cp of committeePerms) {
    const committeeId = committeeMap[cp.comm];
    if (!committeeId) continue;
    for (const permCode of cp.perms) {
      const permissionId = permMap[permCode];
      if (permissionId) {
        await prisma.committeeRolePermission.create({
          data: {
            committeeId,
            committeeRole: cp.role,
            permissionId,
          },
        });
      }
    }
  }

  // 7. Read and Parse CSV
  const csvPath = path.resolve(__dirname, "../seed-data/staff_directory_overview.csv");
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found at ${csvPath}`);
  }

  const csvContent = fs.readFileSync(csvPath, "utf8");
  const rawLines = csvContent.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  const rows = [];

  for (let i = 1; i < rawLines.length; i++) {
    const row = [];
    let curr = "";
    let inQuotes = false;
    for (const ch of rawLines[i]) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        row.push(curr.trim());
        curr = "";
      } else {
        curr += ch;
      }
    }
    row.push(curr.trim());
    if (row[0]) {
      rows.push({
        employee_code: row[0],
        full_name: row[1],
        email: row[2],
        account_type: row[3],
        designation: row[4],
        organization_unit: row[5],
        reports_to: row[6],
        employment_status: row[7],
        account_status: row[8],
        identity_verified: row[9],
        platform_roles: row[10],
        committee_memberships: row[11],
      });
    }
  }

  console.log(`Parsed ${rows.length} staff records from CSV.`);

  // 8. Seed Designations
  const uniqueDesignations = [...new Set(rows.map((r) => r.designation).filter(Boolean))];
  const designationMap = {};
  for (const desigTitle of uniqueDesignations) {
    const code = desigTitle.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    const created = await prisma.designation.create({
      data: {
        code,
        title: desigTitle,
        description: `Official AICTE designation: ${desigTitle}`,
      },
    });
    designationMap[desigTitle] = created.id;
  }

  // 9. Seed Organization Units
  const uniqueOrgUnits = [...new Set(rows.map((r) => r.organization_unit).filter(Boolean))];
  const orgUnitMap = {};
  for (const unitName of uniqueOrgUnits) {
    const code = unitName.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
    const created = await prisma.organizationUnit.create({
      data: {
        code,
        name: unitName,
        unitType: unitName.includes("Regional") ? "REGIONAL_OFFICE" : unitName.includes("Bureau") ? "BUREAU" : "CELL",
      },
    });
    orgUnitMap[unitName] = created.id;
  }

  // 10. Pass 1: Insert Staff & linked User records
  const defaultPasswordHash = await bcrypt.hash("password123", 10);
  const staffByCode = {};

  for (const r of rows) {
    const createdStaff = await prisma.staff.create({
      data: {
        employeeCode: r.employee_code,
        name: r.full_name,
        email: r.email,
        passwordHash: defaultPasswordHash,
        accountType: r.account_type || "AICTE_STAFF",
        designationId: designationMap[r.designation],
        organizationUnitId: orgUnitMap[r.organization_unit] || null,
        employmentStatus: r.employment_status || "SYNTHETIC_ACTIVE",
        accountStatus: r.account_status || "ACTIVE_BOOTSTRAP_DEMO",
        isVerified: r.identity_verified === "YES",
      },
    });
    staffByCode[r.employee_code] = createdStaff;

    // Also ensure a User record exists for seamless integration across existing system
    const userRole = r.platform_roles ? r.platform_roles.split(";")[0].trim().toLowerCase() : "aicte";
    await prisma.user.upsert({
      where: { email: r.email },
      update: {
        name: r.full_name,
        role: userRole,
        accountType: "aicte",
        active: true,
      },
      create: {
        id: r.employee_code,
        name: r.full_name,
        email: r.email,
        passwordHash: defaultPasswordHash,
        role: userRole,
        accountType: "aicte",
        active: true,
      },
    });
  }

  // 11. Pass 2: Update reportsTo hierarchy
  for (const r of rows) {
    if (r.reports_to) {
      // e.g. "DEMO-AIC-010 — Pranav Bansal"
      const managerCode = r.reports_to.split("—")[0].trim();
      const manager = staffByCode[managerCode];
      const staffMember = staffByCode[r.employee_code];
      if (manager && staffMember) {
        await prisma.staff.update({
          where: { id: staffMember.id },
          data: { reportsToStaffId: manager.id },
        });
      }
    }
  }

  // 12. Assign Platform Roles
  for (const r of rows) {
    const staff = staffByCode[r.employee_code];
    if (!staff || !r.platform_roles) continue;
    const roleCodes = r.platform_roles.split(";").map((s) => s.trim()).filter(Boolean);
    for (const rc of roleCodes) {
      const roleId = roleMap[rc];
      if (roleId) {
        await prisma.staffRoleAssignment.create({
          data: {
            staffId: staff.id,
            roleId,
            assignedById: staffByCode["DEMO-AIC-001"]?.id || null, // Ashwini Kapoor (Super Admin)
            active: true,
          },
        });
      }
    }
  }

  // 13. Assign Committee Memberships
  for (const r of rows) {
    const staff = staffByCode[r.employee_code];
    if (!staff || !r.committee_memberships) continue;

    // Format: "EXECUTIVE_COMMITTEE:MEMBER [DEMO-EC-DOCKET-01]; COUNCIL:MEMBER [DEMO-COUNCIL-DOCKET-01]"
    const items = r.committee_memberships.split(";").map((s) => s.trim()).filter(Boolean);
    for (const item of items) {
      // regex to parse: COMMITTEE_CODE:ROLE [DOCKET_NUMBER]
      const match = item.match(/^([A-Z_]+):([A-Z_]+)(?:\s*\[(.*)\])?$/);
      if (match) {
        const commCode = match[1];
        const commRole = match[2];
        const docket = match[3] || null;
        const committeeId = committeeMap[commCode];
        if (committeeId) {
          await prisma.committeeMembership.create({
            data: {
              committeeId,
              staffId: staff.id,
              committeeRole: commRole,
              docketNumber: docket,
              status: "ACTIVE",
            },
          });
        }
      }
    }
  }

  // 14. Seed Sample Workflow Assignments for Dashboards
  // Provide sample applications to Scrutiny, EVC, SHC, and SAC members
  const scrutinyStaff = rows.find((r) => r.committee_memberships?.includes("SCRUTINY"));
  const evcStaff = rows.find((r) => r.committee_memberships?.includes("EVC"));
  const shcStaff = rows.find((r) => r.committee_memberships?.includes("SHC"));
  const sacStaff = rows.find((r) => r.committee_memberships?.includes("SAC"));

  const apps = await prisma.application.findMany({ take: 5 });
  if (apps.length > 0) {
    if (scrutinyStaff && staffByCode[scrutinyStaff.employee_code]) {
      await prisma.workflowAssignment.create({
        data: {
          staffId: staffByCode[scrutinyStaff.employee_code].id,
          committeeId: committeeMap["SCRUTINY"],
          applicationId: apps[0]?.id,
          roleInWorkflow: "SCRUTINY_EVALUATOR",
          status: "ASSIGNED",
        },
      });
    }
    if (evcStaff && staffByCode[evcStaff.employee_code]) {
      await prisma.workflowAssignment.create({
        data: {
          staffId: staffByCode[evcStaff.employee_code].id,
          committeeId: committeeMap["EVC"],
          applicationId: apps[1]?.id || apps[0]?.id,
          roleInWorkflow: "EVC_EXPERT",
          status: "IN_PROGRESS",
        },
      });
    }
    if (shcStaff && staffByCode[shcStaff.employee_code]) {
      await prisma.workflowAssignment.create({
        data: {
          staffId: staffByCode[shcStaff.employee_code].id,
          committeeId: committeeMap["SHC"],
          applicationId: apps[2]?.id || apps[0]?.id,
          roleInWorkflow: "HEARING_OFFICER",
          status: "ASSIGNED",
        },
      });
    }
    if (sacStaff && staffByCode[sacStaff.employee_code]) {
      await prisma.workflowAssignment.create({
        data: {
          staffId: staffByCode[sacStaff.employee_code].id,
          committeeId: committeeMap["SAC"],
          applicationId: apps[3]?.id || apps[0]?.id,
          roleInWorkflow: "APPELLATE_JUDGE",
          status: "ASSIGNED",
        },
      });
    }
  }

  // 15. Record initial bootstrap audit event
  const superAdminStaff = staffByCode["DEMO-AIC-001"];
  if (superAdminStaff) {
    await prisma.staffAuditLog.create({
      data: {
        actorStaffId: superAdminStaff.id,
        targetStaffId: superAdminStaff.id,
        actionType: "BOOTSTRAP_SYSTEM_INIT",
        previousValue: null,
        newValue: "SYSTEM_INITIALIZED",
        reason: "Initial synthetic staff directory seed and role allocation completed",
      },
    });
  }

  console.log(`Seeding complete: 100 AICTE staff seeded with roles, committees, permissions, and audit log.`);
}

// Standalone execution support
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const prisma = new PrismaClient();
  seedStaff(prisma)
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
