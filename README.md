# AICTE PS4 — Approval Workflow Automation Platform
### Full-Stack Node.js + Express + Prisma + SQLite Migration

This repository contains the complete full-stack migration of the AICTE Approval Process Handbook (APH) Workflow Automation System. The application has been decoupled from browser `localStorage` and client-side mocks into a dedicated, production-ready **Node.js + Express + TypeScript** backend backed by **Prisma ORM** and **SQLite**.

---

## 🏗️ System Architecture

```
                                  AICTE PS4 Architecture
                                  
     ┌───────────────────────────────────┐       ┌───────────────────────────────────┐
     │      Frontend (Next.js 16)        │       │       Backend (Express.js)        │
     │      Port: 3000                   │       │       Port: 4000                  │
     │                                   │       │                                   │
     │  - React 19 App Router            │       │  - Express 4 + TypeScript         │
     │  - Tailwind CSS v4                │ HTTP  │  - REST API (/api/*)              │
     │  - AuthProvider (HTTP Cookie/ID)  ├──────►│  - Prisma ORM 6                   │
     │  - dataService (API Client)       │       │  - Zod Request Validation         │
     │  - Role Steppers & Dashboards     │       │  - Multer Disk File Uploads       │
     └───────────────────────────────────┘       └─────────────────┬─────────────────┘
                                                                   │
                                                      ┌────────────▼──────────┐
                                                      │ SQLite (prisma/dev.db)│
                                                      │ 16 Relational Models  │
                                                      │ Atomic Transactions   │
                                                      └───────────────────────┘
```

---

## 🚀 Quick Start Guide (Running in Two Terminals)

### Terminal 1: Express Backend
```powershell
# Navigate to the backend directory
cd backend

# Install dependencies (already installed)
npm install

# Initialize Prisma SQLite schema and load synthetic seed data
npm run prisma:push
npm run prisma:seed

# Start the Express server on port 4000
npm run dev
```
*Backend API Server will start at: `http://localhost:4000/api`*  
*Health Check: `http://localhost:4000/api/health`*

### Terminal 2: Next.js Frontend
```powershell
# Navigate to the app directory
cd app

# Install dependencies (already installed)
npm install

# Start Next.js development server on port 3000
npm run dev
```
*Frontend will be available at: `http://localhost:3000`*

---

## 👥 Seeded Personas & Authentication

| Role | Name | Email | Password | Account Type | Permissions / Scope |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Institution Head** | Dr. P. T. Kulkarni (Principal) | `principal@pict.edu` | `password123` | `institution` | PICT (WRO) - Draft, submit applications, upload docs, respond to deficiencies |
| **Regional Officer** | Dr. S. K. Deshmukh | `ro.western@aicte-india.org` | `password123` | `aicte` | Western Region oversight, committee management, task monitoring |
| **Scrutiny Member** | Prof. Anjali Mathur | `scrutiny.member1@aicte-india.org` | `password123` | `aicte` | Document verification, issue deficiency notices, clearance to EVC |
| **EVC Coordinator** | Dr. B. K. Raman | `evc.head@aicte-india.org` | `password123` | `aicte` | Schedule expert panels, conduct on-site visits, submit EVC reports |
| **Bureau Officer** | Shri Rajiv Ranjan, IAS | `bureau.approvals@aicte-india.org` | `password123` | `aicte` | Inter-departmental clearance, regional committee escalations |
| **Competent Authority**| Prof. T. G. Sitharam (Chairman) | `chairman@aicte-india.org` | `password123` | `aicte` | Final regulatory grant of approval / rejection, conditions & undertakings |
| **System Admin** | System Administrator | `admin@aicte-india.org` | `password123` | `aicte` | Workflow configuration, system monitoring, Citizen's Charter SLA engine |

---

## 🗄️ Relational Database Schema (Prisma + SQLite)

The SQLite database (`backend/prisma/dev.db`) implements 16 relational models:

1. **`Region`**: AICTE regional administrative divisions (WRO, NRO, SRO, ERO, SWRO).
2. **`Institution`**: AICTE-approved educational institutions with regulatory codes, addresses, and contacts.
3. **`User`**: Role-based user accounts with bcrypt password hashes, account types, and institution/regional scope.
4. **`Application`**: Master regulatory petitions, status (`draft`, `submitted`, `in_review`, `awaiting_institution`, `pending_evc`, `committee_review`, `approved`, `rejected`), stage pointers, SLA deadlines, and full JSON snapshot data.
5. **`ApplicationDocument`**: File metadata tracking original filenames, storage disk paths (`backend/uploads/`), MIME types, file sizes, and verification audit statuses (`pending`, `verified`, `deficient`).
6. **`WorkflowTask`**: Citizens Charter SLA tasks with assignees, due dates, escalation levels, and completion statuses.
7. **`AuditEvent`**: Append-only immutable log of every regulatory transition, action reason, actor UID, and timestamp.
8. **`DeficiencyRequest`**: Formal deficiency notices issued by Scrutiny Committees, response deadlines, institution responses, and resolution timestamps.
9. **`EVCVisit`**: Expert Visit Committee inspection records, scheduled dates, and inspection outcomes.
10. **`EVCExpert`**: Empanelled academic and industry experts assigned to inspection panels.
11. **`Undertaking`**: Post-approval regulatory compliance mandates (Anti-Ragging, Land NOC, Faculty Cadre ratio).
12. **`UndertakingEvidence`**: Institution compliance evidence submissions and official verification records.
13. **`Notification`**: Real-time user notifications for status changes, deficiency alerts, and deadline escalations.
14. **`WorkflowDefinition`**: Configurable approval routes per application category (`new_institution`, `extension_of_approval`, `increase_intake`, etc.).
15. **`WorkflowStage`**: Stages within a workflow definition with human-readable titles, SLAs, and assignee roles.
16. **`WorkflowTransition`**: Permitted stage transitions governed by statutory outcomes.

---

## 🔌 API Routes Reference

### Authentication (`/api/auth`)
- `POST /api/auth/register`: Register new institution account with bcrypt hashed password.
- `POST /api/auth/login`: Authenticate with email/password; sets HTTP-only session cookie `aicte_auth_uid`.
- `GET /api/auth/me`: Retrieve active authenticated profile with institution/role permissions.
- `POST /api/auth/switch-demo`: Demo persona switching with server-derived role lookup.
- `POST /api/auth/logout`: Clears session cookie.

### Applications & Workflow Engine (`/api/applications`)
- `GET /api/applications`: List applications with role-based filtering, pagination, and status filters.
- `GET /api/applications/:id`: Retrieve single application with audit logs, tasks, documents, and deficiencies.
- `POST /api/applications`: Create and submit new regulatory application (Prisma transaction).
- `POST /api/applications/:id/return`: Scrutiny Officer returns application for clarification with deficiency notice.
- `POST /api/applications/:id/clarification`: Institution submits clarification response and attached evidence.
- `POST /api/applications/:id/advance`: Server evaluates workflow rules and advances to next permitted stage.
- `POST /api/applications/:id/decision`: Competent Authority records final grant of approval or rejection, and automatically generates compliance undertakings.

### Documents & Multer Storage (`/api/documents`)
- `GET /api/documents`: List uploaded document metadata.
- `POST /api/documents/upload`: Multipart upload with Multer disk storage in `backend/uploads/` and metadata persistence in SQLite.
- `GET /api/documents/:id/download`: Authenticated document download with institution ownership verification.
- `POST /api/documents/:id/verify`: Official verification of uploaded regulatory evidence.

### Expert Visit Committee (`/api/evc`)
- `GET /api/evc`: List EVC inspections.
- `POST /api/evc`: Schedule EVC inspection with empanelled experts and inspection mandate.
- `PATCH /api/evc/:id`: Update visit progress, record findings, and mark completed.

### Compliance & Undertakings (`/api/undertakings`)
- `GET /api/undertakings`: List post-approval undertakings and compliance status.
- `POST /api/undertakings/:id/submit`: Institution submits compliance evidence document.
- `POST /api/undertakings/:id/verify`: AICTE official verifies compliance evidence.

### Dashboard Analytics (`/api/dashboard/metrics`)
- `GET /api/dashboard/metrics`: High-performance SQL aggregates for applications by status, stage, region, and overdue tasks.

### Citizens Charter Engine (`/api/admin/process-deadlines`)
- `POST /api/admin/process-deadlines`: Idempotent evaluation of task SLAs, escalation levels, and overdue notices.

---

## 🧪 Automated Verification Suite

Run the full end-to-end verification script against the running Express backend:
```powershell
cd backend
npx tsx test-e2e.ts
```

Output:
```
=== Starting Automated End-to-End Verification ===

=== Test Results Summary ===
✅ PASS: 1. Server Health Check
✅ PASS: 2. Switch Demo Persona (Institution)
✅ PASS: 3. Bcrypt Password Login
✅ PASS: 4. SQL Dashboard Aggregations
✅ PASS: 5. Application Submission (Institution)
✅ PASS: 6. Cross-Persona Retrieval by AICTE Officer
✅ PASS: 7. Deficiency Return by Scrutiny Committee
✅ PASS: 8. Institution Clarification Response
✅ PASS: 9. Workflow Authoritative Stage Advance
✅ PASS: 10. EVC Scheduling & Completion Update
✅ PASS: 11. Final Decision & Undertaking Generation
✅ PASS: 12. Real Multer File Upload & Authenticated Download
✅ PASS: 13. Citizens Charter Deadline & Escalation Processor

============================
🎉 ALL 13 END-TO-END SPECIFICATIONS PASSED SUCCESSFULLY!
```