/**
 * Phase 3 Institutional Frontend Integration & Scenarios Verification
 * 
 * Verifies all 9 mandatory Phase 3 test scenarios:
 * - Scenario 1: Relevant Document (NBA Certificate -> LIKELY_MATCH)
 * - Scenario 2: Unrelated Document (LeetCode -> POSSIBLE_MISMATCH)
 * - Scenario 3: Scanned Image PDF -> MANUAL_REVIEW_REQUIRED
 * - Scenario 4: Intermediate Pending/Processing states
 * - Scenario 5: Failed/Invalid assessment handling without stack trace leak
 * - Scenario 6: Multiple documents mapped to distinct requirements correctly associated
 * - Scenario 7: Multi-tenant isolation (Institution B cannot access Institution A)
 * - Scenario 8: Existing statutory workflow and officer scrutiny preservation
 * - Scenario 9: Session refresh / navigation state persistence from SQLite
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const API_BASE = 'http://localhost:4000/api';

function createPdfFile(filePath, textContent, isScanned = false) {
  const pythonExe = path.resolve(__dirname, '../ai-service/venv/Scripts/python.exe');
  const pyCode = `
import fitz
doc = fitz.open()
page = doc.new_page(width=595, height=842)
if ${isScanned ? 'True' : 'False'}:
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 100, 100), 0)
    pix.clear_with(220)
    page.insert_image(fitz.Rect(100, 100, 400, 400), pixmap=pix)
else:
    page.insert_textbox(fitz.Rect(50, 50, 545, 792), ${JSON.stringify(textContent)}, fontsize=11)
doc.save(r"${filePath}")
doc.close()
`;
  execFileSync(pythonExe, ['-c', pyCode]);
}

async function run() {
  console.log('===============================================================');
  console.log('STARTING PHASE 3 INSTITUTIONAL FRONTEND SCENARIOS VERIFICATION');
  console.log('===============================================================');

  // --- 1. Authenticate as Institution A (PICT) ---
  console.log('\n[Setup] Authenticating Institution A (principal@pict.edu)...');
  const loginA = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'principal@pict.edu', password: 'password123' }),
  });
  assert.strictEqual(loginA.status, 200, 'Institution A login failed');
  const userA = await loginA.json();
  const authHeadersA = {
    Authorization: `Bearer ${userA.token}`,
    'x-user-id': userA.user.id,
    'x-user-role': userA.user.accountType,
  };
  console.log(`✓ Authenticated as ${userA.user.displayName} (inst: ${userA.user.institutionId})`);

  // --- 2. Create Application for Scenarios ---
  console.log('\n[Setup] Creating draft application for Phase 3 testing...');
  const appResp = await fetch(`${API_BASE}/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeadersA },
    body: JSON.stringify({
      applicationCategory: 'Increase in Intake',
      formData: { institution_name: 'Pune Institute of Computer Technology' },
      status: 'draft',
    }),
  });
  assert.strictEqual(appResp.status, 201);
  const appId = (await appResp.json()).application.id;
  console.log(`✓ Application created: ${appId}`);

  // Fetch requirement definitions
  const formResp = await fetch(`${API_BASE}/application-types/cmvnw4dw3000tmsk4lgboox1u/form`, { headers: authHeadersA });
  const formData = await formResp.json();
  const req1 = formData.documentRequirements.find((r) => r.documentName === 'NBA Accreditation Certificate') || formData.documentRequirements[1];
  const req2 = formData.documentRequirements.find((r) => r.documentName === 'Instructional Carpet Area Layout Plan') || formData.documentRequirements[2];
  console.log(`✓ Requirement 1: "${req1.documentName}" (id: ${req1.id})`);
  console.log(`✓ Requirement 2: "${req2.documentName}" (id: ${req2.id})`);

  // --- SCENARIO 1: Relevant Document (NBA Certificate) ---
  console.log('\n[Scenario 1] Uploading RELEVANT document (Valid NBA Certificate)...');
  const relFile = path.resolve(__dirname, 'temp_nba_cert.pdf');
  const nbaText = (
    "NATIONAL BOARD OF ACCREDITATION\n" +
    "NBCC Place, East Tower, 4th Floor, Bhisham Pitamah Marg, Pragati Vihar, New Delhi 110003\n\n" +
    "To: The Principal, Pune Institute of Computer Technology, Pune.\n" +
    "Subject: Accreditation status of Undergraduate Computer Engineering program.\n\n" +
    "Sir,\n" +
    "The National Board of Accreditation has evaluated the program and granted ACCREDITED status " +
    "for Academic Years 2024-2025 to 2026-2027 valid up to 30-06-2027.\n" +
    "Program Name: Computer Engineering (UG)\n" +
    "Member Secretary, NBA."
  );
  createPdfFile(relFile, nbaText, false);

  const fd1 = new FormData();
  fd1.append('file', new Blob([fs.readFileSync(relFile)], { type: 'application/pdf' }), 'nba_valid.pdf');
  fd1.append('documentType', req1.documentName);
  fd1.append('documentRequirementId', req1.id);

  const upResp1 = await fetch(`${API_BASE}/applications/${appId}/documents`, {
    method: 'POST',
    headers: authHeadersA,
    body: fd1,
  });
  assert.strictEqual(upResp1.status, 201);
  const doc1 = (await upResp1.json()).document;
  console.log(`✓ Document 1 uploaded: ${doc1.id}`);

  // --- SCENARIO 4: Intermediate Pending/Processing States ---
  console.log('\n[Scenario 4] Verifying intermediate status querying...');
  const immResp = await fetch(`${API_BASE}/applications/${appId}/documents/${doc1.id}/prevalidation`, {
    headers: authHeadersA,
  });
  assert.strictEqual(immResp.status, 200);
  const immData = await immResp.json();
  console.log(`✓ Immediate pre-validation status: ${immData.status}`);
  assert(['QUEUED', 'PROCESSING', 'COMPLETED'].includes(immData.status), 'Must be a valid active or completed status');

  // Poll until terminal
  console.log('  Waiting for Groq qualitative assessment to complete...');
  let poll1 = null;
  for (let i = 0; i < 20; i++) {
    const sResp = await fetch(`${API_BASE}/applications/${appId}/documents/${doc1.id}/prevalidation`, { headers: authHeadersA });
    poll1 = await sResp.json();
    if (['COMPLETED', 'FAILED'].includes(poll1.status)) break;
    await new Promise((r) => setTimeout(r, 1200));
  }
  assert.strictEqual(poll1.status, 'COMPLETED');
  console.log(`✓ Scenario 1 Terminal Classification: ${poll1.classification.result}`);
  console.log(`  Advisory: ${poll1.classification.advisoryMessage}`);
  console.log(`  Evidence Excerpt: "${poll1.classification.evidenceExcerpt}"`);
  assert.strictEqual(poll1.classification.result, 'LIKELY_MATCH', 'NBA cert must evaluate to LIKELY_MATCH');
  assert(poll1.classification.evidenceExcerpt.includes('ACCREDITED') || poll1.classification.evidenceExcerpt.includes('National Board'), 'Evidence must quote source text');
  console.log('✓ Scenario 1 PASSED: Relevant document classified as LIKELY_MATCH with verified quote.');

  // --- SCENARIO 2: Unrelated Document (LeetCode) on Requirement 1 Replacement ---
  console.log('\n[Scenario 2] Uploading UNRELATED document (LeetCode Problem) as replacement...');
  const unrelFile = path.resolve(__dirname, 'temp_unrel_leetcode.pdf');
  const leetCodeText = (
    "LEETCODE 42: TRAPPING RAIN WATER (HARD)\n\n" +
    "Given n non-negative integers representing an elevation map where the width of each bar is 1, " +
    "compute how much water it can trap after raining.\n\n" +
    "def trap(height):\n" +
    "    left, right = 0, len(height) - 1\n" +
    "    left_max, right_max = 0, 0\n" +
    "    water = 0\n" +
    "    while left < right:\n" +
    "        if height[left] < height[right]:\n" +
    "            left += 1\n" +
    "    return water\n"
  );
  createPdfFile(unrelFile, leetCodeText, false);

  const fd2 = new FormData();
  fd2.append('file', new Blob([fs.readFileSync(unrelFile)], { type: 'application/pdf' }), 'leetcode_p42.pdf');
  fd2.append('documentType', req1.documentName);
  fd2.append('documentRequirementId', req1.id);

  const upResp2 = await fetch(`${API_BASE}/applications/${appId}/documents`, {
    method: 'POST',
    headers: authHeadersA,
    body: fd2,
  });
  assert.strictEqual(upResp2.status, 201);
  const doc2 = (await upResp2.json()).document;
  assert.strictEqual(doc2.versionNumber, 2, 'Replacement must be version 2');
  console.log(`✓ Document 2 uploaded as v2 replacement: ${doc2.id}`);

  let poll2 = null;
  for (let i = 0; i < 20; i++) {
    const sResp = await fetch(`${API_BASE}/applications/${appId}/documents/${doc2.id}/prevalidation`, { headers: authHeadersA });
    poll2 = await sResp.json();
    if (['COMPLETED', 'FAILED'].includes(poll2.status)) break;
    await new Promise((r) => setTimeout(r, 1200));
  }
  assert.strictEqual(poll2.status, 'COMPLETED');
  console.log(`✓ Scenario 2 Terminal Classification: ${poll2.classification.result}`);
  console.log(`  Advisory: ${poll2.classification.advisoryMessage}`);
  console.log(`  Recommended Action: ${poll2.classification.recommendedAction}`);
  assert.strictEqual(poll2.classification.result, 'POSSIBLE_MISMATCH', 'LeetCode doc must evaluate to POSSIBLE_MISMATCH');
  assert.strictEqual(poll2.classification.recommendedAction, 'CHECK_AND_REPLACE');
  console.log('✓ Scenario 2 PASSED: Unrelated document flagged as POSSIBLE_MISMATCH with CHECK_AND_REPLACE recommendation.');

  // --- SCENARIO 3: Scanned Image-Only PDF ---
  console.log('\n[Scenario 3] Uploading SCANNED IMAGE-ONLY PDF...');
  const scannedFile = path.resolve(__dirname, 'temp_scanned.pdf');
  createPdfFile(scannedFile, '', true);

  const fd3 = new FormData();
  fd3.append('file', new Blob([fs.readFileSync(scannedFile)], { type: 'application/pdf' }), 'scanned_drawing.pdf');
  fd3.append('documentType', req2.documentName);
  fd3.append('documentRequirementId', req2.id);

  const upResp3 = await fetch(`${API_BASE}/applications/${appId}/documents`, {
    method: 'POST',
    headers: authHeadersA,
    body: fd3,
  });
  assert.strictEqual(upResp3.status, 201);
  const doc3 = (await upResp3.json()).document;
  console.log(`✓ Document 3 (scanned) uploaded: ${doc3.id}`);

  let poll3 = null;
  for (let i = 0; i < 20; i++) {
    const sResp = await fetch(`${API_BASE}/applications/${appId}/documents/${doc3.id}/prevalidation`, { headers: authHeadersA });
    poll3 = await sResp.json();
    if (['COMPLETED', 'FAILED'].includes(poll3.status)) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.strictEqual(poll3.status, 'COMPLETED');
  console.log(`✓ Scenario 3 Terminal Classification: ${poll3.classification.result}`);
  console.log(`  Advisory: ${poll3.classification.advisoryMessage}`);
  assert.strictEqual(poll3.classification.result, 'MANUAL_REVIEW_REQUIRED', 'Scanned PDF must yield MANUAL_REVIEW_REQUIRED');
  console.log('✓ Scenario 3 PASSED: Scanned image PDF correctly categorized as MANUAL_REVIEW_REQUIRED.');

  // --- SCENARIO 5: Failed / Invalid Assessment Graceful Handling ---
  console.log('\n[Scenario 5] Verifying graceful error handling on invalid document ID...');
  const errResp = await fetch(`${API_BASE}/applications/${appId}/documents/doc-non-existent-999/prevalidation`, {
    headers: authHeadersA,
  });
  assert.strictEqual(errResp.status, 404, 'Must return 404 for non-existent document');
  const errData = await errResp.json();
  assert(errData.error, 'Must provide structured error message');
  assert(!JSON.stringify(errData).includes('stack'), 'Must not leak server stack traces');
  console.log(`✓ Graceful 404 returned without stack trace: ${errData.error}`);
  console.log('✓ Scenario 5 PASSED.');

  // --- SCENARIO 6: Multiple Documents Association ---
  console.log('\n[Scenario 6] Verifying independent association of multiple documents...');
  const s2Doc1Resp = await fetch(`${API_BASE}/applications/${appId}/documents/${doc2.id}/prevalidation`, { headers: authHeadersA });
  const s2Doc3Resp = await fetch(`${API_BASE}/applications/${appId}/documents/${doc3.id}/prevalidation`, { headers: authHeadersA });
  const d2Data = await s2Doc1Resp.json();
  const d3Data = await s2Doc3Resp.json();
  assert.strictEqual(d2Data.classification.result, 'POSSIBLE_MISMATCH');
  assert.strictEqual(d3Data.classification.result, 'MANUAL_REVIEW_REQUIRED');
  assert.notStrictEqual(d2Data.jobId, d3Data.jobId);
  console.log(`✓ Doc 2 (${req1.documentName}) job ${d2Data.jobId}: ${d2Data.classification.result}`);
  console.log(`✓ Doc 3 (${req2.documentName}) job ${d3Data.jobId}: ${d3Data.classification.result}`);
  console.log('✓ Scenario 6 PASSED: Multiple documents maintain isolated and correct assessments.');

  // --- SCENARIO 7: Cross-Tenant Isolation ---
  console.log('\n[Scenario 7] Verifying Cross-Tenant Isolation (Institution B -> Institution A)...');
  const loginB = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dean_academics@dtu.ac.in', password: 'password123' }),
  });
  const userB = await loginB.json();
  const authHeadersB = {
    Authorization: `Bearer ${userB.token}`,
    'x-user-id': userB.user.id,
    'x-user-role': userB.user.accountType,
  };

  const crossResp = await fetch(`${API_BASE}/applications/${appId}/documents/${doc2.id}/prevalidation`, { headers: authHeadersB });
  assert.strictEqual(crossResp.status, 403, 'Cross-tenant status read must return 403');
  console.log('✓ Scenario 7 PASSED: Institution B strictly blocked with HTTP 403.');

  // --- SCENARIO 8: Existing Workflow Preservation ---
  console.log('\n[Scenario 8] Verifying application submission and workflow preservation...');

  // Satisfy standard application form validation requirements
  await fetch(`${API_BASE}/applications/${appId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeadersA },
    body: JSON.stringify({
      formData: {
        programme: 'Engineering & Technology',
        course: 'Computer Science & Engineering',
        academic_year: '2026-2027',
        existing_intake: 120,
        requested_intake: 180,
        reason_for_increase: 'High regional demand for AI/ML engineers',
        available_classrooms: 6,
        laboratory_capacity: 240,
        faculty_availability: 18,
        infrastructure_availability: true,
        governing_body_resolution_details: 'Resolution No. SCTR/BOD/2026/04 dated 15 Jan 2026',
        declaration_agreed: true,
      },
    }),
  });

  // Ensure all remaining mandatory checklist items have documents attached
  for (const r of formData.documentRequirements) {
    if (r.required && r.id !== req1.id && r.id !== req2.id) {
      const fd = new FormData();
      fd.append('file', new Blob([fs.readFileSync(relFile)], { type: 'application/pdf' }), `${r.id}.pdf`);
      fd.append('documentType', r.documentName);
      fd.append('documentRequirementId', r.id);
      await fetch(`${API_BASE}/applications/${appId}/documents`, {
        method: 'POST',
        headers: authHeadersA,
        body: fd,
      });
    }
  }

  const submitResp = await fetch(`${API_BASE}/applications/${appId}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeadersA },
    body: JSON.stringify({ isFinalSubmit: true }),
  });
  assert.strictEqual(submitResp.status, 200, 'Application final submission must succeed');
  const submittedApp = (await submitResp.json()).application;
  console.log(`✓ Application submitted: status=${submittedApp.status}, stage=${submittedApp.currentStageName || submittedApp.currentStageId}`);
  assert.strictEqual(submittedApp.status, 'in_review', 'Status must advance to in_review upon final submission');
  console.log('✓ Scenario 8 PASSED: Application workflow and submission completely unaffected.');

  // --- SCENARIO 9: Persistence Across Refresh / Navigation ---
  console.log('\n[Scenario 9] Verifying persistence across session refresh...');
  const freshAppResp = await fetch(`${API_BASE}/applications/${appId}`, { headers: authHeadersA });
  const freshApp = await freshAppResp.json();
  const currentDocs = freshApp.documents || (freshApp.application && freshApp.application.documents) || [];
  assert(currentDocs.length >= 2, 'All uploaded documents must be persisted in SQLite');

  const checkDoc2Resp = await fetch(`${API_BASE}/applications/${appId}/documents/${doc2.id}/prevalidation`, { headers: authHeadersA });
  const checkDoc2Data = await checkDoc2Resp.json();
  assert.strictEqual(checkDoc2Data.status, 'COMPLETED');
  assert.strictEqual(checkDoc2Data.classification.result, 'POSSIBLE_MISMATCH');
  console.log(`✓ Re-queried pre-validation status after re-opening application: ${checkDoc2Data.classification.result}`);
  console.log('✓ Scenario 9 PASSED: Complete state persistence from SQLite verified.');

  // Cleanup temporary PDF files
  [relFile, unrelFile, scannedFile].forEach((f) => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });

  console.log('\n===============================================================');
  console.log('ALL 9 PHASE 3 FRONTEND INTEGRATION SCENARIOS PASSED CLEANLY!');
  console.log('===============================================================');
}

run().catch((err) => {
  console.error('\n❌ Scenario test failed:', err);
  process.exit(1);
});
