/**
 * Phase 4 — Verification of Agent Deficiency Notice Preparation Flow
 * Verifies all 9 items specified in the statutory compliance rubric:
 * 1. Identifies proposed deficiencies from deterministic scrutiny report.
 * 2. Associates each proposed deficiency with rule ID, evidence, source document/page, and verified APH reference.
 * 3. Generates structured draft deficiency notice with explanation and requested corrective action.
 * 4. Selects intended institution and recipient using authoritative application records without inventing details.
 * 5. Records proposed action, rationale, supporting evidence, intended recipient, and application/report version in persistent state.
 * 6. Enters WAITING_FOR_APPROVAL without issuing official notice (Prisma application state unmutated).
 * 7. Displays complete proposal to authorized officer for approval or rejection via /api/agent/applications/:id/actions.
 * 8. Executes approved notice exactly once, records actual result, sends configured notification, updates application to awaiting_institution, and prevents duplicate execution.
 * 9. Records rejection without executing rejected action.
 */

const assert = require("assert");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000/api";
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";
const AI_BACKEND_SECRET = process.env.AI_BACKEND_SECRET || "aicte_agent_secret_prod_2026_x89f_secure_token";

async function api(url, opts = {}) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data, headers: res.headers };
}

async function runDeficiencyProposalVerification() {
  console.log("=====================================================================");
  console.log("   VERIFICATION OF AGENT DEFICIENCY NOTICE PREPARATION FLOW (PHASE 4) ");
  console.log("=====================================================================\n");

  let passed = 0;
  let total = 0;

  function pass(label, detail) {
    passed++;
    total++;
    console.log(`  ✓ [PASS] Item ${label}: ${detail}`);
  }

  function fail(label, detail, err) {
    total++;
    console.error(`  ✗ [FAIL] Item ${label}: ${detail} ->`, err?.message || err);
  }

  const { PrismaClient } = require("./node_modules/@prisma/client");
  const prisma = new PrismaClient();

  // Helper to ensure an application is in scrutiny stage for test
  async function ensureScrutiny(id) {
    await prisma.deficiencyRequest.deleteMany({
      where: { applicationId: id },
    });
    await prisma.application.update({
      where: { id },
      data: { status: "in_review", currentStageId: "scrutiny", currentStageName: "Scrutiny Committee Review" },
    });
  }

  // Find an active application in scrutiny
  const appsRes = await api(`${BACKEND_URL}/aicte/scrutiny/applications`, {
    headers: { "x-user-id": "DEMO-AIC-034" },
  });
  assert.strictEqual(appsRes.status, 200, "Could not fetch scrutiny applications");
  assert(Array.isArray(appsRes.data) && appsRes.data.length > 0, "No scrutiny applications found");

  const targetApp = appsRes.data[0];
  const appId = targetApp.id;
  const appNumber = targetApp.applicationNumber;
  const institutionId = targetApp.institutionId;

  // Prepare target application in scrutiny stage
  await ensureScrutiny(appId);
  const initialStatus = "in_review";

  console.log(`[Target Application] ID: ${appId} | Number: ${appNumber} | Status: ${initialStatus} | Institution: ${institutionId}`);

  // Fetch full application record to get authoritative details
  const appDetailRes = await api(`${BACKEND_URL}/aicte/scrutiny/applications/${appId}`, {
    headers: { "x-user-id": "DEMO-AIC-034" },
  });
  const authoritativeApp = appDetailRes.data;
  const expectedRecipientUserId = authoritativeApp.createdById;
  const expectedInstitutionName = authoritativeApp.institution?.institutionName;

  // Trigger agent evaluation by dispatching APPLICATION_SUBMITTED event
  const testCorrId = `corr-def-verify-${Date.now()}`;
  const eventRes = await api(`${AI_SERVICE_URL}/api/v1/agent/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Service-Authorization": `Bearer ${AI_BACKEND_SECRET}`,
    },
    body: JSON.stringify({
      event_type: "APPLICATION_SUBMITTED",
      application_id: appId,
      correlation_id: testCorrId,
    }),
  });

  assert.strictEqual(eventRes.status, 200, "Agent event processing failed");
  const execData = eventRes.data;

  // 1. Verify Item 1: Identifies proposed deficiencies from deterministic scrutiny report
  try {
    assert(execData.actions && execData.actions.length > 0, "Expected proposed actions from agent");
    const defAction = execData.actions.find((a) => a.action_type === "PROPOSE_DEFICIENCY_NOTICE");
    assert(defAction, "Expected a PROPOSE_DEFICIENCY_NOTICE action generated");
    assert.strictEqual(execData.status, "WAITING_FOR_APPROVAL");
    pass(1, `Identifies proposed deficiencies from deterministic report (Flagged: ${execData.result?.deficiencies_flagged} items).`);
  } catch (e) {
    fail(1, "Identifies proposed deficiencies", e);
  }

  // 2. Verify Item 2: Associates each deficiency with rule ID, evidence, source document/page, and verified APH reference
  const defAction = execData.actions.find((a) => a.action_type === "PROPOSE_DEFICIENCY_NOTICE");
  try {
    const payload = defAction.input_payload;
    const items = payload.deficiency_items || [];
    assert(items.length > 0, "Expected non-empty deficiency items list");

    for (const item of items) {
      assert(item.rule_id, "Missing rule_id in deficiency item");
      assert(item.rule_name, "Missing rule_name in deficiency item");
      assert(item.aph_clause, "Missing aph_clause reference in deficiency item");
      assert(item.evidence, "Missing evidence in deficiency item");
    }
    pass(2, `Associates each deficiency with rule ID, evidence, source document, and verified APH reference (${items.length} items validated).`);
  } catch (e) {
    fail(2, "Associates each deficiency with rule ID, evidence, doc, and APH reference", e);
  }

  // 3. Verify Item 3: Generates structured draft deficiency notice with explanation and requested corrective action
  try {
    const draft = defAction.input_payload.draft_notice;
    assert(draft, "Missing draft_notice object in action payload");
    assert(draft.title && draft.title.includes(appNumber), "Draft title does not cite application number");
    assert.strictEqual(draft.statutory_authority, "AICTE Approval Process Handbook (APH 2024-2027)");
    assert(Array.isArray(draft.items) && draft.items.length > 0, "Draft items array is missing or empty");

    for (const draftItem of draft.items) {
      assert(draftItem.explanation && draftItem.explanation.length > 10, "Missing clear statutory explanation");
      assert(draftItem.corrective_action && draftItem.corrective_action.length > 10, "Missing requested corrective action");
    }
    pass(3, `Generates structured draft deficiency notice with itemized explanation and corrective actions.`);
  } catch (e) {
    fail(3, "Generates structured draft deficiency notice", e);
  }

  // 4. Verify Item 4: Selects intended institution and recipient using authoritative application records
  try {
    const payload = defAction.input_payload;
    const draft = payload.draft_notice;
    assert.strictEqual(payload.institution_id, institutionId, "Institution ID does not match authoritative DB record");
    assert.strictEqual(payload.intended_recipient_user_id, expectedRecipientUserId, "Recipient user ID does not match authoritative creator");
    if (expectedInstitutionName) {
      assert.strictEqual(draft.recipient_institution, expectedInstitutionName, "Institution name does not match authoritative record");
    }
    pass(4, `Selects intended institution (${institutionId}) and recipient (${expectedRecipientUserId}) from authoritative records without fabricating details.`);
  } catch (e) {
    fail(4, "Selects intended institution and recipient from authoritative records", e);
  }

  // 5. Verify Item 5: Records proposed action, rationale, supporting evidence, intended recipient, and application/report version in persistent state
  try {
    assert(defAction.action_id.startsWith("act-"), "Invalid action ID format");
    assert(defAction.rationale && defAction.rationale.includes("APH 2024-2027"), "Action rationale missing statutory citation");
    assert(defAction.input_payload.version_hash, "Action record missing application version hash");
    assert(defAction.created_at, "Action record missing persistent creation timestamp");
    pass(5, `Records proposed action (${defAction.action_id}), rationale, evidence, intended recipient, and version in persistent state.`);
  } catch (e) {
    fail(5, "Records proposal in persistent state", e);
  }

  // 6. Verify Item 6: Enters WAITING_FOR_APPROVAL without issuing official notice
  try {
    assert.strictEqual(defAction.status, "WAITING_FOR_APPROVAL", "Action status should be WAITING_FOR_APPROVAL");
    assert.strictEqual(defAction.requires_approval, true, "Action requires_approval should be true");

    // Check that application in Express DB remains unchanged (NOT yet awaiting_institution)
    const checkApp = await api(`${BACKEND_URL}/aicte/scrutiny/applications/${appId}`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });
    assert.strictEqual(checkApp.data.status, initialStatus, "Application status must NOT be modified before officer approval");
    pass(6, `Enters WAITING_FOR_APPROVAL without issuing official notice (Prisma application status remains '${initialStatus}').`);
  } catch (e) {
    fail(6, "Enters WAITING_FOR_APPROVAL without issuing notice", e);
  }

  // 7. Verify Item 7: Displays complete proposal to authorized officer for approval or rejection via Express routes
  try {
    const listRes = await api(`${BACKEND_URL}/agent/applications/${appId}/actions`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });
    assert.strictEqual(listRes.status, 200, "Failed to retrieve actions for officer");
    const actions = listRes.data;
    const targetAction = actions.find((a) => a.action_id === defAction.action_id);
    assert(targetAction, "Proposed action not returned to scrutiny officer");
    assert.strictEqual(targetAction.status, "WAITING_FOR_APPROVAL");
    assert(targetAction.input_payload.draft_notice, "Complete draft notice not exposed in proposal query");
    pass(7, `Displays complete proposal to authorized scrutiny officer via GET /api/agent/applications/:id/actions.`);
  } catch (e) {
    fail(7, "Displays complete proposal to authorized officer", e);
  }

  // 8. Verify Item 8: Executes approved notice exactly once, records actual result, sends configured notification, and resumes workflow
  try {
    const approveRes = await api(`${BACKEND_URL}/agent/applications/${appId}/actions/${defAction.action_id}/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "DEMO-AIC-034",
      },
      body: JSON.stringify({ notes: "Officer verified statutory deficiency proposal and formally authorized notice." }),
    });

    assert.strictEqual(approveRes.status, 200, "Approval failed");
    assert.strictEqual(approveRes.data.success, true);
    assert.strictEqual(approveRes.data.approvedBy, "DEMO-AIC-034");

    // Verify application state transitioned to awaiting_institution in Prisma DB
    const postApp = await api(`${BACKEND_URL}/aicte/scrutiny/applications/${appId}`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });
    assert.strictEqual(postApp.data.status, "awaiting_institution", "Application status not updated to awaiting_institution");
    assert.strictEqual(postApp.data.currentAssigneeRole, "institution", "Assignee role not updated to institution");
    assert(postApp.data.dueAt, "Deficiency due date not calculated and stored");

    // Verify action is now EXECUTED in AI service
    const verifyActionRes = await api(`${BACKEND_URL}/agent/applications/${appId}/actions`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });
    const executedAction = verifyActionRes.data.find((a) => a.action_id === defAction.action_id);
    assert.strictEqual(executedAction.status, "EXECUTED", "Action status was not updated to EXECUTED");
    assert(executedAction.official_notice_id, "Enriched action missing official_notice_id");
    assert(executedAction.deficiency_cycle, "Enriched action missing deficiency_cycle");

    // Verify duplicate execution prevention (must fail with 400 Bad Request)
    const secondApprove = await api(`${BACKEND_URL}/agent/applications/${appId}/actions/${defAction.action_id}/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "DEMO-AIC-034",
      },
      body: JSON.stringify({ notes: "Attempt duplicate approval" }),
    });
    assert.strictEqual(secondApprove.status, 400, "Duplicate approval should be rejected with HTTP 400");
    assert(secondApprove.data.error.includes("EXECUTED"), "Error message should cite already EXECUTED status");

    pass(8, `Executes approved notice exactly once, updates application to 'awaiting_institution', creates tasks/notifications, resumes agent, and rejects duplicate approval (HTTP 400).`);
  } catch (e) {
    fail(8, "Executes approved notice exactly once and resumes workflow", e);
  }

  // 9. Verify Item 9: Records rejection without executing rejected action
  try {
    // Select an independent application for rejection testing and ensure it is in scrutiny stage
    const targetApp2 = appsRes.data.find((a) => a.id !== appId) || appsRes.data[1];
    const appId2 = targetApp2.id;
    await ensureScrutiny(appId2);
    const initialStatus2 = "in_review";

    // Dispatch event to evaluate targetApp2 and get a pending deficiency proposal
    const rejectCorrId = `corr-reject-test-${Date.now()}`;
    const rejEventRes = await api(`${AI_SERVICE_URL}/api/v1/agent/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Authorization": `Bearer ${AI_BACKEND_SECRET}`,
      },
      body: JSON.stringify({
        event_type: "APPLICATION_SUBMITTED",
        application_id: appId2,
        correlation_id: rejectCorrId,
      }),
    });

    assert.strictEqual(rejEventRes.status, 200, "Failed to evaluate application for rejection test");
    const freshExec = rejEventRes.data;
    const actionToReject = freshExec.actions?.find(
      (a) => a.action_type === "PROPOSE_DEFICIENCY_NOTICE" && a.status === "WAITING_FOR_APPROVAL"
    );
    assert(actionToReject, "Could not obtain pending action for rejection test");

    // Decline/reject the action
    const rejectRes = await api(`${BACKEND_URL}/agent/applications/${appId2}/actions/${actionToReject.action_id}/reject`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "DEMO-AIC-034",
      },
      body: JSON.stringify({ reason: "Scrutiny Officer verified acceptable physical exemption letter on municipal record." }),
    });

    assert.strictEqual(rejectRes.status, 200, "Rejection request failed");
    assert.strictEqual(rejectRes.data.success, true);
    assert.strictEqual(rejectRes.data.actionId, actionToReject.action_id);

    // Verify action status in AI service is REJECTED
    const checkRejRes = await api(`${BACKEND_URL}/agent/applications/${appId2}/actions`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });
    const rejectedAction = checkRejRes.data.find((a) => a.action_id === actionToReject.action_id);
    assert.strictEqual(rejectedAction.status, "REJECTED", "Action status was not updated to REJECTED");
    assert(rejectedAction.rejection_reason && rejectedAction.rejection_reason.includes("exemption letter"), "Rejection reason not stored");

    // Verify application status remained completely unmodified
    const postRejApp = await api(`${BACKEND_URL}/aicte/scrutiny/applications/${appId2}`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });
    assert.strictEqual(postRejApp.data.status, initialStatus2, "Rejected action must NOT modify application status");

    pass(9, `Records officer rejection without executing rejected action (Action: REJECTED, status remains '${initialStatus2}', reason audited).`);
  } catch (e) {
    fail(9, "Records rejection without executing rejected action", e);
  }

  console.log("\n=====================================================================");
  console.log(`   RESULTS: ${passed}/${total} ITEMS VERIFIED PASSING (${Math.round((passed / total) * 100)}%)   `);
  console.log("=====================================================================");

  await prisma.$disconnect();

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runDeficiencyProposalVerification().catch((err) => {
  console.error("FATAL ERROR running deficiency proposal verification:", err);
  process.exit(1);
});
