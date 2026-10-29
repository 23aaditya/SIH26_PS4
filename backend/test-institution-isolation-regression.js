import assert from "assert";

const BASE_URL = "http://localhost:4000/api";

async function runTests() {
  console.log("=== AICTE Institution Data Isolation & Dashboard Regression Test Suite ===\n");

  let totalTests = 0;
  let passedTests = 0;

  async function test(name, fn) {
    totalTests++;
    try {
      await fn();
      console.log(`✔ [PASS] ${name}`);
      passedTests++;
    } catch (err) {
      console.error(`✖ [FAIL] ${name}:`, err.message);
    }
  }

  // 1. Unauthenticated requests to /api/applications/my should be rejected
  await test("Unauthenticated request to /applications/my returns 401", async () => {
    const res = await fetch(`${BASE_URL}/applications/my`);
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
  });

  // 2. Institution A (PICT - inst-user-1) sees only its own applications
  await test("Institution A (inst-user-1, PICT) sees only its own applications", async () => {
    const res = await fetch(`${BASE_URL}/applications/my`, {
      headers: { "x-user-id": "inst-user-1" },
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data), "Expected response to be an array");
    for (const app of data) {
      assert.strictEqual(app.institutionId, "inst-001", `App ${app.applicationNumber} does not belong to inst-001`);
    }
  });

  // 3. Institution B (inst-user-1792931114917) gets only its own applications
  let instBAppId = null;
  await test("Institution B (inst-user-1792931114917) sees only its own applications", async () => {
    const res = await fetch(`${BASE_URL}/applications/my`, {
      headers: { "x-user-id": "inst-user-1792931114917" },
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data), "Expected response to be an array");
    assert(data.length > 0, "Expected non-zero applications for inst-user-1792931114917");
    instBAppId = data[0].id;
    for (const app of data) {
      assert.strictEqual(
        app.institutionId,
        "inst-1792931114917",
        `App ${app.applicationNumber} does not belong to inst-1792931114917`
      );
    }
  });

  // 4. Institution A cannot access Institution B's application details
  await test("Institution A cannot access Institution B's application details (403 Forbidden)", async () => {
    assert(instBAppId, "Expected valid application ID for Institution B");
    const res = await fetch(`${BASE_URL}/applications/${instBAppId}`, {
      headers: { "x-user-id": "inst-user-1" },
    });
    assert.strictEqual(res.status, 403, `Expected 403 Forbidden, got ${res.status}`);
  });

  // 5. Institution B can access its own application details
  await test("Institution B can access its own application details (200 OK)", async () => {
    assert(instBAppId, "Expected valid application ID for Institution B");
    const res = await fetch(`${BASE_URL}/applications/${instBAppId}`, {
      headers: { "x-user-id": "inst-user-1792931114917" },
    });
    assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.institutionId, "inst-1792931114917");
  });

  // 6. AICTE staff account querying /applications/my returns empty array
  await test("AICTE staff member querying /applications/my receives empty array", async () => {
    const res = await fetch(`${BASE_URL}/applications/my`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });
    assert.strictEqual(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data), "Expected array");
    assert.strictEqual(data.length, 0, "Expected AICTE staff to receive 0 applications in myApplications");
  });

  // 7. Dashboard metrics for Institution A match its actual count
  await test("Dashboard metrics for Institution A match its application count", async () => {
    const [metricsRes, myAppsRes] = await Promise.all([
      fetch(`${BASE_URL}/dashboard/metrics`, { headers: { "x-user-id": "inst-user-1" } }),
      fetch(`${BASE_URL}/applications/my`, { headers: { "x-user-id": "inst-user-1" } }),
    ]);
    assert.strictEqual(metricsRes.status, 200);
    assert.strictEqual(myAppsRes.status, 200);
    const metrics = await metricsRes.json();
    const myApps = await myAppsRes.json();
    assert.strictEqual(metrics.summary.total, myApps.length, `Metrics total (${metrics.summary.total}) must match myApps (${myApps.length})`);
  });

  // 8. Dashboard metrics for Institution B match its actual count
  await test("Dashboard metrics for Institution B match its application count", async () => {
    const [metricsRes, myAppsRes] = await Promise.all([
      fetch(`${BASE_URL}/dashboard/metrics`, { headers: { "x-user-id": "inst-user-1792931114917" } }),
      fetch(`${BASE_URL}/applications/my`, { headers: { "x-user-id": "inst-user-1792931114917" } }),
    ]);
    assert.strictEqual(metricsRes.status, 200);
    assert.strictEqual(myAppsRes.status, 200);
    const metrics = await metricsRes.json();
    const myApps = await myAppsRes.json();
    assert.strictEqual(metrics.summary.total, myApps.length, `Metrics total (${metrics.summary.total}) must match myApps (${myApps.length})`);
  });

  // 9. Profile switcher switches session correctly
  await test("POST /auth/switch-demo properly returns persona and sets session cookie", async () => {
    const res = await fetch(`${BASE_URL}/auth/switch-demo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: "inst-user-1" }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert(data.success, "Expected success true");
    assert.strictEqual(data.user.institutionId, "inst-001");
    assert.strictEqual(data.user.role, "institution");
  });

  console.log(`\nResults: ${passedTests}/${totalTests} tests passed.`);
  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
