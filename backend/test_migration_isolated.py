"""
Isolated Database Migration & Backfill Test Script (Phase 2).
Tests document versioning columns, reconciliation backfill, and partial unique index on an isolated test database.
"""

import sqlite3
import shutil
from pathlib import Path

SOURCE_DB = Path("backend/prisma/dev.db")
TEST_DB = Path("backend/prisma/test_migration.db")

def test_migration_and_backfill():
    print(f"Creating isolated copy from {SOURCE_DB} to {TEST_DB}...")
    shutil.copyfile(SOURCE_DB, TEST_DB)

    conn = sqlite3.connect(TEST_DB)
    cur = conn.cursor()

    # 1. Check existing table columns
    cur.execute("PRAGMA table_info(ApplicationDocument)")
    existing_cols = [r[1] for r in cur.fetchall()]
    print("Existing columns:", existing_cols)

    # 2. Add versioning columns if not present
    if "isCurrent" not in existing_cols:
        print("Adding column isCurrent...")
        cur.execute("ALTER TABLE ApplicationDocument ADD COLUMN isCurrent INTEGER NOT NULL DEFAULT 1")
    if "supersededAt" not in existing_cols:
        print("Adding column supersededAt...")
        cur.execute("ALTER TABLE ApplicationDocument ADD COLUMN supersededAt DATETIME")
    if "versionNumber" not in existing_cols:
        print("Adding column versionNumber...")
        cur.execute("ALTER TABLE ApplicationDocument ADD COLUMN versionNumber INTEGER NOT NULL DEFAULT 1")

    # 3. Create DocumentPrevalidationOutbox table
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

    # 4. Reconcile existing duplicate records
    cur.execute("""
        SELECT applicationId, documentRequirementId, COUNT(*) 
        FROM ApplicationDocument 
        WHERE documentRequirementId IS NOT NULL 
        GROUP BY applicationId, documentRequirementId 
        HAVING COUNT(*) > 1
    """)
    dupes = cur.fetchall()
    print(f"Found {len(dupes)} duplicate groups to reconcile.")

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

    # 5. Apply partial unique index
    print("Creating partial unique index idx_one_current_application_document...")
    cur.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_one_current_application_document
        ON ApplicationDocument(applicationId, documentRequirementId)
        WHERE isCurrent = 1 AND documentRequirementId IS NOT NULL
    """)
    conn.commit()

    # 6. Test index enforcement
    print("Testing unique constraint enforcement...")
    # Insert a dummy record
    cur.execute("""
        INSERT INTO ApplicationDocument (
            id, applicationId, institutionId, documentType, originalFilename,
            uploadedById, isCurrent, documentRequirementId
        ) VALUES (
            'test_doc_1', 'test_app_x', 'test_inst_x', 'Test Doc', 'doc1.pdf',
            'user-1', 1, 'req_nba'
        )
    """)
    conn.commit()

    # Attempting to insert a duplicate current record for the same req_nba must fail
    try:
        cur.execute("""
            INSERT INTO ApplicationDocument (
                id, applicationId, institutionId, documentType, originalFilename,
                uploadedById, isCurrent, documentRequirementId
            ) VALUES (
                'test_doc_2', 'test_app_x', 'test_inst_x', 'Test Doc 2', 'doc2.pdf',
                'user-1', 1, 'req_nba'
            )
        """)
        conn.commit()
        raise AssertionError("Expected sqlite3.IntegrityError on duplicate current document!")
    except sqlite3.IntegrityError:
        print("Verified: Duplicate current document correctly rejected by unique constraint.")

    # Inserting a superseded record (isCurrent = 0) for the same req_nba must succeed
    cur.execute("""
        INSERT INTO ApplicationDocument (
            id, applicationId, institutionId, documentType, originalFilename,
            uploadedById, isCurrent, documentRequirementId
        ) VALUES (
            'test_doc_superseded', 'test_app_x', 'test_inst_x', 'Test Doc Superseded', 'doc_old.pdf',
            'user-1', 0, 'req_nba'
        )
    """)
    conn.commit()
    print("Verified: Superseded document (isCurrent=0) successfully permitted.")

    # Inserting multiple records with null documentRequirementId must succeed
    cur.execute("""
        INSERT INTO ApplicationDocument (
            id, applicationId, institutionId, documentType, originalFilename,
            uploadedById, isCurrent, documentRequirementId
        ) VALUES (
            'test_doc_null_1', 'test_app_x', 'test_inst_x', 'Ad-hoc Doc 1', 'adhoc1.pdf',
            'user-1', 1, NULL
        )
    """)
    cur.execute("""
        INSERT INTO ApplicationDocument (
            id, applicationId, institutionId, documentType, originalFilename,
            uploadedById, isCurrent, documentRequirementId
        ) VALUES (
            'test_doc_null_2', 'test_app_x', 'test_inst_x', 'Ad-hoc Doc 2', 'adhoc2.pdf',
            'user-1', 1, NULL
        )
    """)
    conn.commit()
    print("Verified: Multiple ad-hoc uploads with null requirement ID successfully permitted.")

    conn.close()
    if TEST_DB.exists():
        TEST_DB.unlink()
    print("ALL ISOLATED DATABASE MIGRATION TESTS PASSED CLEANLY!")

if __name__ == "__main__":
    test_migration_and_backfill()
