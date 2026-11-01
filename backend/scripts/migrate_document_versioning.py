"""
Production Migration Script: Add Document Versioning and Prevalidation Outbox (Phase 2).
Safely adds isCurrent, supersededAt, versionNumber, DocumentPrevalidationOutbox table,
and partial unique index idx_one_current_application_document to dev.db.
Preserves all historical documents, audit history, and physical files.
"""

import sqlite3
import shutil
from pathlib import Path

DEV_DB = Path("backend/prisma/dev.db")
BACKUP_DB = Path("backend/prisma/dev.db.bak_pre_versioning")

def migrate():
    print(f"Creating backup of dev.db at {BACKUP_DB}...")
    shutil.copyfile(DEV_DB, BACKUP_DB)

    conn = sqlite3.connect(DEV_DB)
    cur = conn.cursor()

    cur.execute("PRAGMA table_info(ApplicationDocument)")
    existing_cols = [r[1] for r in cur.fetchall()]

    if "isCurrent" not in existing_cols:
        print("Adding column isCurrent to ApplicationDocument...")
        cur.execute("ALTER TABLE ApplicationDocument ADD COLUMN isCurrent INTEGER NOT NULL DEFAULT 1")
    if "supersededAt" not in existing_cols:
        print("Adding column supersededAt to ApplicationDocument...")
        cur.execute("ALTER TABLE ApplicationDocument ADD COLUMN supersededAt DATETIME")
    if "versionNumber" not in existing_cols:
        print("Adding column versionNumber to ApplicationDocument...")
        cur.execute("ALTER TABLE ApplicationDocument ADD COLUMN versionNumber INTEGER NOT NULL DEFAULT 1")

    # Create DocumentPrevalidationOutbox table
    print("Creating DocumentPrevalidationOutbox table...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS DocumentPrevalidationOutbox (
            id TEXT PRIMARY KEY,
            applicationId TEXT NOT NULL,
            documentId TEXT NOT NULL,
            institutionId TEXT NOT NULL,
            requirementId TEXT NOT NULL,
            checksum TEXT NOT NULL,
            documentName TEXT NOT NULL,
            storagePath TEXT NOT NULL,
            payloadJson TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'PENDING',
            attempts INTEGER NOT NULL DEFAULT 0,
            lastError TEXT,
            createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            deliveredAt DATETIME
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_outbox_status_created ON DocumentPrevalidationOutbox (status, createdAt)")

    # Reconcile existing records if any duplicates exist
    cur.execute("""
        SELECT applicationId, documentRequirementId, COUNT(*) 
        FROM ApplicationDocument 
        WHERE documentRequirementId IS NOT NULL 
        GROUP BY applicationId, documentRequirementId 
        HAVING COUNT(*) > 1
    """)
    dupes = cur.fetchall()
    print(f"Reconciling duplicate records... found {len(dupes)} groups.")

    for app_id, req_id, count in dupes:
        cur.execute("""
            SELECT id, uploadedAt 
            FROM ApplicationDocument 
            WHERE applicationId = ? AND documentRequirementId = ?
            ORDER BY uploadedAt ASC, id ASC
        """, (app_id, req_id))
        rows = cur.fetchall()
        total = len(rows)
        for idx, (doc_id, up_at) in enumerate(rows):
            v_num = idx + 1
            if idx < total - 1:
                next_up = rows[idx + 1][1]
                cur.execute("""
                    UPDATE ApplicationDocument 
                    SET isCurrent = 0, supersededAt = ?, versionNumber = ?
                    WHERE id = ?
                """, (next_up, v_num, doc_id))
            else:
                cur.execute("""
                    UPDATE ApplicationDocument 
                    SET isCurrent = 1, supersededAt = NULL, versionNumber = ?
                    WHERE id = ?
                """, (v_num, doc_id))

    conn.commit()

    # Create partial unique index
    print("Creating partial unique index idx_one_current_application_document...")
    cur.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_one_current_application_document
        ON ApplicationDocument(applicationId, documentRequirementId)
        WHERE isCurrent = 1 AND documentRequirementId IS NOT NULL
    """)
    conn.commit()
    conn.close()
    print("Migration completed successfully!")

if __name__ == "__main__":
    migrate()
