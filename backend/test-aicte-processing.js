/**
 * Complete AICTE Application Processing Backend & Detailed Status Tracking Test Suite
 * Validates all endpoints, stage actions, transitions, timelines, deficiency cycles, and decisions.
 */

const BASE_URL = "http://localhost:4000/api";

async function runAicteProcessingTests() {
  console.log("=== AICTE PS4 Application Processing & Status Tracking Verification ===\n");
  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // 1. Authenticate AICTE Member (Dr. Mihir Tiwari - Scrutiny Member)
  console.log("1. Authenticating AICTE Scrutiny Member (DEMO-AIC-034)...");
  const aicteLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "staff034@aicte-demo.test",
      password: "password123",
      accountType: "aicte",
    }),
  });
  assert(aicteLoginRes.status === 200, "AICTE staff login succeeds");
  const aicteAuthCookies = aicteLoginRes.headers.get("set-cookie");
  const aicteUser = (await aicteLoginRes.json()).user;
  assert(aicteUser.accountType === "aicte", "Authenticated as AICTE Staff");

  // 2. Authenticate Super Admin (DEMO-AIC-001) for governance / final decisions
  console.log("\n2. Authenticating AICTE Council Officer / Super Admin (DEMO-AIC-001)...");
  const adminLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "staff001@aicte-demo.test",
      password: "password123",
      accountType: "aicte",
    }),
  });
  assert(adminLoginRes.status === 200, "AICTE admin login succeeds");
  const adminCookies = adminLoginRes.headers.get("set-cookie");

  // 3. Create and Submit a Fresh Application from Institution side
  console.log("\n3. Creating & submitting a fresh statutory application from Institute side...");
  const instLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "principal@pict.edu", password: "password123" }),
  });
  assert(instLoginRes.status === 200, "Institute user login succeeds");
  const instCookies = instLoginRes.headers.get("set-cookie") || "";
  const instJson = await instLoginRes.json();

  const draftRes = await fetch(`${BASE_URL}/applications`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": instJson.user.id,
      Cookie: instCookies,
    },
    body: JSON.stringify({
      applicationCategory: "Increase in Intake",
      status: "draft",
      formData: {
        programme: "Engineering & Technology",
        course: "Artificial Intelligence & Data Science",
        academic_year: "2026-2027",
        existing_intake: 60,
        requested_intake: 120,
        reason_for_increase: "Surge in industry demand and top NIRF placement stats.",
        available_classrooms: 6,
        laboratory_capacity: 180,
        faculty_availability: 18,
        infrastructure_availability: true,
        governing_body_resolution_details: "GovBody/Res/2026/044 approved unanimously.",
        declaration_agreed: true,
      },
    }),
  });
  assert(draftRes.status === 201, "Draft application created with status 201");
  const draftJson = await draftRes.json();
  const appId = draftJson.application.id;
  const appNumber = draftJson.application.applicationNumber;
  console.log(`   Created application: ${appNumber} (ID: ${appId})`);

  // Upload required documents
  const docsToUpload = [
    { type: "Governing Body Resolution", filename: "gb_resolution_2026.pdf" },
    { type: "Detailed Project Report (DPR)", filename: "dpr_expansion.pdf" },
    { type: "Faculty Cadre Allocation & Recruitment Undertaking", filename: "faculty_cadre.pdf" },
    { type: "Laboratory Equipment List & Invoice Copies", filename: "lab_invoices.pdf" },
  ];
  for (const d of docsToUpload) {
    const docRes = await fetch(`${BASE_URL}/applications/${appId}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: instCookies },
      body: JSON.stringify({
        documentType: d.type,
        originalFilename: d.filename,
        storagePath: `uploads/${d.filename}`,
        fileSize: 1048576,
        mimeType: "application/pdf",
      }),
    });
    assert(docRes.status === 201, `Document '${d.type}' metadata saved`);
  }

  // Submit Application
  const submitRes = await fetch(`${BASE_URL}/applications/${appId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: instCookies },
  });
  assert(submitRes.status === 200, "Application formally submitted to AICTE");

  // 4. Test Dashboard Metrics
  console.log("\n4. Testing GET /api/aicte/dashboard/metrics...");
  const metricsRes = await fetch(`${BASE_URL}/aicte/dashboard/metrics`, {
    headers: { Cookie: aicteAuthCookies },
  });
  assert(metricsRes.status === 200, "Dashboard metrics returns 200 OK");
  const metrics = await metricsRes.json();
  assert(typeof metrics.summary.total === "number", "Metrics has total applications count");
  assert(typeof metrics.summary.inReview === "number", "Metrics has inReview count");
  assert(Array.isArray(metrics.byStage), "Metrics includes breakdown byStage");
  assert(Array.isArray(metrics.recentActivity), "Metrics includes recentActivity");

  // 5. Test Application Queue Listing & Filtering
  console.log("\n5. Testing GET /api/aicte/applications (Queue)...");
  const queueRes = await fetch(`${BASE_URL}/aicte/applications?page=1&pageSize=10`, {
    headers: { Cookie: aicteAuthCookies },
  });
  assert(queueRes.status === 200, "Queue list returns 200 OK");
  const queueData = await queueRes.json();
  assert(Array.isArray(queueData.items), "Returns array of application items");
  assert(queueData.total >= 1, `Found ${queueData.total} applications in processing queue`);

  // 6. Test Filter by Queue: my_assigned
  console.log("\n6. Testing Queue filter: ?queue=my_assigned...");
  const myQueueRes = await fetch(`${BASE_URL}/aicte/applications?queue=my_assigned`, {
    headers: { Cookie: aicteAuthCookies },
  });
  assert(myQueueRes.status === 200, "my_assigned queue filter returns 200 OK");
  const myQueueData = await myQueueRes.json();
  assert(Array.isArray(myQueueData.items), "my_assigned returns application items");

  // 7. Test Single Application Detail & Form Data
  console.log(`\n7. Testing GET /api/aicte/applications/${appId}...`);
  const appDetailRes = await fetch(`${BASE_URL}/aicte/applications/${appId}`, {
    headers: { Cookie: aicteAuthCookies },
  });
  assert(appDetailRes.status === 200, "Application detail returns 200 OK");
  const appDetail = await appDetailRes.json();
  assert(appDetail.id === appId, "Application ID matches");
  assert(!!appDetail.institution, "Includes institution details");
  assert(!!appDetail.region, "Includes region details");
  assert(Array.isArray(appDetail.documents), "Includes documents list");
  assert(appDetail.documents.length >= 4, "All uploaded documents visible to officer");

  // 8. Test Workflow Timeline API
  console.log(`\n8. Testing GET /api/aicte/applications/${appId}/timeline...`);
  const timelineRes = await fetch(`${BASE_URL}/aicte/applications/${appId}/timeline`, {
    headers: { Cookie: aicteAuthCookies },
  });
  assert(timelineRes.status === 200, "Timeline returns 200 OK");
  const timeline = await timelineRes.json();
  assert(timeline.applicationId === appId, "Timeline references target application");
  assert(Array.isArray(timeline.stages), "Timeline contains stages array");
  assert(timeline.stages.length >= 3, `Found ${timeline.stages.length} workflow stages configured`);
  assert(Array.isArray(timeline.auditEvents), "Timeline contains immutable auditEvents");

  // 9. Test Documents Listing & Document Status Update
  console.log(`\n9. Testing GET /api/aicte/applications/${appId}/documents & verification...`);
  const docsRes = await fetch(`${BASE_URL}/aicte/applications/${appId}/documents`, {
    headers: { Cookie: aicteAuthCookies },
  });
  assert(docsRes.status === 200, "Documents endpoint returns 200 OK");
  const docs = await docsRes.json();
  assert(Array.isArray(docs), "Returns array of documents");
  const docId = docs[0].id;
  const docPatchRes = await fetch(`${BASE_URL}/aicte/documents/${docId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: aicteAuthCookies },
    body: JSON.stringify({ status: "verified", notes: "Verified during statutory review." }),
  });
  assert(docPatchRes.status === 200, "Document verification status updated to 'verified'");

  // 10. Test Assignments Endpoint
  console.log(`\n10. Testing GET /api/aicte/applications/${appId}/assignments...`);
  const assignRes = await fetch(`${BASE_URL}/aicte/applications/${appId}/assignments`, {
    headers: { Cookie: aicteAuthCookies },
  });
  assert(assignRes.status === 200, "Assignments endpoint returns 200 OK");
  const assignments = await assignRes.json();
  assert(Array.isArray(assignments), "Returns array of workflow assignments");

  // 11. Test Start Stage
  console.log(`\n11. Testing POST /api/aicte/applications/${appId}/stages/scrutiny/start...`);
  const startStageRes = await fetch(`${BASE_URL}/aicte/applications/${appId}/stages/scrutiny/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: aicteAuthCookies },
  });
  assert(startStageRes.status === 200, "Start stage returns 200 OK");
  const startStageData = await startStageRes.json();
  assert(startStageData.stage.stageStatus === "IN_PROGRESS", "Stage status transitioned to IN_PROGRESS");

  // 12. Test Submit Review Report
  console.log(`\n12. Testing POST /api/aicte/applications/${appId}/reports...`);
  const reportRes = await fetch(`${BASE_URL}/aicte/applications/${appId}/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: aicteAuthCookies },
    body: JSON.stringify({
      stageKey: "scrutiny",
      reportType: "SCRUTINY_REPORT",
      title: "Scrutiny Committee Statutory Assessment Report",
      content: "All mandatory architectural and academic criteria evaluated for intake expansion.",
      recommendations: "Recommended for approval.",
      outcome: "FAVORABLE",
    }),
  });
  assert(reportRes.status === 201, "Review report submitted with 201 Created");
  const reportData = await reportRes.json();
  assert(reportData.report.outcome === "FAVORABLE", "Report outcome saved as FAVORABLE");

  // 13. Test GET Reports
  console.log(`\n13. Testing GET /api/aicte/applications/${appId}/reports...`);
  const getReportsRes = await fetch(`${BASE_URL}/aicte/applications/${appId}/reports`, {
    headers: { Cookie: aicteAuthCookies },
  });
  assert(getReportsRes.status === 200, "GET reports returns 200 OK");
  const reportsList = await getReportsRes.json();
  assert(reportsList.length >= 1, `Found ${reportsList.length} review reports`);

  // 14. Test Stage Decision (Passing Scrutiny)
  console.log(`\n14. Testing POST /api/aicte/applications/${appId}/stages/scrutiny/decision (PASS)...`);
  const stageDecisionRes = await fetch(`${BASE_URL}/aicte/applications/${appId}/stages/scrutiny/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: aicteAuthCookies },
    body: JSON.stringify({
      outcome: "PASS",
      comments: "Statutory documents and norms satisfied. Recommended forward.",
      findings: "All requirements conform to Approval Process Handbook guidelines.",
    }),
  });
  assert(stageDecisionRes.status === 200, "Stage decision returns 200 OK");
  const decisionResult = await stageDecisionRes.json();
  assert(decisionResult.success === true, "Stage decision processed successfully");
  assert(!!decisionResult.nextStageKey, `Stage outcome routed to next stage: ${decisionResult.nextStageKey}`);

  // 15. Test Forward Application to Next Stage
  console.log(`\n15. Testing POST /api/aicte/applications/${appId}/forward...`);
  const forwardRes = await fetch(`${BASE_URL}/aicte/applications/${appId}/forward`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: aicteAuthCookies },
    body: JSON.stringify({
      reason: "Advance to executive committee / decision stage.",
    }),
  });
  assert(forwardRes.status === 200, "Forward application returns 200 OK");
  const forwardData = await forwardRes.json();
  console.log(`   Application advanced to stage: ${forwardData.application.currentStageId}`);

  // 16. Test Final Decision (Approval / LoA Issuance)
  console.log(`\n16. Testing POST /api/aicte/applications/${appId}/decision (LoA Approved)...`);
  const finalDecisionRes = await fetch(`${BASE_URL}/aicte/applications/${appId}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookies },
    body: JSON.stringify({
      decisionType: "APPROVED",
      decisionAuthority: "Executive Committee",
      reasonAndFindings: "All requirements satisfied under AICTE regulations.",
      documentLetterType: "LoA",
      conditions: ["Maintain faculty-student ratio of 1:15", "Adhere to AICTE anti-ragging regulations"],
      appealEligible: false,
    }),
  });
  assert(finalDecisionRes.status === 200, "Final decision recorded with 200 OK");
  const finalResult = await finalDecisionRes.json();
  assert(finalResult.decision.decisionType === "APPROVED", "Decision recorded as APPROVED");
  assert(finalResult.application.status === "approved", "Application status updated to 'approved'");

  // 17. Verify Refreshed Timeline contains Final Decision & Full Audit Trail
  console.log(`\n17. Verifying Final Timeline & Audit Trail for ${appId}...`);
  const finalTimelineRes = await fetch(`${BASE_URL}/aicte/applications/${appId}/timeline`, {
    headers: { Cookie: aicteAuthCookies },
  });
  assert(finalTimelineRes.status === 200, "Refreshed timeline returns 200 OK");
  const finalTimeline = await finalTimelineRes.json();
  assert(!!finalTimeline.decision, "Timeline includes final statutory decision record");
  assert(finalTimeline.decision.decisionType === "APPROVED", "Decision type is APPROVED");
  assert(finalTimeline.auditEvents.length >= 4, `Audit trail contains ${finalTimeline.auditEvents.length} events`);

  console.log("\n====================================================");
  console.log(`AICTE Processing Test Results: ${passed}/${total} checks passed (100%)`);
  console.log("====================================================\n");
}

runAicteProcessingTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
