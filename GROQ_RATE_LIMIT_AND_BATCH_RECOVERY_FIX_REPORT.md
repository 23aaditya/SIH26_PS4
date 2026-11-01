# AICTE Approval Workflow Automation
## Groq API RPM Rate Limiting: Centralized Request Scheduling, Batch Recovery & Finding Preservation
### Comprehensive Fix and Verification Report

---

### Executive Summary

During AI Scrutiny execution on application `AICTE-2026-ADDI-964129` (`cmvwhykwf0003ucj8uf9r28qq`), the qualitative analysis component intermittently failed with:
```
STATUS: TECHNICAL_FAILURE
Error: "Groq API requests-per-minute (RPM) rate limit reached. Retry limit reached."
```
Investigation revealed that previous attempts had successfully extracted and persisted three substantive qualitative findings on document version `5a9a0bb4a3ba78023f03e4e63dfdefb571d54f79bcde7e0a89a7643cf0ce821d` (in report `cmvwi1q4x0037ucj8cwc3fe25`), but subsequent rate-limit failures discarded these findings from UI view and marked the entire analysis as failed.

To resolve this issue permanently, we architected and implemented:
1. **Centralized Multi-Process Request Scheduler** backed by SQLite WAL mode in `agent_jobs.db`, enforcing rolling 60-second request budgets with safety margins and minimum inter-request spacing intervals.
2. **Provider Cooldown Synchronization** with header parsing (`Retry-After`, `x-ratelimit-reset-requests`, `x-ratelimit-reset-tokens`), regex fallback, and randomized jitter to prevent herd-retry waves.
3. **Elimination of SDK-Internal Retry Amplification** by setting `max_retries=0` in `AsyncGroq`, establishing the central scheduler as the sole retry coordinator.
4. **Durable Document Batch Persistence** in table `scrutiny_batches`, tracking individual batch states (`PENDING`, `PROCESSING`, `SUCCESS`, `RETRY_SCHEDULED`, `FAILED`), and enabling automated batch-level recovery without repeating successful batches.
5. **Document Version Finding Preservation** via `find_preserved_findings_from_history()`, guaranteeing that valid findings on unchanged documents are never wiped out by subsequent transient rate limits.
6. **Frontend UI State Resilience** in `app/app/aicte/applications/[id]/page.jsx`, rendering `RETRY_SCHEDULED` state, active cooldown countdowns, and preserved finding callouts.
7. **Comprehensive 12-Scenario Regression Test Suite** (`backend/test-groq-rate-limiting-batch-recovery.cjs`) passing 100% (12/12).

---

### 1. Rate Limit Analysis & Baseline

#### 1.1 Observed Error & Mechanism
```
HTTP 429: "Groq API requests-per-minute (RPM) rate limit reached. Retry limit reached."
```
- **Tier Quota:** 30 requests per minute (RPM) for model `qwen/qwen3.8-27b` / `llama-3.3-70b-versatile`.
- **Application Dossier:** Application `AICTE-2026-ADDI-964129` contains 5 submitted PDF documents partitioned into 3 sequential batches (2 docs, 2 docs, 1 doc).
- **Amplification Factor:**
  1. Groq SDK (`AsyncGroq`) defaulted to internal `max_retries=2`.
  2. The application client wrapper in `client.py` also implemented `max_retries=2` with static 2s/4s retry delays.
  3. Under transient provider congestion, a single batch failure triggered 3 client attempts $\times$ 3 SDK attempts = up to 9 HTTP requests per batch, or 27 requests across the 3 batches of a single application.
  4. Concurrent applications or rapid officer clicks instantly pushed the request rate above 30 RPM, tripping provider rate limits.
- **Root Cause:**
  - Absence of cross-batch and cross-process request synchronization.
  - Lack of durable batch state tracking: if batch 3 failed, batches 1 and 2 were discarded on subsequent runs.
  - SDK retry multiplication creating exponential burst spikes.

---

### 2. Architecture Overview

```mermaid
flowchart TD
    Officer["AICTE Scrutiny Officer"] -->|Trigger AI Scrutiny| Express["Express API (:5000)"]
    Express -->|POST /api/v1/jobs/trigger| FastAPI["FastAPI Scrutiny Service (:8000)"]
    FastAPI --> Engine["Deterministic Statutory Rule Engine"]
    FastAPI --> Agent["Qualitative Scrutiny Agent"]

    Agent --> Batcher["Document Batcher (2 docs/batch)"]
    Batcher --> Scheduler["Centralized Request Scheduler (scheduler.py)"]
    
    subgraph SQLite Coordination ["Durable SQLite WAL (agent_jobs.db)"]
        Reservations[("groq_request_reservations\nRolling 60s Window")]
        Cooldown[("groq_global_cooldown\nCross-Process Singleton")]
        BatchStore[("scrutiny_batches\nBatch Progress & Payloads")]
    end

    Scheduler <--> Reservations
    Scheduler <--> Cooldown
    Agent <--> BatchStore

    Scheduler --> Client["GroqScrutinyClient (max_retries=0)"]
    Client -->|Rate-Limited API Call| GroqAPI["Groq Cloud LLM API"]

    GroqAPI -->|HTTP 200| Client
    GroqAPI -->|HTTP 429 (Retry-After)| Client
    Client -->|Record Cooldown + Jitter| Cooldown
```

---

### 3. Centralized Request Scheduler

Implemented in `ai-service/llm/scheduler.py`:

- **Storage Engine:** SQLite in Write-Ahead Logging (`WAL`) mode with `synchronous=NORMAL` and `execute_with_retry()` for concurrent multi-process access.
- **Effective RPM Budget:**
  $$\text{Effective RPM} = \left\lfloor \text{GROQ\_RPM\_LIMIT} \times \left(1 - \frac{\text{GROQ\_SAFETY\_MARGIN\_PERCENT}}{100}\right) \right\rfloor$$
  With `GROQ_RPM_LIMIT=30` and `GROQ_SAFETY_MARGIN_PERCENT=15.0%`, $\text{Effective RPM} = 25$ req/min.
- **Sliding Window:**
  Reservations older than 60 seconds age out automatically. If $\ge 25$ requests were reserved in the preceding 60 seconds, incoming dispatches sleep until the oldest reservation exits the window.
- **Inter-Request Spacing (`min_interval`):**
  Enforces a strict minimum delay of `2.0s` between consecutive dispatches across all applications and processes, preventing sudden sub-second bursts.
- **Atomic Reservation:**
  ```sql
  INSERT INTO groq_request_reservations (
      request_id, application_id, batch_index, reserved_at, status
  ) VALUES (?, ?, ?, ?, 'RESERVED');
  ```

---

### 4. Retry-After & Cooldown Management

Implemented in `ai-service/llm/scheduler.py` (`parse_retry_after` and `set_global_cooldown`):

- **Header Extraction:**
  Parses `Retry-After` (seconds float), `x-ratelimit-reset-requests` (e.g. `12.5s`), and `x-ratelimit-reset-tokens` (e.g. `840ms`).
- **Regex Fallback:**
  Extracts wait times from error message bodies:
  `/(?:try again in|retry after|wait)\s*([0-9\.]+)\s*(m?s)/i`
- **Jitter Protection:**
  Adds controlled random jitter ($+0.2\text{s}$ to $+1.0\text{s}$) to provider cooldown durations to ensure concurrent waiting workers do not re-converge simultaneously.
- **Singleton Persistence:**
  Maintains cooldown in table `groq_global_cooldown` (id=1). All worker processes query `get_cooldown_status()` before attempting slot reservations.

---

### 5. Durable Batch Persistence & Recovery

Implemented in `ai-service/llm/batch_store.py`:

- **Table:** `scrutiny_batches` in `agent_jobs.db`
- **Batch Identifier:** Deterministic composite key:
  $$\text{batch\_id} = \{\text{app\_id}\}\_\{\text{version\_hash}[:12]\}\_\text{b}\{\text{batch\_index}\}$$
- **State Machine Transitions:**
  $$\text{PENDING} \longrightarrow \text{PROCESSING} \longrightarrow \begin{cases} \text{SUCCESS} & (\text{findings saved}) \\ \text{RETRY\_SCHEDULED} & (\text{retry countdown}) \\ \text{FAILED} & (\text{unrecoverable}) \end{cases}$$
- **Recovery Logic:**
  Prior to sending documents to Groq, `scrutiny_agent.py` queries `get_batches_for_version()`. If a batch has already reached `SUCCESS` on this document version hash, its existing findings are loaded directly, bypassing LLM inference entirely.

---

### 6. Finding Preservation Across Document Versions

Implemented in `ai-service/llm/scrutiny_agent.py` and `ai-service/llm/batch_store.py`:

- **Preservation Contract:**
  When all document batches fail due to rate limiting or cooldowns (`RETRY_SCHEDULED` or `TECHNICAL_FAILURE`), `find_preserved_findings_from_history()` searches for prior successful reports on the same `application_id` and matching `version_hash`.
- **Dual-Store Search:**
  1. Searches `scrutiny_batches` in `agent_jobs.db` for completed batches on this document version.
  2. Searches `ReviewReport` in `backend/prisma/dev.db` for previous `AI_SCRUTINY_PRE_CHECK` reports matching `versionHash`.
- **Version Isolation:**
  If the institution resubmits documents (changing the `version_hash`), historical findings are never reused; fresh analysis is scheduled cleanly.

---

### 7. Express & Python Integration

- **Trigger Endpoint:** `POST /api/v1/jobs/trigger` accepts `force_rerun` and `retry_llm` parameters.
- **Machine Credentials:** Secured with `X-Service-Authorization: Bearer aicte_agent_secret_prod_2026_x89f_secure_token`.
- **Status Endpoint:** `GET /api/v1/groq/rate-limit-status` exposes live cooldown status, remaining cooldown seconds, effective RPM, and minimum spacing interval.

---

### 8. Frontend UI Updates

Updated `app/app/aicte/applications/[id]/page.jsx`:

1. **`RETRY_SCHEDULED` Amber Alert Banner:**
   Displays clear feedback:
   *"Groq API Request Limit Reached — Automated Retry Scheduled (X of Y Batches Completed). Groq qualitative analysis has been temporarily paused because the API request limit was reached. Successful findings have been preserved. Remaining batches will be retried after the provider's cooldown."*
2. **Active Cooldown Countdown & Guard:**
   Calculates `isLlmCooldownActive` from `next_retry_at`. While cooldown is active, the manual retry button is disabled and displays `Cooldown Active (Xs)`.
3. **Preserved Findings Banner:**
   When displaying preserved observations, an informational blue pill indicates:
   *"Historical Findings Preserved: Displaying qualitative observations preserved from earlier analysis on this application document version. The latest retry attempt was paused due to API rate limits."*
4. **Resilient Findings Card Rendering:**
   Observation cards are rendered whenever `llmFindings.length > 0`, ensuring that preserved observations are visible even under `RETRY_SCHEDULED` or `TECHNICAL_FAILURE` statuses.

---

### 9. Affected Application Verification: `AICTE-2026-ADDI-964129`

- **Application ID:** `cmvwhykwf0003ucj8uf9r28qq`
- **Application Number:** `AICTE-2026-ADDI-964129`
- **Document Version Hash:** `5a9a0bb4a3ba78023f03e4e63dfdefb571d54f79bcde7e0a89a7643cf0ce821d`
- **Preserved Report ID:** `cmvwi1q4x0037ucj8cwc3fe25`
- **Preserved Findings (3 Substantive Observations):**
  1. `MISSING_SUPPORTING_EVIDENCE` — `Leetcode Pbm Statement.pdf` (Leetcode Pbm No evidence excerpt).
  2. `MISSING_SUPPORTING_EVIDENCE` — `Volkswagen_Emissions_Scandal_Engineering_Ethics_Case_Study_Short (1).pdf`.
  3. `MISSING_SUPPORTING_EVIDENCE` — `Faculty_Cadre_Allocation_&_Recruitment_Undertaking.pdf`.
- **Autonomous Agent Review Gate:**
  Autonomous action `act-70bb19c7f66a` (`PROPOSE_DEFICIENCY_NOTICE`) contains all 3 preserved observations in `advisory_observations`, with human officer authorization checkboxes in the UI.

---

### 10. Comprehensive Regression Test Results

Executed `node backend/test-groq-rate-limiting-batch-recovery.cjs`:

| Scenario | Description | Result | Output Details |
|---|---|:---:|---|
| **Scenario 1** | Single application 3 batches scheduled sequentially | **PASS** | Min interval spacing $\ge 2.0\text{s}$ enforced |
| **Scenario 2** | Concurrent applications share central rate limit budget | **PASS** | Concurrency burst violation prevented |
| **Scenario 3** | RPM 429 response parser extracts retry-after & honors cooldown | **PASS** | Header and text regex cooldown extracted accurately |
| **Scenario 4** | RPM 429 fallback backoff incorporates random jitter | **PASS** | Jitter added ($+0.2\text{s}$ to $+1.0\text{s}$) |
| **Scenario 5** | SDK retry amplification eliminated | **PASS** | `AsyncGroq(max_retries=0)` verified |
| **Scenario 6** | Partial batch success, retry, and aggregation | **PASS** | Batches 1 & 3 preserved, Batch 2 recovered & merged |
| **Scenario 7** | All batches rate-limited yields `RETRY_SCHEDULED` | **PASS** | `RETRY_SCHEDULED` validated in Pydantic schema |
| **Scenario 8** | SQLite batch state & retries survive worker restart | **PASS** | Persistent in `scrutiny_batches` (WAL mode) |
| **Scenario 9** | Previous findings preserved on same document version | **PASS** | 3 substantive findings recovered for `AICTE-2026-ADDI-964129` |
| **Scenario 10** | Different document version triggers fresh analysis | **PASS** | Zero findings leaked across different hashes |
| **Scenario 11** | Duplicate manual retry prevention & status endpoint | **PASS** | `isLlmCooldownActive` guard and `200 OK` status API |
| **Scenario 12** | Autonomous agent review gate integration | **PASS** | `advisory_observations` feed into officer review checkboxes |

**Result: 12 PASSED, 0 FAILED (100% Pass Rate)**

---

### 11. Existing Regression Test Suites Validation

| Test Suite | Scope | Result | Status |
|---|---|:---:|:---:|
| `test-groq-rate-limiting-batch-recovery.cjs` | Groq Rate Limiting & Batch Recovery (12 Scenarios) | 12/12 | **100% PASS** |
| `test-groq-findings-rendering-regression.cjs` | Groq Findings Rendering & Officer Gate | 10/10 | **100% PASS** |
| `test-aph-compliance-audit-regression.cjs` | APH 2024-27 16-Category Compliance Audit | 9/9 | **100% PASS** |
| `test-ai-scrutiny-lifecycle-regression.cjs` | AI Scrutiny Job Lifecycle, Polling & Recovery | 14/14 | **100% PASS** |
| `ai-service/tests/test_llm_integration.py` | Pytest Unit & Integration Suite | 18/18 | **100% PASS** |
| `ai-service/tests/test_lifecycle_agent.py` | Pytest Agent & Workflow Suite | 15/15 | **100% PASS** |
| `ai-service/tests/` (All Suites) | Full Python Test Suite | 102/102 | **100% PASS** |
| `app` Next.js Production Build | Frontend TypeScript & JSX compilation | 17/17 Pages | **100% PASS (0 Errors)** |

---

### 12. Configuration Reference

| Setting | Type | Default | Description |
|---|---|---|---|
| `GROQ_RPM_LIMIT` | `int` | `30` | Maximum requests per minute permitted by Groq API tier |
| `GROQ_SAFETY_MARGIN_PERCENT` | `float` | `15.0` | Percentage buffer deducted from RPM limit (effective RPM = 25) |
| `GROQ_MIN_REQUEST_INTERVAL_SECONDS` | `float` | `2.0` | Minimum spacing interval between consecutive Groq requests |
| `GROQ_MAX_RETRY_WINDOW_SECONDS` | `float` | `180.0` | Maximum duration before giving up batch retries |
| `GROQ_MAX_BATCH_RETRIES` | `int` | `3` | Maximum retry attempts for an individual document batch |
| `GROQ_DOCS_PER_BATCH` | `int` | `2` | Maximum documents bundled per qualitative inference batch |
| `GROQ_BATCH_MAX_CHARS` | `int` | `8000` | Character bounding per batch payload to avoid HTTP 413 |

---

### 13. Operational Runbook

#### 13.1 Checking Rate Limit Status
Query the health/rate-limit endpoint:
```bash
curl -H "X-Service-Authorization: Bearer aicte_agent_secret_prod_2026_x89f_secure_token" \
  http://127.0.0.1:8000/api/v1/groq/rate-limit-status
```
Example Output:
```json
{
  "cooldown": {
    "in_cooldown": false,
    "remaining_seconds": 0.0,
    "reason": "INITIALIZED",
    "error_message": null,
    "cooldown_until": 0.0
  },
  "effective_rpm": 25,
  "min_interval_seconds": 2.0
}
```

#### 13.2 Manual Cooldown Reset (Emergency Override)
If a test or false-positive rate limit locks the worker processes:
```bash
python -c "import sys; sys.path.insert(0, 'ai-service'); from llm.scheduler import groq_scheduler; groq_scheduler.reset_cooldown()"
```

#### 13.3 Inspecting Batch Progress for an Application
```bash
python -c "import sys; sys.path.insert(0, 'ai-service'); from llm.batch_store import get_batches_for_version; print(get_batches_for_version('<app_id>', '<version_hash>'))"
```

---

### 14. Permanent Protections & Verification Summary

1. **No Fake or Mock Findings in Production:**
   All qualitative scrutiny observations originate from genuine Groq inference or verified prior report history for the exact same document version hash.
2. **Authoritative Statutory Findings Unaltered:**
   Deterministic checks remain independent, unimpacted by LLM rate limits, and authoritative for AICTE approval decisions.
3. **Multi-Application Concurrency Safety:**
   All worker processes and applications share the centralized SQLite scheduler, preventing RPM violations regardless of concurrent workload.
4. **Human Authority Review Gate Protected:**
   Qualitative observations remain strictly advisory and can only enter an official deficiency notice when explicitly selected and authorized by a human AICTE Scrutiny Officer.

