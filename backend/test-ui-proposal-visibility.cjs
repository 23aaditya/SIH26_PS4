/**
 * Verification of Executed & Rejected Agent Deficiency Proposals Visibility
 * Tests that:
 * 1. Target application cmvtkyckt001lucbs57wihthn returns all actions (EXECUTED and REJECTED).
 * 2. EXECUTED action act-8dbc6ba400cb is enriched with official_notice_id, deficiency_cycle, approved_by, approved_at.
 * 3. REJECTED action act-464b57b10d44 contains rejection_reason and rejecting officer info.
 * 4. Duplicate approval attempts on EXECUTED actions are rejected with HTTP 400.
 * 5. Duplicate manual deficiency notices while application is in awaiting_institution are rejected with HTTP 400.
 * 6. Access control is enforced (unauthenticated requests rejected with 401).
 */

const assert = require("assert");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000/api";
const TARGET_APP_ID = "cmvtkyckt001lucbs57wihthn";

async function api(url, opts = {}) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function runTest() {
  console.log("=====================================================================");
  console.log("   UI PROPOSAL VISIBILITY & DUPLICATE PREVENTION REGRESSION TEST     ");
  console.log("=====================================================================\n");

  let passed = 0;
  let total = 0;

  function pass(title, detail) {
    passed++;
    total++;
    console.log(`  ✓ [PASS] ${title}: ${detail}`);
  }

  function fail(title, detail, err) {
    total++;
    console.error(`  ✗ [FAIL] ${title}: ${detail} ->`, err?.message || err);
  }

  // 1. Unauthenticated request rejected
  try {
    const unauth = await api(`${BACKEND_URL}/agent/applications/${TARGET_APP_ID}/actions`);
    assert.strictEqual(unauth.status, 401, "Expected 401 for unauthenticated request");
    pass("Auth Enforcement", "Unauthenticated request correctly rejected with HTTP 401.");
  } catch (e) {
    fail("Auth Enforcement", "Failed to reject unauthenticated request", e);
  }

  // 2. Authenticated query returns actions list
  let actions = [];
  try {
    const res = await api(`${BACKEND_URL}/agent/applications/${TARGET_APP_ID}/actions`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });
    assert.strictEqual(res.status, 200, "Expected 200 OK");
    assert(Array.isArray(res.data) && res.data.length >= 2, "Expected at least 2 actions");
    actions = res.data;
    pass("Actions Retrieval", `Successfully fetched ${actions.length} agent actions for application.`);
  } catch (e) {
    fail("Actions Retrieval", "Failed to retrieve actions", e);
  }

  // 3. Inspect EXECUTED action act-8dbc6ba400cb
  try {
    const executed = actions.find((a) => a.action_id === "act-8dbc6ba400cb");
    assert(executed, "act-8dbc6ba400cb not found in actions list");
    assert.strictEqual(executed.status, "EXECUTED", "Status must be EXECUTED");
    assert.strictEqual(executed.approved_by, "DEMO-AIC-034", "Approver must be DEMO-AIC-034");
    assert(executed.approved_at, "Must have approval timestamp");
    assert.strictEqual(executed.official_notice_id, "cmvtpzjm30003ucr4qf565quv", "Must link to official notice ID");
    assert.strictEqual(executed.deficiency_cycle, 1, "Must link to Deficiency Cycle #1");
    assert.strictEqual(executed.deficiency_status, "pending", "Must have deficiency status 'pending'");
    assert(executed.input_payload.draft_notice.items.length > 0, "Must contain structured items");
    pass("Executed Action Enrichment", `act-8dbc6ba400cb enriched with official notice (${executed.official_notice_id}), Cycle #${executed.deficiency_cycle}, and approver.`);
  } catch (e) {
    fail("Executed Action Enrichment", "Failed to verify executed action details", e);
  }

  // 4. Inspect REJECTED action act-464b57b10d44
  try {
    const rejected = actions.find((a) => a.action_id === "act-464b57b10d44");
    assert(rejected, "act-464b57b10d44 not found in actions list");
    assert.strictEqual(rejected.status, "REJECTED", "Status must be REJECTED");
    assert(rejected.rejection_reason && rejected.rejection_reason.length > 5, "Must contain recorded rejection reason");
    pass("Rejected Action Audit", `act-464b57b10d44 preserved with rejection reason: "${rejected.rejection_reason.slice(0, 50)}..."`);
  } catch (e) {
    fail("Rejected Action Audit", "Failed to verify rejected action details", e);
  }

  // 5. Duplicate Approval Prevention on Executed Action
  try {
    const dupApprove = await api(`${BACKEND_URL}/agent/applications/${TARGET_APP_ID}/actions/act-8dbc6ba400cb/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "DEMO-AIC-034",
      },
      body: JSON.stringify({ notes: "Attempt re-approving executed notice" }),
    });
    assert.strictEqual(dupApprove.status, 400, "Expected HTTP 400 for duplicate approval");
    assert(dupApprove.data.error.includes("EXECUTED"), "Error should state action is already EXECUTED");
    pass("Duplicate Approval Guard", `Duplicate approval rejected (HTTP 400): ${dupApprove.data.error}`);
  } catch (e) {
    fail("Duplicate Approval Guard", "Failed to reject duplicate approval", e);
  }

  // 6. Duplicate Manual Deficiency Notice Prevention
  try {
    const dupDef = await api(`${BACKEND_URL}/aicte/scrutiny/applications/${TARGET_APP_ID}/deficiencies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "DEMO-AIC-034",
      },
      body: JSON.stringify({
        deficiencyCategory: "Statutory",
        deficiencyText: "Duplicate attempt while notice active",
        dueDays: 10,
      }),
    });
    assert.strictEqual(dupDef.status, 400, "Expected HTTP 400 for duplicate deficiency");
    assert(
      dupDef.data.code === "DEFICIENCY_ALREADY_ACTIVE" || dupDef.data.code === "DEFICIENCY_ALREADY_PENDING",
      "Expected duplicate prevention code"
    );
    pass("Duplicate Notice Guard", `Duplicate deficiency creation rejected (HTTP 400): ${dupDef.data.error}`);
  } catch (e) {
    fail("Duplicate Notice Guard", "Failed to reject duplicate deficiency notice", e);
  }

  console.log(`\n=====================================================================`);
  console.log(`   RESULTS: ${passed}/${total} TESTS PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log(`=====================================================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runTest().catch((err) => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
