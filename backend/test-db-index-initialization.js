/**
 * D-01 Verification Suite:
 * Tests reproducible SQLite partial unique index creation, idempotency,
 * sqlite_master verification, and audited reconciliation of existing duplicate rows.
 */
import prisma from "./src/db/prisma.js";
import { ensureDatabaseIndexes } from "./src/db/ensureIndexes.js";

async function runD01Tests() {
  console.log("=====================================================");
  console.log("Starting D-01 Partial Unique Index Verification Suite");
  console.log("=====================================================\n");

  // Test 1: Idempotent initialization
  console.log("1. Testing initial index creation and verification in sqlite_master...");
  const res1 = await ensureDatabaseIndexes(prisma);
  if (!res1.success || res1.indexName !== "idx_unique_ai_report_version") {
    throw new Error("Test 1 failed: Index not created properly");
  }
  console.log("✅ PASS: Index created and verified in sqlite_master:", res1.sql);

  // Test 2: Double initialization (idempotency check)
  console.log("\n2. Testing repeated initialization (idempotency)...");
  const res2 = await ensureDatabaseIndexes(prisma);
  if (!res2.success || res2.indexName !== "idx_unique_ai_report_version") {
    throw new Error("Test 2 failed: Idempotent initialization failed");
  }
  console.log("✅ PASS: Double initialization succeeded idempotently");

  // Test 3: Duplicate row detection and audited reconciliation
  console.log("\n3. Testing duplicate-row detection and audited reconciliation...");
  
  // Find an eligible application and stage to construct test reports
  const stage = await prisma.workflowStageInstance.findFirst({
    where: { stageKey: "scrutiny" },
  });
  if (!stage) throw new Error("No scrutiny stage found for test");

  const testAppId = stage.applicationId;
  const duplicateVersionHash = "vhash_dup_test_" + Date.now();

  // Temporarily drop index to simulate legacy database with duplicate rows
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS idx_unique_ai_report_version;`);

  // Insert two duplicate ReviewReport rows directly
  const now = new Date();
  const rep1 = await prisma.reviewReport.create({
    data: {
      workflowStageId: stage.id,
      applicationId: testAppId,
      reportType: "AI_SCRUTINY_PRE_CHECK",
      title: "Canonical Earliest Report",
      content: "First report content",
      outcome: "DEFICIENCY_SUGGESTED",
      versionHash: duplicateVersionHash,
      submittedAt: new Date(now.getTime() - 10000), // 10s earlier
    },
  });

  const rep2 = await prisma.reviewReport.create({
    data: {
      workflowStageId: stage.id,
      applicationId: testAppId,
      reportType: "AI_SCRUTINY_PRE_CHECK",
      title: "Redundant Duplicate Report",
      content: "Duplicate report content",
      outcome: "DEFICIENCY_SUGGESTED",
      versionHash: duplicateVersionHash,
      submittedAt: now,
    },
  });

  console.log(`Created test duplicates: rep1=${rep1.id} (canonical), rep2=${rep2.id} (duplicate)`);

  // Run ensureDatabaseIndexes — it must detect duplicates, reconcile them, and create the unique index
  const res3 = await ensureDatabaseIndexes(prisma);
  if (!res3.success) throw new Error("Test 3 failed: Reconciliation failed");

  // Verify that only the canonical report remains in ReviewReport
  const remainingReports = await prisma.reviewReport.findMany({
    where: {
      applicationId: testAppId,
      reportType: "AI_SCRUTINY_PRE_CHECK",
      versionHash: duplicateVersionHash,
    },
  });

  if (remainingReports.length !== 1) {
    throw new Error(`Expected exactly 1 remaining report, found ${remainingReports.length}`);
  }
  if (remainingReports[0].id !== rep1.id) {
    throw new Error(`Expected canonical report ${rep1.id} to be preserved, but found ${remainingReports[0].id}`);
  }
  console.log("✅ PASS: Audited reconciliation preserved canonical report and removed duplicate");

  // Clean up test report
  await prisma.reviewReport.delete({ where: { id: rep1.id } });

  console.log("\n=====================================================");
  console.log("All D-01 Index Initialization Checks PASSED (100%)");
  console.log("=====================================================");
  process.exit(0);
}

runD01Tests().catch((err) => {
  console.error("D-01 Test Suite Failed:", err);
  process.exit(1);
});
