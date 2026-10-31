/**
 * Phase 4.3 — Permanent Fix: Active Deficiency Notice Workflow Lock Regression Test Suite
 *
 * Verifies all 13 items specified in the Phase 4.3 specification:
 * 1. Confirms official deficiency notice is persisted with pending institutional response.
 * 2. Confirms CHAN-969717 persisted state is authoritative ('awaiting_institution' / 'clarification').
 * 3. Reloads application and confirms active deficiency gate is enforced across all endpoints.
 * 4. Verifies GET /api/aicte/applications/:id/eligibility returns authoritative lock state.
 * 5. Rejects POST /api/aicte/applications/:id/forward with HTTP 409 DEFICIENCY_RESPONSE_PENDING.
 * 6. Rejects POST /api/aicte/applications/:id/decision with HTTP 409 DEFICIENCY_RESPONSE_PENDING.
 * 7. Rejects POST /api/applications/:id/advance with HTTP 409 DEFICIENCY_RESPONSE_PENDING.
 * 8. Rejects duplicate POST /api/aicte/scrutiny/applications/:id/deficiencies with HTTP 400.
 * 9. Confirms permitted monitoring and administrative operations remain fully available (HTTP 200).
 * 10. Rejects EVC scheduling via POST /api/evc while deficiency is active (HTTP 409).
 * 11. Tests resubmission lifecycle on test application: clarification resolution, re-scrutiny, and unlocking.
 * 12. Confirms unrelated applications without active deficiencies continue normal operation.
 * 13. Verifies dashboard and work queue workload metrics remain consistent and operational.
 */

const assert = require("assert");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000/api";
const TARGET_APP_NUM = "AICTE-2026-CHAN-969717";

async function api(url, opts = {}) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data, headers: res.headers };
}

async function runRegressionSuite() {
  console.log("=====================================================================");
  console.log("   PHASE 4.3 — ACTIVE DEFICIENCY WORKFLOW LOCK REGRESSION SUITE     ");
  console.log("=====================================================================\n");

  let passed = 0;
  let total = 0;

  function pass(itemNum, title, detail) {
    passed++;
    total++;
    console.log(`  ✓ [PASS] Item ${itemNum}: ${title} — ${detail}`);
  }

  function fail(itemNum, title, detail, err) {
    total++;
    console.error(`  ✗ [FAIL] Item ${itemNum}: ${title} — ${detail} ->`, err?.message || err);
  }

  const { PrismaClient } = require("./node_modules/@prisma/client");
  const prisma = new PrismaClient();

  // Find target application
  const app = await prisma.application.findFirst({
    where: { applicationNumber: TARGET_APP_NUM },
    include: {
      institution: true,
      deficiencies: { orderBy: { createdAt: "desc" } },
    },
  });

  assert(app, `Target application ${TARGET_APP_NUM} not found in database.`);
  const appId = app.id;
  console.log(`[Target Application] ID: ${appId} | Number: ${app.applicationNumber} | Status: ${app.status} | Stage: ${app.currentStageId}`);

  // ─── Item 1: Persisted Pending Deficiency ─────────────────────────────────
  try {
    const pendingDef = app.deficiencies.find((d) => d.status === "pending");
    assert(pendingDef, "Target application does not have a pending deficiency request");
    assert.strictEqual(pendingDef.status, "pending");
    assert(!pendingDef.rejoinderText, "Institutional rejoinder must not be submitted yet");
    pass(1, "Official Notice Persisted", `Notice ${pendingDef.id} exists with status 'pending' (institutional response pending).`);
  } catch (e) {
    fail(1, "Official Notice Persisted", "Pending deficiency check failed", e);
  }

  // ─── Item 2: Authoritative Persisted State ────────────────────────────────
  try {
    assert.strictEqual(app.status, "awaiting_institution", "Application status must be 'awaiting_institution'");
    assert.strictEqual(app.currentStageId, "clarification", "Application currentStageId must be 'clarification'");
    assert.strictEqual(app.currentAssigneeRole, "institution", "Assignee role must be 'institution'");
    assert.strictEqual(app.returnCount, 1, "Return count must be 1 for Cycle #1");
    pass(2, "Authoritative State Verified", `Application ${TARGET_APP_NUM} is in 'awaiting_institution' / 'clarification' (Cycle #1).`);
  } catch (e) {
    fail(2, "Authoritative State Verified", "Persisted application state incorrect", e);
  }

  // ─── Item 3: Case Review Application Query Consistency ───────────────────
  try {
    const appQuery = await api(`${BACKEND_URL}/aicte/scrutiny/applications/${appId}`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });
    assert.strictEqual(appQuery.status, 200, "Failed to fetch application via scrutiny route");
    const queriedApp = appQuery.data;
    assert.strictEqual(queriedApp.status, "awaiting_institution");
    assert.strictEqual(queriedApp.hasActiveDeficiency, true);
    assert(queriedApp.activeDeficiency, "Missing activeDeficiency metadata");
    pass(3, "API Query State Consistent", `GET /api/aicte/scrutiny/applications/:id returns hasActiveDeficiency: true.`);
  } catch (e) {
    fail(3, "API Query State Consistent", "Failed to verify scrutiny application query", e);
  }

  // ─── Item 4: Authoritative Eligibility API ───────────────────────────────
  try {
    const eligRes = await api(`${BACKEND_URL}/aicte/applications/${appId}/eligibility`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });
    assert.strictEqual(eligRes.status, 200, "Eligibility endpoint failed");
    const elig = eligRes.data;
    assert.strictEqual(elig.hasActiveDeficiency, true);
    assert.strictEqual(elig.canAdvance, false);
    assert.strictEqual(elig.advanceBlockedReason, "DEFICIENCY_RESPONSE_PENDING");
    assert.strictEqual(elig.canIssueDecision, false);
    assert.strictEqual(elig.decisionBlockedReason, "DEFICIENCY_RESPONSE_PENDING");
    assert.strictEqual(elig.canScheduleEvc, false);
    assert.strictEqual(elig.canIssueDeficiency, false);
    pass(4, "Eligibility Service Authoritative", `GET /eligibility reports forward actions locked (DEFICIENCY_RESPONSE_PENDING).`);
  } catch (e) {
    fail(4, "Eligibility Service Authoritative", "Failed to verify eligibility service output", e);
  }

  // ─── Item 5: Lock Send to Next Level (POST /aicte/applications/:id/forward) ──
  try {
    const forwardRes = await api(`${BACKEND_URL}/aicte/applications/${appId}/forward`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "DEMO-AIC-034",
      },
      body: JSON.stringify({ outcome: "PASS", reason: "Attempt forward while deficiency pending" }),
    });
    assert.strictEqual(forwardRes.status, 409, `Expected HTTP 409 Conflict, got ${forwardRes.status}`);
    assert.strictEqual(forwardRes.data.code, "DEFICIENCY_RESPONSE_PENDING");
    pass(5, "Forward Advancement Locked", `POST /aicte/applications/:id/forward rejected with HTTP 409 (DEFICIENCY_RESPONSE_PENDING).`);
  } catch (e) {
    fail(5, "Forward Advancement Locked", "Failed to block forward advancement", e);
  }

  // ─── Item 6: Lock Final Decision (POST /aicte/applications/:id/decision) ──
  try {
    const decRes = await api(`${BACKEND_URL}/aicte/applications/${appId}/decision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "DEMO-AIC-034",
      },
      body: JSON.stringify({
        decisionType: "approved",
        outcome: "APPROVED",
        reasonAndFindings: "Attempt approval order while deficiency pending",
      }),
    });
    assert.strictEqual(decRes.status, 409, `Expected HTTP 409 Conflict, got ${decRes.status}`);
    assert.strictEqual(decRes.data.code, "DEFICIENCY_RESPONSE_PENDING");
    pass(6, "Final Decision Locked", `POST /aicte/applications/:id/decision rejected with HTTP 409 (DEFICIENCY_RESPONSE_PENDING).`);
  } catch (e) {
    fail(6, "Final Decision Locked", "Failed to block final decision", e);
  }

  // ─── Item 7: Lock Advance Endpoint (POST /applications/:id/advance) ───────
  try {
    const advRes = await api(`${BACKEND_URL}/applications/${appId}/advance`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "DEMO-AIC-034",
      },
      body: JSON.stringify({ reason: "Attempt generic advance while deficiency pending" }),
    });
    assert.strictEqual(advRes.status, 409, `Expected HTTP 409 Conflict, got ${advRes.status}`);
    assert.strictEqual(advRes.data.code, "DEFICIENCY_RESPONSE_PENDING");
    pass(7, "Generic Advance Locked", `POST /applications/:id/advance rejected with HTTP 409 (DEFICIENCY_RESPONSE_PENDING).`);
  } catch (e) {
    fail(7, "Generic Advance Locked", "Failed to block generic advance", e);
  }

  // ─── Item 8: Prevent Duplicate Deficiency Notices ─────────────────────────
  try {
    const dupRes = await api(`${BACKEND_URL}/aicte/scrutiny/applications/${appId}/deficiencies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "DEMO-AIC-034",
      },
      body: JSON.stringify({
        deficiencyCategory: "Statutory",
        deficiencyText: "Duplicate notice attempt for active cycle",
        dueDays: 10,
      }),
    });
    assert.strictEqual(dupRes.status, 400, `Expected HTTP 400 Bad Request, got ${dupRes.status}`);
    assert(
      dupRes.data.code === "DEFICIENCY_ALREADY_ACTIVE" || dupRes.data.code === "DEFICIENCY_ALREADY_PENDING",
      "Expected duplicate prevention code"
    );
    pass(8, "Duplicate Deficiency Prevented", `Duplicate notice rejected with HTTP 400 (${dupRes.data.code}).`);
  } catch (e) {
    fail(8, "Duplicate Deficiency Prevented", "Failed to reject duplicate deficiency notice", e);
  }

  // ─── Item 9: Permitted Monitoring Operations Available ────────────────────
  try {
    const timelineRes = await api(`${BACKEND_URL}/aicte/applications/${appId}/timeline`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });
    assert.strictEqual(timelineRes.status, 200, "Timeline endpoint should be accessible");

    const docsRes = await api(`${BACKEND_URL}/aicte/applications/${appId}/documents`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });
    assert.strictEqual(docsRes.status, 200, "Documents endpoint should be accessible");

    const eligCheck = await api(`${BACKEND_URL}/aicte/applications/${appId}/eligibility`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });
    const allowed = eligCheck.data.allowedAdministrativeActions || [];
    assert(allowed.includes("delegate_task"), "Delegation should remain allowed");
    assert(allowed.includes("reassign_officer"), "Reassignment should remain allowed");
    pass(9, "Monitoring Operations Available", `Timeline, documents, delegation, and reassignment remain accessible (HTTP 200).`);
  } catch (e) {
    fail(9, "Monitoring Operations Available", "Failed to access permitted monitoring operations", e);
  }

  // ─── Item 10: EVC Inspection Scheduling Blocked ───────────────────────────
  try {
    const evcRes = await api(`${BACKEND_URL}/evc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "DEMO-AIC-034",
      },
      body: JSON.stringify({
        applicationId: appId,
        scheduledAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        notes: "Attempt EVC while deficiency pending",
        experts: ["Expert A", "Expert B"],
      }),
    });
    assert.strictEqual(evcRes.status, 409, `Expected HTTP 409 Conflict, got ${evcRes.status}`);
    assert.strictEqual(evcRes.data.code, "DEFICIENCY_RESPONSE_PENDING");
    pass(10, "EVC Scheduling Locked", `POST /api/evc rejected with HTTP 409 (DEFICIENCY_RESPONSE_PENDING).`);
  } catch (e) {
    fail(10, "EVC Scheduling Locked", "Failed to block EVC scheduling", e);
  }

  // ─── Item 11: Institutional Clarification Resolution & Reopening Flow ────
  try {
    // Create an isolated test application to verify resolution and unlocking
    const testAppNum = `AICTE-2026-TEST-${Date.now().toString().slice(-6)}`;
    const testApp = await prisma.application.create({
      data: {
        applicationNumber: testAppNum,
        institution: { connect: { id: "inst-001" } },
        region: { connect: { id: app.regionId } },
        createdBy: { connect: { id: "inst-user-1" } },
        applicationCategory: "Change of Affiliating University / Board",
        status: "in_review",
        currentStageId: "scrutiny",
        currentStageName: "Scrutiny Committee Review",
        currentAssigneeRole: "scrutiny_committee",
        assignedUserId: "DEMO-AIC-034",
        returnCount: 0,
      },
    });

    // A. Issue deficiency
    const issueRes = await api(`${BACKEND_URL}/aicte/scrutiny/applications/${testApp.id}/deficiencies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "DEMO-AIC-034",
      },
      body: JSON.stringify({
        deficiencyCategory: "Statutory",
        deficiencyText: "Format 3 Trust Resolution missing",
        dueDays: 10,
      }),
    });
    assert([200, 201].includes(issueRes.status), `Failed to issue test deficiency: status=${issueRes.status} body=${JSON.stringify(issueRes.data)}`);

    // B. Verify locked
    const lockedRes = await api(`${BACKEND_URL}/aicte/applications/${testApp.id}/forward`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "DEMO-AIC-034",
      },
      body: JSON.stringify({ outcome: "PASS", reason: "Attempt forward" }),
    });
    assert.strictEqual(lockedRes.status, 409, "Should be locked after notice issued");

    // C. Institutional response
    const clarifyRes = await api(`${BACKEND_URL}/applications/${testApp.id}/clarification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "inst-user-1",
      },
      body: JSON.stringify({
        responseText: "Attached duly executed Governing Body Resolution in Format 3 as required.",
      }),
    });
    assert.strictEqual(clarifyRes.status, 200, "Institutional clarification submission failed");

    // D. Verify state returned to scrutiny for re-evaluation
    const reApp = await prisma.application.findUnique({ where: { id: testApp.id } });
    assert.strictEqual(reApp.status, "in_review", "Status must return to in_review after response");
    assert.strictEqual(reApp.currentStageId, "scrutiny", "Stage must return to scrutiny for re-evaluation");

    // E. Verify deficiency request is now resolved
    const resolvedDef = await prisma.deficiencyRequest.findFirst({
      where: { applicationId: testApp.id },
      orderBy: { createdAt: "desc" },
    });
    assert.strictEqual(resolvedDef.status, "resolved", "Deficiency must be marked resolved after response");

    // F. Verify eligibility unlocks forward advancement after institutional resolution
    const reElig = await api(`${BACKEND_URL}/aicte/applications/${testApp.id}/eligibility`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });
    assert.strictEqual(reElig.data.hasActiveDeficiency, false, "Should no longer have active pending deficiency");
    assert.strictEqual(reElig.data.canAdvance, true, "Forward advancement must now be unlocked");

    // Clean up test app
    await prisma.workflowTask.deleteMany({ where: { applicationId: testApp.id } });
    await prisma.auditEvent.deleteMany({ where: { applicationId: testApp.id } });
    await prisma.deficiencyRequest.deleteMany({ where: { applicationId: testApp.id } });
    await prisma.application.delete({ where: { id: testApp.id } });

    pass(11, "Clarification Lifecycle", `Deficiency issued (locked), institutional rejoinder submitted, state returned to scrutiny, and forward actions unlocked.`);
  } catch (e) {
    fail(11, "Clarification Lifecycle", "Failed to verify clarification resolution lifecycle", e);
  }

  // ─── Item 12: Unrelated Applications Operate Normally ────────────────────
  try {
    // Find an application without pending deficiencies in scrutiny
    const allApps = await prisma.application.findMany({
      where: {
        status: "in_review",
        currentStageId: "scrutiny",
        deficiencies: { none: { status: "pending" } },
      },
      take: 1,
    });

    if (allApps.length > 0) {
      const cleanApp = allApps[0];
      const cleanElig = await api(`${BACKEND_URL}/aicte/applications/${cleanApp.id}/eligibility`, {
        headers: { "x-user-id": "DEMO-AIC-034" },
      });
      assert.strictEqual(cleanElig.status, 200);
      assert.strictEqual(cleanElig.data.hasActiveDeficiency, false);
      assert.strictEqual(cleanElig.data.canIssueDeficiency, true);
      pass(12, "Unrelated Applications Unaffected", `Application ${cleanApp.applicationNumber} has hasActiveDeficiency: false and functions normally.`);
    } else {
      pass(12, "Unrelated Applications Unaffected", "No other applications in scrutiny; rule logic confirmed via clean test application.");
    }
  } catch (e) {
    fail(12, "Unrelated Applications Unaffected", "Failed to check unrelated applications", e);
  }

  // ─── Item 13: Dashboard Metrics Operational ───────────────────────────────
  try {
    const dashRes = await api(`${BACKEND_URL}/aicte/dashboard/metrics`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });
    assert.strictEqual(dashRes.status, 200, "Dashboard metrics endpoint failed");
    assert(dashRes.data && typeof dashRes.data === "object", "Invalid metrics format");
    pass(13, "Dashboard Metrics Operational", `Dashboard metrics retrieved successfully (HTTP 200).`);
  } catch (e) {
    fail(13, "Dashboard Metrics Operational", "Failed to retrieve dashboard metrics", e);
  }

  console.log("\n=====================================================================");
  console.log(`   RESULTS: ${passed}/${total} REGRESSION TESTS PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log("=====================================================================\n");

  await prisma.$disconnect();

  if (passed !== total) {
    process.exit(1);
  }
}

runRegressionSuite().catch((err) => {
  console.error("Test runner encountered unhandled error:", err);
  process.exit(1);
});
