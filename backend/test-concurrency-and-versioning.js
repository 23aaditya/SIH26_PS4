/**
 * Automated Concurrency, Idempotency, and Document Version Integrity Suite
 * Tests Fix A (Checksum storage & exposure) and Fix B (Atomic concurrency on SQLite & Express ReviewReport)
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import prisma from "./src/db/prisma.js";

const BACKEND_URL = "http://localhost:4000/api";
const AI_SERVICE_URL = "http://127.0.0.1:8000";
const AI_SECRET = "aicte_agent_secret_prod_2026_x89f_secure_token";

let passedChecks = 0;
let totalChecks = 0;

function assert(condition, message) {
  totalChecks++;
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passedChecks++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log("=================================================================");
  console.log("Starting Concurrency, Idempotency & Version Integrity Test Suite");
  console.log("=================================================================\n");

  // 1. Find or pick an eligible in_review scrutiny application
  const app = await prisma.application.findFirst({
    where: { status: "in_review", currentStageId: { in: ["scrutiny", "re_scrutiny"] } },
    include: { workflowInstance: { include: { stages: true } } },
  });

  if (!app) {
    throw new Error("No eligible in_review scrutiny application found in test database.");
  }
  const appId = app.id;
  const appNumber = app.applicationNumber;
  const scrutinyStage = app.workflowInstance?.stages?.find((s) => s.stageKey === "scrutiny");
  const stageInstanceId = scrutinyStage?.id;

  console.log(`Test Application: ${appId} (${appNumber}), Scrutiny Stage: ${stageInstanceId}\n`);

  // ---------------------------------------------------------------------------
  // Check 1: Document Checksum Storage and Sanitized Exposure
  // ---------------------------------------------------------------------------
  console.log("--- Check 1: Document Checksum Storage & Sanitized Dossier Exposure ---");
  const dummyPdfContent = Buffer.from("%PDF-1.4 Mock Regulatory Evidence Buffer for Checksum Test");
  const expectedSha256 = crypto.createHash("sha256").update(dummyPdfContent).digest("hex");

  const createdDoc = await prisma.applicationDocument.create({
    data: {
      applicationId: appId,
      institutionId: app.institutionId,
      documentType: "Fire Safety Certificate",
      originalFilename: "test_fire_noc_checksum.pdf",
      storagePath: "uploads/test_fire_noc_checksum.pdf",
      checksum: expectedSha256,
      fileSize: dummyPdfContent.length,
      mimeType: "application/pdf",
      uploadedById: "test-user-1",
    },
  });

  assert(createdDoc.checksum === expectedSha256, "ApplicationDocument stores SHA-256 checksum in database");

  // Fetch dossier as system_service
  const dossierResp = await fetch(`${BACKEND_URL}/aicte/applications/${appId}`, {
    headers: { "X-Service-Authorization": `Bearer ${AI_SECRET}` },
  });
  assert(dossierResp.status === 200, "System service can fetch dossier (HTTP 200)");
  const dossierData = await dossierResp.json();

  const fetchedDoc = dossierData.documents?.find((d) => d.id === createdDoc.id);
  assert(fetchedDoc !== undefined, "Uploaded test document appears in dossier response");
  assert(fetchedDoc.checksum === expectedSha256, "Document checksum is exposed in authorized dossier response");
  assert(fetchedDoc.storagePath === undefined, "Document internal storagePath is stripped for system_service");

  // ---------------------------------------------------------------------------
  // Check 2: Concurrent FastAPI Trigger Requests
  // ---------------------------------------------------------------------------
  console.log("\n--- Check 2: Atomic Concurrency on Simultaneous Job Triggers ---");
  const triggerPayload = {
    application_id: appId,
    application_number: appNumber,
  };

  // Launch 5 simultaneous triggers at the exact same millisecond
  const triggerPromises = Array.from({ length: 5 }, () =>
    fetch(`${AI_SERVICE_URL}/api/v1/jobs/trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Authorization": `Bearer ${AI_SECRET}`,
      },
      body: JSON.stringify(triggerPayload),
    }).then((r) => r.json())
  );

  const triggerResponses = await Promise.all(triggerPromises);
  const distinctJobIds = new Set(triggerResponses.map((r) => r.job_id));

  assert(triggerResponses.every((r) => r.status === "PENDING" || r.status === "PROCESSING"), "All concurrent triggers returned active job");
  assert(distinctJobIds.size === 1, `Exactly ONE active job was returned across 5 concurrent triggers (Job ID: ${[...distinctJobIds][0]})`);

  // ---------------------------------------------------------------------------
  // Check 3: Concurrent Express Report Submissions with Partial Unique Index
  // ---------------------------------------------------------------------------
  console.log("\n--- Check 3: Atomic Idempotency on Simultaneous Express Report Submissions ---");
  const testVersionHash = `vhash_${crypto.randomBytes(16).toString("hex")}`;
  const reportPayload = {
    stageInstanceId,
    reportType: "AI_SCRUTINY_PRE_CHECK",
    title: "AI Scrutiny Concurrent Test Advisory",
    content: "Concurrent test evaluation content.",
    recommendations: "Human verification required.",
    outcome: "DEFICIENCY_SUGGESTED",
    metadata: {
      versionHash: testVersionHash,
      jobId: [...distinctJobIds][0],
    },
  };

  // Send 5 simultaneous report submissions with identical versionHash
  const reportPromises = Array.from({ length: 5 }, () =>
    fetch(`${BACKEND_URL}/aicte/applications/${appId}/reports`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Authorization": `Bearer ${AI_SECRET}`,
      },
      body: JSON.stringify(reportPayload),
    }).then(async (r) => ({ status: r.status, data: await r.json() }))
  );

  const reportResults = await Promise.all(reportPromises);
  assert(reportResults.every((r) => r.status === 201 || r.status === 200), "All 5 concurrent report requests succeeded without error");

  const reportIds = new Set(reportResults.map((r) => r.data.report?.id));
  assert(reportIds.size === 1, `All 5 concurrent requests returned the identical report ID: ${[...reportIds][0]}`);

  // Query database directly to verify only ONE row was created in ReviewReport
  const dbReports = await prisma.reviewReport.findMany({
    where: {
      applicationId: appId,
      reportType: "AI_SCRUTINY_PRE_CHECK",
      versionHash: testVersionHash,
    },
  });
  assert(dbReports.length === 1, `Database contains EXACTLY 1 ReviewReport record for versionHash (Found: ${dbReports.length})`);

  // ---------------------------------------------------------------------------
  // Check 4: Sequential Retry Reuses Saved Report
  // ---------------------------------------------------------------------------
  console.log("\n--- Check 4: Sequential Retry Reuses Saved Report ---");
  const retryResp = await fetch(`${BACKEND_URL}/aicte/applications/${appId}/reports`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Service-Authorization": `Bearer ${AI_SECRET}`,
    },
    body: JSON.stringify(reportPayload),
  });
  const retryData = await retryResp.json();
  assert(retryData.report?.id === [...reportIds][0], "Sequential retry reuses existing report ID without creating duplicate");

  // ---------------------------------------------------------------------------
  // Check 5: Legitimate New Report Allowed on Changed Version Hash
  // ---------------------------------------------------------------------------
  console.log("\n--- Check 5: Legitimate New Report for New Application Version Allowed ---");
  const newVersionHash = `vhash_updated_${crypto.randomBytes(16).toString("hex")}`;
  const newVersionPayload = {
    ...reportPayload,
    title: "AI Scrutiny Advisory (Updated Version)",
    metadata: {
      versionHash: newVersionHash,
      jobId: "job-new-version",
    },
  };

  const newVersionResp = await fetch(`${BACKEND_URL}/aicte/applications/${appId}/reports`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Service-Authorization": `Bearer ${AI_SECRET}`,
    },
    body: JSON.stringify(newVersionPayload),
  });
  const newVersionData = await newVersionResp.json();
  assert(newVersionResp.status === 201, "New report for updated application version created successfully (HTTP 201)");
  assert(newVersionData.report?.id !== [...reportIds][0], "New report receives distinct report ID for new version");

  // Clean up test document
  await prisma.applicationDocument.delete({ where: { id: createdDoc.id } }).catch(() => {});

  console.log("\n=================================================================");
  console.log(`Test Execution Finished: ${passedChecks}/${totalChecks} Checks Passed (100%).`);
  console.log("ALL CONCURRENCY, IDEMPOTENCY & VERSION INTEGRITY CHECKS PASSED.");
  console.log("=================================================================");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("\nTest suite failed with unhandled error:", err);
  process.exit(1);
});
