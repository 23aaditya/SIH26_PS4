const BASE_URL = "http://localhost:4000/api";

async function runTests() {
  console.log("=== AICTE PS4 Authentication & Dynamic Dashboard Test Suite ===\n");
  let passed = 0;
  let total = 0;

  function assert(condition, testName) {
    total++;
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
    }
  }

  try {
    // 1. Super Admin Login by email
    console.log("1. Testing Super Admin login by email (staff001@aicte-demo.test)...");
    const superAdminRes = await fetch(`${BASE_URL}/auth/aicte/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "staff001@aicte-demo.test",
        password: "password123",
      }),
    });
    const superAdminData = await superAdminRes.json();
    assert(superAdminRes.status === 200, "Super admin login returns 200 OK");
    assert(superAdminData.user?.employeeCode === "DEMO-AIC-001", "Super admin employeeCode is DEMO-AIC-001");
    assert(superAdminData.user?.platformRoles?.includes("SUPER_ADMIN"), "Super admin has SUPER_ADMIN role");
    assert(superAdminData.user?.permissions?.includes("MANAGE_STAFF_ROLES"), "Super admin has MANAGE_STAFF_ROLES permission");
    assert(superAdminData.user?.dashboardModules?.includes("user_management"), "Super admin has user_management module");
    assert(superAdminData.user?.dashboardModules?.includes("audit_logs"), "Super admin has audit_logs module");

    // 2. Super Admin Login by employee code
    console.log("\n2. Testing Super Admin login by employeeCode (DEMO-AIC-001)...");
    const codeLoginRes = await fetch(`${BASE_URL}/auth/aicte/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeCode: "DEMO-AIC-001",
        password: "password123",
      }),
    });
    const codeLoginData = await codeLoginRes.json();
    assert(codeLoginRes.status === 200, "Login by employeeCode returns 200 OK");
    assert(codeLoginData.user?.email === "staff001@aicte-demo.test", "Returns matching staff email");

    // 3. Scrutiny Member Login (staff034@aicte-demo.test - Mihir Tiwari)
    console.log("\n3. Testing Scrutiny Member login (DEMO-AIC-034)...");
    const scrutinyRes = await fetch(`${BASE_URL}/auth/aicte/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "staff034@aicte-demo.test",
        password: "password123",
      }),
    });
    const scrutinyData = await scrutinyRes.json();
    assert(scrutinyRes.status === 200, "Scrutiny member login returns 200 OK");
    assert(scrutinyData.user?.committeeMemberships?.some((c) => c.committeeCode === "SCRUTINY"), "User belongs to SCRUTINY committee");
    assert(scrutinyData.user?.permissions?.includes("CONDUCT_SCRUTINY"), "Has CONDUCT_SCRUTINY permission");
    assert(scrutinyData.user?.dashboardModules?.includes("scrutiny"), "Has scrutiny module in dashboard");
    assert(!scrutinyData.user?.dashboardModules?.includes("user_management"), "Does NOT have user_management module");

    // 4. EVC Member Login (staff037@aicte-demo.test - Neha Rao)
    console.log("\n4. Testing EVC Member login (DEMO-AIC-037)...");
    const evcRes = await fetch(`${BASE_URL}/auth/aicte/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "staff037@aicte-demo.test",
        password: "password123",
      }),
    });
    const evcData = await evcRes.json();
    assert(evcRes.status === 200, "EVC member login returns 200 OK");
    assert(evcData.user?.committeeMemberships?.some((c) => c.committeeCode === "EVC"), "User belongs to EVC committee");
    assert(evcData.user?.permissions?.includes("CONDUCT_EVC"), "Has CONDUCT_EVC permission");
    assert(evcData.user?.dashboardModules?.includes("evc_tasks"), "Has evc_tasks module in dashboard");

    // 5. Multi-Committee Expert (staff091@aicte-demo.test - Amol Iyer) & Workspace Switching
    console.log("\n5. Testing Multi-Committee Member (DEMO-AIC-091) & Workspace Switching...");
    const multiRes = await fetch(`${BASE_URL}/auth/aicte/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "staff091@aicte-demo.test",
        password: "password123",
      }),
    });
    const multiData = await multiRes.json();
    assert(multiRes.status === 200, "Multi-committee expert login returns 200 OK");
    const commCodes = multiData.user?.committeeMemberships?.map((c) => c.committeeCode);
    assert(commCodes.includes("SCRUTINY") && commCodes.includes("SAC") && commCodes.includes("SCSC"), "Member of SCRUTINY, SAC, and SCSC committees");

    // Test GET /api/auth/me with ?committeeWorkspace=SAC
    const sacMeRes = await fetch(`${BASE_URL}/auth/me?committeeWorkspace=SAC`, {
      headers: { "x-user-id": "DEMO-AIC-091" },
    });
    const sacMeData = await sacMeRes.json();
    assert(sacMeData.user?.activeWorkspace === "SAC", "Active workspace switched to SAC");
    assert(sacMeData.user?.dashboardModules?.includes("sac_tasks"), "Dashboard includes sac_tasks in SAC workspace");

    // Test GET /api/auth/me with header x-committee-workspace: SCSC
    const scscMeRes = await fetch(`${BASE_URL}/auth/me`, {
      headers: {
        "x-user-id": "DEMO-AIC-091",
        "x-committee-workspace": "SCSC",
      },
    });
    const scscMeData = await scscMeRes.json();
    assert(scscMeData.user?.activeWorkspace === "SCSC", "Active workspace switched to SCSC via header");
    assert(scscMeData.user?.dashboardModules?.includes("scsc_tasks"), "Dashboard includes scsc_tasks in SCSC workspace");

    // 6. Super Admin Staff Management Endpoints
    console.log("\n6. Testing Super Admin Staff Management & Role Update...");
    const listStaffRes = await fetch(`${BASE_URL}/admin/staff?limit=5`, {
      headers: { "x-user-id": "DEMO-AIC-001" },
    });
    const listStaffData = await listStaffRes.json();
    assert(listStaffRes.status === 200, "List staff endpoint returns 200 OK");
    assert(listStaffData.staff?.length === 5, "Returns requested page limit of 5 staff records");
    assert(listStaffData.total === 100, "Total count reflects all 100 synthetic staff records");

    // Update staff roles for DEMO-AIC-062
    const updateRolesRes = await fetch(`${BASE_URL}/admin/staff/DEMO-AIC-062/roles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "DEMO-AIC-001",
      },
      body: JSON.stringify({
        roles: ["REVIEWING_OFFICER", "READ_ONLY_AUDITOR"],
        reason: "Annual internal compliance rotation",
      }),
    });
    const updateRolesData = await updateRolesRes.json();
    assert(updateRolesRes.status === 200, "Role update endpoint returns 200 OK");
    assert(updateRolesData.staff?.platformRoles?.includes("READ_ONLY_AUDITOR"), "Updated staff has READ_ONLY_AUDITOR role");

    // Check Audit Logs
    const auditRes = await fetch(`${BASE_URL}/admin/audit-logs?limit=5`, {
      headers: { "x-user-id": "DEMO-AIC-001" },
    });
    const auditData = await auditRes.json();
    assert(auditRes.status === 200, "Audit logs endpoint returns 200 OK");
    const roleAudit = auditData.logs?.find((l) => l.actionType === "UPDATE_PLATFORM_ROLES");
    assert(roleAudit !== undefined, "Audit log records UPDATE_PLATFORM_ROLES action");
    assert(roleAudit?.reason === "Annual internal compliance rotation", "Audit log records accurate reason");

    // 7. Authorization Enforcement (Non-admin rejection)
    console.log("\n7. Testing Authorization Enforcement (Non-admin rejection)...");
    const forbiddenRes = await fetch(`${BASE_URL}/admin/staff/DEMO-AIC-062/roles`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "DEMO-AIC-034", // Scrutiny officer, NOT Super Admin
      },
      body: JSON.stringify({
        roles: ["SUPER_ADMIN"],
        reason: "Unauthorized attempt",
      }),
    });
    assert(forbiddenRes.status === 403, "Non-admin role update is rejected with 403 Forbidden");

    // 8. Institute Login Preservation
    console.log("\n8. Testing Institute user login preservation...");
    const instLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "principal@pict.edu",
        password: "password123",
      }),
    });
    const instLoginData = await instLoginRes.json();
    assert(instLoginRes.status === 200, "Institute user login returns 200 OK");
    assert(instLoginData.user?.accountType === "institution", "Preserves institution account type");
    assert(instLoginData.user?.role === "institution", "Preserves institution role");

    console.log(`\n====================================================`);
    console.log(`Test Results: ${passed}/${total} checks passed (${Math.round((passed / total) * 100)}%)`);
    console.log(`====================================================`);

    if (passed === total) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error("Test execution failed with error:", err);
    process.exit(1);
  }
}

runTests();
