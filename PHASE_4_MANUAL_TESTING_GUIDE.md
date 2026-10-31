# AICTE Approval Process Portal — Phase 4 Manual Testing & Verification Guide
**Grounded in AICTE Approval Process Handbook (APH 2024–2027)**  
*Document Version: 1.0.0 — Generated: October 2026*

---

## Overview & Architecture Summary

This guide provides step-by-step instructions for manually testing and verifying the **Phase 4 Application Lifecycle Agent** across the full microservices topology:
1. **Frontend**: Next.js 14 App Router on `http://localhost:3000`.
2. **Backend**: Express 4 / Prisma ORM / SQLite (`backend/prisma/dev.db`) on `http://localhost:4000/api`.
3. **AI Service & Agent**: Python 3.12 FastAPI microservice with SQLite job/agent store (`ai-service/agent_jobs.db`) on `http://127.0.0.1:8000`.
4. **Qualitative LLM**: Groq Cloud API (`qwen/qwen3.8-27b`) with bounded batching (`GROQ_BATCH_MAX_CHARS=8000`, `GROQ_DOCS_PER_BATCH=2`) and non-retrying HTTP 413 resilience.

---

## Service Startup & Health Verification

### 1. Terminal 1: Python FastAPI AI Service
```powershell
cd d:\SIH\SIH26_PS4\ai-service
.\venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload --app-dir .
```
- **Port**: `8000`
- **Health Check**: `GET http://127.0.0.1:8000/health`
- **Expected Output**:
  ```json
  {
    "status": "ok",
    "service": "ai-scrutiny-assistant",
    "version": "1.0.0",
    "handbook": "APH 2024-2027",
    "backend_url": "http://localhost:4000/api",
    "llm_provider": "groq",
    "llm_model": "qwen/qwen3.8-27b",
    "llm_enabled": true,
    "llm_configured": true,
    "llm_status": "READY",
    "llm_diagnostic": {
      "category": "HEALTHY",
      "message": "Groq LLM service is connected and operational."
    }
  }
  ```

### 2. Terminal 2: Express Backend Server
```powershell
cd d:\SIH\SIH26_PS4\backend
npm run dev
```
- **Port**: `4000`
- **Health Check**: `GET http://localhost:4000/api/health`
- **Expected Output**:
  ```json
  {
    "status": "ok",
    "service": "AICTE Express Backend",
    "timestamp": "2026-10-29T..."
  }
  ```

### 3. Terminal 3: Next.js Frontend
```powershell
cd d:\SIH\SIH26_PS4\app
npm run dev
```
- **Port**: `3000`
- **Website URL**: `http://localhost:3000`

---

## Active Test Accounts & Credentials

| Role / Persona | Display Name | Identifier / Email | Password | Primary Dashboard |
| :--- | :--- | :--- | :--- | :--- |
| **Institution Principal** | Dr. P. T. Kulkarni (PICT) | `principal@pict.edu` | `password123` | `/institution/dashboard` |
| **Alternative Institute** | Aaditya insti | `aaditya@testinstitution.edu` | `password123` | `/institution/dashboard` |
| **Scrutiny Officer** | Dr. R. K. Sharma / Mihir Tiwari | `DEMO-AIC-034` | `password123` | `/aicte/dashboard` |
| **EVC Coordinator** | Dr. Neha Rao | `DEMO-AIC-037` | `password123` | `/aicte/dashboard` |
| **Regional / Bureau Officer** | Shri Karan Sinha | `DEMO-AIC-013` | `password123` | `/aicte/dashboard` |
| **Super Admin** | Ashwini Kapoor | `DEMO-AIC-001` | `password123` | `/aicte/dashboard` |

> [!TIP]
> **One-Click Role Switching**: When logged into the website, use the **"Role: [Current Role] ▾"** dropdown button in the top navigation bar (`TopBar.jsx`) to instantly switch personas without typing passwords. This triggers `/api/auth/switch-demo` and sets official session cookies.

---

## Manual Acceptance Test Scenarios

### Test 1: Service Readiness & Health Diagnostics
1. Open your browser and navigate to:
   - `http://localhost:3000` (Unified Regulatory Gateway homepage)
   - `http://localhost:4000/api/health` (Express backend check)
   - `http://127.0.0.1:8000/health` (FastAPI AI agent check)
2. Verify that all 3 services report `status: "ok"`.
3. Check `llm_status: "READY"` in the port 8000 response. If `GROQ_API_KEY` is missing or invalid, it will report `llm_status: "UNAVAILABLE"` with diagnostic guidance, but deterministic statutory pre-checks will remain 100% operational.

---

### Test 2: Submit a Synthetic Application
1. Navigate to `http://localhost:3000/login`.
2. Select the **"Institute User"** tab:
   - Email: `principal@pict.edu`
   - Password: `password123`
   - Click **"Authenticate as Institute User →"**.
3. You will be redirected to `/institution/dashboard`.
4. Click **"New Application"** or navigate to `http://localhost:3000/institution/applications/new`.
5. Select an application category:
   - **Extension of Approval (EoA)** (5 baseline statutory checks)
   - OR **Increase in Intake** (7 statutory checks including Affidavit-8, Core Branches, Format-3 Resolution)
   - OR **Additional Course** (Nomenclature validation & Core Branches)
6. Enter required statutory fields (e.g. Existing Intake, Proposed Intake).
7. In the Document Upload section:
   - Upload a test PDF (e.g. `backend/uploads/applications/app-accept-999001/1793282462618-19603721-fixture_affidavit_2.pdf`).
8. Click **"Submit Statutory Application"**.
9. **Observed Evidence**:
   - Status transitions from `draft` to `in_review`.
   - Current stage becomes `Scrutiny Committee Review` (`currentStageId: "scrutiny"`).
   - Responsible officer assigned: `Mihir Tiwari (DEMO-AIC-034)`.
   - Backend dispatches asynchronous event `APPLICATION_SUBMITTED` to `http://127.0.0.1:8000/api/v1/agent/events`.

---

### Test 3: Autonomous AI Scrutiny Pre-Check Verification
1. Switch to the Scrutiny Officer session using the top bar role switcher:
   - Select **"Mihir Tiwari (DEMO-AIC-034 • Scrutiny Officer)"**
   - Alternatively, log out and log in at `/login` under the **"AICTE Member"** tab (`DEMO-AIC-034` / `password123`).
2. Navigate to **"Application Queue"** (`/aicte/queue` or `/aicte/applications`).
3. Locate the submitted application and click **"Review Case"** to open `/aicte/applications/[id]`.
4. Click the **"AI Scrutiny & Pre-Check"** tab (`activeTab: "ai_scrutiny"`):
   - **Executive Summary Card**: Displays statutory advisory notice, headline, and pre-check recommendation (`RECOMMEND_ACCEPT` or `DEFICIENCY_SUGGESTED`).
   - **Integrity Hash**: Shows the SHA-256 canonical version hash (e.g. `hash_version_12345...`).
   - **Category-Specific Statutory Checks**: Confirms that rules match the selected application category (e.g. for EoA, exactly 5 checks: Affidavit-2, Fire NOC, Occupancy Certificate, Land/FSI, Faculty-Student Ratio).
   - **Groq LLM Qualitative & Contextual Scrutiny**: Displays qualitative observations, model name (`qwen/qwen3.8-27b`), and batch processing status.
5. If scrutiny is still pending or needs a fresh re-evaluation, click the **"Run AI Pre-Check Now"** button.

---

### Test 4: Verify Human Approval Gate for Proposed Deficiencies
1. On `/aicte/applications/[id]`:
   - If deterministic scrutiny detected missing or non-compliant documents (e.g. missing Fire NOC), the Lifecycle Agent plans a reserved action: `PROPOSE_DEFICIENCY_NOTICE`.
   - Execution status enters `WAITING_FOR_APPROVAL`.
2. Inspect the **"Observations & Deficiencies"** tab:
   - Click **"Issue Deficiency Letter"** button to review statutory deficiencies.
3. **Security Boundary Enforcement**:
   - The AI agent **never** unilaterally issues official deficiencies or transitions status to `awaiting_institution` without human officer approval.
   - An institution account attempting to call `POST /api/agent/applications/:id/actions/:actionId/approve` is strictly rejected with `HTTP 403 Forbidden`.
   - A system service attempting to self-approve via M2M credentials is blocked with `HTTP 403 Forbidden` (`denySystemService`).
4. To approve the proposed deficiency:
   - In the modal or through API (`POST /api/agent/applications/:id/actions/:actionId/approve`), the officer approves with remarks.
   - The backend records an `AuditEvent` (`action: "AGENT_PROPOSED_DEFICIENCY_OFFICIALLY_APPROVED"`).
   - The application moves to `awaiting_institution`, `currentStageId: "clarification"`.
   - Statutory 10-day response window is assigned.

---

### Test 5: Verify Workflow Resumption After Human Approval
1. Once approved by the officer:
   - The backend informs the Python agent via `ACTION_APPROVED`.
   - The agent updates the action status in SQLite from `WAITING_FOR_APPROVAL` to `EXECUTED`.
   - The execution transitions to `COMPLETED`.
   - Check SQLite persistence directly:
     ```powershell
     .\venv\Scripts\python.exe -c "import sqlite3; conn = sqlite3.connect('agent_jobs.db'); print(conn.execute('SELECT action_id, action_type, status, approved_by FROM agent_actions ORDER BY created_at DESC LIMIT 3').fetchall())"
     ```
   - Confirms that the agent does not duplicate reports, restart already finished tasks, or rerun completed actions.

---

### Test 6: Institutional Resubmission & Discrepancy Diff Reconciliation
1. Switch back to the institution account (`principal@pict.edu`) via TopBar switcher.
2. Open `/institution/applications/[id]`.
3. In the deficiency resolution section:
   - Enter rejoinder text (e.g. *"Submitting renewed Fire NOC issued by municipal fire department."*).
   - Upload the corrected PDF.
   - Click **"Submit Clarification Response"**.
4. **Autonomous Agent Reaction**:
   - Backend advances application back to `in_review` / `scrutiny`.
   - Event `RESUBMISSION_RECEIVED` is dispatched automatically to the Lifecycle Agent.
   - Agent runs re-scrutiny on the new documents.
   - Computes the discrepancy diff by comparing new findings against the prior report.
5. Switch to Scrutiny Officer (`DEMO-AIC-034`) and open the application's **"AI Scrutiny & Pre-Check"** tab:
   - Look for the **"Resubmission Comparison Audit Diff"** card:
     - Items resolved by compliant evidence are tagged: `[RESOLVED]`.
     - Items still deficient are tagged: `[STILL_OUTSTANDING]`.
     - Items with ambiguous evidence are tagged: `[NEEDS_HUMAN_REVIEW]`.
   - Provenance tag shows: `Event-Triggered Resubmission Scrutiny`.

---

### Test 7: Internal Officer Notifications & Audit Trail
1. Triggering scrutiny completion, deficiency proposal, or resubmission automatically generates internal notifications.
2. Check the notifications bell icon in the top right header:
   - Navigate to `/aicte/notifications`.
   - Verify unread notification: *"AI Scrutiny Pre-Check Complete: AICTE-2026-..."* or *"Resubmission Scrutiny Diff: ..."*.
3. Click the notification link to jump directly to the case review.
4. Open the **"Audit Log"** tab (`activeTab: "audit"`):
   - Verify chronological entries:
     - `APPLICATION_SUBMITTED`
     - `DEFICIENCY_LETTER_ISSUED` (or `AGENT_PROPOSED_DEFICIENCY_OFFICIALLY_APPROVED`)
     - `DEFICIENCY_RESOLVED_BY_INSTITUTION`
     - `AI_SCRUTINY_PRE_CHECK` report generation

---

### Test 8: Idempotency & Failure Recovery
1. **Repeated Click Test**:
   - Click **"Run AI Pre-Check Now"** twice in rapid succession.
   - Check port 8000 terminal logs: the second dispatch detects the active job/execution and returns the in-progress run without spinning duplicate workers.
2. **Page Refresh Test**:
   - Trigger scrutiny and immediately refresh the browser (`F5`).
   - The UI resumes polling using the existing `jobId` and updates status seamlessly once complete.
3. **Report Row Idempotency**:
   - Multiple pre-checks on an identical application version update the existing `ReviewReport` record in-place rather than inserting duplicate rows, guaranteed by index `(applicationId, reportType, versionHash)`.
4. **Crash Recovery**:
   - If `ai-service` is terminated while a job is `PROCESSING` or `RUNNING`, upon restart the `lifespan` handler automatically reconciles interrupted jobs:
     ```
     [INFO] Startup recovery: Reconciled N interrupted jobs to FAILED status.
     ```

---

### Test 9: Application-Category Rule Matrix Differentiation
1. Open or create an **Extension of Approval (EoA)** application:
   - Scrutiny displays exactly 5 checks (Affidavit-2, Fire, Occupancy, Land, FSR).
2. Open or create an **Increase in Intake** application:
   - Scrutiny displays 7 checks:
     - `Affidavit-8 on Non-Judicial Stamp Paper` (Annexure-2 Section 2.6.i)
     - `Governing Body Resolution in Format-3`
     - `Accreditation or Validated Core Engineering Branches Prerequisite`
     - `Fire Safety Certificate`
     - `Building Occupancy Certificate`
     - `Faculty-Student Ratio & Cadre Compliance`
     - `Expert Visit Committee (EVC) Physical/Virtual Inspection`
3. Open an application with an unmapped category (e.g. "Other Statutory AICTE Application"):
   - Scrutiny displays the **Unsupported Category Alert Banner**.
   - Output flags `unsupported_category: true` and requests manual officer scrutiny rather than defaulting to EoA.

---

## Diagnostic Commands for Backend & Database Verification

If you need to verify database states directly from the terminal:

### View Recent Agent Executions in SQLite:
```powershell
d:\SIH\SIH26_PS4\ai-service\venv\Scripts\python.exe -c "
import sqlite3
conn = sqlite3.connect('d:/SIH/SIH26_PS4/ai-service/agent_jobs.db')
cursor = conn.cursor()
cursor.execute('SELECT execution_id, event_type, status, current_step, created_at FROM agent_executions ORDER BY created_at DESC LIMIT 5')
for r in cursor.fetchall():
    print(r)
"
```

### View Recent Agent Actions (Pending & Executed):
```powershell
d:\SIH\SIH26_PS4\ai-service\venv\Scripts\python.exe -c "
import sqlite3
conn = sqlite3.connect('d:/SIH/SIH26_PS4/ai-service/agent_jobs.db')
cursor = conn.cursor()
cursor.execute('SELECT action_id, action_type, status, requires_approval, approved_by FROM agent_actions ORDER BY created_at DESC LIMIT 5')
for r in cursor.fetchall():
    print(r)
"
```

### Run Automated Regression Test Suites:
```powershell
# 1. Lifecycle Agent & Tool Registry Suite (Node.js)
node d:\SIH\SIH26_PS4\backend\test-lifecycle-agent-regression.js

# 2. Phase 3.5 Category Scrutiny Suite (Node.js)
node d:\SIH\SIH26_PS4\backend\test-category-scrutiny-regression.js

# 3. Official Workload & Queue Consistency Suite (Node.js)
node d:\SIH\SIH26_PS4\backend\test-official-workload-regression.js

# 4. Institution Data Isolation Suite (Node.js)
node d:\SIH\SIH26_PS4\backend\test-institution-isolation-regression.js

# 5. Agent Unit & Integration Test Suite (Python pytest)
d:\SIH\SIH26_PS4\ai-service\venv\Scripts\python.exe -m pytest d:\SIH\SIH26_PS4\ai-service\tests\test_lifecycle_agent.py
```

