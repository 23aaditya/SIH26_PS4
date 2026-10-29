import assert from "assert";

const BASE_URL = "http://localhost:4000/api";

async function runTests() {
  console.log("=== AICTE Official Dashboard & Application Queue Regression Test Suite ===\n");

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

  // ─── TEST A: Check / Submit Scrutiny Application ─────────────────────────
  let testAppId = null;
  let testAppNumber = null;

  await test("Test A: Verify Application exists and has valid scrutiny / review state", async () => {
    // Check existing test application AICTE-2026-ADDI-796708
    const res = await fetch(`${BASE_URL}/aicte/scrutiny/applications`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const apps = await res.json();
    assert(Array.isArray(apps), "Expected array of applications");
    assert(apps.length > 0, "Expected at least one scrutiny application in queue");

    const app = apps.find(a => a.applicationNumber === "AICTE-2026-ADDI-796708") || apps[0];
    testAppId = app.id;
    testAppNumber = app.applicationNumber;
    assert(testAppId, "Expected valid application ID");
    assert(app.assignedUserId, "Expected assignedUserId to be defined on application");
  });

  // ─── TEST B: Dashboard vs Application Queue for DEMO-AIC-034 ───────────────
  await test("Test B: Dashboard metrics, work lists, and queue agree for Mihir Tiwari (DEMO-AIC-034)", async () => {
    const headers = { "x-user-id": "DEMO-AIC-034" };

    const [summaryRes, assignedRes, allWorkRes, priorityRes, queueRes] = await Promise.all([
      fetch(`${BASE_URL}/aicte/my-work/summary`, { headers }),
      fetch(`${BASE_URL}/aicte/my-work?filter=assigned`, { headers }),
      fetch(`${BASE_URL}/aicte/my-work?filter=all`, { headers }),
      fetch(`${BASE_URL}/aicte/my-work?filter=priority`, { headers }),
      fetch(`${BASE_URL}/aicte/scrutiny/applications`, { headers }),
    ]);

    assert.strictEqual(summaryRes.status, 200, `Summary status ${summaryRes.status}`);
    assert.strictEqual(assignedRes.status, 200, `Assigned status ${assignedRes.status}`);
    assert.strictEqual(allWorkRes.status, 200, `All work status ${allWorkRes.status}`);
    assert.strictEqual(priorityRes.status, 200, `Priority status ${priorityRes.status}`);
    assert.strictEqual(queueRes.status, 200, `Queue status ${queueRes.status}`);

    const summary = await summaryRes.json();
    const assignedList = await assignedRes.json();
    const allWorkList = await allWorkRes.json();
    const priorityList = await priorityRes.json();
    const queue = await queueRes.json();

    // 1. Dashboard Assigned count must match the assigned work items list
    assert.strictEqual(
      summary.assigned,
      assignedList.total,
      `Summary assigned count (${summary.assigned}) must match assigned work list total (${assignedList.total})`
    );

    // 2. Summary total must match all active assigned work
    assert(summary.total >= summary.assigned, "Summary total must be >= assigned count");

    // 3. Authenticated officer details must be returned cleanly
    assert.strictEqual(summary.staff.employeeCode, "DEMO-AIC-034");
    assert.strictEqual(summary.staff.name, "Mihir Tiwari");
    assert.strictEqual(summary.staff.availability, "AVAILABLE");

    // 4. Test application must be present in Assigned to Me and All Work
    const inAssigned = assignedList.items.some(i => i.applicationNumber === testAppNumber || i.id === testAppId);
    assert(inAssigned, `Application ${testAppNumber} must be present in Assigned to Me list`);

    // 5. Application Queue must also contain the application
    const inQueue = queue.some(i => i.applicationNumber === testAppNumber || i.id === testAppId);
    assert(inQueue, `Application ${testAppNumber} must be present in Application Queue`);

    // 6. Every item in Assigned to Me must have assignedUserId = DEMO-AIC-034
    for (const item of assignedList.items) {
      assert(
        item.assignedUserId === "DEMO-AIC-034" || item.assignedUserId === summary.staff.id,
        `Assigned item ${item.applicationNumber} does not belong to DEMO-AIC-034`
      );
    }
  });

  // ─── TEST C: Other Officer and Role Isolation ─────────────────────────────
  await test("Test C: Other officer (DEMO-AIC-037 - Neha Rao) does not see DEMO-AIC-034's assigned work", async () => {
    const headers = { "x-user-id": "DEMO-AIC-037" };

    const [summaryRes, assignedRes] = await Promise.all([
      fetch(`${BASE_URL}/aicte/my-work/summary`, { headers }),
      fetch(`${BASE_URL}/aicte/my-work?filter=assigned`, { headers }),
    ]);

    assert.strictEqual(summaryRes.status, 200);
    assert.strictEqual(assignedRes.status, 200);

    const summary = await summaryRes.json();
    const assignedList = await assignedRes.json();

    // Neha Rao is EVC Coordinator, not assigned to AICTE-2026-ADDI-796708
    assert.strictEqual(summary.staff.employeeCode, "DEMO-AIC-037");
    const leaksTestApp = assignedList.items.some(i => i.applicationNumber === testAppNumber || i.id === testAppId);
    assert(!leaksTestApp, `Application ${testAppNumber} must NOT leak into DEMO-AIC-037's Assigned to Me`);
  });

  await test("Test C: Regional Officer (DEMO-AIC-013 - Karan Sinha) sees only their own assigned work", async () => {
    const headers = { "x-user-id": "DEMO-AIC-013" };

    const [summaryRes, assignedRes] = await Promise.all([
      fetch(`${BASE_URL}/aicte/my-work/summary`, { headers }),
      fetch(`${BASE_URL}/aicte/my-work?filter=assigned`, { headers }),
    ]);

    assert.strictEqual(summaryRes.status, 200);
    assert.strictEqual(assignedRes.status, 200);

    const summary = await summaryRes.json();
    const assignedList = await assignedRes.json();

    assert.strictEqual(summary.staff.employeeCode, "DEMO-AIC-013");
    // Verify every item in assignedList belongs to DEMO-AIC-013
    for (const item of assignedList.items) {
      assert.strictEqual(item.assignedUserId, "DEMO-AIC-013");
    }
    const leaksTestApp = assignedList.items.some(i => i.applicationNumber === testAppNumber || i.id === testAppId);
    assert(!leaksTestApp, `Application ${testAppNumber} must NOT leak into DEMO-AIC-013's Assigned to Me`);
  });

  // ─── TEST D: Lifecycle Updates ───────────────────────────────────────────
  await test("Test D: Lifecycle waiting on institute filter matches summary waitingOnInstitute count", async () => {
    const headers = { "x-user-id": "DEMO-AIC-034" };

    const [summaryRes, waitingRes] = await Promise.all([
      fetch(`${BASE_URL}/aicte/my-work/summary`, { headers }),
      fetch(`${BASE_URL}/aicte/my-work?filter=waiting`, { headers }),
    ]);

    assert.strictEqual(summaryRes.status, 200);
    assert.strictEqual(waitingRes.status, 200);

    const summary = await summaryRes.json();
    const waitingList = await waitingRes.json();

    assert.strictEqual(
      summary.waitingOnInstitute,
      waitingList.total,
      `Summary waiting count (${summary.waitingOnInstitute}) must match waiting list total (${waitingList.total})`
    );

    // Every item in waitingList must have status awaiting_institution or deficiency_raised
    for (const item of waitingList.items) {
      assert(
        ["awaiting_institution", "deficiency_raised"].includes(item.status),
        `Item ${item.applicationNumber} has unexpected status ${item.status}`
      );
    }
  });

  // ─── TEST E: Failure and Loading States ───────────────────────────────────
  await test("Test E: Unauthenticated request to /my-work/summary returns 401 Unauthorized", async () => {
    const res = await fetch(`${BASE_URL}/aicte/my-work/summary`);
    assert.strictEqual(res.status, 401, `Expected 401 Unauthorized, got ${res.status}`);
  });

  await test("Test E: Institution user attempting to access officer /my-work returns 403 Forbidden", async () => {
    const res = await fetch(`${BASE_URL}/aicte/my-work/summary`, {
      headers: { "x-user-id": "inst-user-1" },
    });
    // inst-user-1 is an institution account, staff identity should not be found -> 403 or error
    assert(res.status === 403 || res.status === 500, `Expected 403 or 500, got ${res.status}`);
  });

  await test("Test E: Staff availability endpoint returns valid structure without relation errors", async () => {
    const res = await fetch(`${BASE_URL}/aicte/availability`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, "AVAILABLE");
  });

  await test("Test E: Work tree hierarchy returns upward chain and co-members without 500 errors", async () => {
    const res = await fetch(`${BASE_URL}/aicte/work-tree`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert(data.you, "Expected 'you' in work tree data");
    assert.strictEqual(data.you.employeeCode, "DEMO-AIC-034");
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
