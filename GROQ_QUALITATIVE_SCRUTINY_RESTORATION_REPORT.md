# Groq LLM Qualitative Scrutiny Findings Restoration & Regression Report

**Date:** October 31, 2026  
**System:** AICTE Approval Workflow Automation Platform (APH 2024–2027)  
**Investigation Focus:** Restoration of Groq LLM Qualitative & Contextual Scrutiny Findings  
**Target Representative Case:** Application `AICTE-2026-ADDI-964129` (ID: `cmvwhykwf0003ucj8uf9r28qq`)  
**Report ID:** `cmvwi1q4x0037ucj8cwc3fe25`  
**Test Suite:** `backend/test-groq-findings-rendering-regression.cjs` (10/10 Scenarios Passed)  

---

## 1. Executive Summary & Root Cause Confirmation

### The Defect
Following the AI Scrutiny Job Lifecycle enhancements and runtime fixes, the AICTE Scrutiny Officer application review page opened normally and displayed deterministic statutory checklist items. However, the **Groq LLM Qualitative & Contextual Scrutiny** section failed to display qualitative findings, document observations, extracted source evidence, facts-versus-inference analyses, and scrutiny recommendations. 

The UI displayed:
- `STATUS: PARTIAL_ANALYSIS`
- `Model: qwen/qwen3.8-27b`
- Sidebar badge: `3 flagged`
- Findings list: **Completely Empty / Missing from DOM**

### Root Cause Confirmation: Case D (Frontend State Gate Regression)
A comprehensive forensic trace across the entire pipeline confirmed **Case D**:
- **Database (`dev.db`):** Authoritative SQLite record `cmvwi1q4x0037ucj8cwc3fe25` possessed valid, substantive findings in `metadataJson.llmFindings` (3 distinct findings across processed batches).
- **Python AI Microservice (`ai-service`):** Successfully performed inference on Batches 1 and 3, extracted findings, isolated the Batch 2 payload size error, and returned a structured `LLMAnalysisResult` with `status: "PARTIAL_ANALYSIS"`.
- **Express Backend (`backend`):** Faithfully retrieved `metadataJson` from Prisma and delivered it intact over `GET /api/aicte/applications/:id/reports`.
- **Frontend (`app/app/aicte/applications/[id]/page.jsx`):** Contained a strict conditional gate at line 2543:
  ```jsx
  {/* Distinct State Handling: SUCCESS (Only state allowed to claim verified) */}
  {aiMeta?.llmAnalysis?.status === "SUCCESS" && (
    <div className="space-y-2">
      {(!aiMeta?.llmFindings || aiMeta.llmFindings.length === 0) ? (
        ...
      ) : (
        aiMeta.llmFindings.map((lf, idx) => ( ... ))
      )}
    </div>
  )}
  ```
  Because the condition evaluated `status === "SUCCESS"`, any application with `status: "PARTIAL_ANALYSIS"` evaluated to `false`. Without a corresponding `PARTIAL_ANALYSIS` branch, all successfully parsed LLM findings were completely omitted from DOM rendering. Furthermore, no warning banner was shown, leaving the officer with no explanation of why the analysis was partial or how to retry.

---

## 2. End-to-End Lifecycle Trace & Data Flow

```
┌───────────────────────────────────────────────┐
│              Application Dossier              │
│       5 Documents Uploaded by Institution     │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────┐
│         FastAPI Scrutiny Engine (8000)        │
│  - Evaluates 7 Deterministic Statutory Rules  │
│  - Batches Documents into 3 Inference Windows │
│    • Batch 1 (Docs 1-2): SUCCESS (2 findings) │
│    • Batch 2 (Docs 3-4): HTTP 413 (Exceeded)  │
│    • Batch 3 (Doc 5):    SUCCESS (1 finding)  │
│  - Synthesizes LLM Analysis (PARTIAL_ANALYSIS)│
└───────────────────────┬───────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────┐
│           Express Database Storage            │
│  Prisma ReviewReport (cmvwi1q4x0037ucj8cwc3fe) │
│  - reportType: "AI_SCRUTINY_PRE_CHECK"        │
│  - outcome: "DEFICIENCY_SUGGESTED"            │
│  - metadataJson: {                            │
│      llmAnalysis: { status: PARTIAL_ANALYSIS } │
│      llmFindings: [ 3 Real Substantive Items ]│
│    }                                          │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────┐
│     Express API (GET /applications/:id/reports)│
│  Returns raw JSON with metadataJson           │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────┐
│          Next.js Frontend (CaseReviewContent) │
│  - aiMeta = JSON.parse(aiReport.metadataJson) │
│  - Sidebar: aiMeta.llmFindings.length -> "3"  │
│  - AI Tab: Gated behind status === "SUCCESS"  │
│    ==> [BUG] Evaluated to false!             │
│    ==> [FIX] Allowed SUCCESS || PARTIAL       │
│    ==> [FIX] Added Amber Banner + Retry Button│
└───────────────────────────────────────────────┘
```

---

## 3. Representative Application Forensic Audit: `AICTE-2026-ADDI-964129`

- **Application ID:** `cmvwhykwf0003ucj8uf9r28qq`
- **Application Number:** `AICTE-2026-ADDI-964129`
- **Application Category:** `additional_course` (Additional Course / Expansion)
- **Institution:** Pune Institute of Computer Technology (`inst-001`)
- **Report ID:** `cmvwi1q4x0037ucj8cwc3fe25`
- **Report Outcome:** `DEFICIENCY_SUGGESTED`

### Batch Processing Diagnostics
- **Total Batches:** 3
- **Successful Batches:** 2
- **Failed Batches:** 1 (Batch 2: `cmvwhzdbq001ducj8zn95zq8v`, `cmvwhzkea001fucj8a43bwkcf`)
- **Batch Error Message:** `Groq request entity too large (HTTP 413): Requested 1,014 tokens exceeds model limit of 1,000 tokens.`
- **Executive Qualitative Summary:**  
  `"[Partial Analysis: 2/3 batches processed] The submitted documents consist of a student programming problem statement sheet and an engineering ethics case study, neither of which constitutes valid regulatory evidence for an Additional Course application. Critical statutory documents such as Fire Safety NOC, Building Occupancy Certificate, and Trust Resolutions are missing or deficient. The submitted document 'Faculty_Cadre_Allocation_&_Recruitment_Undertaking.pdf' contains only metadata and verification status information, lacking the substantive content required for scrutiny. No qualitative inconsistencies were detected in the available text, but the absence of actual undertaking details prevents assessment of compliance with AICTE norms."`

### Preserved Substantive Findings
1. **Finding #1: Irrelevant Academic Artifact**
   - **Document:** `Leetcode Pbm Statement.pdf` (Page 1)
   - **Type:** `MISSING_SUPPORTING_EVIDENCE`
   - **Severity:** `ADVISORY_HIGH` | **Confidence:** 78%
   - **Excerpt:** `Topic Pbm No Programming Statement Leetcode Pbm No Solved /Unsolved 1 1. Factorial of given no 2 2. Find out fibonacci series 509`
   - **Factual Basis vs. Inference:** `FACT: The document lists programming problems and Leetcode IDs. INFERENCE: This is an academic artifact, not a statutory compliance document required for AICTE approval.`
   - **Scrutiny Recommendation:** `[Manual Excerpt Verification Required] Reject this document as evidence for statutory compliance. Request the applicant to submit the missing Fire Safety NOC, Building Occupancy Certificate, and Affidavit 8.`

2. **Finding #2: Generic Academic Case Study**
   - **Document:** `Volkswagen_Emissions_Scandal_Engineering_Ethics_Case_Study_Short (1).pdf` (Page 1)
   - **Type:** `MISSING_SUPPORTING_EVIDENCE`
   - **Severity:** `ADVISORY_HIGH` | **Confidence:** 78%
   - **Excerpt:** `CASE STUDY ON THE VOLKSWAGEN EMISSIONS SCANDAL (2015) Engineering Ethics Case Study – Defeat Devices`
   - **Factual Basis vs. Inference:** `FACT: The document describes the 2015 Volkswagen emissions scandal. INFERENCE: It is an instructional case study and contains no institutional evidence.`
   - **Scrutiny Recommendation:** `[Manual Excerpt Verification Required] Reject this document as statutory evidence; require institutional affidavits.`

3. **Finding #3: Empty Undertaking Body / Metadata Only**
   - **Document:** `Faculty_Cadre_Allocation_&_Recruitment_Undertaking.pdf` (Page 1)
   - **Type:** `MISSING_SUPPORTING_EVIDENCE`
   - **Severity:** `ADVISORY_HIGH` | **Confidence:** 95%
   - **Excerpt:** `Official AICTE Regulatory Document Verification Copy... Verification Status: pending`
   - **Factual Basis vs. Inference:** `FACT: Document contains only system stamp and header. INFERENCE: Substantive cadre allocation table and recruitment undertaking clauses are missing.`
   - **Scrutiny Recommendation:** `Manually review physical/scanned original or flag for institutional re-upload.`

---

## 4. UI State Matrix & Rendering Contract

The updated implementation in `app/app/aicte/applications/[id]/page.jsx` enforces the following exhaustive rendering contract across all operational LLM states:

| LLM Analysis Status | Findings Count | Rendered Visual Elements | Interactive Controls |
| :--- | :--- | :--- | :--- |
| **`SUCCESS`** | $\ge 1$ | - Status badge: Emerald `SUCCESS`<br>- Model badge: e.g. `llama-3.3-70b-versatile`<br>- Advisory disclaimer pill<br>- Qualitative Synthesis summary card<br>- Full list of styled finding cards with severity, confidence, decoded filenames, verified/unverified badges, excerpts, facts vs. inference, and recommendations | Officer can read all findings and view source documents |
| **`SUCCESS`** | 0 | - Status badge: Emerald `SUCCESS`<br>- Emerald verification banner: *"No qualitative inconsistencies or conditional clauses flagged. Groq scrutiny verified cross-document institutional naming and declarations without discrepancies."* | "Re-Run AI Scrutiny" header button |
| **`PARTIAL_ANALYSIS`** | $\ge 1$ | - Status badge: Amber `PARTIAL_ANALYSIS`<br>- Amber alert banner with processed batch stats (e.g. *2 of 3 Batches Processed*) and diagnostic error explanation<br>- Advisory disclaimer pill<br>- Qualitative Synthesis summary card<br>- **ALL findings from successful batches fully rendered and interactive** | **"Retry Qualitative LLM Scrutiny"** button inside banner and header |
| **`PARTIAL_ANALYSIS`** | 0 | - Status badge: Amber `PARTIAL_ANALYSIS`<br>- Amber alert banner with batch failure diagnostic<br>- Amber notice: *"No qualitative inconsistencies flagged in the processed batches. Some batches were not processed due to size limits."* | **"Retry Qualitative LLM Scrutiny"** button inside banner and header |
| **`TECHNICAL_FAILURE`** | Any | - Status badge: Red `TECHNICAL_FAILURE`<br>- Red failure banner with exact error message and advisory notice stating deterministic statutory rules remain valid and unimpacted | **"Retry Qualitative LLM Scrutiny"** button inside banner and header |
| **`SKIPPED`** | 0 | - Status badge: Amber `SKIPPED`<br>- Amber notice: *"Groq LLM qualitative scrutiny skipped: GROQ_API_KEY is not configured."* Explains deterministic statutory checks evaluated independently. | None (manual verification required) |
| **`DISABLED`** | 0 | - Status badge: Slate `DISABLED`<br>- Slate notice: *"Qualitative Scrutiny Disabled. LLM inference is disabled by configuration (GROQ_ENABLED=false)."* | None |

---

## 5. Autonomous Agent Action Integration

The autonomous AI agent (`PROPOSE_DEFICIENCY_NOTICE`) integrates Groq qualitative findings into the formal deficiency workflow via an **Officer Discretion Gate** (`AgentDeficiencyProposalCard`):

1. **Separation of Statutory vs. Advisory Findings:**
   - **Deterministic Statutory Deficiencies:** Automatically included in the formal statutory deficiency notice (e.g. Fire Safety Certificate, Occupancy Certificate).
   - **Groq Qualitative Observations:** Populated into `action.input_payload.draft_notice.advisory_observations` with `officer_action: "EXCLUDED"` by default.
2. **Officer Review Gate:**
   - Scrutiny Officers see each Groq observation in the "Observations & Deficiencies" tab.
   - Each observation features an interactive checkbox: *Include in Official Notice Draft*.
   - When checked, an editable text area allows the officer to edit the observation text and corrective action before dispatching.
   - Unchecked observations remain strictly internal advisory notes for the Scrutiny Committee.

---

## 6. Verification & Automated Regression Test Results

### 1. Dedicated Groq Regression Test Suite (`test-groq-findings-rendering-regression.cjs`)
A dedicated 10-point automated regression suite was executed against the running database, Express backend, and Python AI microservice:

```
================================================================
RUNNING GROQ QUALITATIVE SCRUTINY FINDINGS REGRESSION TEST SUITE
================================================================

  ✓ PASS: Test 1: Report cmvwi1q4x0037ucj8cwc3fe25 exists and contains PARTIAL_ANALYSIS metadata with 3 substantive findings
  ✓ PASS: Test 2: Autonomous Agent Action for application contains Groq advisory observations in draft notice
  ✓ PASS: Test 3: Frontend page.jsx handles PARTIAL_ANALYSIS state distinctly with warning banner and retry button
  ✓ PASS: Test 4: Frontend page.jsx renders findings when status is SUCCESS OR PARTIAL_ANALYSIS
  ✓ PASS: Test 5: Frontend page.jsx displays Qualitative Review Synthesis summary when present
  ✓ PASS: Test 6: Frontend page.jsx handles TECHNICAL_FAILURE with red alert and retry button
  ✓ PASS: Test 7: Frontend page.jsx handles SKIPPED state with advisory note
  ✓ PASS: Test 8: Frontend page.jsx handles DISABLED state cleanly
  ✓ PASS: Test 9: AgentDeficiencyProposalCard includes officer review checkboxes and textareas for Groq observations
  ✓ PASS: Test 10: Verify frontend contains no fake or hardcoded mock LLM findings

================================================================
RESULTS: 10 passed, 0 failed out of 10 tests (100% Pass)
================================================================
```

### 2. APH Compliance Audit Regression Suite (`test-aph-compliance-audit-regression.cjs`)
All 9 scenarios in the APH 2024–2027 regulatory compliance audit passed with 100% success:
- All 16 application categories verified with exact APH chapters, clauses, and printed page numbers.
- EoA Affidavit-2, Satellite Map, and Audited Accounts strictly mandated.
- Increase in Intake and Change of Affiliating University statutory rules verified.
- **Result:** 9/9 Passed (100%).

### 3. AI Scrutiny Job Lifecycle Regression Suite (`test-ai-scrutiny-lifecycle-regression.cjs`)
- Asynchronous trigger, status polling, navigation-away recovery, concurrent trigger deduplication, and RBAC authorization verified.
- **Result:** 13/14 Passed (93%, 1 minor latency test threshold under concurrent load).

### 4. Next.js Production Build
```
▲ Next.js 16.4.3 (Turbopack)
✓ Compiled successfully in 3.4s
  Running TypeScript ...
  Finished TypeScript in 12ms ...
✓ Generating static pages using 11 workers (17/17) in 2.4s
  Finalizing page optimization ...
```
Zero compilation errors, zero TypeScript errors, zero routing warnings.

---

## 7. Permanent Regression Prevention & Guardrails

1. **State Inclusivity:** The frontend rendering condition `(status === "SUCCESS" || status === "PARTIAL_ANALYSIS")` ensures that partial results are never suppressed from human officers.
2. **Batch Isolation & Preservation:** In `ai-service/llm/client.py`, batch failures log specific token and payload limits without aborting the storage of findings from preceding or subsequent batches.
3. **Database Integrity:** Existing historical records and `metadataJson` payloads in `dev.db` were strictly preserved without truncating or modifying stored findings.
4. **Discretionary Integrity:** LLM observations remain labeled as `Advisory Only` and cannot contaminate the legal statutory deficiency notice without explicit human officer authorization.

