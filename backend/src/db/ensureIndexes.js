import prismaClient from "./prisma.js";

/**
 * Ensures required database indexes exist on the SQLite database,
 * specifically the partial unique index on ReviewReport for AI_SCRUTINY_PRE_CHECK idempotency.
 * 
 * Performs safe pre-check for existing duplicate rows before creating the unique index.
 */
export async function ensureDatabaseIndexes(prisma = prismaClient) {
  // 1. Detect any duplicate AI_SCRUTINY_PRE_CHECK rows with the same applicationId and versionHash
  const duplicates = await prisma.$queryRawUnsafe(`
    SELECT applicationId, versionHash, COUNT(*) as count, GROUP_CONCAT(id) as ids
    FROM ReviewReport
    WHERE reportType = 'AI_SCRUTINY_PRE_CHECK' AND versionHash IS NOT NULL
    GROUP BY applicationId, versionHash
    HAVING COUNT(*) > 1
  `);

  if (duplicates && duplicates.length > 0) {
    console.warn(`[DB-INIT] Detected ${duplicates.length} duplicate ReviewReport group(s) with identical (applicationId, versionHash):`);
    for (const dup of duplicates) {
      const ids = String(dup.ids).split(",");
      console.warn(`  - App: ${dup.applicationId}, versionHash: ${dup.versionHash}, Count: ${dup.count}, IDs: ${dup.ids}`);

      // Audited reconciliation: preserve the earliest submitted report (canonical), remove redundant duplicates
      const reports = await prisma.reviewReport.findMany({
        where: { id: { in: ids } },
        orderBy: { submittedAt: "asc" },
      });

      if (reports.length > 1) {
        const canonical = reports[0];
        const redundant = reports.slice(1);

        console.warn(`    Preserving canonical report: ${canonical.id} (submittedAt: ${canonical.submittedAt.toISOString()})`);
        for (const red of redundant) {
          console.warn(`    Reconciling redundant duplicate: ${red.id}`);
          // Log audit event for reconciliation traceability
          await prisma.auditEvent.create({
            data: {
              applicationId: canonical.applicationId,
              action: "REPORT_DUPLICATE_RECONCILED",
              actorRole: "system",
              reason: `Reconciled duplicate AI report ${red.id} in favor of canonical report ${canonical.id} during partial unique index migration.`,
            },
          }).catch(() => {});

          // Remove redundant duplicate row
          await prisma.reviewReport.delete({ where: { id: red.id } });
        }
      }
    }
  }

  // 2. Create the SQLite partial unique index idempotently
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_ai_report_version
    ON ReviewReport (applicationId, reportType, versionHash)
    WHERE reportType = 'AI_SCRUTINY_PRE_CHECK'
    AND versionHash IS NOT NULL;
  `);

  // 3. Confirm the actual SQLite index definition directly from sqlite_master
  const indexRows = await prisma.$queryRawUnsafe(`
    SELECT name, tbl_name, sql 
    FROM sqlite_master 
    WHERE type = 'index' AND name = 'idx_unique_ai_report_version';
  `);

  if (!indexRows || indexRows.length === 0) {
    throw new Error("Failed to verify SQLite index 'idx_unique_ai_report_version' in sqlite_master after creation.");
  }

  return {
    success: true,
    indexName: indexRows[0].name,
    tableName: indexRows[0].tbl_name,
    sql: indexRows[0].sql,
  };
}

// Allow direct CLI execution: node backend/src/db/ensureIndexes.js
if (process.argv[1]?.endsWith("ensureIndexes.js")) {
  ensureDatabaseIndexes(prismaClient)
    .then((result) => {
      console.log("Index initialization result:", result);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Index initialization error:", err);
      process.exit(1);
    });
}
