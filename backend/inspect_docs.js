import prisma from "./src/db/prisma.js";
import fs from "fs";
import path from "path";

async function main() {
  const docs = await prisma.applicationDocument.findMany({
    include: { application: true }
  });
  console.log(`Total documents: ${docs.length}`);
  for (const d of docs) {
    const fullPath = d.storagePath ? path.resolve(d.storagePath) : null;
    const exists = fullPath ? fs.existsSync(fullPath) : false;
    let size = 0;
    let header = "";
    if (exists) {
      size = fs.statSync(fullPath).size;
      const buf = fs.readFileSync(fullPath);
      header = buf.toString("utf8", 0, Math.min(size, 40)).replace(/\r?\n/g, "\\n");
    }
    console.log(`- ID: ${d.id}`);
    console.log(`  App: ${d.application?.applicationNumber} (${d.applicationId})`);
    console.log(`  File: ${d.originalFilename}`);
    console.log(`  Path: ${d.storagePath} (exists: ${exists}, size: ${size} bytes)`);
    console.log(`  Header: ${header}`);
    console.log(`  Checksum: ${d.checksum}`);
  }
}

main().finally(() => prisma.$disconnect());
