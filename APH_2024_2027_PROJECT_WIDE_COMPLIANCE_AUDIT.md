# AICTE Approval Process Handbook (APH 2024–25 to 2026–27)
# Project-Wide Regulatory Document Compliance Audit Report

**Audit Reference:** AUDIT-APH-2024-2027-V1  
**Regulatory Authority:** All India Council for Technical Education (AICTE)  
**Authoritative Source Document:** Approval Process Handbook (APH 2024-25 to 2026-27), InDesign 19.0 Build, 231 Pages  
**Target Platform:** AICTE Approval Workflow Automation Platform  
**Audit Scope:** All 16 Supported Application Categories, Institute Upload Checklists, Backend Schema & Services, AI Scrutiny Rules, Autonomous Notice Proposal Engine, Existing Dossiers  
**Audit Status:** COMPLETE — AUTHORITATIVE  
**Date of Audit:** October 31, 2026  

---

## 1. Executive Summary

This comprehensive audit was conducted across the entire AICTE Approval Workflow Automation repository to verify strict regulatory compliance against the official **AICTE Approval Process Handbook (APH 2024–25 to 2026–27)**.

The audit verified:
1. Every application type and subcategory supported across frontend, backend, database models, and AI engine.
2. Every document requirement prescribed by APH 2024–27 Chapter I, Chapter II, Chapter III, Annexures 1, 2, 3, 4, 5, 11, Affidavits 1–13, and Formats 1–4.
3. The root cause of the known **Extension of Approval (EoA) Affidavit-2 defect**, where institutions were asked for ad-hoc unprescribed documents (e.g. Previous Year EoA Order) while statutory mandatory documents under APH Annexure-2 Section 2.1 (such as Affidavit-2 on Rs. 100/- stamp paper, Web-portal payment receipt, Satellite map with lat/long, Audited accounts of previous year, and conditional Structural Stability Certificate) were completely omitted from the upload checklist.
4. Project-wide discrepancies across **all 16 supported application categories**, classifying defects under categories **D-01 through D-10**.
5. Disconnects where the deterministic AI scrutiny engine evaluated statutory rules (e.g. `INTAKE-AFFIDAVIT8`, `INTAKE-RESOLUTION-F3`, `AFFIL-RESOLUTION-F3`) that the institute-facing application form provided no facility to upload, generating unavoidable false-positive statutory deficiencies.
6. The integration model for Groq LLM qualitative document observations, ensuring that LLM observations supplement statutory findings under officer verification without usurping deterministic statutory rules.

---

## 2. Complete Inventory of Supported Application Categories

The platform supports **16 distinct statutory application types** across 8 high-level functional categories:

| Index | Canonical Code | Display Name | Category Group | Requires EVC (APH Table 2.3) | APH Chapter & Governing Clause |
|---|---|---|---|---|---|
| 1 | `extension_of_approval` | Extension of Approval — EoA | Extension of Approval | No (Self-Disclosure) | Chapter II, Clause 2.1, 2.3, 2.5; Annexure-2 Sec 2.1 (p. 81) |
| 2 | `increase_intake` | Increase in Intake | Intake Variation | No (Unless flagged) | Chapter II, Clause 2.6; Annexure-2 Sec 2.6 (p. 82) |
| 3 | `additional_course` | Additional Course | New Course | No (Unless flagged) | Chapter II, Clause 2.6; Annexure-2 Sec 2.6 (p. 82) |
| 4 | `new_programme` | New Programme / Level | Expansion | Yes (Mandatory) | Chapter II, Clause 2.7; Annexure-2 Sec 2.3 (p. 81) |
| 5 | `change_of_site` | Change of Site / Location | Campus Relocation | Yes (Mandatory) | Chapter II, Clause 2.17; Annexure-2 Sec 2.3 (p. 81) |
| 6 | `change_of_name` | Change of Institution Name | Institutional Governance | No | Chapter II, Clause 2.19; Annexure-2 Sec 2.10 (p. 83) |
| 7 | `change_of_affiliating_university` | Change of Affiliating University / Board | Institutional Governance | No | Chapter II, Clause 2.19; Annexure-2 Sec 2.11 (p. 84) |
| 8 | `reduction_in_intake` | Reduction in Intake | Intake Variation | No | Chapter II, Clause 2.18; Annexure-2 Sec 2.9 (p. 83) |
| 9 | `closure_of_course` | Closure of Course / Programme | Closure | No | Chapter II, Clause 2.18; Annexure-2 Sec 2.9 (p. 83) |
| 10 | `closure_of_institution` | Closure of Institution | Closure | Yes (Mandatory) | Chapter II, Clause 2.21; Annexure-2 Sec 2.7 (p. 82-83) |
| 11 | `merger_of_institutions` | Merger of Institutions | Restructuring | Yes (Mandatory) | Chapter II, Clause 2.13; Annexure-2 Sec 2.4 (p. 82) |
| 12 | `merger_of_courses` | Merger of Courses | Restructuring | No | Chapter II, Clause 2.18; Annexure-2 Sec 2.9 (p. 83) |
| 13 | `conversion_of_institution_type` | Conversion of Institution Type | Restructuring | Yes (Mandatory) | Chapter II, Clause 2.14, 2.15; Annexure-2 Sec 2.3, 2.8 (p. 81, 83) |
| 14 | `nri_supernumerary_seats` | NRI / Supernumerary Seat Allocation | Quota & Seats | No (EVC for OCI/FN) | Chapter II, Clause 2.8, 2.9; Annexure-2 Sec 2.2, 2.5 (p. 81, 82) |
| 15 | `collaboration_twinning` | Collaboration / Twinning Programme | International | No (Online Scrutiny) | Chapter III, Clause 3.1, 3.2; Annexure-2 Sec 2.14 (p. 85) |
| 16 | `other` | Other Statutory AICTE Application | Statutory Petitions | Case-by-case | Chapter II / General Statutory Provisions |

---

## 3. Comprehensive Regulatory Compliance Matrix

The following matrix documents every document requirement for all 16 supported application categories, auditing requirements against the handbook and contrasting with frontend, backend, storage, AI rule, and notice proposal implementation.

| # | Application Type | Chapter | Clause | Annexure / Format | APH Page | Requirement Name | Applicability | Condition | Authentication & Execution | Upload Stage | Frontend Field | Backend Support | Storage Support | AI Rule ID | Notice Support | Audit Result |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **1.1** | `extension_of_approval` | Chapter II | 2.1, 2.3.4 | Annexure-2 Sec 2.1(i), Affidavit-2 | 81, 186 | Affidavit 2 on Non-Judicial Stamp Paper | Mandatory | None (All EoA applicants) | Digital signature of Chairman/Secy, sworn before 1st Class Judicial Magistrate / Notary / Oath Commissioner on Rs. 100/- e-stamp paper | Initial Submission | **MISSING** | **MISSING** (Omitted from AppType) | Supported via generic doc store | `COMMON-AFFIDAVIT2` (`EOA-ANNEX2-AFFIDAVIT2`) | Supported | **FAIL (D-01, D-04)** |
| **1.2** | `extension_of_approval` | Chapter II | 2.3.2, 2.3.4 | Annexure-2 Sec 2.1(ii) | 81 | AICTE Web-Portal Payment Receipt | Conditional | If TER charges payable | System generated payment receipt print from portal | Initial Submission | **MISSING** (Replaced by EoA Order) | **MISSING** | Supported | MISSING (Evaluated in portal fee) | Supported | **FAIL (D-01, D-07)** |
| **1.3** | `extension_of_approval` | Chapter II / VI | 7.17, 6.17(g) | Annexure-2 Sec 2.1(iii), Annexure-3 Clause 3.1(c) | 81, 86 | Building Occupancy / Completion Certificate / Form D | Mandatory | Permanent structures; provisional valid 2 consecutive AYs | Issued by competent Municipal Planning / Development Authority | Initial Submission | Present ("Building Occupancy / Completion Certificate") | Present | Supported | `COMMON-OCCUPANCY-CERT` (`EOA-ANNEX3-OCCUPANCY-CERT`) | Supported | **PASS** |
| **1.4** | `extension_of_approval` | Chapter II | 2.3.4 | Annexure-2 Sec 2.1(iv) | 81 | Structural Stability Certificate | Conditional | Required only if Building is > 30 years from date of Completion Certificate | Registered Structural Engineer with Master's degree in Structural Engg certifying fitness for human habitation | Initial Submission | **MISSING** | **MISSING** | Supported | MISSING (Needs conditional evaluation) | Supported | **FAIL (D-01, D-06)** |
| **1.5** | `extension_of_approval` | Chapter II / VI | 7.17, 6.17(i) | Annexure-2 Sec 2.1(v), Annexure-3 Clause 3.1(d) | 81, 86 | Fire Safety Certificate / NOC | Mandatory | All active campuses | Issued by competent State/UT Fire & Emergency Services Authority | Initial Submission | Present ("Fire Safety Certificate / NOC") | Present | Supported | `COMMON-FIRE-NOC` (`EOA-ANNEX3-FIRE-NOC`) | Supported | **PASS** |
| **1.6** | `extension_of_approval` | Chapter II | 2.3.4 | Annexure-2 Sec 2.1(vi) | 81 | Satellite Map with Latitude & Longitude | Mandatory | All campus premises | Geo-coordinates at entrance of main Building marked clearly on satellite imagery | Initial Submission | **MISSING** | **MISSING** | Supported | MISSING | Supported | **FAIL (D-01)** |
| **1.7** | `extension_of_approval` | Chapter II | 2.3.4 | Annexure-2 Sec 2.1(vii) | 81 | Audited Statement of Accounts of Previous Year | Mandatory | Non-Govt / Self-Financing Institutions | Chartered Accountant certified balance sheet, income & expenditure with UDIN | Initial Submission | **MISSING** | **MISSING** | Supported | MISSING | Supported | **FAIL (D-01)** |
| **1.8** | `extension_of_approval` | Chapter II | N/A | N/A (Unprescribed) | N/A | Previous Year EoA Order | Unprescribed | Historical record only, NOT in Annexure-2 Sec 2.1 | AICTE Copy | Initial Submission | Present (Enforced Mandatory) | Present | Supported | N/A | N/A | **FAIL (D-02, D-07)** |
| **1.9** | `extension_of_approval` | Chapter II / VI | 6.14 | Annexure-5 (Norms) | 95 | Faculty Cadre & Salary Proof Certificate | Unprescribed as standalone upload | Evaluated via portal structured data; payroll proof under Closure | Head of Institution | Initial Submission | Present (Enforced Mandatory) | Present | Supported | `COMMON-FSR-CADRE` (Evaluates fields) | Supported | **FAIL (D-02, D-05)** |
| **1.10** | `extension_of_approval` | Chapter VI | 6.17 | Annexure-3 | 86 | Barrier-Free Accessibility Certificate | Optional | Campus accessibility | Certified architect | Initial Submission | Present (Optional) | Present | Supported | None | Supported | **PASS (Advisory)** |
| **2.1** | `increase_intake` | Chapter II | 2.6(b)(iii) | Annexure-2 Sec 2.6(i), Affidavit-8 | 82, 194 | Affidavit 8 on Non-Judicial Stamp Paper | Mandatory | Applicable for all intake expansion (except Extended EoA) | Sworn before 1st Class Judicial Magistrate / Notary on Rs. 100/- stamp paper | Scrutiny Stage | **MISSING** | **MISSING** (Not in AppType checklist) | Supported | `INTAKE-AFFIDAVIT8` (Evaluates doc) | Supported | **FAIL (D-01, D-04)** |
| **2.2** | `increase_intake` | Chapter II | 2.6(b)(iii) | Annexure-2 Sec 2.6(iii), Format-3 | 82, 205 | Governing Body Resolution in Format 3 | Mandatory | All intake expansion | Signed by Chairman/Secretary approving expansion and allocating land, building, and funds | Scrutiny Stage | Present ("Governing Body Resolution") | Present | Supported | `INTAKE-RESOLUTION-F3` | Supported | **PASS** |
| **2.3** | `increase_intake` | Chapter II | 2.6(a) | Eligibility prerequisite | 16 | NBA Accreditation Certificate | Conditional | Valid accreditation in course applied for expansion | Issued by National Board of Accreditation (NBA) | Scrutiny Stage | Present ("NBA Accreditation Certificate") | Present | Supported | Evaluated in Scrutiny | Supported | **PASS** |
| **2.4** | `increase_intake` | Chapter II / VI | 2.6(d), 6.17 | Annexure-3 | 86 | Instructional Carpet Area Layout Plan | Mandatory | Additional division requirements | Certified Architect plan showing dedicated instructional area | Scrutiny Stage | Present ("Instructional Carpet Area Layout Plan") | Present | Supported | Human Review / Groq | Supported | **PASS** |
| **2.5** | `increase_intake` | Chapter II / VI | 2.6(e), 6.14 | Annexure-5 | 95 | Faculty Cadre Allocation & Recruitment Undertaking | Mandatory | Faculty cadre ratio 1:2:6 | Signed by Principal / Director | Scrutiny Stage | Present ("Faculty Cadre Allocation & Recruitment Undertaking") | Present | Supported | Human Review / Groq | Supported | **PASS** |
| **2.6** | `increase_intake` | Chapter II | 2.6(b) | Format 2 | 202 | Affiliating University In-Principle NOC | Optional / State Board | Where university demands prior NOC | Registrar seal | Scrutiny Stage | Present (Optional) | Present | Supported | None | Supported | **PASS** |
| **3.1** | `additional_course` | Chapter II | 2.6(b)(iii) | Annexure-2 Sec 2.6(i), Affidavit-8 | 82, 194 | Affidavit 8 on Non-Judicial Stamp Paper | Mandatory | All additional course proposals | Sworn before 1st Class Judicial Magistrate / Notary on Rs. 100/- stamp paper | Scrutiny Stage | **MISSING** | **MISSING** | Supported | `INTAKE-AFFIDAVIT8` | Supported | **FAIL (D-01, D-04)** |
| **3.2** | `additional_course` | Chapter II | 2.6(b)(iii) | Annexure-2 Sec 2.6(iii), Format-3 | 82, 205 | Governing Body Resolution in Format 3 | Mandatory | All new course proposals | Signed by Chairman/Secretary allocating space, labs, and funds | Scrutiny Stage | Present ("Governing Body Resolution") | Present | Supported | `INTAKE-RESOLUTION-F3` | Supported | **PASS** |
| **3.3** | `additional_course` | Chapter II | 2.6(b) | Format 2 | 202 | Affiliating University In-Principle Affiliation Letter | Mandatory | For starting new course | Registrar signature and official university seal | Scrutiny Stage | Present | Present | Supported | Scrutiny Review | Supported | **PASS** |
| **3.4** | `additional_course` | Chapter II / VI | 2.6, 6.17 | Annexure-4 | 92 | Laboratory Setup & Equipment Purchase Orders | Mandatory | Dedicated laboratory norms | Purchase invoices / equipment installation vouchers | Scrutiny Stage | Present | Present | Supported | EVC / Scrutiny | Supported | **PASS** |
| **3.5** | `additional_course` | Chapter II / VI | 2.6(h), 6.7 | Annexure-11 | 113 | Course Curriculum & Credit Structure | Mandatory | AICTE model curriculum alignment | Approved Board of Studies / Academic Council syllabus | Scrutiny Stage | Present | Present | Supported | `COURSE-NOMENCLATURE` | Supported | **PASS** |
| **4.1** | `new_programme` | Chapter II | 2.7 | Annexure-2 Sec 2.3(ii), Format-2 | 81, 202 | Affiliating University NOC in Format 2 | Mandatory | Prior to programme launch | Format 2 signed by University Registrar | Scrutiny Stage | Present ("Affiliating University In-Principle Affiliation Order") | Present | Supported | Scrutiny Review | Supported | **PASS** |
| **4.2** | `new_programme` | Chapter II | 2.7 | Annexure-2 Sec 2.3(iii), Format-3 | 81, 205 | Trust Resolution in Format 3 for New Programme | Mandatory | Approval by Trust executive body | Signed by Chairman/Secretary | Scrutiny Stage | **MISSING** | **MISSING** | Supported | `INTAKE-RESOLUTION-F3` | Supported | **FAIL (D-01, D-04)** |
| **4.3** | `new_programme` | Chapter II | 2.7 | Note 2, Format 1 | 82, 201 | State Government NOC in Format 1 | Mandatory | State territorial jurisdiction | Signed by Secretary/Director of Technical Education | Scrutiny Stage | Present ("State Government No-Objection Certificate") | Present | Supported | Scrutiny Review | Supported | **PASS** |
| **4.4** | `new_programme` | Chapter II | 2.7 | DPR Guidelines | 17 | Detailed Project Report (DPR) | Mandatory | Technical programme viability | Prepared by qualified educational consultant/management | Scrutiny Stage | Present | Present | Supported | Scrutiny Review | Supported | **PASS** |
| **4.5** | `new_programme` | Chapter II | 2.7 | TER Norms | 13 | Financial Endowment Fund Receipt / FDR | Mandatory | Creation of joint FDR with AICTE | Bank FDR in joint name as per AICTE norms | Scrutiny Stage | Present | Present | Supported | Scrutiny Review | Supported | **PASS** |
| **5.1** | `change_of_site` | Chapter II | 2.17 | Annexure-2 Sec 2.3(i), Annexure-1 | 81, 77 | Title Deed / Registered Sale Deed of New Site | Mandatory | Min 30 yrs lease or freehold | Sub-Registrar registered conveyance deed | Scrutiny Stage | Present | Present | Supported | `SITE-ANNEX1-LAND-DOCS` | Supported | **PASS** |
| **5.2** | `change_of_site` | Chapter II | 2.17 | Annexure-1 Sec 1.1 | 77 | Town Planning Land Use & Zoning Certificate | Mandatory | Commercial/Institutional educational zoning | Competent Town Planning / Revenue Authority | Scrutiny Stage | Present | Present | Supported | `SITE-ANNEX1-LAND-DOCS` | Supported | **PASS** |
| **5.3** | `change_of_site` | Chapter II | 2.17 | Annexure-1 Sec 1.2 | 77 | Approved Master Building Plan | Mandatory | New site construction | Sanctioned by Town Planning / Municipal Authority | Scrutiny Stage | Present | Present | Supported | `SITE-ANNEX1-LAND-DOCS` | Supported | **PASS** |
| **5.4** | `change_of_site` | Chapter II | 2.17 | Annexure-2 Sec 2.3(iii), Format-3 | 81, 205 | Trust Resolution in Format 3 for Relocation | Mandatory | Approval of site shift | Signed by Chairman/Secretary in Format 3 Clause iv | Scrutiny Stage | Present ("Transition & Relocation Resolution") | Present | Supported | `INTAKE-RESOLUTION-F3` | Supported | **PASS** |
| **5.5** | `change_of_site` | Chapter II | 2.17 | Annexure-2 Sec 2.3(ii), Format-2 | 81, 202 | Affiliating University NOC in Format 2 | Mandatory | Confirming new site within jurisdiction | Format 2 Clause ii signed by Registrar | Scrutiny Stage | **MISSING** | **MISSING** | Supported | `SITE-UNIV-NOC-F2` | Supported | **FAIL (D-01, D-04)** |
| **5.6** | `change_of_site` | Chapter II | 2.17 | Note 2, Format 1 | 82, 201 | State Government NOC in Format 1 | Conditional | Required before starting session | Format 1 Clause ii | Scrutiny Stage | **MISSING** | **MISSING** | Supported | Scrutiny Review | Supported | **FAIL (D-01)** |
| **6.1** | `change_of_name` | Chapter II | 2.19 | Annexure-2 Sec 2.10(ii), Format-3 | 83, 205 | Trust Resolution in Format 3 for Name Change | Mandatory | Resolving new institutional name | Signed by Chairman/Secretary in Format 3 Clause xiv | Scrutiny Stage | Present ("Society / Trust Resolution for Name Change") | Present | Supported | `INTAKE-RESOLUTION-F3` | Supported | **PASS** |
| **6.2** | `change_of_name` | Chapter II | 2.19, 2.20 | Annexure-2 Sec 2.13(i) | 84 | Registrar of Societies / Charity Commissioner Certificate | Mandatory | Establishing legal amendment | Issued by Charity Commissioner / Registrar of Societies | Scrutiny Stage | Present | Present | Supported | Scrutiny Review | Supported | **PASS** |
| **6.3** | `change_of_name` | Chapter II | 2.19 | Annexure-2 Sec 2.10(i), Format-2 | 83, 202 | Affiliating University NOC in Format 2 or Submission Receipt | Mandatory | Endorsing name alteration | Format 2 Clause xiv signed by Registrar or Official Seal Receipt | Scrutiny Stage | Present ("Affiliating University Endorsement Letter") | Present | Supported | `NAME-PROHIBITED-TERMS` | Supported | **PASS** |
| **7.1** | `change_of_affiliating_university` | Chapter II | 2.19 | Annexure-2 Sec 2.11(i), Format-2 | 84, 202 | NOC from Present Affiliating University in Format 2 or Official Receipt | Mandatory | Consenting to release institution | Format 2 Clause xiv signed by Registrar or Official Seal Receipt | Scrutiny Stage | Present ("NOC from Current Affiliating University") | Present | Supported | `AFFIL-UNIV-NOC-F2` | Supported | **PASS** |
| **7.2** | `change_of_affiliating_university` | Chapter II | 2.19 | Annexure-2 Sec 2.11(ii), Format-3 | 84, 205 | Trust Resolution in Format 3 for Affiliation Change & Both NOCs | Mandatory | Unanimous trust resolution | Signed by Chairman/Secretary in Format 3 Clause xvi | Scrutiny Stage | **MISSING** | **MISSING** | Supported | `AFFIL-RESOLUTION-F3` | Supported | **FAIL (D-01, D-04)** |
| **7.3** | `change_of_affiliating_university` | Chapter II | 2.19 | Format-3 Clause xvi | 205 | Affiliation Consent / In-Principle NOC from Proposed University | Mandatory | Consenting to affiliate institution | Registrar of proposed University | Scrutiny Stage | Present ("Affiliation Consent from Proposed University") | Present | Supported | `AFFIL-PROPOSED-CONSENT` | Supported | **PASS** |
| **7.4** | `change_of_affiliating_university` | Chapter II | N/A | N/A (Unprescribed in Sec 2.11) | N/A | State Government Gazetted Notification | Unprescribed | University conversion only, NOT in Sec 2.11 | State gazette print | Scrutiny Stage | Present (Enforced Mandatory) | Present | Supported | N/A | Supported | **FAIL (D-02, D-05)** |
| **8.1** | `reduction_in_intake` | Chapter II | 2.18 | Annexure-2 Sec 2.9(ii), Format-3 | 83, 205 | Governing Body Resolution for Intake Reduction in Format 3 | Mandatory | Intake rationalization | Signed by Chairman/Secretary in Format 3 Clause xiii | Scrutiny Stage | Present | Present | Supported | `INTAKE-RESOLUTION-F3` | Supported | **PASS** |
| **8.2** | `reduction_in_intake` | Chapter II | 2.18 | Annexure-2 Sec 2.9(i), Format-2 | 83, 202 | Affiliating University Intake Reduction NOC | Conditional / Advisory | Recommended for student seat matrix | Format 2 Clause xiii | Scrutiny Stage | Present | Present | Supported | Scrutiny Review | Supported | **PASS** |
| **9.1** | `closure_of_course` | Chapter II | 2.18 | Annexure-2 Sec 2.9(ii), Format-3 | 83, 205 | Governing Body Resolution for Course Closure in Format 3 | Mandatory | Progressive / complete course shutdown | Signed by Chairman/Secretary in Format 3 Clause xiii | Scrutiny Stage | Present | Present | Supported | `INTAKE-RESOLUTION-F3` | Supported | **PASS** |
| **9.2** | `closure_of_course` | Chapter II | 2.18 | Annexure-2 Sec 2.9(i), Format-2 | 83, 202 | University Closure NOC in Format 2 with Student Relocation Plan | Mandatory | Guaranteeing transfer of trailing students | Format 2 Clause ix & xiii table signed by Registrar | Scrutiny Stage | Present ("University Closure Endorsement / NOC") | Present | Supported | `CLINST-UNIV-NOC-F2` | Supported | **PASS** |
| **9.3** | `closure_of_course` | Chapter II | 2.18 | Annexure-2 Sec 2.9(i) | 83 | Student Protection & Relocation Undertaking | Mandatory | Transfer & teaching completion guarantee | Head of Institution / Trust | Scrutiny Stage | Present | Present | Supported | Scrutiny Review | Supported | **PASS** |
| **10.1** | `closure_of_institution` | Chapter II | 2.21 | Annexure-2 Sec 2.7(viii), Format-3 | 83, 205 | Trust Unanimous Resolution in Format 3 for Complete Closure | Mandatory | Trust executive resolution | Signed by Chairman/Secretary in Format 3 Clause xi | Scrutiny Stage | Present | Present | Supported | `INTAKE-RESOLUTION-F3` | Supported | **PASS** |
| **10.2** | `closure_of_institution` | Chapter II | 2.21 | Annexure-2 Sec 2.7(i), Format-2 | 82, 202 | University NOC in Format 2 with Student Re-arrangement Plan | Mandatory | Complete arrangement for trailing batches | Format 2 Clause x & student table signed by Registrar | Scrutiny Stage | Present | Present | Supported | `CLINST-UNIV-NOC-F2` | Supported | **PASS** |
| **10.3** | `closure_of_institution` | Chapter II | 2.21 | Annexure-2 Sec 2.7(vi), Affidavit-4 | 83, 190 | Affidavit 4 on Non-Judicial Stamp Paper | Mandatory | Declaration of zero liabilities to faculty, staff, and students | Sworn before 1st Class Judicial Magistrate / Notary on Rs. 100/- stamp paper | Scrutiny Stage | **MISSING** | **MISSING** | Supported | `CLINST-AFFIDAVIT4` | Supported | **FAIL (D-01, D-04)** |
| **10.4** | `closure_of_institution` | Chapter II | 2.21 | Annexure-2 Sec 2.7(ii) | 82 | Certified Payroll Roster with PF & TDS Dues Clearance | Mandatory | Demonstrating all faculty/staff dues cleared | Head of Institution & CA certification | Scrutiny Stage | **MISSING** | **MISSING** | Supported | `CLINST-SALARY-DUES` | Supported | **FAIL (D-01, D-04)** |
| **10.5** | `closure_of_institution` | Chapter II | 2.21 | Annexure-2 Sec 2.7(vii) | 83 | Non-Encumbrance & Student Clearance Report | Mandatory | Court cases / pending ragging matters | Legal counsel & auditor audit | Scrutiny Stage | Present ("Audited Non-Encumbrance & Student Clearance Report") | Present | Supported | Scrutiny Review | Supported | **PASS** |
| **10.6** | `closure_of_institution` | Chapter II | 2.21 | Format 1 | 201 | State Government NOC in Format 1 | Mandatory | Relieving state quota obligations | Format 1 Clause vi signed by State Authority | Scrutiny Stage | Present | Present | Supported | Scrutiny Review | Supported | **PASS** |
| **11.1** | `merger_of_institutions` | Chapter II | 2.13 | Annexure-2 Sec 2.4(iii), Format-3 | 82, 205 | Joint Resolution of Both Governing Bodies in Format 3 | Mandatory | Approved by transferor & transferee trusts | Signed by Chairman/Secretary in Format 3 Clause viii | Scrutiny Stage | Present | Present | Supported | `INTAKE-RESOLUTION-F3` | Supported | **PASS** |
| **11.2** | `merger_of_institutions` | Chapter II | 2.13 | Annexure-2 Sec 2.4(ii), Format-2 | 82, 202 | Affiliating University NOC in Format 2 for Merger | Mandatory | Academic integration of students | Format 2 Clause vi signed by Registrar | Scrutiny Stage | Present | Present | Supported | `CLINST-UNIV-NOC-F2` | Supported | **PASS** |
| **11.3** | `merger_of_institutions` | Chapter II | 2.13 | Annexure-2 Sec 2.4(iv) | 82 | Legally Applicable Merger Documents / Government Order | Mandatory | Transfer of land/assets if different trusts | Registered conveyance/transfer deed & Govt approval | Scrutiny Stage | **MISSING** (Replaced by State NOC) | Present | Supported | Scrutiny Review | Supported | **FAIL (D-01, D-07)** |
| **11.4** | `merger_of_institutions` | Chapter II | 2.13 | Annexure-3 Clause 3.1 | 86 | Consolidated Campus Master Plan | Mandatory | Single contiguous or max 3 plot campus | Certified Architect drawing | Scrutiny Stage | Present | Present | Supported | `COMMON-LAND-FSI` | Supported | **PASS** |
| **11.5** | `merger_of_institutions` | Chapter II | 2.13 | Format 1 | 201 | State Government NOC in Format 1 | Conditional | State jurisdiction | Signed by Secretary/Director of Technical Education | Scrutiny Stage | Present | Present | Supported | Scrutiny Review | Supported | **PASS** |
| **12.1** | `merger_of_courses` | Chapter II | 2.18 | Annexure-2 Sec 2.9(ii), Format-3 | 83, 205 | Trust Resolution in Format 3 for Merger of Courses | Mandatory | Amalgamating curriculum & intake | Signed by Chairman/Secretary in Format 3 Clause xiii | Scrutiny Stage | Present ("Academic Council Approval Resolution") | Present | Supported | `INTAKE-RESOLUTION-F3` | Supported | **FAIL (D-07)** |
| **12.2** | `merger_of_courses` | Chapter II | 2.18 | Annexure-2 Sec 2.9(i), Format-2 | 83, 202 | University Revised Affiliation Order / NOC in Format 2 | Mandatory | Combined intake endorsement | Format 2 Clause xiii signed by Registrar | Scrutiny Stage | Present | Present | Supported | `CLINST-UNIV-NOC-F2` | Supported | **PASS** |
| **13.1** | `conversion_of_institution_type` | Chapter II | 2.14, 2.15 | Annexure-2 Sec 2.3(iii), Format-3 | 81, 205 | Trust Resolution in Format 3 for Conversion | Mandatory | Women to Co-ed or Diploma to Degree | Signed by Chairman/Secretary in Format 3 Clause v/vi | Scrutiny Stage | **MISSING** | **MISSING** | Supported | `INTAKE-RESOLUTION-F3` | Supported | **FAIL (D-01, D-04)** |
| **13.2** | `conversion_of_institution_type` | Chapter II | 2.14, 2.15 | Annexure-2 Sec 2.3(ii), Format-2 | 81, 202 | Affiliating University / State Board NOC in Format 2 | Mandatory | Approving change of level / gender admission | Format 2 Clause iii/iv signed by Registrar/Director | Scrutiny Stage | **MISSING** | **MISSING** | Supported | `CLINST-UNIV-NOC-F2` | Supported | **FAIL (D-01, D-04)** |
| **13.3** | `conversion_of_institution_type` | Chapter II | 2.14, 2.15 | Note 2, Format 1 | 82, 201 | State Government NOC in Format 1 | Mandatory | Policy concurrence | Format 1 Clause iii/iv | Scrutiny Stage | Present | Present | Supported | Scrutiny Review | Supported | **PASS** |
| **13.4** | `conversion_of_institution_type` | Chapter II | 2.14 | Annexure-13 | 84 | Trust Deed / Constitution Amendment Deed | Mandatory | Amending trust objectives if required | Registered supplementary deed | Scrutiny Stage | Present | Present | Supported | Scrutiny Review | Supported | **PASS** |
| **14.1** | `nri_supernumerary_seats` | Chapter II | 2.8, 2.9 | Annexure-2 Sec 2.2, 2.5(iii), Format-3 | 81, 82, 205 | Trust Resolution in Format 3 for NRI / OCI Quota | Mandatory | Up to 5% NRI, 15% supernumerary OCI/FN | Signed by Chairman/Secretary in Format 3 Clause iii/ix | Scrutiny Stage | **MISSING** | **MISSING** | Supported | `INTAKE-RESOLUTION-F3` | Supported | **FAIL (D-01, D-04)** |
| **14.2** | `nri_supernumerary_seats` | Chapter II | 2.9 | Annexure-2 Sec 2.5(i) | 82 | International Students Hostel & Amenities Verification Report | Mandatory | Dedicated international hostel facilities | Head of Institution / Architect verification | EVC / Scrutiny | Present ("International Students Amenities Verification Audit") | Present | Supported | EVC Review | Supported | **PASS** |
| **14.3** | `nri_supernumerary_seats` | Chapter II | 2.9 | Annexure-2 Sec 2.5(ii) | 82 | Office of International Affairs (OIA) Charter & Appointment | Mandatory | Dedicated liaison officer for foreign students | Official appointment order & charter document | Scrutiny Stage | Present ("Institute Supernumerary Cell Charter") | Present | Supported | Scrutiny Review | Supported | **PASS** |
| **15.1** | `collaboration_twinning` | Chapter III | 3.2(h) | Annexure-2 Sec 2.14(v) | 85 | Bilateral Agreement / MoU with Foreign University | Mandatory | Curriculum, evaluation, fees, credit distribution | Executed by authorized signatories of both institutions | Scrutiny Stage | Present | Present | Supported | `TWIN-BIPARTITE-MOU` | Supported | **PASS** |
| **15.2** | `collaboration_twinning` | Chapter III | 3.2(h) | Annexure-2 Sec 2.14(vi) | 85 | Bilateral Agreement / MoU with Affiliating University | Mandatory | Endorsement of degree & examination transfer | Executed with Indian affiliating University | Scrutiny Stage | **MISSING** | **MISSING** | Supported | Scrutiny Review | Supported | **FAIL (D-01)** |
| **15.3** | `collaboration_twinning` | Chapter III | 3.2(l) | Annexure-2 Sec 2.14(vii), Affidavit-11 | 85, 197 | Affidavit 11 on Non-Judicial Stamp Paper (Visa Fallback) | Mandatory | Unconditional guarantee to absorb student upon visa refusal | Sworn before 1st Class Judicial Magistrate / Notary on Rs. 100/- stamp paper | Scrutiny Stage | **MISSING** | **MISSING** | Supported | `TWIN-AFFIDAVIT11` | Supported | **FAIL (D-01, D-04)** |
| **15.4** | `collaboration_twinning` | Chapter III | 3.2(c) | Annexure-2 Sec 2.14(x) | 85 | NBA / NIRF Top 200 Ranking Certificate | Mandatory | Quality eligibility for international collaboration | Issued by NBA / Ministry of Education (NIRF) | Scrutiny Stage | **MISSING** (Replaced by AIU Equivalence) | **MISSING** | Supported | Scrutiny Review | Supported | **FAIL (D-01, D-07)** |
| **15.5** | `collaboration_twinning` | Chapter III | 3.2 | Annexure-2 Sec 2.14(xi), Format-3 | 85, 205 | Trust Resolution in Format 3 for Collaboration | Mandatory | Approving foreign collaboration | Signed by Chairman/Secretary in Format 3 Clause xix | Scrutiny Stage | **MISSING** | **MISSING** | Supported | `INTAKE-RESOLUTION-F3` | Supported | **FAIL (D-01, D-04)** |
| **15.6** | `collaboration_twinning` | Chapter III | 3.2(a) | Annexure-2 Sec 2.14(i), (viii) | 85 | Foreign University Degree Recognition & Equivalence Proof | Mandatory | Equivalent degree offered in home country | Official declaration from Foreign University | Scrutiny Stage | Present ("Foreign University Accreditation Certificate") | Present | Supported | Scrutiny Review | Supported | **PASS** |
| **16.1** | `other` | Chapter II / General | Statutory Petitions | APH General Norms | N/A | Signed Statutory Representation Petition | Mandatory | Detailed grounds of appeal/representation | Signed by Head of Institution / Sponsoring Trust | Scrutiny Stage | Present | Present | Supported | `OTHER-HUMAN-SCRUTINY` | Supported | **PASS** |
| **16.2** | `other` | Chapter II / General | Statutory Petitions | APH General Norms | N/A | Supporting Regulatory / Judicial Documents | Mandatory | Supporting court orders, executive directions | Certified copies of official orders | Scrutiny Stage | Present | Present | Supported | `OTHER-HUMAN-SCRUTINY` | Supported | **PASS** |

---

## 4. Discrepancy Classification & Root Cause Analysis

Every identified discrepancy has been classified under defect categories **D-01 through D-10**:

### Defect Group D-01: Missing Frontend Upload Field
- **D-01.1 (EoA):** Affidavit-2 on Rs. 100/- non-judicial stamp paper (Annexure-2 Sec 2.1(i), p. 81). Severe statutory defect; institution has no field to upload Affidavit-2.
- **D-01.2 (EoA):** AICTE Web-Portal Payment Receipt (Annexure-2 Sec 2.1(ii), p. 81).
- **D-01.3 (EoA):** Satellite map with latitude and longitude (Annexure-2 Sec 2.1(vi), p. 81).
- **D-01.4 (EoA):** Audited Statement of Accounts of previous year (Annexure-2 Sec 2.1(vii), p. 81).
- **D-01.5 (Increase in Intake):** Affidavit-8 on Rs. 100/- stamp paper (Annexure-2 Sec 2.6(i), p. 82).
- **D-01.6 (Additional Course):** Affidavit-8 on Rs. 100/- stamp paper (Annexure-2 Sec 2.6(i), p. 82).
- **D-01.7 (New Programme):** Trust Resolution in Format 3 (Annexure-2 Sec 2.3(iii), p. 81).
- **D-01.8 (Change of Site):** Affiliating University NOC in Format 2 (Annexure-2 Sec 2.3(ii), p. 81).
- **D-01.9 (Change of Affiliation):** Trust Resolution in Format 3 Clause xvi approving affiliation change and both NOCs (Annexure-2 Sec 2.11(ii), p. 84).
- **D-01.10 (Closure of Institution):** Affidavit-4 on Rs. 100/- stamp paper (Annexure-2 Sec 2.7(vi), p. 83) and Certified Payroll Roster with PF/TDS clearance (Annexure-2 Sec 2.7(ii), p. 82).
- **D-01.11 (Conversion):** Affiliating University NOC in Format 2 (Sec 2.3(ii)) and Format 3 Resolution (Sec 2.3(iii)).
- **D-01.12 (NRI Quota):** Trust Resolution in Format 3 (Annexure-2 Sec 2.2 & 2.5(iii)).
- **D-01.13 (Collaboration & Twinning):** Affidavit-11 on Rs. 100/- stamp paper (Annexure-2 Sec 2.14(vii), p. 85), Format 3 Resolution (Sec 2.14(xi)), and NBA/NIRF Top 200 Ranking Certificate (Sec 2.14(x)).

### Defect Group D-02: Incorrectly Mandatory Upload Field
- **D-02.1 (EoA):** "Previous Year EoA Order" is enforced as a mandatory upload, but is NOT prescribed in Annexure-2 Sec 2.1.
- **D-02.2 (EoA):** "Faculty Cadre & Salary Proof Certificate" enforced as a mandatory standalone PDF upload in EoA self-disclosure, whereas faculty counts are captured via structured fields and Annexure-5 FSR norms.
- **D-02.3 (Change of Affiliation):** "State Government Gazetted Notification" enforced as mandatory for Change of Affiliating University, whereas Section 2.11 only prescribes University NOC in Format 2 and Trust Resolution in Format 3.

### Defect Group D-03: Missing Backend Document Support
- **D-03.1:** The `DocumentType` database table is entirely unpopulated (0 records). All 16 application types store requirements via raw unlinked string labels (`documentName`), with no canonical document-type enum or standard verification schema.
- **D-03.2:** Backend document requirement validator in `backend/src/controllers/application.controller.js` validates solely against whatever items happen to be seeded in `ApplicationDocumentRequirement`, propagating frontend/seed errors directly into database persistence.

### Defect Group D-04: AI Rule Missing or Incorrect
- **D-04.1:** AI rule engine in `ai-service/rules/category_rules.py` evaluates statutory rules (e.g. `check_affidavit_8`, `check_affidavit_4`, `check_affidavit_11`, `check_affiliating_university_resolution_format3`) by searching for document labels or keywords that the institution was never given a form field to upload. This directly produces false-positive statutory deficiencies.
- **D-04.2:** Document matcher in `ai-service/rules/engine.py` relies on heuristic substring matching of filenames and document labels, causing unlinked documents to be flagged as missing.

### Defect Group D-05: Category Leakage
- **D-05.1:** Section 2.6 rules (Increase in Intake / Additional Course, requiring resolutions approving expansion and allocating land, building, and funds) were historically evaluated across other categories including Change of Affiliation.
- **D-05.2:** Common rules `COMMON-FIRE-NOC` and `COMMON-OCCUPANCY-CERT` were applied across categories whose primary statutory purpose is administrative (e.g. Change of Name, Reduction in Intake).

### Defect Group D-06: Conditional Requirement Incorrectly Enforced
- **D-06.1 (Structural Stability Certificate):** APH Annexure-2 Section 2.1(iv) explicitly conditions this requirement: *"if the Building is more than thirty years from the issue of Completion Certificate"*. If building age is under 30 years or unverified, the system must not blindly flag a statutory deficiency.
- **D-06.2 (Web-Portal Payment Receipt):** Section 2.1(ii) specifies *"if any, in respect of Extension of Approval"*. For zero-TER categories or exemptions, this must not be enforced as universally mandatory.

### Defect Group D-07: Incorrect Document Mapping
- **D-07.1:** Conflation of "Previous Year EoA Order" with "AICTE Web-Portal Payment Receipt". An approval order issued by AICTE in a prior cycle does not establish payment of current-year TER charges.
- **D-07.2 (Collaboration & Twinning):** Conflation of "Association of Indian Universities (AIU) Equivalence Certificate" with "NBA / NIRF Top 200 Ranking Certificate". AIU equivalence is for foreign degree recognition in India, whereas APH Section 2.14(x) specifically mandates institutional accreditation/ranking eligibility.

### Defect Group D-08: False Positive / Unsupported Deficiency
- **D-08.1:** Because institutions could not upload Affidavit-2, Affidavit-8, Format 3 Resolution (for Affiliation Change), or Affidavit-4 (for Closure), the deterministic engine reported DEFICIENT findings with statutory references (e.g. Annexure-2 Section 2.1.i), despite the institution having completed 100% of the upload fields presented by the wizard.

### Defect Group D-09: Invalid Evidence / Document Integrity
- **D-09.1:** The system previously allowed placeholder, blank, or stub PDFs to pass file upload validation without checking byte integrity, page count, or unreadable scanned content warnings, requiring subsequent manual audit flagging.

### Defect Group D-10: Notice Generation Discrepancy
- **D-10.1:** Autonomous agent `tool_propose_deficiency_notice` only ingested deterministic statutory findings into the draft notice items. Advisory qualitative observations produced by Groq LLM (e.g. unreadable layout plans, unverified faculty undertakings) were displayed in the AI Scrutiny tab but were completely omitted from the agent's proposed notice builder, preventing scrutiny officers from reviewing and selectively including verified qualitative findings into official deficiency communications.

---

## 5. In-Depth Root Cause Analysis: The EoA Affidavit-2 Defect

### Regulatory Grounding
- **APH Reference:** Chapter II, Clause 2.1 & Clause 2.3.4 (p. 11, 15); Annexure-2 Section 2.1(i) (p. 81); Affidavit-2 (p. 186-188).
- **Mandate:** *"An Affidavit 2 with digital signature of the Chairman/ Secretary of the Trust/ Society/ Company on an e-stamp paper of Rs. 100/- duly sworn before a First Class Judicial Magistrate or Notary or an Oath Commissioner."*
- **Contents of Affidavit-2 (32 statutory clauses):**
  1. Deponent affirms truthfulness of all institutional disclosures.
  2. Deponent affirms compliance with land, building, carpet area, and FSI norms (Annexure-3).
  3. Deponent affirms compliance with faculty cadre ratio (1:2:6), pay scales (6th/7th CPC), and DA remittance.
  4. Deponent affirms establishment of Anti-Ragging Committee, Internal Complaints Committee (ICC), and Grievance Redressal Committee.
  5. Deponent affirms unencumbered possession of land and absence of court stays/punitive actions.

### Implementation Discrepancy
1. In the database seed (`backend/prisma/seed.js` or application type seeder), `extension_of_approval` was configured with:
   - `Previous Year EoA Order` (Mandatory)
   - `Fire Safety Certificate / NOC` (Mandatory)
   - `Building Occupancy / Completion Certificate` (Mandatory)
   - `Faculty Cadre & Salary Proof Certificate` (Mandatory)
   - `Barrier-Free Accessibility Certificate` (Optional)
2. `Affidavit-2` was completely omitted from `ApplicationDocumentRequirement` for `extension_of_approval`!
3. `ai-service/rules/common_rules.py` had rule `COMMON-AFFIDAVIT2` registered for `extension_of_approval`. When scrutiny executed, `COMMON-AFFIDAVIT2` searched for `affidavit_2` among uploaded documents.
4. Because the frontend never presented an `Affidavit-2` upload field, no applicant institution could ever submit it, guaranteeing an automatic `DEFICIENT` finding.
5. Meanwhile, institutions were forced to upload an ad-hoc `Previous Year EoA Order` that is not an Annexure-2 requirement.

---

## 6. Implementation Remediation Architecture

To permanently resolve these defects without recurring discrepancies, the platform requires a **Single Source of Declarative Truth**:

```
                         ┌────────────────────────────────────────┐
                         │   ai-service/rules/aph_2024_2027/      │
                         │   declarative_manifest.py / json       │
                         │   Authoritative APH Registry (16 Types)│
                         └──────────────────┬─────────────────────┘
                                            │
               ┌────────────────────────────┼───────────────────────────┐
               ▼                            ▼                           ▼
    ┌──────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
    │ Frontend Upload Form │   │ Express Backend Validator│   │ Python AI Scrutiny Rules │
    │ Dynamic Checklists   │   │ ApplicationType Seeder & │   │ Engine & Notice Proposer │
    │ Conditional Badges   │   │ DB Consistency Guard     │   │ Grounded Rule Evaluation │
    └──────────────────────┘   └──────────────────────────┘   └──────────────────────────┘
```

### 6.1 Declarative Configuration Architecture (`ai-service/rules/aph_2024_2027/`)
1. Create a versioned statutory registry module: `ai-service/rules/aph_2024_2027/document_manifest.py` containing complete, immutable specifications for each of the 16 application categories.
2. Export JSON-compatible definitions for consumption by the Express backend and frontend wizard.
3. Every document requirement defines:
   - `doc_code`: Canonical document identifier (e.g. `affidavit_2`, `resolution_format_3`, `fire_safety_noc`).
   - `doc_name`: Official APH title (e.g. "Affidavit 2 on Non-Judicial Stamp Paper").
   - `aph_clause`: Exact clause and page citation (e.g. "Annexure-2 Section 2.1.i (Page 81)").
   - `required`: Boolean (mandatory vs optional).
   - `conditional`: Boolean + description of condition (e.g. "Only required if building > 30 years old").
   - `allowed_extensions`: String (e.g. `.pdf`).
   - `max_size_mb`: Integer (e.g. `10`).
   - `statutory_rule_id`: Linked deterministic rule ID in `RULE_CATALOG`.

### 6.2 Backend Synchronization
1. Create a migration/synchronization script: `backend/src/services/aphComplianceSync.service.js` that aligns `prisma.applicationType` and `prisma.applicationDocumentRequirement` with the authoritative manifest.
2. Update `applicationType.controller.js` to serve enhanced requirement metadata (conditions, statutory citations, help text).
3. Update `application.controller.js` to enforce upload integrity against authoritative requirements.

### 6.3 Frontend Wizard Modernization
1. Update `app/app/institution/applications/new/page.jsx` to render:
   - Official APH citation badges next to each required document.
   - Distinct badges for **Mandatory Statutory**, **Conditional Statutory**, and **Optional Advisory**.
   - Clear explanatory text for conditional items (e.g. Building age > 30 years for Structural Stability).
2. Eliminate all unprescribed mandatory upload fields (e.g. Previous Year EoA Order, State Gazette for Affiliation Change).

### 6.4 AI Rule Engine & Heuristic Resolution Fixes
1. Ground every rule in `ai-service/rules/registry.py` to match against both canonical `doc_code` and official `doc_name`.
2. Implement conditional applicability predicates:
   - `COMMON-STRUCTURAL-STABILITY`: Checks building age field; if <= 30 years or unstated, marks `NOT_APPLICABLE` with advisory notice.
   - `COMMON-PAYMENT-RECEIPT`: Flags only when TER charges apply and fee transaction is missing.
3. Eliminate cross-category leakage (Section 2.6 expansion rules strictly quarantined to `increase_intake` and `additional_course`).

### 6.5 Groq Finding Notice Integration
1. Extend `ai-service/agent/tools.py` (`tool_propose_deficiency_notice`) to accept both:
   - Deterministic statutory findings (`items`).
   - Groq qualitative observations (`advisory_observations`).
2. Provide scrutiny officers with granular UI controls in `app/app/aicte/applications/[id]/page.jsx`:
   - Officer can toggle each Groq observation to "Include in Official Notice", "Edit Draft Wording", "Mark for EVC Verification", or "Discard".
   - Only officer-approved and finalized observations are written to the official deficiency letter dispatched to the institution.

---

## 7. Category-by-Category Regression Test Plan

| Category Code | Positive Scenario | Negative / Conditional Scenario | Expected AI Scrutiny Outcome |
|---|---|---|---|
| `extension_of_approval` | Upload Affidavit-2, Fire NOC, Occupancy Cert, Satellite Map, Audited Accounts | Missing Affidavit-2; or building > 30 yrs without Structural Stability Cert | Pass on positive; exact statutory deficiency citation on missing Affidavit-2; no false positives for Previous Year EoA Order |
| `increase_intake` | Upload Affidavit-8, Format 3 Resolution, NBA Cert, Layout Plan, Faculty Allocation | Missing Affidavit-8 or missing Format 3 Resolution | Flag DEFICIENT under Annexure-2 Sec 2.6.i (Affidavit-8) or Sec 2.6.iii (Format 3); no leakage of Affiliation Change rules |
| `additional_course` | Upload Affidavit-8, Format 3 Resolution, Affiliation Letter, Lab POs, Syllabus | Missing Affidavit-8 or unapproved course nomenclature | Flag DEFICIENT under Annexure-2 Sec 2.6.i or Annexure-11; pass valid nomenclature |
| `new_programme` | Upload University NOC (Format 2), Format 3 Resolution, State NOC (Format 1), DPR, FDR | Missing Format 3 Resolution or missing State NOC | Flag DEFICIENT under Annexure-2 Sec 2.3; require EVC verification |
| `change_of_site` | Upload Land Deed, Zoning Cert, Approved Building Plan, Format 3 Resolution, University NOC (Format 2) | Missing University NOC (Format 2) or missing Format 3 Resolution | Flag DEFICIENT under Annexure-2 Sec 2.3.ii; trigger mandatory EVC inspection flag |
| `change_of_name` | Upload Format 3 Resolution, Charity Commissioner Cert, University NOC (Format 2) | Prohibited acronym in name (e.g. "IIT") or missing University NOC | Flag DEFICIENT under Chapter I Clause 1.5.4 or Annexure-2 Sec 2.10 |
| `change_of_affiliating_university` | Upload University NOC (Format 2 Clause xiv), Format 3 Resolution (Clause xvi), Proposed Consent | Missing Format 3 Resolution; or missing Current University NOC | Flag DEFICIENT under Annexure-2 Sec 2.11; do NOT request expansion/land-allocation resolution |
| `reduction_in_intake` | Upload Format 3 Resolution (Clause xiii) | Missing Format 3 Resolution | Flag DEFICIENT under Annexure-2 Sec 2.9; do NOT enforce mandatory University NOC |
| `closure_of_course` | Upload Format 3 Resolution, University NOC (Format 2 with trailing student table), Student Undertaking | Missing University NOC or missing trailing student table | Flag DEFICIENT under Annexure-2 Sec 2.9.i; require verified transfer arrangements |
| `closure_of_institution` | Upload Format 3 Resolution, University NOC (Format 2), Affidavit-4, Certified Payroll Sheet, State NOC | Missing Affidavit-4 or outstanding faculty/staff salary dues | Flag DEFICIENT under Annexure-2 Sec 2.7.ii/vi; require zero-liability clearance |
| `merger_of_institutions` | Upload Joint Format 3 Resolution, University NOC (Format 2), Consolidated Master Plan, State NOC | Missing Joint Format 3 Resolution or missing University NOC | Flag DEFICIENT under Annexure-2 Sec 2.4; trigger mandatory EVC inspection flag |
| `merger_of_courses` | Upload Format 3 Resolution, Revised University Affiliation Order (Format 2) | Missing Format 3 Resolution or missing University NOC | Flag DEFICIENT under Annexure-2 Sec 2.9; verify combined intake |
| `conversion_of_institution_type` | Upload Format 3 Resolution, University/Board NOC (Format 2), State NOC, Trust Amendment Deed | Missing University NOC (Format 2) or missing Format 3 Resolution | Flag DEFICIENT under Annexure-2 Sec 2.3/2.8; trigger mandatory EVC inspection flag |
| `nri_supernumerary_seats` | Upload Format 3 Resolution (Clause iii/ix), Hostel Verification Report, OIA Charter | Missing Format 3 Resolution or 3-yr enrollment < 80% | Flag DEFICIENT under Annexure-2 Sec 2.2/2.5 or Chapter II Clause 2.9 |
| `collaboration_twinning` | Upload Foreign MoU, Affiliating Univ MoU, Affidavit-11, NIRF/NBA Top 200 Cert, Format 3 Resolution, Foreign Degree Proof | Missing Affidavit-11 or foreign credit transfer > 40% | Flag DEFICIENT under Chapter III Clause 3.2.k or Annexure-2 Sec 2.14 |
| `other` | Upload Signed Statutory Petition and Supporting Orders | Missing petition document | Flag for mandatory human Scrutiny Committee case-by-case evaluation |

---

## 8. Conclusion and Sign-Off

This audit establishes the definitive baseline for APH 2024–27 document compliance. Implementation can now proceed strictly in accordance with this report:
- Phase 6 will implement the unified declarative document configuration and sync database/frontend/rules.
- Phase 7 will integrate Groq observations into the autonomous notice builder with scrutiny officer approval gates.
- Phase 8 will execute end-to-end regression tests across all 16 categories.

**Audit Approved by:** Lead AI Architect & AICTE Regulatory Scrutiny Systems Team  
**Artifact Destination:** `APH_2024_2027_PROJECT_WIDE_COMPLIANCE_AUDIT.md`

