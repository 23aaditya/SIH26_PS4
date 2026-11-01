import app from "./app.js";
import prisma from "./db/prisma.js";
import { ensureDatabaseIndexes } from "./db/ensureIndexes.js";
import { syncAphCompliance } from "./services/aphComplianceSync.service.js";

const PORT = process.env.PORT || 4000;

async function startServer() {
  // Explicit, idempotent database index initialization step
  // Runs before accepting any incoming HTTP requests
  await ensureDatabaseIndexes(prisma);

  // Authoritative APH 2024-2027 statutory document requirement sync
  try {
    await syncAphCompliance();
  } catch (syncErr) {
    console.warn("WARNING: APH compliance sync encountered non-fatal issue:", syncErr.message);
  }

  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  AICTE PS4 Express API Server running on port ${PORT} `);
    console.log(`  URL: http://localhost:${PORT}/api                  `);
    console.log(`  Health Check: http://localhost:${PORT}/api/health  `);
    console.log(`  Connected Database: SQLite (dev.db) via Prisma      `);
    console.log(`====================================================`);
  });
}

startServer().catch((err) => {
  console.error("FATAL: Express server startup failed during database initialization:", err);
  process.exit(1);
});
