# Phase 3.5 — Application-Type-Aware Deterministic Scrutiny
**AICTE Approval Process Handbook (APH 2024–25 to 2026–27)**  
**Status:** IMPLEMENTATION COMPLETE & 100% VERIFIED  
**Date:** October 29, 2026  

---

## 1. Original Objective
Replace the hardcoded five-check scrutiny engine (`Affidavit-2`, `Fire Safety NOC`, `Building Occupancy Certificate`, `Land and Floor Space Index`, `Faculty-Student Ratio & Cadre Norms`) with category-aware statutory scrutiny dynamically driven by the application's actual persisted category, grounded strictly in the official AICTE Approval Process Handbook (APH 2024–2027).

---

## 2. Recovery & Repository Status
- **Git Branch:** `main` (clean working state, zero discarded work, zero database resets).
- **Services State:**
  - AI Scrutiny Microservice (FastAPI + Uvicorn) online at `http://127.0.0.1:8000`.
  - Backend API (Express + Prisma SQLite) online at `http://localhost:4000`.
  - Web UI (Next.js 16 + Turbopack) online at `http://localhost:3000`.

---

## 3. Completed Implementation Details

### A. Authoritative Rule Matrix & Normalization
- Derived canonical representations for all 16 supported application categories in [ai-service/rules/base.py](file:///d:/SIH/SIH26_PS4/ai-service/rules/base.py):
  1. `extension_of_approval` (EoA)
  2. `increase_intake` (Increase in Intake)
  3. `additional_course` (Additional Course)
  4. `new_programme` (New Programme / Level)
  5. `change_of_site` (Change of Site / Location)
  6. `change_of_name` (Change of Institution Name)
  7. `change_of_affiliating_university` (Change of Affiliating University / Board)
  8. `reduction_in_intake` (Reduction in Intake)
  9. `closure_of_course` (Closure of Programme / Course)
  10. `closure_of_institution` (Closure of Institution)
  11. `merger_of_institutions` (Merger of Institutions)
  12. `merger_of_courses` (Merger of Courses)
  13. `conversion_of_institution_type` (Conversion of Institution Type / Level)
  14. `nri_supernumerary_seats` (NRI / Supernumerary Seat Allocation)
  15. `collaboration_twinning` (Collaboration / Twinning Programme)
  16. `other` (Other Statutory AICTE Application / Petitions)
- `normalize_category()` extracts and maps any category representation (`applicationCategory` display label, `applicationType.code`, `category`, `formData` aliases) to its canonical code.

### B. Shared vs. Category-Specific Statutory Rules
- Baseline Statutory Rules ([ai-service/rules/common_rules.py](file:///d:/SIH/SIH26_PS4/ai-service/rules/common_rules.py)):
  - Preserved existing valid checks for operational institutions: Affidavit-2, Fire Safety NOC, Building Occupancy Certificate, Land & FSI Compliance, Faculty-Student Ratio & Cadre Norms.
  - Implemented technical payload verification: differentiates unuploaded records (`DEFICIENT`), physical storage unavailability (`TECHNICAL_ERROR`), unreadable scans (`NEEDS_HUMAN_REVIEW`), and substantive compliance (`COMPLIANT`/`DEFICIENT`).
- Category-Specific Statutory Rules ([ai-service/rules/category_rules.py](file:///d:/SIH/SIH26_PS4/ai-service/rules/category_rules.py)):
  - `INTAKE-AFFIDAVIT8`: Mandatory Affidavit 8 on ₹100 non-judicial stamp paper for Intake Increase and Additional Courses (Annexure-2 Section 2.6.i).
  - `INTAKE-RESOLUTION-F3`: Trust/Society Governing Body Resolution in Format 3 (Annexure-2 Section 2.2, 2.3.iii, 2.6.iii, 2.7.viii, 2.9.ii, 2.10.ii, 2.14.xi).
  - `INTAKE-CORE-BRANCHES`: Prerequisite of at least 3 core engineering branches for technical intake expansion (Chapter II Clause 2.6.c & Annexure-11).
  - `COURSE-NOMENCLATURE`: Verification against official AICTE approved course directory (Chapter VI Clause 6.7 & Annexure-11).
  - `INTAKE-EVC-MANDATE`: Mandatory Expert Visit Committee verification flag (Chapter II Clause 2.6.j & Table 2.3).
  - `CLINST-AFFIDAVIT4`: Mandatory Affidavit 4 declaring zero student, faculty, and staff liabilities for Closure of Institution (Annexure-2 Section 2.7.vi).
  - `CLINST-UNIV-NOC-F2`: University/Board NOC in Format 2 guaranteeing student re-allocation (Annexure-2 Section 2.7.i, 2.9.i, 2.10.i).
  - `CLINST-SALARY-DUES`: Latest faculty/staff salary disbursements and settled statutory dues (Annexure-2 Section 2.7.ii).
  - `SITE-ANNEX1-LAND-DOCS`: Full Annexure-1 land/building documents for new site (Annexure-2 Section 2.3.i).
  - `SITE-VACATION-SHIFT`: Shifting strictly during academic vacation period (Chapter II Clause 2.22).
  - `NAME-PROHIBITED-TERMS`: Emblems and Names Act compliance prohibiting national titles without statutory sanction (Chapter I Clause 1.5.4).
  - `TWIN-AFFIDAVIT11`: Affidavit 11 ensuring Indian university enrollment fallback if visa is rejected (Annexure-2 Section 2.14.vii).
  - `TWIN-BIPARTITE-MOU`: Bipartite agreement with accredited foreign university (Annexure-2 Section 2.14.v, Chapter III Clause 3.2.b).
  - `TWIN-CREDIT-CAP`: Foreign institution credit transfer ceiling capped at 40% (Chapter III Clause 3.2.k).
  - `NRI-ENROLLMENT-THRESHOLD`: Minimum 80% average enrollment over preceding 3 consecutive academic years (Chapter II Clause 2.9).
  - `NRI-CEILING-LIMITS`: Approved intake ceilings: 5% for NRI, 15% supernumerary for FN/OCI/Gulf (Chapter II Clause 2.8.b, 2.9).
  - `OTHER-HUMAN-SCRUTINY`: Safe fallback for uncataloged petitions directing scrutiny to the Regional Office and Standing Hearing Committee (Chapter II Clause 2.1).

### C. Registry & Evaluation Engine
- [ai-service/rules/registry.py](file:///d:/SIH/SIH26_PS4/ai-service/rules/registry.py): Centralized catalog with dynamic applicability filter `get_applicable_rules(category_code, app_data)`.
- [ai-service/rules/engine.py](file:///d:/SIH/SIH26_PS4/ai-service/rules/engine.py): Executes rules dynamically, groups results into category-specific and common statutory checks, formats status badges, and preserves backward-compatible `evaluate_eoa()` wrapper.
- [ai-service/main.py](file:///d:/SIH/SIH26_PS4/ai-service/main.py): Incorporates category into cryptographic SHA-256 version hash computation (`compute_application_version_hash`) and dispatches category-aware evaluation.

### D. User Interface Enhancements
- [app/app/aicte/applications/[id]/page.jsx](file:///d:/SIH/SIH26_PS4/app/app/aicte/applications/[id]/page.jsx): Displays canonical category badge, unsupported category warning banner, two distinct collapsible tables (Category-Specific Requirements vs. Common Statutory Baseline), complete APH chapter/clause citations, and visual status badges (`COMPLIANT`, `DEFICIENT`, `NEEDS_HUMAN_REVIEW`, `NOT_APPLICABLE`, `TECHNICAL_ERROR`).

---

## 4. Test Verification & Results

| Test Suite | Command | Result | Pass Rate |
|---|---|---|---|
| **AI Service Unit Tests** | `python -m pytest tests/test_category_rules.py tests/test_rules.py` | 36 / 36 PASSED | 100% |
| **Full AI Service Pytest Suite** | `python -m pytest tests/` | 70 / 70 PASSED | 100% |
| **Category Scrutiny Regression** | `node test-category-scrutiny-regression.js` | 9 / 9 PASSED | 100% |
| **Comprehensive Acceptance Suite** | `node test-phase3-4-acceptance.js` | 8 / 8 PASSED | 100% |
| **Official Workload Suite** | `node test-official-workload-regression.js` | 9 / 9 PASSED | 100% |
| **Institution Isolation Suite** | `node test-institution-isolation-regression.js` | 9 / 9 PASSED | 100% |
| **Frontend Production Build** | `npm run build` (in `app`) | 17 / 17 routes compiled | 100% |
