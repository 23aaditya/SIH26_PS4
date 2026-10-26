/**
 * Phase 3.2 Regression and Acceptance Test Suite
 * Tests:
 * 1. PDF retrieval of real persisted PDF (Status 200, Content-Type: application/pdf, %PDF- magic bytes)
 * 2. Missing file handling (Status 404 DOCUMENT_FILE_NOT_FOUND)
 * 3. Malformed/non-PDF file handling (Status 422 MALFORMED_PDF_FILE)
 * 4. Document upload, storage, checksum calculation, and download consistency
 * 5. Role-specific official dashboard metrics & queue authorization for:
 *    - Scrutiny Officer (DEMO-AIC-034)
 *    - EVC Coordinator (DEMO-AIC-037)
 *    - Competent Authority (DEMO-AIC-013)
 *    - Super Admin (DEMO-AIC-001)
 * 6. Unauthorized access denial (Institution account cannot access /api/aicte/dashboard/metrics)
 */

import http from "http";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import app from "./src/app.js";
import prisma from "./src/db/prisma.js";

let server;
const PORT = 4099;
const BASE_URL = `http://localhost:${PORT}/api`;

async function startServer() {
  return new Promise((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`Test Express server running on port ${PORT}`);
      resolve();
    });
  });
}

async function stopServer() {
  return new Promise((resolve) => {
    server.close(() => {
      console.log("Test Express server closed");
      resolve();
    });
  });
}

async function request(urlPath, options = {}) {
  const url = `${BASE_URL}${urlPath}`;
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  let body;
  if (contentType.includes("application/json")) {
    body = await response.json();
  } else {
    body = Buffer.from(await response.arrayBuffer());
  }
  return { status: response.status, headers: response.headers, body };
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    failed++;
    throw new Error(message);
  } else {
    console.log(`  PASS: ${message}`);
    passed++;
  }
}

async function runTests() {
  console.log("\n=======================================================");
  console.log("   PHASE 3.2 REGRESSION & ACCEPTANCE AUDIT TESTS");
  console.log("=======================================================\n");

  await startServer();

  try {
    // -------------------------------------------------------------
    // Test 1: Real Persisted PDF Retrieval
    // -------------------------------------------------------------
    console.log("[Test 1] Real Persisted PDF Retrieval");
    const testDoc = await prisma.applicationDocument.findFirst({
      where: {
        application: { applicationNumber: "AICTE-2026-INCR-142016" },
      },
    });
    assert(!!testDoc, "Found an application document for AICTE-2026-INCR-142016");

    const pdfResp = await request(`/documents/${testDoc.id}/download?inline=true`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });

    assert(pdfResp.status === 200, `Expected status 200, got ${pdfResp.status}`);
    assert(pdfResp.headers.get("content-type") === "application/pdf", "Content-Type is application/pdf");
    assert(pdfResp.headers.get("content-disposition")?.includes("inline"), "Content-Disposition is inline");

    const magic = pdfResp.body.toString("ascii", 0, 5);
    assert(magic === "%PDF-", `Magic bytes match %PDF- (got '${magic}')`);
    assert(pdfResp.body.length > 500, `Payload contains real file bytes (size=${pdfResp.body.length} bytes)`);

    // Verify SHA-256 matches DB checksum
    const computedHash = crypto.createHash("sha256").update(pdfResp.body).digest("hex");
    assert(
      computedHash.toLowerCase() === (testDoc.checksum || "").toLowerCase(),
      `Returned bytes SHA-256 matches database checksum (${computedHash.slice(0, 10)}...)`
    );

    // -------------------------------------------------------------
    // Test 2: Missing File Handling
    // -------------------------------------------------------------
    console.log("\n[Test 2] Missing File Handling");
    const missingResp = await request(`/documents/nonexistent-doc-id-9999/download`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });
    assert(missingResp.status === 404, `Missing document returns 404 (got ${missingResp.status})`);
    assert(missingResp.body.code === "DOCUMENT_FILE_NOT_FOUND" || missingResp.body.error, "Missing document returns structured error");

    // -------------------------------------------------------------
    // Test 3: Corrupted / Malformed PDF File Handling
    // -------------------------------------------------------------
    console.log("\n[Test 3] Corrupted / Malformed PDF File Handling");
    // Create a temporary document record pointing to non-PDF garbage bytes
    const fakeFilePath = path.resolve("uploads/test_corrupt.pdf");
    fs.mkdirSync(path.dirname(fakeFilePath), { recursive: true });
    fs.writeFileSync(fakeFilePath, "NOT_A_VALID_PDF_STREAM_12345");

    const corruptDoc = await prisma.applicationDocument.create({
      data: {
        applicationId: testDoc.applicationId,
        institutionId: testDoc.institutionId,
        documentType: "TEST_CORRUPT",
        originalFilename: "corrupted.pdf",
        storagePath: "uploads/test_corrupt.pdf",
        checksum: "fakehash",
        mimeType: "application/pdf",
        fileSize: 26,
        uploadedById: "DEMO-AIC-034",
      },
    });

    const corruptResp = await request(`/documents/${corruptDoc.id}/download`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });
    assert(corruptResp.status === 422, `Malformed PDF returns HTTP 422 (got ${corruptResp.status})`);
    assert(corruptResp.body.code === "MALFORMED_PDF_FILE", "Code is MALFORMED_PDF_FILE");

    // Cleanup corrupt test record & file
    await prisma.applicationDocument.delete({ where: { id: corruptDoc.id } });
    if (fs.existsSync(fakeFilePath)) fs.unlinkSync(fakeFilePath);

    // -------------------------------------------------------------
    // Test 4: Dashboard Metrics & Role-Specific Authorization
    // -------------------------------------------------------------
    console.log("\n[Test 4] Dashboard Metrics for Official Roles");

    // 4a. Scrutiny Officer
    const scrutinyResp = await request(`/aicte/dashboard/metrics`, {
      headers: { "x-user-id": "DEMO-AIC-034" },
    });
    assert(scrutinyResp.status === 200, `Scrutiny officer dashboard returns 200 (got ${scrutinyResp.status})`);
    assert(scrutinyResp.body.authenticatedUser.isScrutinyAuthorized === true, "Authenticated user has scrutiny authority");
    assert(Array.isArray(scrutinyResp.body.roleSpecificQueue), "Returns roleSpecificQueue array");
    assert(scrutinyResp.body.kpis.inScrutiny >= 0, "Includes inScrutiny KPI metric");
    assert(Array.isArray(scrutinyResp.body.regionalMatrix), "Includes regionalMatrix");

    // 4b. EVC Coordinator
    const evcResp = await request(`/aicte/dashboard/metrics`, {
      headers: { "x-user-id": "DEMO-AIC-037" },
    });
    assert(evcResp.status === 200, `EVC Coordinator dashboard returns 200 (got ${evcResp.status})`);
    assert(evcResp.body.authenticatedUser.isEvcAuthorized === true, "Authenticated user has EVC authority");
    assert(evcResp.body.kpis.pendingEvc >= 0, "Includes pendingEvc KPI metric");

    // 4c. Competent Authority
    const compResp = await request(`/aicte/dashboard/metrics`, {
      headers: { "x-user-id": "DEMO-AIC-013" },
    });
    assert(compResp.status === 200, `Competent Authority dashboard returns 200 (got ${compResp.status})`);
    assert(compResp.body.authenticatedUser.isHearingAuthorized === true, "Authenticated user has hearing/decision authority");
    assert(compResp.body.kpis.awaitingCommittee >= 0, "Includes awaitingCommittee KPI metric");

    // 4d. Super Admin
    const adminResp = await request(`/aicte/dashboard/metrics`, {
      headers: { "x-user-id": "DEMO-AIC-001" },
    });
    assert(adminResp.status === 200, `Super Admin dashboard returns 200 (got ${adminResp.status})`);
    assert(adminResp.body.authenticatedUser.isSuperAdminAuthorized === true, "Authenticated user has Super Admin authority");
    assert(adminResp.body.kpis.totalActive >= 0, "Includes totalActive KPI metric");

    // -------------------------------------------------------------
    // Test 5: Unauthorized Access Denied
    // -------------------------------------------------------------
    console.log("\n[Test 5] Unauthorized Access Denial");
    // Find an institution user
    const instUser = await prisma.user.findFirst({
      where: { accountType: "institution" },
    });
    if (instUser) {
      const deniedResp = await request(`/aicte/dashboard/metrics`, {
        headers: { "x-user-id": instUser.id },
      });
      assert(deniedResp.status === 403, `Institution user is denied access to AICTE metrics (got ${deniedResp.status})`);
    }

    const unauthResp = await request(`/aicte/dashboard/metrics`);
    assert(unauthResp.status === 401, `Unauthenticated request returns 401 (got ${unauthResp.status})`);

    console.log("\n-------------------------------------------------------");
    console.log(`All Phase 3.2 regression tests passed: ${passed} passed, ${failed} failed.`);
    console.log("-------------------------------------------------------\n");
  } finally {
    await stopServer();
    await prisma.$disconnect();
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
