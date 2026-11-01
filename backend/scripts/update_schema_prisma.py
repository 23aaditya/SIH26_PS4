from pathlib import Path

schema_path = Path("backend/prisma/schema.prisma")
content = schema_path.read_text(encoding="utf-8")

old_text = "  undertakingEvidence UndertakingEvidence[]\n}"
if old_text not in content and "  undertakingEvidence UndertakingEvidence[]\r\n}" in content:
    old_text = "  undertakingEvidence UndertakingEvidence[]\r\n}"
    newline = "\r\n"
else:
    newline = "\n"

new_text = (
    f"  undertakingEvidence UndertakingEvidence[]{newline}"
    f"  isCurrent           Boolean               @default(true){newline}"
    f"  supersededAt        DateTime?{newline}"
    f"  versionNumber       Int                   @default(1){newline}{newline}"
    f"  @@index([applicationId, documentRequirementId, isCurrent]){newline}"
    f"}}{newline}{newline}"
    f"model DocumentPrevalidationOutbox {{{newline}"
    f"  id                    String                @id @default(cuid()){newline}"
    f"  applicationId         String{newline}"
    f"  documentId            String{newline}"
    f"  institutionId         String{newline}"
    f"  requirementId         String{newline}"
    f"  checksum              String{newline}"
    f"  documentName          String{newline}"
    f"  storagePath           String{newline}"
    f"  payloadJson           String{newline}"
    f"  status                String                @default(\"PENDING\"){newline}"
    f"  attempts              Int                   @default(0){newline}"
    f"  lastError             String?{newline}"
    f"  createdAt             DateTime              @default(now()){newline}"
    f"  updatedAt             DateTime              @updatedAt{newline}"
    f"  deliveredAt           DateTime?{newline}{newline}"
    f"  @@index([status, createdAt]){newline}"
    f"}}"
)

assert old_text in content, "old_text target not found in schema.prisma"
updated = content.replace(old_text, new_text, 1)
schema_path.write_text(updated, encoding="utf-8")
print("Successfully updated backend/prisma/schema.prisma")
