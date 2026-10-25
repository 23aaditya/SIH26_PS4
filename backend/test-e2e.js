import fs from "fs";
import path from "path";

const API_BASE = "http://localhost:4000/api";

const results = [];

async function run() {
  console.log("=== Starting Automated End-to-End Verification (Pure JavaScript) ===");

  // 1. Health check
  try {
    const res = await fetch(`${API_BASE}/health`);
    const data = await res.json();
    if (res.ok && data.status === "ok") {
      results.push({ step: "1. Server Health Check", passed: true, details: data });
    } else {
      results.push({ step: "1. Server Health Check", passed: false, error: JSON.stringify(data) });
    }
  } catch (err) {
    results.push({ step: "1. Server Health Check", passed: false, error: err.message });
  }

  // 2. Demo User Switching & Cookie / Session retrieval
  let instCookie = "";
  try {
    const res = await fetch(`${API_BASE}/auth/switch-demo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: "inst-user-1" }),
    });
    const setCookie = res.headers.get("set-cookie") || "";
    if (setCookie) {
      instCookie = setCookie.split(";")[0];
    }
    const data = await res.json();
    if (res.ok && data.user.email === "principal@pict.edu") {
      results.push({ step: "2. Switch Demo Persona (Institution)", passed: true, details: data.user.email });
    } else {
      results.push({ step: "2. Switch Demo Persona (Institution)", passed: false, error: JSON.stringify(data) });
    }
  } catch (err) {
    results.push({ step: "2. Switch Demo Persona (Institution)", passed: false, error: err.message });
  }

  // 3. Password-based login with bcrypt
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "principal@pict.edu", password: "password123" }),
    });
    const data = await res.json();
    if (res.ok && data.user && data.user.displayName.includes("Principal")) {
      results.push({ step: "3. Bcrypt Password Login", passed: true, details: data.user.displayName });
    } else {
      results.push({ step: "3. Bcrypt Password Login", passed: false, error: JSON.stringify(data) });
    }
  } catch (err) {
    results.push({ step: "3. Bcrypt Password Login", passed: false, error: err.message });
  }

  // 4. SQL Dashboard Aggregations (counts, stage-wise, status-wise)
  try {
    const res = await fetch(`${API_BASE}/dashboard/metrics`, {
      headers: { "x-user-id": "aicte-ro-west" },
    });
    const data = await res.json();
    if (res.ok && data.summary && typeof data.summary.total === "number" && Array.isArray(data.byStage)) {
      results.push({
        step: "4. SQL Dashboard Aggregations",
        passed: true,
        details: { totalApps: data.summary.total, byStageCount: data.byStage.length, byRegionCount: data.byRegion.length },
      });
    } else {
      results.push({ step: "4. SQL Dashboard Aggregations", passed: false, error: JSON.stringify(data) });
    }
  } catch (err) {
    results.push({ step: "4. SQL Dashboard Aggregations", passed: false, error: err.message });
  }

  // 5. Submit New Application (by Institution)
  let createdAppId = "";
  try {
    const res = await fetch(`${API_BASE}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": "inst-user-1" },
      body: JSON.stringify({
        applicationCategory: "new_institution",
        workflowDefinitionId: "wf-new-inst-2026",
        workflowVersion: "2026.1",
        requiresEvc: true,
        formData: {
          step1_basic: { establishedYear: 2026, landAreaAcres: 12.5 },
          step2_academic: { totalIntakeProposed: 420 },
        },
      }),
    });
    const data = await res.json();
    if (res.ok && data.application && data.application.id) {
      createdAppId = data.application.id;
      results.push({
        step: "5. Application Submission (Institution)",
        passed: true,
        details: { id: createdAppId, appNumber: data.application.applicationNumber, stage: data.application.currentStageId },
      });
    } else {
      results.push({ step: "5. Application Submission (Institution)", passed: false, error: JSON.stringify(data) });
    }
  } catch (err) {
    results.push({ step: "5. Application Submission (Institution)", passed: false, error: err.message });
  }

  // 6. Cross-Persona Application Retrieval (Scrutiny Member seeing the application)
  try {
    const res = await fetch(`${API_BASE}/applications/${createdAppId}`, {
      headers: { "x-user-id": "aicte-scrutiny-1" },
    });
    const data = await res.json();
    if (res.ok && data.id === createdAppId) {
      results.push({
        step: "6. Cross-Persona Retrieval by AICTE Officer",
        passed: true,
        details: { viewer: "scrutiny.member1@aicte-india.org", foundApp: data.applicationNumber },
      });
    } else {
      results.push({ step: "6. Cross-Persona Retrieval by AICTE Officer", passed: false, error: JSON.stringify(data) });
    }
  } catch (err) {
    results.push({ step: "6. Cross-Persona Retrieval by AICTE Officer", passed: false, error: err.message });
  }

  // 7. Deficiency Return (Scrutiny Officer returns for clarification)
  try {
    const res = await fetch(`${API_BASE}/applications/${createdAppId}/return`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": "aicte-scrutiny-1" },
      body: JSON.stringify({
        deficiencyText: "Land title certificate is missing survey parcel boundary map.",
      }),
    });
    const data = await res.json();
    if (res.ok && data.application.status === "awaiting_institution") {
      results.push({
        step: "7. Deficiency Return by Scrutiny Committee",
        passed: true,
        details: { status: data.application.status, stage: data.application.currentStageId },
      });
    } else {
      results.push({ step: "7. Deficiency Return by Scrutiny Committee", passed: false, error: JSON.stringify(data) });
    }
  } catch (err) {
    results.push({ step: "7. Deficiency Return by Scrutiny Committee", passed: false, error: err.message });
  }

  // 8. Institution Clarification Response
  try {
    const res = await fetch(`${API_BASE}/applications/${createdAppId}/clarification`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": "inst-user-1" },
      body: JSON.stringify({
        responseText: "Uploaded registered surveyor parcel map under document registry ref #SRV-2026-99.",
      }),
    });
    const data = await res.json();
    if (res.ok && data.application.currentStageId === "scrutiny") {
      results.push({
        step: "8. Institution Clarification Response",
        passed: true,
        details: { stage: data.application.currentStageId, status: data.application.status },
      });
    } else {
      results.push({ step: "8. Institution Clarification Response", passed: false, error: JSON.stringify(data) });
    }
  } catch (err) {
    results.push({ step: "8. Institution Clarification Response", passed: false, error: err.message });
  }

  // 9. Workflow Stage Advance to EVC
  try {
    const res = await fetch(`${API_BASE}/applications/${createdAppId}/advance`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": "aicte-scrutiny-1" },
      body: JSON.stringify({
        reason: "Land boundary map verified. Cleared for Expert Visit Committee inspection.",
      }),
    });
    const data = await res.json();
    if (res.ok && data.application.currentStageId === "evc") {
      results.push({
        step: "9. Workflow Authoritative Stage Advance",
        passed: true,
        details: { stage: data.application.currentStageId, stageName: data.application.currentStageName },
      });
    } else {
      results.push({ step: "9. Workflow Authoritative Stage Advance", passed: false, error: JSON.stringify(data) });
    }
  } catch (err) {
    results.push({ step: "9. Workflow Authoritative Stage Advance", passed: false, error: err.message });
  }

  // 10. EVC Visit Scheduling & Status Update
  let evcId = "";
  try {
    const res = await fetch(`${API_BASE}/evc`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": "aicte-evc-1" },
      body: JSON.stringify({
        applicationId: createdAppId,
        institutionId: "inst-001",
        regionId: "western",
        scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        assignedExperts: ["Dr. C. R. Rao (IIT Bombay)", "Prof. Anita Sharma (COEP)"],
        notes: "On-site physical inspection of laboratories and library infrastructure.",
      }),
    });
    const data = await res.json();
    if (res.ok && data.visit && data.visit.id) {
      evcId = data.visit.id;
      // Now update status to completed
      const updateRes = await fetch(`${API_BASE}/evc/${evcId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-id": "aicte-evc-1" },
        body: JSON.stringify({ status: "visit_completed", notes: "Inspection completed satisfactorily" }),
      });
      const updateData = await updateRes.json();
      results.push({
        step: "10. EVC Scheduling & Completion Update",
        passed: updateRes.ok && updateData.visit.status === "visit_completed",
        details: { evcId, status: updateData.visit?.status },
      });
    } else {
      results.push({ step: "10. EVC Scheduling & Completion Update", passed: false, error: JSON.stringify(data) });
    }
  } catch (err) {
    results.push({ step: "10. EVC Scheduling & Completion Update", passed: false, error: err.message });
  }

  // 11. Final Decision by Competent Authority & Automatic Undertaking Generation
  try {
    const res = await fetch(`${API_BASE}/applications/${createdAppId}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-id": "aicte-authority-1" },
      body: JSON.stringify({
        decision: "grant_approval",
        remarks: "Approved for AY 2026-27 subject to anti-ragging and faculty cadre compliance.",
        conditions: [
          "Submit Anti-Ragging Committee composition within 30 days",
          "Ensure 1:20 teacher-student ratio before academic session begins",
        ],
      }),
    });
    const data = await res.json();
    if (res.ok && data.application.status === "approved") {
      results.push({
        step: "11. Final Decision & Undertaking Generation",
        passed: true,
        details: { status: data.application.status, undertakingsGenerated: data.undertakingsGenerated },
      });
    } else {
      results.push({ step: "11. Final Decision & Undertaking Generation", passed: false, error: JSON.stringify(data) });
    }
  } catch (err) {
    results.push({ step: "11. Final Decision & Undertaking Generation", passed: false, error: err.message });
  }

  // 12. Multer Multipart File Upload & Download
  try {
    const dummyFilePath = path.resolve("./test-document.pdf");
    fs.writeFileSync(dummyFilePath, "%PDF-1.4 Mock verification pdf content for AICTE regulatory test");

    const formData = new FormData();
    const fileBlob = new Blob([fs.readFileSync(dummyFilePath)], { type: "application/pdf" });
    formData.append("file", fileBlob, "survey_parcel_map.pdf");
    formData.append("applicationId", createdAppId);
    formData.append("documentType", "land_document");

    const uploadRes = await fetch(`${API_BASE}/documents/upload`, {
      method: "POST",
      headers: { "x-user-id": "inst-user-1" },
      body: formData,
    });
    const uploadData = await uploadRes.json();

    if (uploadRes.ok && uploadData.document && uploadData.document.id) {
      // Verify download
      const dlRes = await fetch(`${API_BASE}/documents/${uploadData.document.id}/download`, {
        headers: { "x-user-id": "aicte-scrutiny-1" },
      });
      const dlText = await dlRes.text();
      results.push({
        step: "12. Real Multer File Upload & Authenticated Download",
        passed: dlRes.ok && dlText.length > 0,
        details: { docId: uploadData.document.id, filename: uploadData.document.originalFilename, size: uploadData.document.fileSizeBytes },
      });
    } else {
      results.push({ step: "12. Real Multer File Upload & Authenticated Download", passed: false, error: JSON.stringify(uploadData) });
    }

    if (fs.existsSync(dummyFilePath)) fs.unlinkSync(dummyFilePath);
  } catch (err) {
    results.push({ step: "12. Real Multer File Upload & Authenticated Download", passed: false, error: err.message });
  }

  // 13. Deadline Reminder Processor (Idempotent background execution)
  try {
    const res = await fetch(`${API_BASE}/admin/process-deadlines`, {
      method: "POST",
      headers: { "x-user-id": "aicte-admin-1" },
    });
    const data = await res.json();
    if (res.ok && data.success) {
      results.push({
        step: "13. Citizens Charter Deadline & Escalation Processor",
        passed: true,
        details: data.results,
      });
    } else {
      results.push({ step: "13. Citizens Charter Deadline & Escalation Processor", passed: false, error: JSON.stringify(data) });
    }
  } catch (err) {
    results.push({ step: "13. Citizens Charter Deadline & Escalation Processor", passed: false, error: err.message });
  }

  console.log("\n=== Test Results Summary ===");
  let allPassed = true;
  for (const r of results) {
    const icon = r.passed ? "✅ PASS" : "❌ FAIL";
    console.log(`${icon}: ${r.step}`);
    if (r.details) console.log("   Details:", JSON.stringify(r.details));
    if (r.error) {
      console.log("   Error:", r.error);
      allPassed = false;
    }
  }

  console.log("\n============================");
  if (allPassed) {
    console.log("🎉 ALL 13 END-TO-END SPECIFICATIONS PASSED (PURE JAVASCRIPT)!");
  } else {
    console.log("⚠️ Some tests failed. Check output above.");
  }
}

run();
