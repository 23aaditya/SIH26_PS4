# Architectural Feasibility Study & Implementation Plan: Institute-Side AI Document Pre-Validation Using the Groq Scrutiny Engine

**Document Reference:** `AICTE-ARCH-2026-DOC-PREVAL-01-REV4`  
**Target Release:** AICTE Approval Workflow Automation 2026–2027  
**Author:** AICTE Platform Architecture & Scrutiny Engineering Team  
**Status:** CONSOLIDATED ARCHITECTURAL PLAN (REV4 FINAL ENGINEERING CORRECTIONS)  
**Classification:** Internal Technical Architecture Plan  

---

## Document Revision History & Change Log

| Revision | Date | Author | Summary of Changes |
|---|---|---|---|
| `REV1` | 2026-11-01 | Architecture Team | Initial feasibility study and implementation plan. |
| `REV2` | 2026-11-01 | Architecture Team | Architectural corrections following review (bounded assessment scope, multi-condition parsing, dynamic quotas, non-destructive versioning). |
| `REV3` | 2026-11-01 | Architecture Team | Technical corrections: separated `job_status` from `classification_result`, extended active job unique index to `RETRY_SCHEDULED`, defined atomic job claiming, application-scoped cache key, minimal Prisma schema migration, dedicated `DocumentPrevalidationRecoveryWorker`, operational quotas, and side-effect tests. |
| `REV4` | 2026-11-01 | Architecture Team | **Final Engineering Corrections:**<br>1. **Durable PDF Byte Persistence:** Formalized disk-backed staging storage (`ai-service/staging/prevalidation/{job_id}.pdf`) with cryptographic verification before HTTP 202 acknowledgment, persistent file path tracking in SQLite, recovery worker disk access, and 24h retention cleanup.<br>2. **One Current Document Enforcement:** Defined SQLite partial unique index (`idx_one_current_application_document ... WHERE isCurrent = 1`) and verified compatibility with SQLite/Prisma.<br>3. **Existing Document Migration Backfill:** Formalized safe pre-migration audit and backfill sequence to group existing documents, reconcile `isCurrent`, assign `versionNumber`, preserve audit history, and safely apply the partial unique index without data loss.<br>4. **Worker Lease Heartbeats & Fencing Protection:** Implemented dynamic 60s lease duration, 20s periodic background heartbeat renewals, and claim-token fencing (`WHERE claim_token = :my_token`) to prevent stale workers from overwriting newer worker results or causing duplicate executions during long Groq calls.<br>5. **Precise Priority Scheduler Criteria:** Clarified that priority applies strictly to future queue reservations (next available permitted slot ahead of normal requests); prohibited bypassing active cooldowns, exceeding RPM/TPM ceilings, or cancelling in-flight Groq requests. |

---

## Executive Summary

Under the current AICTE Approval Workflow, applicant institutions upload statutory documents in **Step 5 (Statutory Document Checklist & Upload)** of the application wizard. These documents are only qualitatively scrutinized downstream by the AI Scrutiny Officer pipeline *after* formal submission and fee payment. Consequently, avoidable administrative deficiencies—such as uploading an unrelated document (e.g., a Land Title Deed in place of an NBA Accreditation Certificate), uploading an unreadable file, or attaching an incomplete resolution—are only discovered during formal scrutiny. This triggers statutory deficiency notices, mandatory institutional clarification cycles, and delayed committee hearings.

This document presents the consolidated architectural plan for **Institute-Side AI Document Pre-Validation**. Whenever an institution uploads a document against an upload field, the system automatically performs a targeted, document-level qualitative assessment using the **existing Groq LLM Scrutiny Engine**.

### Fundamental Architectural Tenet: Zero Engine Duplication
This feature **does NOT** build a separate document-analysis engine, introduce duplicate LLM clients, or create isolated prompts. Instead, it reuses:
1. `DocumentExtractor` (PyMuPDF `fitz` extraction with multi-condition PDF structure analysis).
2. `GroqScrutinyClient` and model configuration (`qwen/qwen3.8-27b`).
3. Centralized `groq_scheduler` with cross-process SQLite concurrency control, dynamic RPM/TPM rate limiting, and prioritized quota preservation.
4. Evidence extraction, strict quote verification, and facts-vs-inference qualitative schemas.
5. Canonical APH 2024–2027 dynamic compliance manifests across all 16 institutional application categories.

---

## 1. Scope and Regulatory Boundaries of Groq Document Assessment

### 1.1 Permitted Scope of Assessment
The Groq LLM Qualitative Assessment is strictly designed to perform:
- **Document-Type Matching:** Assessing whether the extracted textual content corresponds to the nature and purpose of the selected upload field (e.g., distinguishing a Land Sale Deed from an NBA Accreditation Certificate).
- **Content-Relevance Assessment:** Determining whether the substantive text addresses the statutory subject matter described in the applicable AICTE Approval Process Handbook (APH) clause.
- **Completeness Heuristic:** Identifying whether substantive text is available or if essential sections appear missing from the extracted pages.

### 1.2 Explicit Non-Capabilities and Prohibited Claims
Under no circumstances shall the Groq prompt, response schema, or user interface state or imply that the system has verified:
1. **Document Authenticity or Genuineness:** The LLM inspects raw extracted characters; it cannot verify whether a physical or digital document is genuine, forged, or altered.
2. **Legal Validity:** The system cannot evaluate legal enforceability, court standing, or statutory validity under Indian law.
3. **Certificate Validity Period or Accreditation Standing:** The LLM cannot certify that an institution is currently accredited by NBA/NAAC; it only notes dates mentioned in the text.
4. **Digital Signatures or Cryptographic Hashes:** PyMuPDF text extraction does not validate PKI digital signatures (DSC/eSign).
5. **Stamps, Seals, or Notary Attestations:** Visual notary seals, rubber stamps, and physical signatures cannot be certified via text-stream LLM analysis.

### 1.3 Prescribed System Prompt Core Instruction
In accordance with this strictly bounded scope, all pre-validation prompts replace claims of authenticity with:
> *"Determine whether the extracted document content appears relevant to the selected document requirement and whether sufficient substantive information is available for preliminary assessment."*

---

## 2. Document Parsing, Scanned PDFs, and Insufficient-Text Handling

### 2.1 Multi-Condition Document Classification
The extraction heuristic in `ai-service/extractor.py` must **never** automatically classify a document as incorrect or mismatched simply because extractable text is short or absent.

The extraction pipeline classifies uploaded documents into five distinct states:

```
                                [Uploaded PDF Bytes]
                                         │
                                         ▼
                            DocumentExtractor Parsing
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 │                                               │
           [Parser Error]                                [Valid PDF Stream]
                 │                                               │
                 ▼                                               ▼
         CORRUPTED_FILE                                    Inspect Pages &
    "File damaged/unreadable"                               Total Chars
                                                                 │
                 ┌───────────────────────┬───────────────────────┴───────────────────────┐
                 │                       │                                               │
           total_chars = 0         total_chars < 40                              total_chars >= 40
          and zero raster          has raster/images                                     │
                 │                       │                                               │
                 ▼                                                                       ▼
             BLANK_PDF               IMAGE_ONLY_SCANNED                          Evaluate Text Density
      "Document is empty"        "Text-based check unavailable;                          │
                                  manual inspection required"            ┌───────────────┴───────────────┐
                                                                         │                               │
                                                                   total_chars < 150              total_chars >= 150
                                                                         │                               │
                                                                         ▼                               ▼
                                                                SHORT_OR_BRIEF_TEXT           RELEVANT_DIGITAL_TEXT
                                                            "Manual review / brief text"    Proceed to Groq Pre-Val
```

### 2.2 Status Mapping & Guidance Messages

| Extracted State | Internal Status | UI Badge | Institution Advisory Wording | Token Cost |
|---|---|---|---|---|
| **Image-Only Scanned PDF** | `MANUAL_REVIEW_REQUIRED` | `Scanned Document (Manual Review Required)` | *"Automatic text-based assessment is unavailable for this document. This does not necessarily mean the document is incorrect. Please verify that the complete document has been uploaded. The document will undergo manual inspection by the Scrutiny Officer."* | **0 Tokens** |
| **Corrupted / Invalid File** | `TECHNICAL_FAILURE` | `Unreadable File Format` | *"The uploaded file could not be read or parsed. Please verify that the file is not corrupted, password-protected, or damaged, and re-upload."* | **0 Tokens** |
| **Blank PDF** | `INSUFFICIENT_EVIDENCE` | `Blank Document Detected` | *"The uploaded document appears to contain blank or empty pages. Please inspect your file and re-upload the complete document."* | **0 Tokens** |
| **Legitimate Short Digital Certificate** ($< 150$ chars) | `MANUAL_REVIEW_REQUIRED` | `Short Digital Certificate (Manual Review)` | *"Extracted text is brief (e.g. single-page sanction/certificate). Document appears readable but contains limited text for automated scoring; it will be verified manually by the Scrutiny Officer."* | **0 Tokens** |
| **Substantive Digital Text** ($\ge 150$ chars) | `PROCEED_TO_LLM` | `Analyzing Content...` | Processed via scheduled Groq LLM inference. | 1 Slot |

---

## 3. Dynamic Shared Groq Scheduler & Priority Preservation

### 3.1 Operationally Verifiable Quota Architecture
The scheduler treats all RPM and TPM limits as **configurable variables requiring operational verification against the actual Groq account and model quota**.

- Default base configuration from `ai-service/config.py`:
  - `GROQ_RPM_LIMIT` (Operational variable, e.g., 30)
  - `GROQ_TPM_LIMIT` (Operational variable, e.g., 8000)
  - `GROQ_SAFETY_MARGIN_PERCENT` (Default: 15.0%)
  - `GROQ_MIN_REQUEST_INTERVAL_SECONDS` (Default: 2.5s)
- **Dynamic Live Feedback:** The scheduler parses response headers:
  - `x-ratelimit-remaining-requests`
  - `x-ratelimit-remaining-tokens`
  - `x-ratelimit-reset-requests`
  - `retry-after`
- When header limits drop below the safety margin, the scheduler updates `groq_global_cooldown` in `agent_jobs.db`, dynamically throttling outbound requests.

### 3.2 Dual-Tier Priority Scheduling Policy & Precise Acceptance Criteria
Priority applies **strictly to future reservation scheduling**:
- **Officer Formal Scrutiny (`priority="high"`):** When a slot becomes available under the rate-limit window, any waiting high-priority request is granted the reservation **ahead of any waiting normal-priority requests**.
- **Institute Pre-Validation (`priority="normal"`):** Granted reservations only when active RPM $< 70\%$ of effective budget.
- **Anti-Starvation Guarantee:** If officer scrutiny load remains high, normal-priority pre-validations track their `queued_at` timestamp. After waiting $> 30\text{ seconds}$, normal requests are granted guaranteed interleaved execution (at least 1 out of every 5 granted reservations).
- **Absolute Safety Boundaries:** Priority **never**:
  1. Bypasses an active provider `Retry-After` cooldown or global backoff.
  2. Exceeds the configured RPM, TPM, or RPD ceilings.
  3. Pre-empts, aborts, or cancels an in-flight Groq request that has already been dispatched.
  4. Violates the minimum 2.5-second spacing between consecutive outbound API calls.

---

## 4. Contextual Cache Isolation and Atomic Idempotency

### 4.1 Application-Scoped Composite Cache Key
To guarantee that assessment results are strictly isolated to the exact application and academic context in which a document was submitted:

$$\text{CacheKey} = \text{SHA256}(\text{ApplicationId} \parallel \text{DocChecksum} \parallel \text{ReqId} \parallel \text{AppCategory} \parallel \text{ProgramContextHash} \parallel \text{ClauseVersion} \parallel \text{PromptVersion} \parallel \text{ModelId})$$

- `ApplicationId`: Explicit application identifier in `dev.db`. Contextual findings from one application are **never** returned for another application.
- `DocChecksum`: SHA-256 hash of the stored file bytes.
- `ReqId`: Authoritative `ApplicationDocumentRequirement.id`.
- `AppCategory`: Canonical application category (e.g., `increase_intake`).
- `ProgramContextHash`: SHA-256 of applied programmes, shifts, and courses.
- `ClauseVersion`: Canonical APH clause reference.
- `PromptVersion`: Prompt schema version string (`PV_PROMPT_V2.1`).
- `ModelId`: Active Groq model name (`qwen/qwen3.8-27b`).

This identical hash definition is calculated and verified across Express, FastAPI, and SQLite during creation, retrieval, and cache evaluation.

---

## 5. Durable PDF Byte Persistence, Staging & Retention

### 5.1 The Byte-Persistence Challenge
If FastAPI returns `HTTP 202 Accepted` after enqueuing a pre-validation job, the system must guarantee that the actual uploaded PDF bytes remain durably accessible across worker restarts, process crashes, and server reboots until processing and retention windows complete. Relying on an in-memory buffer or an uncommitted temporary operating system path causes unrecoverable worker crashes.

### 5.2 Persistent Disk-Backed Staging Architecture

```
[Express Backend]
       │ (Streams authenticated file bytes via POST /api/v1/prevalidate-document)
       ▼
[FastAPI Internal Ingestion: POST /api/v1/prevalidate-document]
       │
       ├─► 1. Compute SHA-256 stream hash & verify matches Express `checksum`
       ├─► 2. Allocate persistent staging path:
       │      `ai-service/staging/prevalidation/{job_id}.pdf`
       ├─► 3. Write bytes to disk using atomic write (fsync)
       ├─► 4. Set file permissions to 0600 (read/write by service owner only)
       ├─► 5. Persist record to `agent_jobs.db` with `staged_file_path`
       └─► 6. Return HTTP 202 Accepted { jobId, status: "QUEUED" }
```

### 5.3 Storage Specifications & Disk Safety
1. **Staging Directory:** Configured via `settings.PREVALIDATION_STAGING_DIR` (default: `ai-service/staging/prevalidation/`). Created on service startup.
2. **Disk Capacity Guard:** Before accepting an upload, FastAPI checks available filesystem space (`shutil.disk_usage`). If available storage is $< 500\text{ MB}$, the service rejects the pre-validation request with `HTTP 507 Insufficient Storage` (`STAGING_DISK_FULL`), leaving the uploaded document safely in Express.
3. **Recovery Worker Access:** When `DocumentPrevalidationRecoveryWorker` claims a job from SQLite, it reads the physical bytes directly from `staged_file_path`. If the worker restarts, the bytes remain intact on disk.
4. **Retention & Cleanup Policy:**
   - Completed jobs (`COMPLETED`) or permanently failed jobs (`FAILED` after max retries) retain their staged PDF for a configurable grace period of **24 hours** for diagnostic verification.
   - A daily cron / background janitor cleans up staged files older than 24 hours whose database state is terminal.
   - If an applicant uploads a replacement file, Express notifies FastAPI or marks the old job superseded; the janitor immediately removes the superseded staged file.

---

## 6. One Current Document Enforcement & Migration Backfill

### 6.1 Partial Unique Index in SQLite (`dev.db`)
In the relational database, an application must have at most **one active, current document per document requirement**. Historical uploads are retained for audit and deficiency review.

Prisma does not natively support partial SQL indexes in SQLite schema syntax. Therefore, the constraint is enforced via a raw SQL migration in SQLite (`dev.db`):

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_current_application_document
ON ApplicationDocument(applicationId, documentRequirementId)
WHERE isCurrent = 1;
```

**Compatibility Verification:** SQLite has supported partial indexes (`WHERE` clause in `CREATE INDEX`) natively since SQLite 3.8.0. Both Prisma raw migrations (`prisma migrate diff` / `db execute`) and `better-sqlite3` support this construct flawlessly.

### 6.2 Pre-Migration Document Reconciliation Backfill
Before applying `idx_one_current_application_document`, existing records in `dev.db` must be safely reconciled so that no existing duplicates cause migration failure or silent data loss.

#### Reconciliation & Backfill Algorithm
1. **Audit Existing Groups:**
   ```sql
   SELECT applicationId, documentRequirementId, COUNT(*) as count 
   FROM ApplicationDocument 
   WHERE documentRequirementId IS NOT NULL 
   GROUP BY applicationId, documentRequirementId 
   HAVING COUNT(*) > 1;
   ```
2. **Reconciliation Sequence:**
   For each duplicate `(applicationId, documentRequirementId)` group:
   - Order records chronologically by `uploadedAt ASC`, with secondary ordering by `id ASC`.
   - Iterate through the sorted records:
     - For records $1$ through $N-1$:
       - Set `isCurrent = 0` (superseded).
       - Set `supersededAt = record[i+1].uploadedAt`.
       - Assign `versionNumber = i`.
     - For record $N$ (latest uploaded record):
       - Set `isCurrent = 1` (current).
       - Set `supersededAt = NULL`.
       - Assign `versionNumber = N`.
3. **Safety Verification:**
   - Confirm that all foreign keys (e.g. `UndertakingEvidence`, `ReviewReport` references) remain intact.
   - Confirm that zero physical files are deleted.
   - **Ambiguity Guard:** If a group cannot be resolved confidently (e.g. multiple records with identical timestamps and no clear downstream reference), log the group to `reconciliation_audit.log` and pause migration for administrator confirmation.
4. **Apply Partial Unique Index:** Once zero duplicate `isCurrent = 1` records exist, execute `CREATE UNIQUE INDEX idx_one_current_application_document ...`.

### 6.3 Prisma Schema Definition
The updated model in `backend/prisma/schema.prisma`:

```prisma
model ApplicationDocument {
  id                    String                @id @default(cuid())
  applicationId         String
  application           Application           @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  institutionId         String
  institution           Institution           @relation(fields: [institutionId], references: [id])
  documentType          String
  originalFilename      String
  storagePath           String?
  mimeType              String?
  fileSize              Int?
  documentDate          DateTime?
  expiryDate            DateTime?
  verificationStatus    String                @default("pending")
  documentRequirementId String?
  uploadedById          String
  uploadedAt            DateTime              @default(now())
  updatedAt             DateTime              @default(now()) @updatedAt
  checksum              String?
  verifiedById          String?
  verifiedAt            DateTime?
  notes                 String?
  undertakingEvidence   UndertakingEvidence[]

  // --- VERSIONING FIELDS SUPPORTING REPLACEMENT & PARTIAL UNIQUE INDEX ---
  isCurrent             Boolean               @default(true)
  supersededAt          DateTime?
  versionNumber         Int                   @default(1)

  @@index([applicationId, documentRequirementId, isCurrent])
}
```

### 6.4 Strict Replacement Transaction Ordering
When an applicant replaces an uploaded document:
1. **Store Physical File:** Save the replacement file to disk under `uploads/`.
2. **Verify Checksum:** Calculate the SHA-256 hash from stored bytes.
3. **Execute Prisma Interactive Transaction (`prisma.$transaction`):**
   - Query existing document matching `(applicationId, documentRequirementId, isCurrent: true)`.
   - Update existing document: `{ isCurrent: false, supersededAt: new Date() }`.
   - Insert new `ApplicationDocument`:
     - `applicationId`: `application.id`
     - `documentRequirementId`: `requirement.id`
     - `isCurrent`: `true`
     - `versionNumber`: `(existing?.versionNumber || 1) + 1`
     - `checksum`: New SHA-256 hash
     - `storagePath`: New file path
     - `verificationStatus`: `"pending"`
4. **Commit Transaction:** Enforces atomicity. Concurrent replacement transactions cannot violate `idx_one_current_application_document`.
5. **Record Audit Event:** Log `DOCUMENT_SUPERSEDED` event in `dev.db`.
6. **Mark Previous Pre-Validation Record Superseded:**
   ```sql
   UPDATE document_prevalidations 
   SET is_superseded = 1 
   WHERE document_id = :previousDocId;
   ```
7. **Enqueue Pre-Validation:** Create a new `QUEUED` job for the newly created document.

---

## 7. Durable Asynchronous Execution, Worker Leases & Fencing

### 7.1 SQLite Schema (`agent_jobs.db`)
Lifecycle state is strictly separated into `job_status` (execution state machine) and `classification_result` (advisory findings). Includes staging file paths and lease fencing fields:

```sql
CREATE TABLE IF NOT EXISTS document_prevalidations (
    id TEXT PRIMARY KEY,
    job_id TEXT UNIQUE NOT NULL,
    document_id TEXT NOT NULL,
    application_id TEXT NOT NULL,
    institution_id TEXT NOT NULL,
    requirement_id TEXT NOT NULL,
    cache_key TEXT NOT NULL,
    checksum TEXT NOT NULL,
    filename TEXT NOT NULL,
    application_category TEXT NOT NULL,
    staged_file_path TEXT NOT NULL,           /* Durable disk staging path */
    
    /* Strict Lifecycle State */
    job_status TEXT NOT NULL,                 /* QUEUED, PROCESSING, RETRY_SCHEDULED, COMPLETED, FAILED */
    
    /* Strict Assessment Classification */
    classification_result TEXT,              /* LIKELY_MATCH, POSSIBLE_MISMATCH, MANUAL_REVIEW_REQUIRED, INSUFFICIENT_EVIDENCE */
    
    advisory_message TEXT,
    evidence_excerpt TEXT,
    facts_vs_inference TEXT,
    recommended_action TEXT,
    http_status INTEGER,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at REAL DEFAULT 0.0,
    
    /* Lease Heartbeat & Fencing */
    claim_token TEXT,                          /* UUID claim token */
    claimed_at REAL,                           /* Timestamp of active processing claim */
    lease_expires_at REAL DEFAULT 0.0,         /* Dynamic heartbeat expiration */
    
    is_superseded INTEGER DEFAULT 0,
    model_used TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_preval_cache_lookup 
ON document_prevalidations (cache_key);

CREATE INDEX IF NOT EXISTS idx_preval_active_poll 
ON document_prevalidations (application_id, document_id, is_superseded);

/* Active Job Partial Unique Index: Protects QUEUED, PROCESSING, and RETRY_SCHEDULED */
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_preval_job 
ON document_prevalidations (application_id, document_id)
WHERE job_status IN ('QUEUED', 'PROCESSING', 'RETRY_SCHEDULED');
```

### 7.2 Worker Lease Heartbeat & Fencing Protection Architecture
To prevent split-brain execution when a complex Groq call takes longer than an arbitrary static timeout:

```
[DocumentPrevalidationRecoveryWorker]
       │
       ├─► 1. Atomic Job Claim:
       │      UPDATE document_prevalidations 
       │      SET claim_token = :worker_token, 
       │          claimed_at = :now, 
       │          lease_expires_at = :now + 60.0,
       │          job_status = 'PROCESSING'
       │      WHERE id = (
       │          SELECT id FROM document_prevalidations
       │          WHERE (
       │              (job_status = 'QUEUED' AND claim_token IS NULL)
       │              OR (job_status = 'RETRY_SCHEDULED' AND next_retry_at <= :now AND claim_token IS NULL)
       │              OR (job_status = 'PROCESSING' AND lease_expires_at < :now)
       │          )
       │          AND is_superseded = 0
       │          ORDER BY created_at ASC LIMIT 1
       │      );
       │
       ├─► 2. Launch Background Heartbeat Task (every 20s):
       │      WHILE inference_active:
       │          UPDATE document_prevalidations
       │          SET lease_expires_at = :now + 60.0, updated_at = :now_iso
       │          WHERE id = :id AND claim_token = :worker_token;
       │          sleep(20.0)
       │
       ├─► 3. Execute Groq Scrutiny Inference via scheduler
       │
       └─► 4. Conditional Fenced Persistence:
              UPDATE document_prevalidations
              SET job_status = 'COMPLETED',
                  classification_result = :result,
                  advisory_message = :msg,
                  evidence_excerpt = :excerpt,
                  completed_at = :now_iso
              WHERE id = :id AND claim_token = :worker_token;
              
              IF rows_affected == 0:
                  LOG.WARNING("Lease expired and reclaimed by another worker; discarding stale result.")
```

#### Fencing Guarantees:
1. **No Stale Overwrites:** If a worker stalls and another worker reclaims the job after `lease_expires_at`, the first worker's eventual commit fails atomically (`claim_token` mismatch) and is safely discarded.
2. **No Premature Reclaims:** As long as a worker is actively processing, the 20-second heartbeat extends `lease_expires_at` by 60 seconds. A legitimate 90-second Groq call will **never** be prematurely reclaimed by another worker.
3. **Total Isolation:** This logic resides exclusively in `ai-service/llm/prevalidation_recovery_worker.py`. The officer-side `recovery_worker.py` remains 100% untouched.

---

## 8. Authoritative Backend Requirement Resolution

Express independently resolves all metadata from `dev.db` and [`backend/src/config/aph_2024_2027_manifest.json`](file:///d:/SIH/SIH26_PS4/backend/src/config/aph_2024_2027_manifest.json):
1. **Authentication:** Verifies `req.user.institutionId`.
2. **Draft Application Ownership:** Verifies `application.institutionId === req.user.institutionId` and `application.status === 'draft'`.
3. **Document Ownership:** Verifies `doc.applicationId === id` and `doc.isCurrent === true`.
4. **Authoritative Requirement:** Queries `ApplicationDocumentRequirement` in `dev.db` and cross-verifies that `applicationTypeId` matches `application.applicationTypeId`.
5. **Canonical APH Manifest Verification:** Matches category and requirement against `aph_2024_2027_manifest.json`, extracting authoritative APH chapter, governing clause, and rule description.
6. **File Verification:** Verifies physical existence on disk and recalculates SHA-256 checksum.

Any mismatch results in `HTTP 400 Bad Request` (`INVALID_REQUIREMENT_ASSOCIATION`).

---

## 9. Preserved Machine-to-Machine Security & RBAC

- Express communicates with FastAPI using the existing configured machine-to-machine header:
  ```http
  POST /api/v1/prevalidate-document HTTP/1.1
  Host: 127.0.0.1:8000
  X-Service-Authorization: Bearer $AI_BACKEND_SECRET
  ```
- No literal secrets are stored in documentation or source code.
- Express verifies institutional tenant ownership on all pre-validation requests.
- FastAPI verifies `$AI_BACKEND_SECRET` on internal endpoints.
- Least-privilege download rules in [`document.controller.js`](file:///d:/SIH/SIH26_PS4/backend/src/controllers/document.controller.js) remain strictly active.

---

## 10. Qualitative Institute-Facing Guidance & Messaging

Discrete qualitative states without pseudo-calibrated percentages:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ LIKELY_MATCH                                                                                    │
│ 🟢 Document Content Appears Relevant                                                            │
│ The extracted document content corresponds to the statutory requirement description.            │
│ Preliminary check passed. You may proceed with the remaining uploads.                           │
│ Quote Excerpt: "Accredited by NBA for Academic Years 2024-2025 to 2026-2027..."                 │
│ Disclaimer: Preliminary automated check only. Official acceptance is subject to officer review. │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ POSSIBLE_MISMATCH                                                                               │
│ 🟡 Potential Content Mismatch Identified                                                        │
│ The uploaded file appears to describe a Land Property Deed rather than the required NBA         │
│ Accreditation Certificate.                                                                      │
│ Recommended Action: Please verify your file. [ Replace Document ]                               │
│ Note: This is an automated advisory. You will be able to proceed if you confirm this upload.   │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ MANUAL_REVIEW_REQUIRED                                                                          │
│ 🔵 Text-Based Assessment Unavailable (Image-Only / Scanned Document / Brief Certificate)        │
│ Automatic text extraction is unavailable or brief for this document. This does not mean the     │
│ document is incorrect. The document will undergo manual inspection by the Scrutiny Officer.    │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ INSUFFICIENT_EVIDENCE                                                                           │
│ 🟠 Incomplete or Blank Content                                                                  │
│ The extracted content contains insufficient substantive text for automated assessment.          │
│ Please check that all relevant pages of the official document are included in the PDF.          │
│ [ Replace Document ]                                                                            │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Non-blocking rule: `POSSIBLE_MISMATCH` advises replacement, but institutions can advance to Step 6 after confirming an explicit acknowledgment checkbox.

---

## 11. Refined Handling of the `other` Category & Unmapped Fields

For the `other` category or ad-hoc supplementary uploads:
- The system returns `classification_result: MANUAL_REVIEW_REQUIRED`.
- Advisory: *"This document requirement belongs to a specialized or non-standard application category that requires custom manual evaluation by the AICTE Scrutiny Officer. Automated pre-validation is disabled for this field."*
- Zero Groq tokens consumed.

---

## 12. Comprehensive Verification & Test Strategy

Testing uses an isolated SQLite database (`test_agent_jobs.db`).

### 12.1 Verification Test Matrix

| # | Test Scenario | Execution Method | Expected Result |
|---|---|---|---|
| **T01** | **Image-Only Scanned PDF** | Upload scanned PDF (`total_chars < 40`, images present). | `job_status: COMPLETED`, `classification_result: MANUAL_REVIEW_REQUIRED`. 0 tokens. |
| **T02** | **Corrupted / Invalid File** | Upload corrupted binary stream with `.pdf` extension. | `job_status: FAILED`. Friendly parser error returned. |
| **T03** | **Blank PDF** | Upload PDF with 1 blank page (0 chars, 0 images). | `job_status: COMPLETED`, `classification_result: INSUFFICIENT_EVIDENCE`. |
| **T04** | **Legitimate Short Certificate ($< 150$ chars)** | Upload 80-character digital NOC. | `job_status: COMPLETED`, `classification_result: MANUAL_REVIEW_REQUIRED`. Not classified as mismatch. |
| **T05** | **Content Mismatch** | Upload Land Title Deed against "NBA Certificate" field. | `job_status: COMPLETED`, `classification_result: POSSIBLE_MISMATCH`. Excerpt quotes land deed text. |
| **T06** | **Legitimate Match** | Upload authentic NBA letter against "NBA Certificate" field. | `job_status: COMPLETED`, `classification_result: LIKELY_MATCH`. |
| **T07** | **Mismatched Category Req ID** | Call prevalidate with `requirement_id` from a different category. | Express returns `HTTP 400 Bad Request` (`INVALID_REQUIREMENT_ASSOCIATION`). |
| **T08** | **Cross-Tenant Access** | Institution B calls prevalidate on Institution A's document. | Express returns `HTTP 403 Forbidden` (`ACCESS_DENIED`). |
| **T09** | **Contextual Cache Isolation** | Same file checksum uploaded under App A (CSE) vs App B (MBA). | Different cache keys generated (`ApplicationId` included); independent evaluations. |
| **T10** | **Transactional Replacement** | Replace document in Step 5. | `ApplicationDocument` versioned non-destructively; old file preserved; old job superseded. |
| **T11** | **Concurrent Duplicate Requests** | Rapid double-clicks on pre-validation trigger. | Active index `(application_id, document_id)` prevents duplicate; returns existing `job_id`. |
| **T12** | **Worker Restart & Staged PDF Recovery** | Kill uvicorn process during `RETRY_SCHEDULED`. Restart worker. | Worker re-claims job from SQLite, reads staged bytes from disk, and resumes successfully. |
| **T13** | **Officer Priority Acceptance Criteria** | 20 pre-validation reservations waiting; Groq cooldown resets; officer scrutiny arrives. | Scheduler grants next permitted slot to officer scrutiny (`priority="high"`) ahead of waiting pre-validations without bypassing quotas or aborting in-flight calls. |
| **T14** | **No-Workflow-Side-Effects Test** | Complete full pre-validation flow on draft application. | Verify: `verificationStatus` remains `"pending"`, 0 `ReviewReport` created, 0 `agent_actions` created, 0 `DeficiencyRequest` created, application status remains `"draft"`. |
| **T15** | **Worker Lease Heartbeat & Fencing Test** | Simulate Groq request taking 75s. | Verify 20s heartbeat extends lease; no other worker reclaims job; result persists successfully. |
| **T16** | **Fenced Stale Overwrite Prevention** | Simulate worker lease expiration and job reclaim by Worker B. Worker A returns later. | Worker A commit fails (`rows_affected == 0`); Worker B's result remains authoritative. |

---

## 13. File-by-File Scope and Code Classification

```
d:\SIH\SIH26_PS4\
├── ai-service/
│   ├── main.py                                      [MINIMAL ADAPTER] Expose POST /api/v1/prevalidate-document
│   ├── database.py                                  [MINIMAL ADAPTER] Add document_prevalidations DDL & indices
│   ├── extractor.py                                 [MINIMAL ADAPTER] Multi-condition classification
│   ├── config.py                                    [MINIMAL ADAPTER] Add PREVALIDATION_STAGING_DIR config
│   ├── staging/prevalidation/                       [NEW STORAGE] Persistent disk directory for staged PDFs
│   ├── llm/
│   │   ├── client.py                                [REUSE UNCHANGED] GroqScrutinyClient & error parsers
│   │   ├── scheduler.py                             [MINIMAL ADAPTER] Add priority & anti-starvation logic
│   │   ├── prompts.py                               [MINIMAL ADAPTER] Add build_document_prevalidation_prompt
│   │   ├── scrutiny_agent.py                        [REUSE UNCHANGED] normalize_text_for_comparison quote verifier
│   │   ├── recovery_worker.py                       [REUSE UNCHANGED] Left 100% untouched for officer safety
│   │   ├── prevalidation_recovery_worker.py         [NEW ADAPTER] Worker with 20s heartbeats & claim fencing
│   │   └── prevalidation_agent.py                   [NEW ADAPTER] Single-document coordinator
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma                            [SCHEMA CHANGE] Add isCurrent, supersededAt, versionNumber
│   │   └── migrations/add_document_versioning/      [NEW MIGRATION] Backfill script & partial unique index SQL
│   ├── src/
│   │   ├── routes/
│   │   │   └── application.routes.js                [MINIMAL ADAPTER] Expose /documents/:docId/prevalidate
│   │   ├── controllers/
│   │   │   ├── application.controller.js            [MINIMAL ADAPTER] Add replacement transaction & handlers
│   │   │   └── document.controller.js               [REUSE UNCHANGED] Least-privilege rules preserved
│   │   └── services/
│   │       └── aiPrevalidation.service.js           [NEW ADAPTER] Express client streaming file & querying cache
└── app/
    └── app/
        └── institution/
            └── applications/
                └── new/
                    ├── page.jsx                     [MINIMAL ADAPTER] Step 5 upload event & polling integration
                    └── components/
                        └── DocumentPreValidationCard.jsx [NEW UI COMPONENT] Qualitative badges & replacement action
```

### Code Classification Table

| Code Component / Module | Classification | Justification & Architectural Necessity |
|---|---|---|
| `DocumentExtractor` | **MINIMAL ADAPTER REQUIRED** | Update extraction helper to distinguish scanned image PDFs from blank and short digital files. |
| `GroqScrutinyClient` | **REUSE EXISTING CODE** | AsyncGroq client with JSON mode, timeout handling, and token limits is reused without modification. |
| `groq_scheduler.py` | **MINIMAL ADAPTER REQUIRED** | Add future slot reservation priority parameter and anti-starvation fair queue timer. |
| `ai-service/llm/prompts.py` | **MINIMAL ADAPTER REQUIRED** | Add single-document relevance prompt builder function strictly bounded to content relevance and completeness. |
| `ai-service/database.py` | **MINIMAL ADAPTER REQUIRED** | Add `document_prevalidations` table DDL with separated `job_status`, `classification_result`, and lease fields. |
| `ai-service/llm/prevalidation_agent.py` | **NEW ADAPTER CODE REQUIRED** | Small, focused adapter linking `DocumentExtractor`, `groq_scheduler`, and the pre-validation prompt. |
| `ai-service/llm/recovery_worker.py` | **REUSE EXISTING CODE (UNCHANGED)** | Left 100% untouched to prevent any regression in officer-side scrutiny batch recovery. |
| `ai-service/llm/prevalidation_recovery_worker.py` | **NEW ADAPTER CODE REQUIRED** | Dedicated worker processing only `document_prevalidations` with 20s heartbeats and claim-token fencing. |
| `ai-service/main.py` | **MINIMAL ADAPTER REQUIRED** | Register internal endpoint `POST /api/v1/prevalidate-document` protected by `$AI_BACKEND_SECRET`. |
| `backend/prisma/schema.prisma` | **SCHEMA CHANGE REQUIRED** | Minimal migration adding `isCurrent`, `supersededAt`, and `versionNumber` to `ApplicationDocument`. |
| `backend/prisma/migrations/add_document_versioning/` | **NEW CODE REQUIRED** | Reconciliation backfill script and partial unique index DDL (`idx_one_current_application_document`). |
| `backend/src/services/aiPrevalidation.service.js` | **NEW ADAPTER CODE REQUIRED** | Express microservice client responsible for authoritative requirement verification and streaming files to FastAPI. |
| `backend/src/controllers/application.controller.js` | **MINIMAL ADAPTER REQUIRED** | Implement transactional replacement and pre-validation route handlers. |
| `backend/src/routes/application.routes.js` | **MINIMAL ADAPTER REQUIRED** | Route registration for pre-validation endpoints. |
| `app/app/institution/applications/new/components/DocumentPreValidationCard.jsx` | **NEW UI CODE REQUIRED** | Dedicated UI card rendering qualitative advisory badges, quotes, and replacement actions. |
| `app/app/institution/applications/new/page.jsx` | **MINIMAL ADAPTER REQUIRED** | Wire upload events to asynchronous pre-validation polling. |
| `backend/src/controllers/document.controller.js` | **NOT REQUIRED** | Existing least-privilege `system_service` constraints remain strictly untouched. |

---

## Conclusion

The REV4 architectural plan resolves all engineering requirements:
1. Uploaded PDF bytes are persisted durably to dedicated disk staging (`staged_file_path`) and verified cryptographically before job acknowledgment, surviving worker crashes and restarts.
2. An authoritative SQLite partial unique index (`idx_one_current_application_document ... WHERE isCurrent = 1`) guarantees exactly one current document per requirement, preceded by a safe, non-destructive backfill sequence.
3. Workers operate under dynamic 60s leases refreshed every 20s with atomic claim-token fencing, preventing split-brain overwrites.
4. Priority scheduling strictly allocates future slots without violating rate limits or cancelling in-flight requests.
5. All tests and classifications agree across Express, FastAPI, Prisma, and SQLite.

**Status:** Plan finalized and ready for implementation review.
