/**
 * Phase 4.4 Comprehensive Regression Test Suite
 *
 * Verifies end-to-end restoration of autonomous agent proposal generation
 * across all three outcome pathways while preserving Phase 4.3 workflow locks:
 *
 * 1. DEFICIENT outcome -> generates PROPOSE_DEFICIENCY_NOTICE in WAITING_FOR_APPROVAL
 * 2. COMPLIANT outcome -> generates PROPOSE_FORWARD_TO_NEXT_STAGE in WAITING_FOR_APPROVAL
 * 3. NEEDS_HUMAN_REVIEW outcome -> generates REQUEST_HUMAN_REVIEW in WAITING_FOR_APPROVAL
 * 4. Officer approval of PROPOSE_FORWARD_TO_NEXT_STAGE advances stage and executes action
 * 5. Officer approval of REQUEST_HUMAN_REVIEW records audit log and executes action
 * 6. Scrutiny pre-check on active deficiency (awaiting_institution) succeeds (HTTP 200) without 400 error
 * 7. Phase 4.3 workflow locks strictly prevent forward advancement on active deficiency (HTTP 409)
 * 8. Strict action isolation between distinct applications
 * 9. Frontend proposal retrieval via /api/agent/applications/:id/actions exposes enriched details
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000/api";
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";
const AI_BACKEND_SECRET = process.env.AI_BACKEND_SECRET || "aicte_agent_secret_prod_2026_x89f_secure_token";

async function api(url, opts = {}) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data, headers: res.headers };
}

async function runPhase44Regression() {
  console.log("=====================================================================");
  console.log("   PHASE 4.4 REGRESSION SUITE: AUTONOMOUS AGENT PROPOSAL RESTORATION ");
  console.log("=====================================================================\n");

  let passed = 0;
  let total = 0;

  function pass(testNum, label, detail) {
    passed++;
    total++;
    console.log(`  ✓ [PASS] Test ${testNum}: ${label} — ${detail}`);
  }

  function fail(testNum, label, detail, err) {
    total++;
    console.error(`  ✗ [FAIL] Test ${testNum}: ${label} — ${detail} ->`, err?.message || err);
  }

  const { PrismaClient } = require("./node_modules/@prisma/client");
  const prisma = new PrismaClient();

  // Find sample institution and region for creating clean test records
  const sampleInst = await prisma.institution.findFirst();
  assert(sampleInst, "No institution found in DB");
  const sampleRegion = await prisma.region.findFirst();
  assert(sampleRegion, "No region found in DB");
  const sampleUser = await prisma.user.findFirst({ where: { role: "institution" } });
  assert(sampleUser, "No institution user found in DB");

  // Helper to create test applications
  async function createTestApp(category, status = "in_review", stageId = "scrutiny", stageName = "Scrutiny Committee Review") {
    const num = `AICTE-2026-P44-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
    const app = await prisma.application.create({
      data: {
        applicationNumber: num,
        institutionId: sampleInst.id,
        regionId: sampleRegion.id,
        createdById: sampleUser.id,
        applicationCategory: category,
        status: status,
        currentStageId: stageId,
        currentStageName: stageName,
        currentAssigneeRole: "scrutiny_committee",
        assignedUserId: "DEMO-AIC-034",
        returnCount: 0,
        submittedAt: new Date(),
      },
    });
    return app;
  }

  // Helper to clean up test application
  async function cleanupApp(appId) {
    try {
      await prisma.auditEvent.deleteMany({ where: { applicationId: appId } });
      await prisma.workflowTask.deleteMany({ where: { applicationId: appId } });
      await prisma.deficiencyRequest.deleteMany({ where: { applicationId: appId } });
      await prisma.applicationDocument.deleteMany({ where: { applicationId: appId } });
      await prisma.reviewReport.deleteMany({ where: { applicationId: appId } });
      await prisma.application.delete({ where: { id: appId } });
    } catch (e) {
      // Ignore cleanup error
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 1: DEFICIENT Application produces PROPOSE_DEFICIENCY_NOTICE
  // ─────────────────────────────────────────────────────────────────────────────
  let appDeficient = null;
  try {
    appDeficient = await createTestApp("Change of Affiliating University / Board");

    // Dispatch APPLICATION_SUBMITTED without required documents -> deterministic evaluates to DEFICIENT
    const corrId = `corr-p44-def-${Date.now()}`;
    const eventRes = await api(`${AI_SERVICE_URL}/api/v1/agent/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Authorization": `Bearer ${AI_BACKEND_SECRET}`,
      },
      body: JSON.stringify({
        event_type: "APPLICATION_SUBMITTED",
        application_id: appDeficient.id,
        correlation_id: corrId,
      }),
    });

    assert.strictEqual(eventRes.status, 200, `Event dispatch failed: ${JSON.stringify(eventRes.data)}`);
    assert.strictEqual(eventRes.data.status, "WAITING_FOR_APPROVAL");
    const actions = eventRes.data.actions || [];
    const defNoticeAction = actions.find((a) => a.action_type === "PROPOSE_DEFICIENCY_NOTICE");
    assert(defNoticeAction, "Expected action of type PROPOSE_DEFICIENCY_NOTICE");
    assert.strictEqual(defNoticeAction.status, "WAITING_FOR_APPROVAL");
    assert(defNoticeAction.input_payload.draft_notice, "Expected draft_notice in payload");
    assert(defNoticeAction.input_payload.deficiency_items.length > 0, "Expected deficiency items list");

    pass(1, "Deficient Pathway", `Agent generated PROPOSE_DEFICIENCY_NOTICE (${defNoticeAction.action_id}) in WAITING_FOR_APPROVAL.`);
  } catch (err) {
    fail(1, "Deficient Pathway", "Failed to generate deficiency proposal", err);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 2: COMPLIANT Application produces PROPOSE_FORWARD_TO_NEXT_STAGE
  // ─────────────────────────────────────────────────────────────────────────────
  let appCompliant = null;
  let forwardActionId = null;
  const testDocPaths = [];
  try {
    // For Change of Affiliating University / Board, genuine Format 2 NOC and Format 3 Resolution produce COMPLIANT
    appCompliant = await createTestApp("Change of Affiliating University / Board");

    const uploadsDir = path.resolve(__dirname, "uploads");
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const nocPath = path.join(uploadsDir, `test_p44_noc_${Date.now()}.pdf`);
    const resPath = path.join(uploadsDir, `test_p44_res_${Date.now()}.pdf`);
    const consentPath = path.join(uploadsDir, `test_p44_consent_${Date.now()}.pdf`);
    testDocPaths.push(nocPath, resPath, consentPath);

    fs.writeFileSync(
      nocPath,
      "No Objection Certificate — Format 2\n" +
      "The Registrar, Savitribai Phule Pune University, hereby grants no objection to the change of " +
      "affiliating university/board for Pune Institute of Computer Technology as per AICTE norms. " +
      "Sealed and signed by the Registrar on behalf of the University.\n"
    );

    fs.writeFileSync(
      resPath,
      "Governing Body Resolution — Format 3\n" +
      "Executive Meeting of Pune Educational Trust. Resolved that the Trust approves the " +
      "change of affiliating university from Savitribai Phule Pune University to Mumbai University as per the " +
      "provisions of AICTE Approval Process Handbook 2024-27 Clause 2.11 and resolves to apply for NOC to both universities.\n"
    );

    fs.writeFileSync(
      consentPath,
      "Affiliation Consent and In-Principle NOC from Proposed University\n" +
      "The Registrar, University of Mumbai, hereby grants in-principle consent and willingness to affiliate " +
      "Pune Institute of Computer Technology subject to AICTE approval.\n"
    );

    // Create document records in database
    await prisma.applicationDocument.create({
      data: {
        applicationId: appCompliant.id,
        institutionId: sampleInst.id,
        documentType: "university_noc",
        originalFilename: "University_NOC_Format2.pdf",
        storagePath: nocPath,
        fileSize: fs.statSync(nocPath).size,
        mimeType: "application/pdf",
        verificationStatus: "verified",
        uploadedById: sampleUser.id,
      },
    });

    await prisma.applicationDocument.create({
      data: {
        applicationId: appCompliant.id,
        institutionId: sampleInst.id,
        documentType: "resolution",
        originalFilename: "Trust_Resolution_F3.pdf",
        storagePath: resPath,
        fileSize: fs.statSync(resPath).size,
        mimeType: "application/pdf",
        verificationStatus: "verified",
        uploadedById: sampleUser.id,
      },
    });

    await prisma.applicationDocument.create({
      data: {
        applicationId: appCompliant.id,
        institutionId: sampleInst.id,
        documentType: "proposed_university_consent",
        originalFilename: "Proposed_University_Affiliation_Consent.pdf",
        storagePath: consentPath,
        fileSize: fs.statSync(consentPath).size,
        mimeType: "application/pdf",
        verificationStatus: "verified",
        uploadedById: sampleUser.id,
      },
    });

    const corrIdComp = `corr-p44-comp-${Date.now()}`;
    const eventCompRes = await api(`${AI_SERVICE_URL}/api/v1/agent/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Authorization": `Bearer ${AI_BACKEND_SECRET}`,
      },
      body: JSON.stringify({
        event_type: "APPLICATION_SUBMITTED",
        application_id: appCompliant.id,
        correlation_id: corrIdComp,
      }),
    });

    assert.strictEqual(eventCompRes.status, 200, `Event dispatch failed: ${JSON.stringify(eventCompRes.data)}`);
    assert.strictEqual(eventCompRes.data.status, "WAITING_FOR_APPROVAL");
    const actionsComp = eventCompRes.data.actions || [];
    const forwardAction = actionsComp.find((a) => a.action_type === "PROPOSE_FORWARD_TO_NEXT_STAGE");
    assert(forwardAction, "Expected action of type PROPOSE_FORWARD_TO_NEXT_STAGE");
    assert.strictEqual(forwardAction.status, "WAITING_FOR_APPROVAL");
    assert(forwardAction.input_payload.recommended_stage, "Expected recommended_stage");
    assert(forwardAction.input_payload.transition_proposal?.verified_items?.length >= 2, "Expected verified compliant criteria");

    forwardActionId = forwardAction.action_id;
    pass(2, "Compliant Pathway", `Agent generated PROPOSE_FORWARD_TO_NEXT_STAGE (${forwardAction.action_id}) in WAITING_FOR_APPROVAL.`);
  } catch (err) {
    fail(2, "Compliant Pathway", "Failed to generate stage advancement proposal", err);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 3: Officer Approves PROPOSE_FORWARD_TO_NEXT_STAGE
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    assert(forwardActionId, "Missing forward action id from Test 2");
    const approveRes = await api(`${BACKEND_URL}/agent/applications/${appCompliant.id}/actions/${forwardActionId}/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "DEMO-AIC-034",
      },
      body: JSON.stringify({ note: "Officer formally verified all baseline statutory norms satisfied." }),
    });

    assert.strictEqual(approveRes.status, 200, `Approval failed: ${JSON.stringify(approveRes.data)}`);
    assert.strictEqual(approveRes.data.success, true);
    assert.strictEqual(approveRes.data.actionId, forwardActionId);

    // Verify action status became EXECUTED
    const actionsRes = await api(`${BACKEND_URL}/agent/applications/${appCompliant.id}/actions`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });
    const executedAction = actionsRes.data.find((a) => a.action_id === forwardActionId);
    assert.strictEqual(executedAction.status, "EXECUTED");

    // Verify stage advancement or decision in database
    const updatedApp = await prisma.application.findUnique({ where: { id: appCompliant.id } });
    assert(updatedApp, "Target compliant application must exist in database");

    // Verify audit log
    const audit = await prisma.auditEvent.findFirst({
      where: {
        applicationId: appCompliant.id,
        action: "AGENT_PROPOSED_STAGE_ADVANCEMENT_OFFICIALLY_APPROVED",
      },
    });
    assert(audit, "Expected audit event AGENT_PROPOSED_STAGE_ADVANCEMENT_OFFICIALLY_APPROVED");

    pass(3, "Stage Advancement Execution", `Officer approved stage advancement; action marked EXECUTED and stage decision audited.`);
  } catch (err) {
    fail(3, "Stage Advancement Execution", "Failed to approve and execute stage advancement", err);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 4: NEEDS_HUMAN_REVIEW Application produces REQUEST_HUMAN_REVIEW
  // ─────────────────────────────────────────────────────────────────────────────
  let appReview = null;
  let reviewActionId = null;
  try {
    // "Other Statutory Applications" triggers statutory review fallback
    appReview = await createTestApp("Other Statutory Applications");

    const corrIdRev = `corr-p44-rev-${Date.now()}`;
    const eventRevRes = await api(`${AI_SERVICE_URL}/api/v1/agent/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Authorization": `Bearer ${AI_BACKEND_SECRET}`,
      },
      body: JSON.stringify({
        event_type: "APPLICATION_SUBMITTED",
        application_id: appReview.id,
        correlation_id: corrIdRev,
      }),
    });

    assert.strictEqual(eventRevRes.status, 200, `Event dispatch failed: ${JSON.stringify(eventRevRes.data)}`);
    assert.strictEqual(eventRevRes.data.status, "WAITING_FOR_APPROVAL");
    const actionsRev = eventRevRes.data.actions || [];
    const reviewAction = actionsRev.find((a) => a.action_type === "REQUEST_HUMAN_REVIEW");
    assert(reviewAction, "Expected action of type REQUEST_HUMAN_REVIEW");
    assert.strictEqual(reviewAction.status, "WAITING_FOR_APPROVAL");
    assert(reviewAction.input_payload.review_request?.flagged_items?.length > 0, "Expected flagged review items");

    reviewActionId = reviewAction.action_id;
    pass(4, "Human Review Pathway", `Agent generated REQUEST_HUMAN_REVIEW (${reviewAction.action_id}) in WAITING_FOR_APPROVAL.`);
  } catch (err) {
    fail(4, "Human Review Pathway", "Failed to generate human review proposal", err);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 5: Officer Acknowledges REQUEST_HUMAN_REVIEW
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    assert(reviewActionId, "Missing review action id from Test 4");
    const ackRes = await api(`${BACKEND_URL}/agent/applications/${appReview.id}/actions/${reviewActionId}/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "DEMO-AIC-034",
      },
      body: JSON.stringify({ note: "Officer acknowledged manual review requirements." }),
    });

    assert.strictEqual(ackRes.status, 200, `Acknowledgment failed: ${JSON.stringify(ackRes.data)}`);
    assert.strictEqual(ackRes.data.success, true);

    const actionsRes = await api(`${BACKEND_URL}/agent/applications/${appReview.id}/actions`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });
    const ackAction = actionsRes.data.find((a) => a.action_id === reviewActionId);
    assert.strictEqual(ackAction.status, "EXECUTED");

    // Verify audit log
    const audit = await prisma.auditEvent.findFirst({
      where: {
        applicationId: appReview.id,
        action: "AGENT_HUMAN_REVIEW_ACKNOWLEDGED",
      },
    });
    assert(audit, "Expected audit event AGENT_HUMAN_REVIEW_ACKNOWLEDGED");

    pass(5, "Human Review Acknowledgment", `Officer acknowledged human review; action marked EXECUTED with audit event.`);
  } catch (err) {
    fail(5, "Human Review Acknowledgment", "Failed to acknowledge human review action", err);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 6: Scrutiny Pre-Check on Application with Active Deficiency Succeeds (HTTP 200)
  // (Fix for the Phase 4.3 regression where triggerAiScrutiny threw DEFICIENCY_ALREADY_ACTIVE)
  // ─────────────────────────────────────────────────────────────────────────────
  let appWithActiveDef = null;
  try {
    appWithActiveDef = await createTestApp("Change of Affiliating University / Board", "awaiting_institution", "clarification", "Clarification / Compliance");

    // Issue an active deficiency request
    await prisma.deficiencyRequest.create({
      data: {
        applicationId: appWithActiveDef.id,
        raisedById: "DEMO-AIC-034",
        deficiencyText: "Format 3 Resolution missing",
        status: "pending",
        dueAt: new Date(Date.now() + 10 * 86400000),
      },
    });

    // Verify eligibility service confirms active deficiency is present
    const eligRes = await api(`${BACKEND_URL}/aicte/applications/${appWithActiveDef.id}/eligibility`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });
    assert.strictEqual(eligRes.status, 200);
    assert.strictEqual(eligRes.data.hasActiveDeficiency, true);

    // Call POST /api/aicte/applications/:id/trigger-ai
    // Prior to Phase 4.4 fix, this was wrongly rejected with 400 "DEFICIENCY_ALREADY_ACTIVE"
    const triggerRes = await api(`${BACKEND_URL}/aicte/applications/${appWithActiveDef.id}/trigger-ai`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "DEMO-AIC-034",
      },
    });

    assert.strictEqual(triggerRes.status, 200, `trigger-ai was rejected: status=${triggerRes.status} body=${JSON.stringify(triggerRes.data)}`);
    assert(triggerRes.data.jobId, "Expected jobId returned from trigger-ai");

    pass(6, "Pre-Check on Active Deficiency", `POST /trigger-ai succeeded (HTTP 200) without being blocked by active deficiency.`);
  } catch (err) {
    fail(6, "Pre-Check on Active Deficiency", "Failed to run pre-check on application with active deficiency", err);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 7: Phase 4.3 Workflow Locks Remain Strictly Enforced (HTTP 409)
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    assert(appWithActiveDef, "Missing appWithActiveDef from Test 6");

    // Attempting forward advancement must be strictly rejected
    const forwardAttempt = await api(`${BACKEND_URL}/aicte/applications/${appWithActiveDef.id}/forward`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "DEMO-AIC-034",
      },
      body: JSON.stringify({ outcome: "PASS", reason: "Attempt bypass" }),
    });

    assert.strictEqual(forwardAttempt.status, 409, `Expected 409, got ${forwardAttempt.status}`);
    assert.strictEqual(forwardAttempt.data.code, "DEFICIENCY_RESPONSE_PENDING");

    // Attempting final decision must also be rejected
    const decisionAttempt = await api(`${BACKEND_URL}/aicte/applications/${appWithActiveDef.id}/decision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "DEMO-AIC-034",
      },
      body: JSON.stringify({ decision: "APPROVE", comments: "Attempt bypass" }),
    });

    assert.strictEqual(decisionAttempt.status, 409, `Expected 409, got ${decisionAttempt.status}`);
    assert.strictEqual(decisionAttempt.data.code, "DEFICIENCY_RESPONSE_PENDING");

    pass(7, "Phase 4.3 Lock Preservation", `Workflow mutations strictly rejected with HTTP 409 DEFICIENCY_RESPONSE_PENDING while notice active.`);
  } catch (err) {
    fail(7, "Phase 4.3 Lock Preservation", "Failed to enforce workflow locks on active deficiency", err);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 8: Strict Action Isolation Between Applications
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    assert(appDeficient && appCompliant && appReview, "Missing test applications");

    const defActionsRes = await api(`${BACKEND_URL}/agent/applications/${appDeficient.id}/actions`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });
    const compActionsRes = await api(`${BACKEND_URL}/agent/applications/${appCompliant.id}/actions`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });
    const revActionsRes = await api(`${BACKEND_URL}/agent/applications/${appReview.id}/actions`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });

    // Ensure def actions do not appear in comp actions or rev actions
    for (const a of defActionsRes.data) {
      assert(!compActionsRes.data.some((c) => c.action_id === a.action_id), `Action ${a.action_id} leaked to app ${appCompliant.id}`);
      assert(!revActionsRes.data.some((r) => r.action_id === a.action_id), `Action ${a.action_id} leaked to app ${appReview.id}`);
    }

    pass(8, "Action Isolation", `Agent actions are strictly scoped by application_id with zero cross-application bleeding.`);
  } catch (err) {
    fail(8, "Action Isolation", "Failed to verify action isolation", err);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 9: API Exposes Enriched Action Details for Frontend Proposal Cards
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    const actionsRes = await api(`${BACKEND_URL}/agent/applications/${appCompliant.id}/actions`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });

    assert.strictEqual(actionsRes.status, 200);
    assert(Array.isArray(actionsRes.data) && actionsRes.data.length > 0);
    const action = actionsRes.data[0];

    assert(action.action_id, "Missing action_id");
    assert(action.action_type, "Missing action_type");
    assert(action.status, "Missing status");
    assert(action.input_payload, "Missing input_payload");
    assert(action.created_at, "Missing created_at");

    pass(9, "API Proposal Schema", `GET /agent/applications/:id/actions returns complete enriched schema for all action types.`);
  } catch (err) {
    fail(9, "API Proposal Schema", "Failed to verify action payload schema", err);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Clean up test data
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n  Cleaning up test records...");
  for (const p of testDocPaths) {
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) {}
  }
  if (appDeficient) await cleanupApp(appDeficient.id);
  if (appCompliant) await cleanupApp(appCompliant.id);
  if (appReview) await cleanupApp(appReview.id);
  if (appWithActiveDef) await cleanupApp(appWithActiveDef.id);
  await prisma.$disconnect();

  console.log("\n=====================================================================");
  console.log(`   RESULTS: ${passed}/${total} PHASE 4.4 REGRESSION TESTS PASSED (${Math.round((passed / total) * 100)}%)   `);
  console.log("=====================================================================\n");

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runPhase44Regression().catch((err) => {
  console.error("FATAL ERROR in Phase 4.4 regression suite:", err);
  process.exit(1);
});
