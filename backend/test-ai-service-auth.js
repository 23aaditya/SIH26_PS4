/**
 * Automated Security & Permission Verification Suite for AI Scrutiny Service (Phase 1 & Remediation)
 *
 * Verifies:
 * Positive Tests:
 * 1. Valid machine credentials grant access to read application dossier for scrutiny-stage applications
 * 2. Valid machine credentials grant access to read document download for scrutiny-stage applications
 * 3. Valid machine credentials grant access to post AI_SCRUTINY_PRE_CHECK report
 *
 * Baseline & Identity Tests:
 * 4. Invalid machine credentials return 401 Unauthorized
 * 5. Spoofed human headers (x-user-id: SERVICE_AI_SCRUTINY) return 401 Unauthorized
 * 6. Unauthenticated requests are rejected (dev bypass disabled)
 * 7. Machine credentials DENIED from submitting unauthorized reportType
 * 8. Machine credentials FORBIDDEN from issuing deficiency notices
 * 9. Machine credentials FORBIDDEN from verifying documents
 * 10. Machine credentials FORBIDDEN from advancing application workflow stages
 * 11. Machine credentials FORBIDDEN from issuing final decisions
 * 12. Existing human officer authentication remains functional
 * 13. Existing institution user authentication remains functional
 *
 * Audit Remediation Negative Tests (F-01, F-02, F-03):
 * 14. [F-02] Machine credentials FORBIDDEN from scheduling EVC visits (POST /api/evc) -> HTTP 403
 * 15. [F-02] Machine credentials FORBIDDEN from verifying compliance undertakings (POST /api/undertakings/:id/verify) -> HTTP 403
 * 16. [F-01] AI access to a draft application dossier -> HTTP 403 (INELIGIBLE_APPLICATION_FOR_AI_SCRUTINY)
 * 17. [F-01] AI access to an application in a terminal state (approved/rejected) -> HTTP 403 (INELIGIBLE_APPLICATION_FOR_AI_SCRUTINY)
 * 18. [F-01] AI access to an application outside permitted scrutiny stage (e.g., stage=committee) -> HTTP 403 (INELIGIBLE_APPLICATION_FOR_AI_SCRUTINY)
 * 19. [F-03] AI access to documents belonging to draft applications -> HTTP 403 (INELIGIBLE_DOCUMENT_FOR_AI_SCRUTINY)
 * 20. [F-03] AI access to documents belonging to terminal applications -> HTTP 403 (INELIGIBLE_DOCUMENT_FOR_AI_SCRUTINY)
 * 21. [F-03] AI access to documents belonging to applications outside scrutiny stage -> HTTP 403 (INELIGIBLE_DOCUMENT_FOR_AI_SCRUTINY)
 */

import dotenv from "dotenv";
dotenv.config();

const API_BASE = "http://localhost:4000/api";
const VALID_AI_SECRET = process.env.AI_BACKEND_SECRET || "aicte_agent_secret_prod_2026_x89f_secure_token";
const INVALID_AI_SECRET = "wrong_invalid_secret_token";

const testResults = [];

function assert(condition, testName, details = "") {
  if (condition) {
    console.log(`PASS: ${testName} ${details ? `(${details})` : ""}`);
    testResults.push({ name: testName, passed: true, details });
  } else {
    console.error(`FAIL: ${testName} ${details ? `(${details})` : ""}`);
    testResults.push({ name: testName, passed: false, details });
  }
}

function reportBlocked(testName, reason) {
  console.error(`BLOCKED: ${testName} - ${reason}`);
  testResults.push({ name: testName, passed: false, blocked: true, details: reason });
}

async function runTests() {
  console.log("=================================================================");
  console.log("Starting Phase 1 Security & M2M Permission Automated Test Suite");
  console.log("=================================================================\n");

  // Query existing applications to establish test fixtures
  let allApps = [];
  try {
    const res = await fetch(`${API_BASE}/applications?pageSize=100`);
    const data = await res.json();
    allApps = data.items || [];
  } catch (err) {
    console.error("Failed to connect to API server:", err.message);
    process.exit(1);
  }

  // 1. Target Scrutiny Application Fixture (Positive tests)
  const testApp = allApps.find(
    (a) => a.status === "in_review" && (a.currentStageId === "scrutiny" || a.currentStageId === "re_scrutiny")
  );
  const testDoc = testApp?.documents?.[0];

  // 2. Draft Application Fixture (Negative test F-01, F-03)
  const draftApp = allApps.find((a) => a.status === "draft");
  const draftDoc = draftApp?.documents?.[0];

  // 3. Terminal Application Fixture (Negative test F-01, F-03)
  const terminalApp = allApps.find((a) => a.status === "approved" || a.status === "rejected" || a.status === "closed");
  const terminalDoc = terminalApp?.documents?.[0];

  // 4. In-Review but Non-Scrutiny Stage Fixture (Negative test F-01, F-03)
  const nonScrutinyStageApp = allApps.find(
    (a) => a.status === "in_review" && a.currentStageId !== "scrutiny" && a.currentStageId !== "re_scrutiny"
  ) || allApps.find((a) => a.status === "pending_evc");
  const nonScrutinyDoc = nonScrutinyStageApp?.documents?.[0];

  if (!testApp) {
    console.error("CRITICAL: No eligible scrutiny-stage test application found in database.");
    process.exit(1);
  }

  console.log("Test Fixtures Identified:");
  console.log(`- Eligible Scrutiny App: ${testApp.id} (${testApp.applicationNumber}) [status: ${testApp.status}, stage: ${testApp.currentStageId}]`);
  console.log(`- Draft App:            ${draftApp ? `${draftApp.id} (${draftApp.applicationNumber})` : "NONE"}`);
  console.log(`- Terminal App:         ${terminalApp ? `${terminalApp.id} (${terminalApp.applicationNumber}) [status: ${terminalApp.status}]` : "NONE"}`);
  console.log(`- Non-Scrutiny Stage:   ${nonScrutinyStageApp ? `${nonScrutinyStageApp.id} (${nonScrutinyStageApp.applicationNumber}) [status: ${nonScrutinyStageApp.status}, stage: ${nonScrutinyStageApp.currentStageId}]` : "NONE"}\n`);

  // --- Test 1: Invalid machine credentials return 401 ---
  try {
    const res = await fetch(`${API_BASE}/aicte/applications/${testApp.id}`, {
      headers: { "X-Service-Authorization": `Bearer ${INVALID_AI_SECRET}` },
    });
    const body = await res.json();
    assert(
      res.status === 401 && body.code === "INVALID_SERVICE_CREDENTIALS",
      "Test 1: Invalid machine credentials return 401 Unauthorized",
      `HTTP ${res.status}, Code: ${body.code}`
    );
  } catch (err) {
    assert(false, "Test 1: Invalid machine credentials return 401 Unauthorized", err.message);
  }

  // --- Test 2: Spoofed human header claiming machine identity returns 401 ---
  try {
    const res = await fetch(`${API_BASE}/aicte/applications/${testApp.id}`, {
      headers: { "x-user-id": "SERVICE_AI_SCRUTINY" },
    });
    const body = await res.json();
    assert(
      res.status === 401 && body.code === "INVALID_CREDENTIALS",
      "Test 2: Spoofed human header claiming machine identity returns 401",
      `HTTP ${res.status}, Code: ${body.code}`
    );
  } catch (err) {
    assert(false, "Test 2: Spoofed human header claiming machine identity returns 401", err.message);
  }

  // --- Test 3: Unauthenticated request rejected when dev bypass disabled ---
  try {
    const res = await fetch(`${API_BASE}/aicte/applications/${testApp.id}`);
    assert(
      res.status === 401,
      "Test 3: Unauthenticated request returns 401 (Dev bypass disabled)",
      `HTTP ${res.status}`
    );
  } catch (err) {
    assert(false, "Test 3: Unauthenticated request returns 401", err.message);
  }

  // --- Test 4: Valid machine credentials ALLOW reading eligible application dossier ---
  try {
    const res = await fetch(`${API_BASE}/aicte/applications/${testApp.id}`, {
      headers: { "X-Service-Authorization": `Bearer ${VALID_AI_SECRET}` },
    });
    const body = await res.json();
    assert(
      res.status === 200 && body.id === testApp.id,
      "Test 4: Valid machine credentials ALLOW reading application dossier",
      `Application ${body.applicationNumber}`
    );
  } catch (err) {
    assert(false, "Test 4: Valid machine credentials ALLOW reading application dossier", err.message);
  }

  // --- Test 5: Valid machine credentials ALLOW reading authorized document stream ---
  if (testDoc) {
    try {
      const res = await fetch(`${API_BASE}/documents/${testDoc.id}/download`, {
        headers: { "X-Service-Authorization": `Bearer ${VALID_AI_SECRET}` },
      });
      const body = res.status === 200 ? null : await res.json().catch(() => ({}));
      assert(
        res.status === 200 || (res.status === 404 && body?.code === "DOCUMENT_FILE_NOT_FOUND"),
        "Test 5: Valid machine credentials ALLOW downloading document stream (authorized access)",
        `Doc ID: ${testDoc.id}, HTTP ${res.status}${body?.code ? ` (${body.code})` : ""}`
      );
    } catch (err) {
      assert(false, "Test 5: Valid machine credentials ALLOW downloading document stream", err.message);
    }
  } else {
    reportBlocked("Test 5: Valid machine credentials ALLOW downloading document stream", "No document on scrutiny application fixture");
  }

  // --- Test 6: Valid machine credentials ALLOW submitting AI_SCRUTINY_PRE_CHECK report ---
  try {
    const reportPayload = {
      stageKey: "scrutiny",
      reportType: "AI_SCRUTINY_PRE_CHECK",
      title: "Automated Test AI Pre-Check",
      content: "Automated test analysis report content.",
      recommendations: "Test recommendation for scrutiny committee.",
      outcome: "NEEDS_HUMAN_REVIEW",
      metadata: { testSuite: "phase1_security", version: "1.0.0" },
    };
    const res = await fetch(`${API_BASE}/aicte/applications/${testApp.id}/reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Authorization": `Bearer ${VALID_AI_SECRET}`,
      },
      body: JSON.stringify(reportPayload),
    });
    const body = await res.json();
    assert(
      res.status === 201 && body.success === true && body.report?.reportType === "AI_SCRUTINY_PRE_CHECK",
      "Test 6: Valid machine credentials ALLOW posting AI_SCRUTINY_PRE_CHECK report",
      `Report ID: ${body.report?.id}`
    );
  } catch (err) {
    assert(false, "Test 6: Valid machine credentials ALLOW posting AI_SCRUTINY_PRE_CHECK report", err.message);
  }

  // --- Test 7: Machine credentials DENIED from submitting unauthorized reportType ---
  try {
    const unauthorizedReportPayload = {
      stageKey: "scrutiny",
      reportType: "SCRUTINY_REPORT", // Human official report type
      title: "Unauthorized Human Scrutiny Report",
      content: "This report should be rejected for system_service.",
    };
    const res = await fetch(`${API_BASE}/aicte/applications/${testApp.id}/reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Authorization": `Bearer ${VALID_AI_SECRET}`,
      },
      body: JSON.stringify(unauthorizedReportPayload),
    });
    const body = await res.json();
    assert(
      res.status === 403 && body.code === "FORBIDDEN_REPORT_TYPE",
      "Test 7: Machine credentials DENIED from submitting non-AI report types",
      `HTTP ${res.status}, Code: ${body.code}`
    );
  } catch (err) {
    assert(false, "Test 7: Machine credentials DENIED from submitting non-AI report types", err.message);
  }

  // --- Test 8: Machine credentials FORBIDDEN from issuing deficiency notice ---
  try {
    const res = await fetch(`${API_BASE}/aicte/applications/${testApp.id}/deficiencies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Authorization": `Bearer ${VALID_AI_SECRET}`,
      },
      body: JSON.stringify({ deficiencyText: "Illegal automated deficiency notice" }),
    });
    const body = await res.json();
    assert(
      res.status === 403 && body.code === "MACHINE_MUTATION_FORBIDDEN",
      "Test 8: Machine credentials FORBIDDEN from issuing deficiency notices",
      `HTTP ${res.status}, Code: ${body.code}`
    );
  } catch (err) {
    assert(false, "Test 8: Machine credentials FORBIDDEN from issuing deficiency notices", err.message);
  }

  // --- Test 9: Machine credentials FORBIDDEN from verifying documents ---
  if (testDoc) {
    try {
      const res = await fetch(`${API_BASE}/documents/${testDoc.id}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Service-Authorization": `Bearer ${VALID_AI_SECRET}`,
        },
        body: JSON.stringify({ status: "verified", notes: "Illegal automated verification" }),
      });
      const body = await res.json();
      assert(
        res.status === 403 && body.code === "MACHINE_MUTATION_FORBIDDEN",
        "Test 9: Machine credentials FORBIDDEN from verifying documents",
        `HTTP ${res.status}, Code: ${body.code}`
      );
    } catch (err) {
      assert(false, "Test 9: Machine credentials FORBIDDEN from verifying documents", err.message);
    }
  } else {
    reportBlocked("Test 9: Machine credentials FORBIDDEN from verifying documents", "No document on scrutiny application fixture");
  }

  // --- Test 10: Machine credentials FORBIDDEN from advancing stages / decisions ---
  try {
    const res = await fetch(`${API_BASE}/aicte/applications/${testApp.id}/forward`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Authorization": `Bearer ${VALID_AI_SECRET}`,
      },
      body: JSON.stringify({ outcome: "PASS" }),
    });
    const body = await res.json();
    assert(
      res.status === 403 && body.code === "MACHINE_MUTATION_FORBIDDEN",
      "Test 10: Machine credentials FORBIDDEN from advancing application workflow stages",
      `HTTP ${res.status}, Code: ${body.code}`
    );
  } catch (err) {
    assert(false, "Test 10: Machine credentials FORBIDDEN from advancing workflow stages", err.message);
  }

  // --- Test 11: Machine credentials FORBIDDEN from issuing final decisions ---
  try {
    const res = await fetch(`${API_BASE}/aicte/applications/${testApp.id}/decision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Authorization": `Bearer ${VALID_AI_SECRET}`,
      },
      body: JSON.stringify({ decisionType: "APPROVED", outcome: "APPROVED", reasonAndFindings: "Illegal AI Decision" }),
    });
    const body = await res.json();
    assert(
      res.status === 403 && body.code === "MACHINE_MUTATION_FORBIDDEN",
      "Test 11: Machine credentials FORBIDDEN from issuing final approval/rejection decisions",
      `HTTP ${res.status}, Code: ${body.code}`
    );
  } catch (err) {
    assert(false, "Test 11: Machine credentials FORBIDDEN from issuing final decisions", err.message);
  }

  // --- Test 12: Existing human officer authentication remains functional ---
  try {
    const res = await fetch(`${API_BASE}/aicte/applications/${testApp.id}`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });
    assert(
      res.status === 200,
      "Test 12: Existing human officer (Dr. Mihir Tiwari) authentication remains functional",
      `HTTP ${res.status}`
    );
  } catch (err) {
    assert(false, "Test 12: Existing human officer authentication remains functional", err.message);
  }

  // --- Test 13: Existing institution user authentication remains functional ---
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "principal@pict.edu", password: "password123" }),
    });
    const body = await res.json();
    assert(
      res.status === 200 && body.success === true,
      "Test 13: Existing institution user login remains functional",
      `User: ${body.user?.displayName}`
    );
  } catch (err) {
    assert(false, "Test 13: Existing institution user login remains functional", err.message);
  }

  // --- Test 14 (F-02): Machine credentials FORBIDDEN from POST /api/evc (schedule) ---
  try {
    const res = await fetch(`${API_BASE}/evc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Authorization": `Bearer ${VALID_AI_SECRET}`,
      },
      body: JSON.stringify({
        applicationId: testApp.id,
        scheduledAt: new Date().toISOString(),
        notes: "Illegal automated EVC scheduling",
      }),
    });
    const body = await res.json();
    assert(
      res.status === 403 && body.code === "MACHINE_MUTATION_FORBIDDEN",
      "Test 14: Machine credentials FORBIDDEN from scheduling EVC visits (POST /api/evc)",
      `HTTP ${res.status}, Code: ${body.code}`
    );
  } catch (err) {
    assert(false, "Test 14: Machine credentials FORBIDDEN from scheduling EVC visits", err.message);
  }

  // --- Test 15 (F-02): Machine credentials FORBIDDEN from POST /api/undertakings/:id/verify ---
  try {
    const res = await fetch(`${API_BASE}/undertakings/dummy-undertaking-id/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Authorization": `Bearer ${VALID_AI_SECRET}`,
      },
      body: JSON.stringify({ status: "verified" }),
    });
    const body = await res.json();
    assert(
      res.status === 403 && body.code === "MACHINE_MUTATION_FORBIDDEN",
      "Test 15: Machine credentials FORBIDDEN from verifying compliance undertakings (POST /api/undertakings/:id/verify)",
      `HTTP ${res.status}, Code: ${body.code}`
    );
  } catch (err) {
    assert(false, "Test 15: Machine credentials FORBIDDEN from verifying compliance undertakings", err.message);
  }

  // --- Test 16 (F-01): Machine credentials FORBIDDEN from reading draft application dossier ---
  if (draftApp) {
    try {
      const res = await fetch(`${API_BASE}/aicte/applications/${draftApp.id}`, {
        headers: { "X-Service-Authorization": `Bearer ${VALID_AI_SECRET}` },
      });
      const body = await res.json();
      assert(
        res.status === 403 && body.code === "INELIGIBLE_APPLICATION_FOR_AI_SCRUTINY",
        "Test 16: Machine credentials FORBIDDEN from reading draft application dossier",
        `HTTP ${res.status}, Code: ${body.code}`
      );
    } catch (err) {
      assert(false, "Test 16: Machine credentials FORBIDDEN from reading draft application dossier", err.message);
    }
  } else {
    reportBlocked("Test 16: Machine credentials FORBIDDEN from reading draft application dossier", "No draft application fixture available in database");
  }

  // --- Test 17 (F-01): Machine credentials FORBIDDEN from reading terminal (approved/rejected) application dossier ---
  if (terminalApp) {
    try {
      const res = await fetch(`${API_BASE}/aicte/applications/${terminalApp.id}`, {
        headers: { "X-Service-Authorization": `Bearer ${VALID_AI_SECRET}` },
      });
      const body = await res.json();
      assert(
        res.status === 403 && body.code === "INELIGIBLE_APPLICATION_FOR_AI_SCRUTINY",
        "Test 17: Machine credentials FORBIDDEN from reading terminal application dossier",
        `App Status: ${terminalApp.status}, HTTP ${res.status}, Code: ${body.code}`
      );
    } catch (err) {
      assert(false, "Test 17: Machine credentials FORBIDDEN from reading terminal application dossier", err.message);
    }
  } else {
    reportBlocked("Test 17: Machine credentials FORBIDDEN from reading terminal application dossier", "No terminal application fixture available in database");
  }

  // --- Test 18 (F-01): Machine credentials FORBIDDEN from reading application outside permitted scrutiny stage ---
  if (nonScrutinyStageApp) {
    try {
      const res = await fetch(`${API_BASE}/aicte/applications/${nonScrutinyStageApp.id}`, {
        headers: { "X-Service-Authorization": `Bearer ${VALID_AI_SECRET}` },
      });
      const body = await res.json();
      assert(
        res.status === 403 && body.code === "INELIGIBLE_APPLICATION_FOR_AI_SCRUTINY",
        "Test 18: Machine credentials FORBIDDEN from reading application outside scrutiny stage",
        `App Status: ${nonScrutinyStageApp.status}, Stage: ${nonScrutinyStageApp.currentStageId}, HTTP ${res.status}, Code: ${body.code}`
      );
    } catch (err) {
      assert(false, "Test 18: Machine credentials FORBIDDEN from reading application outside scrutiny stage", err.message);
    }
  } else {
    reportBlocked("Test 18: Machine credentials FORBIDDEN from reading application outside scrutiny stage", "No in-review non-scrutiny stage application fixture available");
  }

  // --- Test 19 (F-03): Machine credentials FORBIDDEN from downloading documents of draft applications ---
  if (draftDoc) {
    try {
      const res = await fetch(`${API_BASE}/documents/${draftDoc.id}/download`, {
        headers: { "X-Service-Authorization": `Bearer ${VALID_AI_SECRET}` },
      });
      const body = await res.json();
      assert(
        res.status === 403 && body.code === "INELIGIBLE_DOCUMENT_FOR_AI_SCRUTINY",
        "Test 19: Machine credentials FORBIDDEN from downloading documents of draft applications",
        `HTTP ${res.status}, Code: ${body.code}`
      );
    } catch (err) {
      assert(false, "Test 19: Machine credentials FORBIDDEN from downloading documents of draft applications", err.message);
    }
  } else {
    reportBlocked("Test 19: Machine credentials FORBIDDEN from downloading documents of draft applications", "No draft document fixture available");
  }

  // --- Test 20 (F-03): Machine credentials FORBIDDEN from downloading documents of terminal applications ---
  if (terminalDoc) {
    try {
      const res = await fetch(`${API_BASE}/documents/${terminalDoc.id}/download`, {
        headers: { "X-Service-Authorization": `Bearer ${VALID_AI_SECRET}` },
      });
      const body = await res.json();
      assert(
        res.status === 403 && body.code === "INELIGIBLE_DOCUMENT_FOR_AI_SCRUTINY",
        "Test 20: Machine credentials FORBIDDEN from downloading documents of terminal applications",
        `HTTP ${res.status}, Code: ${body.code}`
      );
    } catch (err) {
      assert(false, "Test 20: Machine credentials FORBIDDEN from downloading documents of terminal applications", err.message);
    }
  } else {
    reportBlocked("Test 20: Machine credentials FORBIDDEN from downloading documents of terminal applications", "No terminal document fixture available");
  }

  // --- Test 21 (F-03): Machine credentials FORBIDDEN from downloading documents of non-scrutiny applications ---
  if (nonScrutinyDoc) {
    try {
      const res = await fetch(`${API_BASE}/documents/${nonScrutinyDoc.id}/download`, {
        headers: { "X-Service-Authorization": `Bearer ${VALID_AI_SECRET}` },
      });
      const body = await res.json();
      assert(
        res.status === 403 && body.code === "INELIGIBLE_DOCUMENT_FOR_AI_SCRUTINY",
        "Test 21: Machine credentials FORBIDDEN from downloading documents of non-scrutiny stage applications",
        `HTTP ${res.status}, Code: ${body.code}`
      );
    } catch (err) {
      assert(false, "Test 21: Machine credentials FORBIDDEN from downloading documents of non-scrutiny stage applications", err.message);
    }
  } else {
    reportBlocked("Test 21: Machine credentials FORBIDDEN from downloading documents of non-scrutiny stage applications", "No non-scrutiny document fixture available");
  }

  console.log("\n=================================================================");
  const total = testResults.length;
  const passed = testResults.filter((r) => r.passed).length;
  const blocked = testResults.filter((r) => r.blocked).length;
  const failed = total - passed - blocked;

  console.log(`Test Execution Finished: ${passed}/${total} Passed (${blocked} Blocked, ${failed} Failed).`);
  if (passed === total) {
    console.log("ALL PHASE 1 SECURITY & AUDIT REMEDIATION TESTS PASSED (100%).");
  } else {
    console.error("SOME TESTS DID NOT PASS.");
  }
  console.log("=================================================================");

  process.exit(passed === total ? 0 : 1);
}

runTests();
