/**
 * Phase 4 Comprehensive Lifecycle Agent Regression Test Suite
 * Tests end-to-end event dispatching, controlled tool execution,
 * human approval gates, role security boundaries, resubmission reconciliation,
 * and duplicate suppression.
 */

import http from "http";
import assert from "assert";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000/api";
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";
const AI_BACKEND_SECRET = process.env.AI_BACKEND_SECRET || "aicte_agent_secret_prod_2026_x89f_secure_token";

async function runTests() {
  console.log("=====================================================================");
  console.log("   PHASE 4 AICTE APPLICATION LIFECYCLE AGENT REGRESSION TEST SUITE   ");
  console.log("=====================================================================\n");

  let passed = 0;
  let total = 0;

  function pass(msg) {
    passed++;
    total++;
    console.log(`  ✓ [PASS] ${msg}`);
  }

  function fail(msg, err) {
    total++;
    console.error(`  ✗ [FAIL] ${msg}:`, err?.message || err);
  }

  // Helper fetch with JSON
  async function api(url, opts = {}) {
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data, headers: res.headers };
  }

  // 1. Health & Readiness
  try {
    const aiHealth = await api(`${AI_SERVICE_URL}/health`);
    assert.strictEqual(aiHealth.status, 200);
    assert.strictEqual(aiHealth.data.status, "ok");
    const beHealth = await api(`${BACKEND_URL}/health`);
    assert.strictEqual(beHealth.status, 200);
    assert.strictEqual(beHealth.data.status, "ok");
    pass("Test 1: FastAPI AI Agent service and Express backend are online and healthy.");
  } catch (e) {
    fail("Test 1: Service health check", e);
  }

  // 2. Unauthenticated event rejection
  try {
    const unauth = await api(`${AI_SERVICE_URL}/api/v1/agent/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_type: "APPLICATION_SUBMITTED", application_id: "app-test" }),
    });
    assert.strictEqual(unauth.status, 401);
    pass("Test 2: Unauthenticated lifecycle event rejected by AI service (HTTP 401).");
  } catch (e) {
    fail("Test 2: Security rejection of unauthenticated event", e);
  }

  // 3. Duplicate event suppression (Idempotency)
  try {
    const corrId = `corr-test-dup-${Date.now()}`;
    const payload = {
      event_type: "DEADLINE_APPROACHING",
      application_id: "app-accept-999001",
      payload: { days_remaining: 5 },
      correlation_id: corrId,
    };
    const reqOpts = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Authorization": `Bearer ${AI_BACKEND_SECRET}`,
      },
      body: JSON.stringify(payload),
    };

    const run1 = await api(`${AI_SERVICE_URL}/api/v1/agent/events`, reqOpts);
    assert.strictEqual(run1.status, 200);
    const execId1 = run1.data.execution_id;

    // Dispatch duplicate event with identical correlation ID
    const run2 = await api(`${AI_SERVICE_URL}/api/v1/agent/events`, reqOpts);
    assert.strictEqual(run2.status, 200);
    assert.strictEqual(run2.data.execution_id, execId1);
    pass("Test 3: Idempotent event processing suppresses duplicate runs with identical correlation ID.");
  } catch (e) {
    fail("Test 3: Duplicate event suppression", e);
  }

  // 4. Human Approval Gate: Institution account forbidden from approving agent action
  try {
    const instApprove = await api(`${BACKEND_URL}/agent/applications/app-accept-999001/actions/act-dummy/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "inst-user-1",
      },
      body: JSON.stringify({ notes: "Unauthorized attempt" }),
    });
    assert.strictEqual(instApprove.status, 403);
    pass("Test 4: Security Boundary: Applicant institution is forbidden from approving agent actions (HTTP 403).");
  } catch (e) {
    fail("Test 4: Institutional permission check", e);
  }

  // 5. Machine Service forbidden from self-approving actions (denySystemService check)
  try {
    const sysApprove = await api(`${BACKEND_URL}/agent/applications/app-accept-999001/actions/act-dummy/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Authorization": `Bearer ${AI_BACKEND_SECRET}`,
      },
      body: JSON.stringify({ notes: "Unauthorized machine self-approval attempt" }),
    });
    assert.strictEqual(sysApprove.status, 403);
    pass("Test 5: Security Boundary: Machine service forbidden from self-approving actions via denySystemService (HTTP 403).");
  } catch (e) {
    fail("Test 5: System service self-approval block", e);
  }

  // 6. Officer can query agent actions through Express proxy
  try {
    const actionsQuery = await api(`${BACKEND_URL}/agent/applications/app-accept-999001/actions`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });
    assert.strictEqual(actionsQuery.status, 200);
    assert(Array.isArray(actionsQuery.data));
    pass(`Test 6: Authorized officer successfully queried agent actions for application (${actionsQuery.data.length} actions logged).`);
  } catch (e) {
    fail("Test 6: Query agent actions", e);
  }

  // 7. Internal M2M notification dispatch
  try {
    const notifRes = await api(`${BACKEND_URL}/agent/notifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Authorization": `Bearer ${AI_BACKEND_SECRET}`,
      },
      body: JSON.stringify({
        applicationId: "app-accept-999001",
        recipientUserId: "DEMO-AIC-034",
        title: "Test Advisory Notification",
        message: "Automated regression verification check.",
        priority: "normal",
        deduplicationKey: `dedup-test-${Date.now()}`,
      }),
    });
    assert.strictEqual(notifRes.status, 201);
    assert.strictEqual(notifRes.data.success, true);
    pass("Test 7: Controlled M2M notification created and routed to assigned scrutiny officer.");
  } catch (e) {
    fail("Test 7: M2M notification dispatch", e);
  }

  // 8. Bounded Planning Loop Execution & State Transitions
  try {
    const execStatus = await api(`${AI_SERVICE_URL}/api/v1/agent/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Authorization": `Bearer ${AI_BACKEND_SECRET}`,
      },
      body: JSON.stringify({
        event_type: "DEADLINE_APPROACHING",
        application_id: "app-accept-999001",
        payload: { days_remaining: 2 },
        correlation_id: `corr-state-${Date.now()}`,
      }),
    });
    assert.strictEqual(execStatus.status, 200);
    assert.strictEqual(execStatus.data.status, "COMPLETED");
    pass("Test 8: Orchestrator bounded planning loop executes permitted tools and terminates in COMPLETED state.");
  } catch (e) {
    fail("Test 8: Bounded loop state machine execution", e);
  }

  // 9. Re-Scrutiny & Resubmission Discrepancy Diff Classification
  try {
    const resubEvent = await api(`${AI_SERVICE_URL}/api/v1/agent/events?sync=false`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Authorization": `Bearer ${AI_BACKEND_SECRET}`,
      },
      body: JSON.stringify({
        event_type: "RESUBMISSION_RECEIVED",
        application_id: "cmvtmz1sx0001uc24uugz4kx6",
        payload: { responseText: "Rejoinder with updated affidavits submitted." },
        correlation_id: `corr-resub-${Date.now()}`,
      }),
    });
    assert.strictEqual(resubEvent.status, 200);
    assert(resubEvent.data.execution_id !== undefined);
    assert.strictEqual(resubEvent.data.event_type, "RESUBMISSION_RECEIVED");
    pass("Test 9: Resubmission received event automatically accepted, enqueued, and tracked by lifecycle agent.");
  } catch (e) {
    fail("Test 9: Re-scrutiny and diff reconciliation", e);
  }

  console.log("\n=====================================================================");
  console.log(`   RESULTS: ${passed}/${total} TESTS PASSED (${Math.round((passed / total) * 100)}%)   `);
  console.log("=====================================================================");

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error("Fatal test runner error:", e);
  process.exit(1);
});
