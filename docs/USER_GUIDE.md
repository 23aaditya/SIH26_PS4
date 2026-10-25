# AICTE PS4: Integrated Approval Workflow Automation Platform
## Complete Website User Manual, Operations Guide & Guided Walkthrough

*Project Reference: SIH26262 — Integrated AICTE Approval Workflow Automation, Compliance Monitoring and Alert Management System*  
*Target Audience: Technical Team Members, Hackathon Evaluators, Institution Administrators, and AICTE Bureau Officers*  
*Document Version: 1.0 (Production Walkthrough)*

---

## 1. Product Overview

### What is this system?
The **Integrated AICTE Approval Workflow Automation Platform** is an enterprise web application designed to digitize, monitor, and accelerate the regulatory approval and compliance lifecycle for Indian technical institutions. 

In traditional operations, technical institutions submit heavy physical dossiers and certificates for Annual Extension of Approval (EoA), New Programs, or Intake Increases. These undergo multi-layered bureaucratic reviews across Regional Offices, Scrutiny Committees, Expert Visiting Committees (EVC), and Hearing Committees.

This platform automates this lifecycle by providing:
1. **An Institution Portal**: Allows colleges and polytechnics to prepare 5-step structured approval petitions, track real-time regulatory stage transitions, address deficiency notices, and submit post-approval compliance undertakings.
2. **An AICTE Official Portal**: Empowers Regional Officers, Scrutiny Committee members, EVC Coordinators, Bureau Officers, and the Competent Authority (Chairman) to review dossiers, verify certificates, schedule expert physical inspections, and issue digitally signed Approval Orders.
3. **Statutory Citizens Charter SLA Tracking**: Embeds automated countdown timers against statutory limits (e.g., 10-day deficiency response windows, 14-day scrutiny cycles), flagging delays before they escalate to national leadership.

### Architecture & Storage Reality (Important Note)
* **Client-Side Reactive Prototype**: All applications, documents, EVC schedules, undertakings, notifications, and audit events run through a client-side state service (`lib/dataService.ts`) and persist directly to your browser's **`localStorage`**.
* **Quick Demo Personas**: Pre-configured statutory roles exist with 1-click switching so you can demonstrate multi-stakeholder approval handoffs instantly on a single laptop without managing separate databases or passwords.
* **Storage Isolation**: Because state is stored in your browser's local storage, actions performed in one browser window will update across tabs in that same browser, but are not shared across separate computers over the network.

---

## 2. How to Start and Access the Website

### Running the Server
The web application is built on Next.js 16 and runs locally:

1. Open your terminal in the `app` directory:
   ```bash
   cd "d:\Aaditya\PICT\Hackathons\SIH 2026\PS4\Project_PS4\app"
   ```
2. Start the local development server (if not already running):
   ```bash
   npm run dev
   ```
3. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

### Default Credentials & Persona Logins
You do not need to memorize passwords. From the login screen (`http://localhost:3000/login`), you can click any of the **Quick Demo Personas** on the right side of the screen:

| Persona Name | Statutory Role | Email ID | Access Area |
| :--- | :--- | :--- | :--- |
| **Dr. P. T. Kulkarni** | Principal (Institution User) | `principal@pict.edu` | Institution Portal (`/institution/*`) |
| **Dr. S. K. Deshmukh** | Regional Officer (Western Region) | `ro.western@aicte-india.org` | AICTE Official Portal (`/aicte/*`) |
| **Prof. Anjali Mathur** | Scrutiny Committee Member | `scrutiny.member1@aicte-india.org` | AICTE Official Portal (`/aicte/*`) |
| **Dr. B. K. Raman** | EVC Coordinator | `evc.head@aicte-india.org` | AICTE Official Portal (`/aicte/*`) |
| **Shri Rajiv Ranjan, IAS**| Bureau Officer (Approvals Bureau)| `bureau.approvals@aicte-india.org` | AICTE Official Portal (`/aicte/*`) |
| **Prof. T. G. Sitharam** | Competent Authority (Chairman) | `chairman@aicte-india.org` | AICTE Official Portal (`/aicte/*`) |
| **System Administrator** | Technical System Administrator | `admin@aicte-india.org` | AICTE Portal + System Configuration |

*(Password for all pre-seeded accounts if typing manually: `password123`)*

---

## 3. Complete Navigation Map

```
Public Internet
  └── / (Landing Page)
        ├── /login (Central Gateway with Quick Personas)
        └── /register (Institution Account Registration)

=============================================================================
INSTITUTION PORTAL (Roles: "institution")
=============================================================================
├── TopBar
│     ├── Breadcrumb trail (e.g. AICTE / Institution / Applications)
│     ├── Global Search (Searches applications by ID/category)
│     ├── Notification Bell (Unread count, dropdown list, mark read)
│     └── Role Switcher (Instant swap to any other AICTE/Inst persona)
└── Sidebar Navigation
      ├── [Main Workflow]
      │     ├── Dashboard (/institution/dashboard)
      │     ├── My Applications (/institution/applications)
      │     │     └── [Click Row] -> Application Details (/institution/applications/[id])
      │     └── New Application (/institution/applications/new)
      │           └── [Step 5 Submit] -> Redirects to /institution/applications/[id]
      ├── [Compliance & Vault]
      │     ├── Compliance & Undertakings (/institution/compliance)
      │     └── Document Repository (/institution/documents)
      └── [Account & Alerts]
            ├── Notifications (/institution/notifications)
            └── Institution Profile (/institution/profile)

=============================================================================
AICTE OFFICIAL PORTAL (Roles: "regional_officer", "bureau_officer", 
                       "scrutiny_committee", "evc_coordinator", 
                       "competent_authority", "admin")
=============================================================================
├── TopBar (Identical header shell with Breadcrumbs, Search, Alerts, Switcher)
└── Sidebar Navigation
      ├── [Core Processing]
      │     ├── Official Dashboard (/aicte/dashboard)
      │     ├── Application Queue (/aicte/applications & /aicte/queue)
      │     │     └── [Click Row] -> Case Review Docket (/aicte/applications/[id])
      │     └── EVC Scheduling (/aicte/evc)
      ├── [Monitoring & Audits]
      │     ├── Compliance Monitoring (/aicte/compliance)
      │     ├── Document Validity (/aicte/documents)
      │     └── Alerts & Escalations (/aicte/notifications)
      └── [Administration & Rules]
            ├── Analytics & Reports (/aicte/reports) [Restricted to: ro, bureau, admin, authority]
            ├── Workflow Configuration (/aicte/rules) [Restricted to: admin]
            └── User & Role Directory (/aicte/users) [Restricted to: admin, bureau]
```

### Route-to-Route Jump Rules:
* If an Institution user attempts to visit `/aicte/dashboard`, the `RequireRole` security guard intercepts them and displays a friendly **"Role Switch Required"** modal with a one-click button: *"Switch to Dr. S. K. Deshmukh (Regional Officer)"*.
* If an AICTE official attempts to visit `/institution/dashboard`, the same guard allows immediate 1-click switching back to *"Dr. P. T. Kulkarni (Principal)"*.

---

## 4. Institution Portal Guide: Every Page & Its Controls

### 4.1. Institution Dashboard (`/institution/dashboard`)
* **How to navigate**: Log in as Principal or click **Dashboard** in the sidebar.
* **Who uses it**: Institution Principals, Registrars, and AICTE Accreditation In-Charges.
* **Purpose**: Overview of active regulatory petitions, upcoming deadlines, pending deficiency letters, and expiring statutory clearances.
* **What you see**:
  1. **Institution Identity Banner**: Shows Institute PID (`1-482910381`), Region (`Western Region`), and college name (*Pune Institute of Computer Technology*).
  2. **Top Actions**:
     * *Compliance Tasks Button*: Shows count of open undertakings and links to `/institution/compliance`.
     * *New Application Button*: Blue button linking directly to the submission wizard.
  3. **Action Required Alert Strip** (Amber): Appears only when an application has been flagged with a deficiency letter by AICTE. Displays direct links to resolve the specific application.
  4. **4 KPI Summary Cards**:
     * *Total Applications*: Total applications in the institution's history.
     * *In Review / Evaluation*: Applications actively with AICTE Scrutiny, EVC, or Committee.
     * *Action Required*: Count of applications returned for clarification.
     * *Approved Orders*: Count of finalized approvals.
  5. **Active Applications Table**: Lists all in-flight applications with Application Number, Category, Current Stage, Assignee Role, SLA countdown timer, and a "View Dossier" link.
  6. **Expiring Statutory Clearances Watchlist**: Card warning of municipal certificates or Fire Safety NOCs expiring within 30 days.
* **Data Source**: Calculated dynamically from `localStorage` records for `inst-001`.

---

### 4.2. My Applications (`/institution/applications`)
* **How to navigate**: Click **My Applications** in sidebar.
* **Purpose**: Searchable, filterable portfolio of all current and historical approval filings.
* **Controls & Features**:
  * **Status Filter Tabs**:
    * *All Applications*: Shows full database.
    * *Active in Progress*: Filters for `in_review`, `pending_evc`, `awaiting_committee`.
    * *Action Required*: Filters for `awaiting_institution`.
    * *Approved Orders*: Filters for `approved`.
  * **Search Bar**: Real-time filtering by Application Number (e.g. `APP-2026-0041`), stage name, or program name.
  * **Category Dropdown**: Filter by *Extension of Approval (EoA)*, *Increase in Intake*, *New Program*, *New Institution*, *Closure*, or *Change of Name/Site*.
  * **Table Row Click**: Click anywhere on a row or the chevron `->` to open that application's full dossier.

---

### 4.3. New Application Wizard (`/institution/applications/new`)
* **How to navigate**: Click **New Application** button from Dashboard or Sidebar.
* **Purpose**: 5-step guided filing process for annual approvals, intake expansions, or new programs.
* **Wizard Steps Explained**:
  1. **Step 1: Application Category**:
     * Select from 6 statutory categories: *Extension of Approval*, *Increase in Intake*, *New Program*, *New Institution*, *Closure*, *Change of Name*.
     * The right panel automatically displays the statutory requirements and mandatory documents required for that category.
  2. **Step 2: Program & Infrastructure Parameters**:
     * Enter *Program Name* (e.g., Computer Science & Engineering).
     * Enter *Academic Year* (`2026-2027`).
     * Enter *Existing Intake* and *Proposed Intake* (e.g., 120 -> 180).
     * Enter *Faculty Cadre Count*, *Built-Up Area (sq.m)*, *Land Area (acres)*, and expansion justification.
  3. **Step 3: Statutory Document Checklist**:
     * Displays category-specific required certificates (e.g., *NBA Accreditation Letter*, *Fire Safety NOC*, *PWD Building Occupancy Certificate*).
     * Click **Upload Document**: Changes the badge to green *"Uploaded"*. *(Note: This is simulated in the browser prototype; it attaches a valid file record name without uploading raw binary data).*
  4. **Step 4: Statutory Undertakings & Declarations**:
     * Reviews statutory statements (anti-ragging compliance, pay scales, land ownership).
     * Must check the mandatory checkbox: *"I hereby confirm that all statements made herein are true..."*
  5. **Step 5: Review & Statutory Submission**:
     * Displays a clean summary card of all entered data.
     * Click **Submit Application to AICTE**:
       * Generates a new unique application number (`APP-2026-XXXX`).
       * Sets stage to `Regional Office Scrutiny`.
       * Calculates a 14-day regulatory SLA deadline.
       * Logs an immutable submission event in the audit trail.
       * Saves the new application to `localStorage`.
       * Automatically navigates you to the newly created Application Details page.

---

### 4.4. Application Detail & Deficiency View (`/institution/applications/[id]`)
* **How to navigate**: Click any application row from the Dashboard or Applications list.
* **Purpose**: Full institutional view of an individual application dossier, including review status, deficiency letters, submitted files, and audit trail.
* **Controls & Sections**:
  1. **Top Actions**:
     * *Download Application Copy*: Triggers a summary download prompt.
     * *Respond to Deficiency (Amber Button)*: **Only appears when status is `awaiting_institution`**. Opens the response dialog.
  2. **Regulatory SLA Badge**: Shows exact days remaining before statutory deadline or an overdue alert.
  3. **5-Stage Workflow Stepper (`WorkflowStepper`)**:
     * Visual bar showing: *Submission -> Scrutiny Review -> EVC Inspection (if required) -> Hearing Committee -> Final Approval Order*.
     * Highlights the current active stage in blue or amber.
  4. **Official Deficiency Notice Box**:
     * Only appears if an AICTE officer returned the application.
     * Displays the exact deficiency remarks written by the Scrutiny Officer and sets a strict 10-day response countdown.
  5. **Deficiency Response Modal**:
     * When you click "Respond to Deficiency", enter your explanation (e.g., *"Uploaded renewed Fire Safety NOC approved by Municipal Fire Officer"*).
     * Click **Submit Clarification**:
       * Updates status from `awaiting_institution` back to `in_review`.
       * Changes current stage to `Scrutiny Committee Re-Evaluation`.
       * Reassigns case to AICTE Scrutiny Committee.
       * Logs response in the audit timeline.
  6. **Submitted Statutory Documents Table**: Lists all uploaded certificates, verification statuses (Pending, Verified, Flagged), and notes.
  7. **Chronological Audit Trail (`AuditTimeline`)**: Shows an immutable log of every action taken on this application with timestamps and actor roles.

---

### 4.5. Compliance & Statutory Undertakings (`/institution/compliance`)
* **How to navigate**: Click **Compliance & Undertakings** in sidebar.
* **Purpose**: Tracks mandatory conditional requirements imposed when an approval was granted (e.g., submitting renewed Fire NOC before October, building wheelchair ramps).
* **Controls**:
  * **Table**: Shows condition description, application reference, deadline, and status (`pending`, `submitted`, `verified`).
  * **Submit Compliance Proof**: Opens modal to enter the evidence document reference and submit. Sets status to `submitted`.

---

### 4.6. Document Repository (`/institution/documents`)
* **How to navigate**: Click **Document Repository** in sidebar.
* **Purpose**: Institutional vault storing permanent land deeds, building plans, AICTE approvals, and safety certificates.
* **Controls**: Search bar, category filters, and verification status badges. The "Upload Document" button shows an operational prompt.

---

### 4.7. Notifications (`/institution/notifications`)
* **How to navigate**: Click **Notifications** in sidebar or the top bell icon.
* **Purpose**: Direct inbox for deficiency letters, approaching compliance deadlines, and approval alerts.
* **Controls**: "Mark All as Read" button; clicking any alert routes directly to the relevant application dossier.

---

### 4.8. Institution Profile (`/institution/profile`)
* **How to navigate**: Click **Institution Profile** in sidebar.
* **Purpose**: Displays AICTE permanent institute registration details (PID, address, affiliation, head of institution).
* **Controls**: Form fields can be edited; clicking "Save Changes" triggers a success confirmation. *(Note: Saves in local component state for demo).*

---

## 5. AICTE Official Portal Guide: Every Page & Its Controls

### 5.1. Official Dashboard (`/aicte/dashboard`)
* **How to navigate**: Log in as any AICTE persona (e.g., Regional Officer or Bureau Officer) or click **Official Dashboard** in sidebar.
* **Purpose**: National regulatory command center tracking approval queue throughput, regional backlogs, and SLA risks.
* **What you see**:
  1. **6 Regulatory Metric Tiles**:
     * *Active In Queue*: Total non-terminal applications.
     * *Pending Scrutiny*: Applications currently awaiting document scrutiny.
     * *Awaiting Institution*: Applications returned to colleges for deficiency rectification.
     * *EVC Inspections*: Number of active on-site expert panel inspections.
     * *Committee Review*: Applications pending Hearing Committee evaluation.
     * *SLA Overdue*: High-risk applications exceeding Citizens Charter deadlines.
  2. **Interactive Stage Distribution Chart (Recharts)**: Visual bar chart displaying application counts across Scrutiny, Clarification, EVC, Committee, and Approved stages.
  3. **Regional Pendency Matrix**: Breakdown of application volume and pendency across Western, Northern, Southern, Eastern, and South-West bureaus.
  4. **Urgent Attention Queue**: Quick list of applications nearing or exceeding SLA deadlines with 1-click links to their case dossiers.

---

### 5.2. Application Review Queue (`/aicte/applications` or `/aicte/queue`)
* **How to navigate**: Click **Application Queue** in sidebar.
* **Purpose**: Central triage table for all pending regulatory filings nationwide.
* **Controls & Filtering**:
  * **Stage Tabs**: Click *All Cases*, *Regional Scrutiny*, *Deficiency Pending*, *EVC Inspections*, *Committee Hearings*, or *Approved Orders*.
  * **Search Bar**: Search by college name (e.g., "PICT", "Delhi Technological") or application ID.
  * **Regional Bureau Dropdown**: Filter by Western (Mumbai), Northern (New Delhi), Southern (Chennai), Eastern (Kolkata), or South-West (Bengaluru).
  * **Regulatory Category Dropdown**: Filter by EoA, Intake Increase, New Program, etc.
  * **SLA Risk Filter**: Filter specifically for `Overdue (>14 Days)` or `Urgent (<3 Days Left)`.
  * **Row Click**: Opens the **Case Review Experience**.

---

### 5.3. Case Review Experience (`/aicte/applications/[id]`)
* **How to navigate**: Click any application in the Application Queue.
* **Purpose**: Primary operational workspace for AICTE Officers to audit documents, issue deficiencies, schedule inspections, and record final approval decisions.
* **Header Action Buttons**:
  1. **Return for Clarification (Amber Button)**:
     * *When to use*: When submitted certificates are deficient, unreadable, or missing.
     * *What it does*: Opens dialog -> type deficiency remarks -> sets status to `awaiting_institution` -> automatically sets a 10-day deadline -> notifies institution -> logs audit event.
  2. **Advance Stage (Blue Button)**:
     * *When to use*: When current stage scrutiny is satisfactory.
     * *What it does*: Advances application to the next regulatory stage (e.g., from Scrutiny to Hearing Committee, or to EVC if inspection is required).
  3. **Schedule EVC (Purple Button)**:
     * *When to use*: For New Institutions, New Programs, or flagged cases requiring physical site inspection.
     * *What it does*: Opens dialog -> pick date -> enter 2-3 expert professor names -> sets status to `pending_evc` -> creates inspection record in EVC store.
  4. **Record Decision (Green Button)**:
     * *When to use*: Final executive stage (Bureau Officer / Competent Authority).
     * *What it does*: Opens decision dialog -> Select *Grant Approval* or *Reject Application* -> Enter statutory order remarks -> **Specify statutory conditions** (e.g., *"Renew Fire Safety NOC before October 2027"*).
     * *Special Automation*: If approved with conditions, **it automatically creates active post-approval compliance tasks** in the institution's Compliance portal.
* **Dossier Tabs**:
  * **Overview**: Full parameters (proposed intake, existing intake, faculty counts, land/building carpet area).
  * **Submitted Documents**: Each document row has interactive **Verify (Check)** and **Flag Deficiency (Cross)** buttons. Clicking them updates verification status and logs the reviewer's UID and timestamp.
  * **Deficiencies**: Log of all deficiency letters issued and institution replies received.
  * **EVC Panel**: Inspection panel details, expert names, and visit status.
  * **Audit Trail**: Complete chronological legal audit log.

---

### 5.4. EVC Operations & Scheduling (`/aicte/evc`)
* **How to navigate**: Click **EVC Scheduling** in sidebar.
* **Purpose**: Manage physical on-site and hybrid Expert Visiting Committee panels.
* **Controls**:
  * View scheduled inspections across all institutions.
  * Click **Schedule Inspection Panel**: Select target application, inspection date, and assigned senior professors/experts (e.g. from IITs/NITs).
  * Updates both the EVC register and the application's current stage.

---

### 5.5. National Compliance Monitoring Console (`/aicte/compliance`)
* **How to navigate**: Click **Compliance Monitoring** in sidebar.
* **Purpose**: Post-approval regulatory audit center to ensure institutions fulfill statutory conditions imposed in their approval orders.
* **Controls**:
  * Filter by *All Undertakings*, *Awaiting Evidence*, *Submitted (Audit Required)*, and *Certified Compliant*.
  * For items submitted by institutions, click **Certify & Clear Condition**:
    * Changes status to `verified`.
    * Stamps the reviewing officer's ID and current timestamp.
    * Closes the compliance obligation.

---

### 5.6. Document Validity & Integrity Registry (`/aicte/documents`)
* **How to navigate**: Click **Document Validity** in sidebar.
* **Purpose**: Cross-institutional repository to search and audit certificates across colleges, identifying expired safety NOCs or fraudulent filings.
* **Controls**: Search by certificate name or file; filter by *Audited & Verified* vs. *Flagged Deficiencies*.

---

### 5.7. Regulatory Alerts & Escalation Center (`/aicte/notifications`)
* **How to navigate**: Click **Alerts & Escalations** in sidebar.
* **Purpose**: Citizens Charter SLA monitoring hub with explainer tiers:
  * *Level 1 Escalation (>7 Days Overdue)*: Regional Officer alerted.
  * *Level 2 Escalation (>14 Days Overdue)*: Bureau Officer intervention.
  * *Level 3 Escalation (>21 Days Overdue)*: Chairman / Competent Authority escalation.
* **Controls**: Review high-priority system alerts and mark them as read.

---

### 5.8. Operational Analytics & Cycle Velocity (`/aicte/reports`)
* **How to navigate**: Click **Analytics & Reports** in sidebar *(Admin, Bureau, Regional Officer)*.
* **Purpose**: High-level statistical dossier showing average processing days (target: 45 days, actual: 29.7 days), Citizens Charter SLA compliance rate (96.4%), and regional throughput.
* **Controls**: Visual charts powered by Recharts. The "Export Comprehensive Dossier" button shows an export confirmation prompt.

---

### 5.9. Workflow Configuration Engine (`/aicte/rules`)
* **How to navigate**: Click **Workflow Configuration** in sidebar *(Admin only)*.
* **Purpose**: Visual management of statutory policy rules (e.g., *Automated EVC Waiver for NBA Accredited Departments*, *EoA Green Channel Fast-Track*, *Strict 10-Day SLA Rejection*).
* **Controls**: Toggle switches on/off in the interface.

---

### 5.10. User & Role Directory (`/aicte/users`)
* **How to navigate**: Click **User & Role Directory** in sidebar *(Admin or Bureau Officer)*.
* **Purpose**: Roster of official government inspectors, regional directors, scrutiny committees, and administrative personnel.
* **Controls**: View official emails, assigned jurisdictions, and role titles. The "Edit Role" button triggers a permission management prompt.

---

## 6. Complete End-to-End Walkthrough Tutorial

Follow this step-by-step script to demonstrate the full application lifecycle.

### Scenario:
*Pune Institute of Computer Technology (PICT)* is submitting an application to **Increase Intake in Computer Engineering from 120 to 180 seats**. The AICTE Regional Officer reviews it, finds the Fire Safety NOC expired, issues a deficiency letter, the college uploads the valid NOC, the officer schedules an EVC inspection, and the Bureau Officer grants final approval with conditions.

---

### Part A: Institution Submits Application
1. **Navigate to**: `http://localhost:3000/login`
2. **Select Persona**: On the right panel, click **Dr. P. T. Kulkarni (Principal)**.
3. You will land on the **Institution Dashboard** (`/institution/dashboard`).
4. Click the blue **+ New Application** button.
5. **Step 1 (Category)**: Click **Increase in Intake**. Notice the right-side checklist updates to require NBA certificates and Fire NOCs. Click **Continue to Details**.
6. **Step 2 (Details)**: 
   * Program Name: `Computer Science & Engineering`
   * Proposed Intake: `180` (Existing: `120`)
   * Faculty Count: `32`
   * Justification: `High regional industry demand for AI and Computer Science graduates.`
   * Click **Continue to Documents**.
7. **Step 3 (Documents)**: Click **Upload** next to each required certificate. Notice the buttons change to green *"Uploaded"*. Click **Continue to Declarations**.
8. **Step 4 (Declarations)**: Check the box: *"I hereby confirm that all statements made herein are true..."*. Click **Review Application**.
9. **Step 5 (Submission)**: Review your summary and click **Submit Application to AICTE**.
10. **Result**: You are immediately redirected to the new application dossier (e.g. `APP-2026-0042`). The status badge shows **Under Review**, stage is **Regional Office Scrutiny**, and the regulatory SLA countdown begins.

---

### Part B: AICTE Scrutiny & Deficiency Letter
1. **Switch Persona**: In the top navigation bar, click the user profile icon or role switcher, and select **Dr. S. K. Deshmukh (Regional Officer)**.
2. You will land on the **Official Dashboard** (`/aicte/dashboard`). Notice *Pending Scrutiny* shows active applications.
3. In the sidebar, click **Application Queue** (`/aicte/applications`).
4. Click on your newly created application (or pre-seeded `APP-2026-0041`).
5. You are now inside the **Case Review Experience**:
   * Click the **Submitted Documents** tab.
   * On the *Building Occupancy Certificate*, click the green **Check (Verify)** button. Notice it updates to *Verified*.
   * On the *Fire Safety NOC*, notice it is flagged or pending.
6. In the top-right header, click the amber button: **Return for Clarification**.
7. In the dialog, enter deficiency notes:
   ```
   Municipal Fire Safety NOC submitted is for Building 2 only. Please upload the composite CFO clearance covering the newly constructed 4th floor computing laboratories.
   ```
8. Click **Issue Deficiency Letter**.
9. **Result**: 
   * The status badge instantly turns orange: **Awaiting Institution**.
   * Current stage updates to **Clarification / Deficiency Resolution**.
   * Regulatory SLA is automatically reset to a strict 10-day deadline.
   * An immutable audit entry is appended to the timeline.

---

### Part C: Institution Rectifies Deficiency
1. **Switch Persona**: Using the top role switcher, switch back to **Dr. P. T. Kulkarni (Principal)**.
2. Open the **Institution Dashboard** (`/institution/dashboard`).
3. Notice the prominent amber alert box: **"Immediate Action Required: Deficiency Letters Issued"**.
4. Click the link to open the application dossier (`/institution/applications/[id]`).
5. Notice:
   * The red deficiency box displays the exact text written by the Regional Officer.
   * A prominent amber button appears in the header: **Respond to Deficiency**.
6. Click **Respond to Deficiency**.
7. In the response text box, enter:
   ```
   We have uploaded the consolidated Chief Fire Officer (CFO) renewal NOC No. CFO/PUN/2026/8942 covering all floors of Building 2 and Building 4.
   ```
8. Click **Submit Clarification Response**.
9. **Result**:
   * Status changes back to **Under Review**.
   * Stage updates to **Scrutiny Committee Re-Evaluation**.
   * The audit trail records the college's formal response.

---

### Part D: EVC Scheduling & Final Approval with Undertakings
1. **Switch Persona**: Switch to **Dr. B. K. Raman (EVC Coordinator)** or **Shri Rajiv Ranjan, IAS (Bureau Officer)**.
2. Open the application dossier in the queue.
3. Click the purple button: **Schedule EVC Inspection**.
   * Set inspection date (e.g. 2 weeks ahead).
   * Enter Expert Panel: `Prof. M. K. Sridhar (IIT Bombay), Dr. Anita Sen (NIT Surat)`.
   * Click **Confirm & Schedule Inspection**.
   * Status updates to **Pending EVC** / *EVC Visit Scheduled*.
4. Now simulate inspection completion and final decision: Click the green button: **Record Final Decision**.
5. In the decision modal:
   * Decision: Select **Grant AICTE Approval**.
   * Order Remarks: `Institution satisfies all faculty, carpet area, and laboratory norms of AICTE Approval Process Handbook (APH) 2026-27.`
   * Imposed Conditions: `Submit annual structural stability certificate before 31 December 2026; Complete installation of braille signage in central library.`
   * Click **Issue Official Decision Order**.
6. **Result**:
   * Status updates to **Approved** with a green badge.
   * Stage changes to **Approval Order Issued**.
   * **Automated Compliance Generation**: The conditions specified above are automatically converted into legally binding undertakings!
7. **Verify Compliance Generation**:
   * Switch back to **Dr. P. T. Kulkarni (Principal)**.
   * In sidebar, click **Compliance & Undertakings** (`/institution/compliance`).
   * You will see the new condition (*"Submit annual structural stability certificate..."*) listed under active tasks!
   * Click **Submit Compliance Proof**, enter `Stability_PWD_Signed.pdf`, and submit.
   * Switch to **Dr. S. K. Deshmukh (Regional Officer)** -> open `/aicte/compliance` -> Click **Certify & Clear Condition**. The condition turns green (*Certified Compliant*).

---

## 7. Role and Permission Reference

| Role Key | Display Name | Portal Access | Accessible Pages | Permitted Actions | Backend Enforcement |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `institution` | Institution User (Principal) | Institution Only | `/institution/*` | Submit applications, reply to deficiencies, upload compliance evidence, view profile | Client Route Guard (`RequireRole`) |
| `regional_officer`| Regional Officer | AICTE Official | `/aicte/dashboard`, `/aicte/applications`, `/aicte/evc`, `/aicte/compliance`, `/aicte/documents`, `/aicte/notifications`, `/aicte/reports` | Scrutinize applications, issue deficiency letters, advance stages, verify compliance | Client Route Guard (`RequireRole`) |
| `scrutiny_committee`| Scrutiny Committee Member | AICTE Official | `/aicte/dashboard`, `/aicte/applications`, `/aicte/documents`, `/aicte/notifications` | Verify submitted certificates, endorse scrutiny reports | Client Route Guard (`RequireRole`) |
| `evc_coordinator`| EVC Coordinator | AICTE Official | `/aicte/dashboard`, `/aicte/applications`, `/aicte/evc`, `/aicte/documents`, `/aicte/notifications` | Schedule inspection dates, assign university experts | Client Route Guard (`RequireRole`) |
| `bureau_officer` | Bureau Officer (Approvals) | AICTE Official | All `/aicte/*` pages (including Users & Reports) | Record decisions, oversee regional pendency, edit user roles | Client Route Guard (`RequireRole`) |
| `competent_authority`| Competent Authority (Chairman) | AICTE Official | `/aicte/dashboard`, `/aicte/applications`, `/aicte/reports`, `/aicte/notifications` | Final executive approvals, national velocity reviews | Client Route Guard (`RequireRole`) |
| `admin` | System Administrator | Full System | All `/aicte/*` pages (including Rules & Users) | Configure workflow rules, user permissions, audit oversight | Client Route Guard (`RequireRole`) |

> [!WARNING]
> **Production Security Note**: In this hackathon release, role restrictions are enforced in the browser client by the `<RequireRole>` component. Users can switch roles using the demo switcher. For production deployment, roles must be issued as Firebase Auth Custom Claims and validated by server middleware and Firestore Security Rules.

---

## 8. Dashboard Metrics & Status Labels Glossary

### Application Status Badges

| Status Key | UI Label | Badge Color | Meaning in Regulatory Process |
| :--- | :--- | :--- | :--- |
| `draft` | Draft | Gray | Application being prepared by the institution; not yet received by AICTE. |
| `submitted` | Submitted | Blue | Received by AICTE; awaiting queue allocation. |
| `in_review` | Under Review | Amber | Actively undergoing scrutiny review or committee re-evaluation. |
| `awaiting_institution`| Awaiting Institution | Orange | Deficiency letter issued. Pauses official clock; institution has 10 days to reply. |
| `pending_evc` | Pending EVC | Purple | Physical on-site inspection scheduled or awaiting committee report. |
| `awaiting_committee` | Awaiting Committee | Indigo | Recommended by scrutiny; queued for Standing Hearing Committee. |
| `approved` | Approved | Green | Approval Order issued for the academic year. |
| `rejected` | Rejected | Red | Application rejected with formal grounds recorded in the order. |

---

### Dashboard Counter Calculations

| Metric Name | Dashboard | How it is Calculated | Changes After Actions |
| :--- | :--- | :--- | :--- |
| **Total Applications** | Institution | Count of all applications where `institutionId === 'inst-001'` | Increments by +1 when submitting New Application wizard. |
| **Action Required** | Institution | Count where `status === 'awaiting_institution'` | Increments when AICTE returns application; decrements to 0 when college replies. |
| **In Review / Evaluation**| Institution | Count where `status` is `in_review`, `pending_evc`, or `awaiting_committee` | Decrements when approved/rejected. |
| **Active In Queue** | AICTE Official| Count of all applications where `status !== 'approved'` and `!== 'rejected'` | Decrements when Competent Authority records decision. |
| **Pending Scrutiny** | AICTE Official| Count where `currentStageId === 'scrutiny'` | Decrements when advanced or returned for clarification. |
| **Awaiting Institution** | AICTE Official| Count where `status === 'awaiting_institution'` | Reflects all institutions currently resolving deficiency letters nationwide. |
| **SLA Overdue** | Both Portals | Count where `dueAt < new Date().toISOString()` | Dynamically flags overdue files based on current time. |
| **SLA Countdown Timer** | Case Dossiers | Remaining days/hours until statutory deadline (`dueAt`) | Automatically resets to +10 days when a deficiency is issued. |

---

## 9. Button & Interaction Reference Table

| Page | Button / Element Label | Visual Appearance | What It Does When Clicked | Working Status |
| :--- | :--- | :--- | :--- | :--- |
| **Global TopBar** | Profile / Persona Switcher | Avatar + Chevron | Opens popover list of 7 personas. Clicking one immediately switches active user. | **Fully Working** |
| **Global TopBar** | Notification Bell | Bell Icon + Badge | Opens dropdown of unread alerts. Clicking alert marks it read and routes to case. | **Fully Working** |
| **Global TopBar** | Global Search Bar | Input with magnifying glass | Pressing Enter routes to `/institution/applications` or `/aicte/applications` with query filter. | **Fully Working** |
| **New Application** | Upload Document | Button with cloud upload | Changes badge to green "Uploaded" and attaches mock filename to record. | **Partially Working** (Simulated upload) |
| **New Application** | Submit Application to AICTE | Blue primary button | Creates application record, generates ID, updates storage, redirects to details. | **Fully Working** |
| **Application Detail**| Respond to Deficiency | Amber prominent button | Opens response modal; submitting advances stage back to Scrutiny Re-evaluation. | **Fully Working** |
| **Application Detail**| Download Application Copy | Outline button with download icon | Triggers a download alert placeholder. | **Placeholder** (Mock alert) |
| **Case Review** | Return for Clarification | Amber header button | Opens deficiency dialog; sets status `awaiting_institution` and resets SLA deadline. | **Fully Working** |
| **Case Review** | Advance Stage | Blue header button | Advances application to Hearing Committee or Next Regulatory Stage. | **Fully Working** |
| **Case Review** | Schedule EVC | Purple header button | Opens modal to pick inspection date and expert professors; updates stage to EVC. | **Fully Working** |
| **Case Review** | Record Final Decision | Green header button | Opens approval/rejection dialog; automatically creates post-approval undertakings. | **Fully Working** |
| **Case Review Docs** | Verify (Checkmark) | Small green check button | Marks document as `Verified`, stamps reviewer UID and current timestamp. | **Fully Working** |
| **Case Review Docs** | Flag Deficiency (Cross) | Small red cross button | Marks document as `Rejected/Flagged` with deficiency warning badge. | **Fully Working** |
| **Compliance Pages** | Submit Compliance Proof | Outline button in table | Opens dialog to record proof document ID; sets undertaking status to `submitted`. | **Fully Working** |
| **AICTE Compliance** | Certify & Clear Condition | Green check button in table | Certifies institutional proof; updates status to `verified`. | **Fully Working** |
| **Workflow Rules** | Rule Toggle Switches | iOS-style toggle | Toggles rule state in local React state. | **Mocked** (State only) |
| **User Directory** | Edit Role | Outline button in table | Triggers a browser permission alert. | **Placeholder** (Mock alert) |

---

## 10. Mock Features & Known Limitations

| Page / Feature | UI Element | What a User Might Expect | What It Actually Does | Technical Limitation |
| :--- | :--- | :--- | :--- | :--- |
| **Application Wizard** | Document Upload buttons | Uploading a real PDF file from local hard drive | Sets a static string filename (e.g. `Fire_NOC_Uploaded.pdf`) | No file stream is sent to Firebase Storage. |
| **Application Detail** | "Download Application Copy" | Downloads a signed AICTE official PDF dossier | Pops a browser alert: *"Generated Application Summary PDF..."* | No PDF generation library (`pdf-lib`) is connected. |
| **Document Vault** | "Upload Document" button | Opens local file selector to add to permanent repository | Pops a browser alert: *"Upload new document modal opened"* | Placeholder button. |
| **Official Dashboard**| Regional Pendency Matrix | Live regional backlog aggregated from database | Displays hardcoded table rows (`Western: 4, Northern: 3...`) | Matrix values are static mock objects. |
| **Analytics & Reports**| Operational Velocity Charts | Live turnaround calculations from historical timestamps | Displays pre-computed demo charts (e.g. 29.7 days average) | Recharts components render static array data. |
| **Workflow Rules** | Rule Policy Toggles | Toggling a rule dynamically modifies application validation logic | Flips a boolean in React `useState` | Rules engine is not wired into the `dataService` state machine. |
| **User Management** | "Edit Role" button | Modifies officer's RBAC role in database | Pops a browser alert: *"Role permissions updated..."* | User directory is read-only from `DEMO_USERS`. |
| **Escalations Center**| Level 1, 2, 3 Escalations | Automated background cron job escalating overdue cases | Visual display of escalation policy + pre-seeded notification objects | No background worker or cron scheduler exists. |
| **Email Alerts** | Email dispatch on deficiency | Email notification sent to Principal's registered inbox | Creates in-app notification in `localStorage` | No SMTP or transactional email provider (Resend/SendGrid) connected. |
| **Data Persistence** | Multi-computer sharing | Submitting on laptop A shows up on laptop B | Saves exclusively to current browser's `localStorage` | Data is isolated to the single client device running the browser. |

---

## 11. Troubleshooting Guide

### 1. "Page Not Found" or Application ID Missing
* **Cause**: You clicked a link to an application that does not exist in `localStorage`, or browser data was cleared.
* **Fix**: Click **Return to Queue** or **Return to Applications**. Select an active application from the table (such as `APP-2026-0041`), or create a new application using the wizard.

### 2. "Role Switch Required" Access Denied Screen
* **Cause**: You attempted to view an AICTE Official page while logged in as an Institution, or vice versa.
* **Fix**: Click the blue button on screen: **"Switch to [Suggested Role]"**, or use the top-right persona switcher to select the required role.

### 3. Resetting Demo Data to Factory State
* **Cause**: You performed multiple test transitions and want to return to the pristine initial hackathon demonstration state.
* **Fix**:
  1. Open Developer Tools in your browser (`F12` or `Ctrl + Shift + I`).
  2. Go to the **Application** tab -> **Local Storage** -> `http://localhost:3000`.
  3. Click **Clear All** (or delete keys beginning with `aicte_`).
  4. Refresh the page (`F5`). The application will re-seed all default mock records automatically!

---

## 12. Short Live-Demo Cheat Sheet (Screen-Share Script)

Follow this 5-minute quick script while presenting to judges or teammates:

```
[0:00 - 0:45] INTRO & INSTITUTION SUBMISSION
  1. Persona: Dr. P. T. Kulkarni (Principal)
  2. Page: /institution/dashboard
  3. Action: Click "+ New Application" -> Select "Increase in Intake" -> Click through wizard -> Click "Submit Application".
  4. Result: Show new application created with live SLA countdown and stage "Regional Office Scrutiny".

[0:45 - 2:00] OFFICIAL SCRUTINY & DEFICIENCY ISSUANCE
  1. Persona: Switch to Dr. S. K. Deshmukh (Regional Officer) via TopBar switcher.
  2. Page: /aicte/applications -> Click newly created application.
  3. Action: 
     - Go to "Submitted Documents" tab -> Click "Verify" on Document 1.
     - Click "Return for Clarification" button -> Type: "Please provide renewed CFO fire safety certificate." -> Click Issue.
  4. Result: Status turns orange "Awaiting Institution", SLA resets to 10-day strict compliance deadline, audit log stamped.

[2:00 - 3:15] INSTITUTION RECTIFICATION
  1. Persona: Switch back to Dr. P. T. Kulkarni (Principal).
  2. Page: /institution/dashboard
  3. Action: Point out the prominent amber "Action Required" alert banner -> Click through to application -> Click "Respond to Deficiency" -> Type: "Attached renewed CFO certificate." -> Click Submit.
  4. Result: Status turns back to "Under Review" with stage "Scrutiny Committee Re-Evaluation".

[3:15 - 4:15] EVC SCHEDULING & CONDITIONAL APPROVAL
  1. Persona: Switch to Shri Rajiv Ranjan, IAS (Bureau Officer).
  2. Page: Case Review Docket for application.
  3. Action:
     - Click "Schedule EVC" -> Select date -> Confirm. (Stage turns to EVC Visit Scheduled).
     - Click "Record Final Decision" -> Select "Grant AICTE Approval" -> In conditions, enter: "Submit annual PWD stability certificate." -> Click Issue Order.
  4. Result: Application badge turns Green "Approved". Approval order issued!

[4:15 - 5:00] POST-APPROVAL COMPLIANCE AUTOMATION
  1. Persona: Switch to Dr. P. T. Kulkarni (Principal).
  2. Page: /institution/compliance
  3. Action: Show how the approval condition was automatically generated as an active compliance task. Click "Submit Compliance Proof".
  4. Persona: Switch to Regional Officer -> /aicte/compliance -> Click "Certify & Clear Condition".
  5. Closing: Show complete, tamper-evident audit history on the application dossier.
```

---

## 13. Glossary of AICTE Regulatory Terms

* **EoA (Extension of Approval)**: Annual statutory re-endorsement granted to existing approved colleges to continue admitting students for the upcoming academic year.
* **APH (Approval Process Handbook)**: The official statutory rulebook published annually by AICTE governing norms, teacher-student ratios, building square meters, and accreditation criteria.
* **Scrutiny Committee**: A three-member regional panel that conducts initial forensic audits of all submitted land, financial, building, and faculty certificates.
* **Deficiency**: A non-compliance flag raised during scrutiny (e.g., missing safety NOC, unaccredited lab, inadequate cadre ratio).
* **EVC (Expert Visiting Committee)**: A high-level physical or hybrid inspection committee comprising senior professors from premier technical institutions (IITs, NITs) sent to inspect campus physical facilities.
* **SHC / SAC (Standing Hearing Committee / Standing Appellate Committee)**: Quasi-judicial appeal committees where institution heads present evidence if an application was flagged for rejection.
* **Undertaking / Condition**: A legally binding affidavit signed by an institution's governing trust agreeing to fulfill a specific requirement within a stipulated timeframe post-approval.
* **Citizens Charter SLA**: Legally mandated turnaround windows established by the Ministry of Education requiring regulatory files to be acted upon within fixed calendar horizons (e.g., 10 days for clarification, 14 days for scrutiny).
* **Escalation**: Automated notification triggered when an application sits idle beyond statutory bounds, alerting higher administrative tiers (Level 1: Regional Officer, Level 2: Bureau Head, Level 3: AICTE Chairman).
