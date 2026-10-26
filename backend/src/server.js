import app from "./app.js";
import prisma from "./db/prisma.js";
import { ensureDatabaseIndexes } from "./db/ensureIndexes.js";

const PORT = process.env.PORT || 4000;

async function startServer() {
  // Explicit, idempotent database index initialization step
  // Runs before accepting any incoming HTTP requests
  await ensureDatabaseIndexes(prisma);

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
