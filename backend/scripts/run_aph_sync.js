import { syncAphCompliance } from "../src/services/aphComplianceSync.service.js";
import prisma from "../src/db/prisma.js";

async function main() {
  try {
    const summary = await syncAphCompliance();
    console.log("Sync succeeded:", summary);
  } catch (err) {
    console.error("Sync failed:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

