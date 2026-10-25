import app from "./app.js";

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  AICTE PS4 Express API Server running on port ${PORT} `);
  console.log(`  URL: http://localhost:${PORT}/api                  `);
  console.log(`  Health Check: http://localhost:${PORT}/api/health  `);
  console.log(`  Connected Database: SQLite (dev.db) via Prisma      `);
  console.log(`====================================================`);
});
