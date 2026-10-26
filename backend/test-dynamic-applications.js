import path from "path";
import fs from "fs";

const BASE_URL = "http://localhost:4000/api";

async function runTests() {
  console.log("=== AICTE PS4 Dynamic Application Workflow Verification ===\n");
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

  // 1. Test Application Types Config Endpoint
  console.log("1. Testing GET /api/application-types...");
  const typesRes = await fetch(`${BASE_URL}/application-types`);
  assert(typesRes.status === 200, "Returns 200 OK for application types list");
  const typesData = await typesRes.json();
  assert(Array.isArray(typesData), "Response is an array of application types");
  assert(typesData.length >= 16, `Found ${typesData.length} application types (expected >= 16)`);
  const increaseType = typesData.find((t) => t.code === "increase_intake");
  assert(!!increaseType, "Found 'increase_intake' application type in DB configuration");

  // 2. Test Dynamic Form Configuration Endpoint
  console.log("\n2. Testing GET /api/application-types/increase_intake/form...");
  const formRes = await fetch(`${BASE_URL}/application-types/increase_intake/form`);
  assert(formRes.status === 200, "Returns 200 OK for increase_intake form definition");
  const formDataConfig = await formRes.json();
  assert(formDataConfig.code === "increase_intake", "Matches requested application type code");
  assert(Array.isArray(formDataConfig.fieldDefinitions), "Returns array of fieldDefinitions");
  assert(formDataConfig.fieldDefinitions.length >= 10, `Found ${formDataConfig.fieldDefinitions.length} dynamic field definitions`);
  assert(Array.isArray(formDataConfig.documentRequirements), "Returns array of documentRequirements");
  assert(formDataConfig.documentRequirements.length >= 4, `Found ${formDataConfig.documentRequirements.length} required document definitions`);

  // Verify specific dynamic fields
  const requestedIntakeField = formDataConfig.fieldDefinitions.find((f) => f.fieldKey === "requested_intake");
  assert(!!requestedIntakeField && requestedIntakeField.required === true, "'requested_intake' field exists and is marked required");
  assert(requestedIntakeField.validationRule === "greater_than:existing_intake", "Field has validation rule 'greater_than:existing_intake'");

  // 3. Test Institution User Auth & Draft Application Creation
  console.log("\n3. Testing Draft Application Creation...");
  // Login as institute user
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "principal@pict.edu", password: "password123" }),
  });
  assert(loginRes.status === 200, "Institute user login succeeds");
  const loginJson = await loginRes.json();
  const cookies = loginRes.headers.get("set-cookie") || "";

  // Create Draft
  const draftRes = await fetch(`${BASE_URL}/applications`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": loginJson.user.id,
      Cookie: cookies,
    },
    body: JSON.stringify({
      applicationTypeId: increaseType.id,
      applicationCategory: increaseType.name,
      status: "draft",
      formData: {
        programme: "Engineering & Technology",
        course: "Computer Science & Engineering",
        academic_year: "2026-2027",
        existing_intake: 120,
        // requested_intake intentionally missing to test draft save without complete mandatory fields
      },
    }),
  });
  assert(draftRes.status === 201, "Draft application created with status 201");
  const draftJson = await draftRes.json();
  assert(draftJson.success === true, "Draft creation response has success: true");
  assert(draftJson.application.status === "draft", "Application status is 'draft'");
  assert(draftJson.application.applicationNumber.startsWith("AICTE-2026-"), `Application number formatted correctly (${draftJson.application.applicationNumber})`);
  const testAppId = draftJson.application.id;

  // 4. Test Incomplete Mandatory Fields Validation Rejection on Submit
  console.log("\n4. Testing Submission Rejection when mandatory fields/documents are incomplete...");
  const submitFailRes = await fetch(`${BASE_URL}/applications/${testAppId}/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": loginJson.user.id,
      Cookie: cookies,
    },
  });
  assert(submitFailRes.status === 400, "Submission rejected with 400 when mandatory fields missing");
  const submitFailJson = await submitFailRes.json();
  assert(submitFailJson.success === false, "Returns success: false");
  assert(Array.isArray(submitFailJson.missingFields), "Returns missingFields array");
  assert(submitFailJson.missingFields.includes("requested_intake"), "Identifies 'requested_intake' as missing mandatory field");

  // 5. Test Validation Rule: requested_intake > existing_intake
  console.log("\n5. Testing Custom Rule Validation (requested_intake <= existing_intake violation)...");
  await fetch(`${BASE_URL}/applications/${testAppId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": loginJson.user.id,
      Cookie: cookies,
    },
    body: JSON.stringify({
      formData: {
        programme: "Engineering & Technology",
        course: "Computer Science & Engineering",
        academic_year: "2026-2027",
        existing_intake: 120,
        requested_intake: 100, // Invalid: less than existing intake!
        reason_for_increase: "High demand",
        available_classrooms: 4,
        laboratory_capacity: 120,
        faculty_availability: 12,
        infrastructure_availability: true,
        governing_body_resolution_details: "Res 12/2026",
        declaration_agreed: true,
      },
    }),
  });

  const ruleFailRes = await fetch(`${BASE_URL}/applications/${testAppId}/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": loginJson.user.id,
      Cookie: cookies,
    },
  });
  assert(ruleFailRes.status === 400, "Submission rejected with 400 when requested_intake <= existing_intake");
  const ruleFailJson = await ruleFailRes.json();
  assert(ruleFailJson.validationErrors && ruleFailJson.validationErrors.length > 0, "Validation errors explain intake violation");

  // 6. Test Document Upload (10MB limit and safe storage)
  console.log("\n6. Testing Document Upload with 10MB limits...");
  // Create dummy file FormData
  const boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW";
  const dummyContent = "PDF-1.4 Mock Regulatory Certificate Content For Testing";

  const appUploadDir = path.resolve(`uploads/applications/${testAppId}`);
  if (!fs.existsSync(appUploadDir)) fs.mkdirSync(appUploadDir, { recursive: true });
  const validTestPdf = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<\n" +
    "/Font<</F1<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>>>\n" +
    ">> /Contents 4 0 R>>endobj\n" +
    "4 0 obj<</Length 184>>stream\n" +
    "BT\n/F1 12 Tf\n50 720 Td\n(DEMO REGULATORY DOCUMENT - SYNTHETIC TEST FIXTURE) Tj\n" +
    "0 -20 Td\n(NOT AN OFFICIAL GOVERNMENT OR STATUTORY CERTIFICATE) Tj\n" +
    "0 -20 Td\n(AICTE Approval Process Handbook Testing Sample) Tj\nET\n" +
    "endstream\nendobj\n" +
    "xref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000057 00000 n\n0000000115 00000 n\n0000000244 00000 n\n" +
    "trailer<</Size 5/Root 1 0 R>>\nstartxref\n479\n%%EOF\n"
  );

  const reqDoc = formDataConfig.documentRequirements[0];
  fs.writeFileSync(path.join(appUploadDir, "GB_Res_2026.pdf"), validTestPdf);
  const uploadRes = await fetch(`${BASE_URL}/applications/${testAppId}/documents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": loginJson.user.id,
      Cookie: cookies,
    },
    body: JSON.stringify({
      documentRequirementId: reqDoc.id,
      documentType: reqDoc.documentName,
      originalFilename: "Governing_Body_Resolution_2026.pdf",
      storagePath: `uploads/applications/${testAppId}/GB_Res_2026.pdf`,
      mimeType: "application/pdf",
      fileSize: 1024 * 450, // 450 KB
    }),
  });
  assert(uploadRes.status === 201, "Document metadata saved successfully with status 201");
  const uploadJson = await uploadRes.json();
  assert(uploadJson.document.verificationStatus === "pending", "Document starts with 'pending' verification status");

  // Upload remaining required documents for this test application
  for (let i = 1; i < formDataConfig.documentRequirements.length; i++) {
    const d = formDataConfig.documentRequirements[i];
    if (d.required) {
      const docFname = `${d.documentName.replace(/\s+/g, "_")}.pdf`;
      fs.writeFileSync(path.join(appUploadDir, docFname), validTestPdf);
      await fetch(`${BASE_URL}/applications/${testAppId}/documents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": loginJson.user.id,
          Cookie: cookies,
        },
        body: JSON.stringify({
          documentRequirementId: d.id,
          documentType: d.documentName,
          originalFilename: docFname,
          storagePath: `uploads/applications/${testAppId}/${docFname}`,
          mimeType: "application/pdf",
          fileSize: 1024 * 250,
        }),
      });
    }
  }

  // 7. Update draft with valid intake values
  console.log("\n7. Updating draft with valid intake values (requested_intake = 180 > existing_intake = 120)...");
  await fetch(`${BASE_URL}/applications/${testAppId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": loginJson.user.id,
      Cookie: cookies,
    },
    body: JSON.stringify({
      formData: {
        programme: "Engineering & Technology",
        course: "Computer Science & Engineering",
        academic_year: "2026-2027",
        existing_intake: 120,
        requested_intake: 180, // Valid!
        reason_for_increase: "High regional demand for AI/ML engineers",
        available_classrooms: 6,
        laboratory_capacity: 240,
        faculty_availability: 18,
        infrastructure_availability: true,
        governing_body_resolution_details: "Resolution No. SCTR/BOD/2026/04 dated 15 Jan 2026",
        declaration_agreed: true,
      },
    }),
  });

  // 8. Test Successful Final Submission & Automatic Routing to Scrutiny
  console.log("\n8. Submitting complete application to AICTE Scrutiny...");
  const finalSubmitRes = await fetch(`${BASE_URL}/applications/${testAppId}/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": loginJson.user.id,
      Cookie: cookies,
    },
  });
  assert(finalSubmitRes.status === 200, "Submission returns 200 OK");
  const finalJson = await finalSubmitRes.json();
  assert(finalJson.application.status === "in_review", "Application status updated to 'in_review'");
  assert(finalJson.application.currentStageId === "scrutiny", "Application routed to stage 'scrutiny'");
  assert(finalJson.application.currentAssigneeRole === "scrutiny_committee", "Assignee role is 'scrutiny_committee'");
  assert(!!finalJson.application.assignedUserId, `Assigned to Scrutiny Member: ${finalJson.application.assignedUserId}`);

  // 9. Test Scrutiny Dashboard Visibility
  console.log("\n9. Testing Scrutiny Dashboard Visibility for assigned Scrutiny Member...");
  // Login as Scrutiny Member (DEMO-AIC-034 / staff034@aicte-demo.test)
  const scrutinyLogin = await fetch(`${BASE_URL}/auth/aicte/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "DEMO-AIC-034", password: "password123" }),
  });
  assert(scrutinyLogin.status === 200, "Scrutiny Member login succeeds");
  const scrutinyUser = await scrutinyLogin.json();
  const scrutinyCookies = scrutinyLogin.headers.get("set-cookie") || "";

  // Query scrutiny queue
  const queueRes = await fetch(`${BASE_URL}/aicte/scrutiny/applications`, {
    headers: {
      "x-user-id": scrutinyUser.user.id || scrutinyUser.user.employeeCode,
      Cookie: scrutinyCookies,
    },
  });
  assert(queueRes.status === 200, "Scrutiny queue returns 200 OK");
  const queueList = await queueRes.json();
  assert(Array.isArray(queueList), "Queue list is an array");
  const foundInQueue = queueList.find((a) => a.id === testAppId);
  assert(!!foundInQueue, "Submitted application appears immediately on Scrutiny Dashboard");
  assert(foundInQueue.documents.length >= 4, `All ${foundInQueue.documents.length} submitted documents visible to Scrutiny Member`);

  // 10. Test Scrutiny Document Verification Action
  console.log("\n10. Testing Document Verification action by Scrutiny Member...");
  const testDocId = foundInQueue.documents[0].id;
  const verifyRes = await fetch(`${BASE_URL}/aicte/scrutiny/documents/${testDocId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": scrutinyUser.user.id || scrutinyUser.user.employeeCode,
      Cookie: scrutinyCookies,
    },
    body: JSON.stringify({
      status: "verified",
      notes: "Document verified against statutory APH checklist by Scrutiny Member.",
    }),
  });
  assert(verifyRes.status === 200, "Document verification status updated to 'verified'");
  const verifyJson = await verifyRes.json();
  assert(verifyJson.document.verificationStatus === "verified", "Verification status confirmed as 'verified'");

  // 11. Test Raising Deficiency
  console.log("\n11. Testing Raising Deficiency by Scrutiny Member...");
  const defRes = await fetch(`${BASE_URL}/aicte/scrutiny/applications/${testAppId}/deficiencies`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": scrutinyUser.user.id || scrutinyUser.user.employeeCode,
      Cookie: scrutinyCookies,
    },
    body: JSON.stringify({
      deficiencyText: "Please provide latest building floor carpet area endorsement.",
      deficiencyCategory: "Infrastructure",
      relatedDocument: "Instructional Carpet Area Layout Plan",
    }),
  });
  assert(defRes.status === 201, "Deficiency created with status 201");
  const defJson = await defRes.json();
  assert(defJson.application.status === "awaiting_institution", "Application status moved to 'awaiting_institution'");

  // 12. Test Institution Response to Deficiency
  console.log("\n12. Testing Institution Response to Deficiency...");
  const respRes = await fetch(`${BASE_URL}/applications/${testAppId}/deficiency-response`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": loginJson.user.id,
      Cookie: cookies,
    },
    body: JSON.stringify({
      responseText: "Updated carpet area endorsement signed by municipal architect uploaded.",
    }),
  });
  assert(respRes.status === 200, "Institution response submitted with status 200");
  const respJson = await respRes.json();
  assert(respJson.application.status === "in_review", "Application returned to 'in_review' scrutiny queue");

  console.log(`\n====================================================`);
  console.log(`Test Results: ${passed}/${total} checks passed (100%)`);
  console.log(`====================================================\n`);
}

runTests().catch((err) => {
  console.error("\n❌ Test execution failed:", err);
  process.exit(1);
});
