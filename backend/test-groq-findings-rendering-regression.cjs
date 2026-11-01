/**
 * Regression Test Suite: Groq LLM Qualitative Scrutiny Findings Rendering & State Handling
 * 
 * Verifies:
 * 1. Database integrity of AICTE-2026-ADDI-964129 (cmvwhykwf0003ucj8uf9r28qq) and report cmvwi1q4x0037ucj8cwc3fe25.
 * 2. LLM findings preservation in PARTIAL_ANALYSIS status (3 real qualitative findings).
 * 3. Frontend page rendering logic for:
 *    - SUCCESS with findings -> Findings rendered
 *    - SUCCESS with 0 findings -> Emerald verified banner
 *    - PARTIAL_ANALYSIS with findings -> Amber banner + Retry button + Findings rendered
 *    - PARTIAL_ANALYSIS with 0 findings -> Amber incomplete banner + Retry button
 *    - TECHNICAL_FAILURE -> Red failure banner + Retry button
 *    - SKIPPED -> Amber skipped banner
 *    - DISABLED -> Slate disabled banner
 * 4. Autonomous agent proposed deficiency notice advisory observations contract.
 * 5. Verify no hardcoded mock bypasses.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('./node_modules/@prisma/client');

const prisma = new PrismaClient();

async function runTests() {
  console.log('================================================================');
  console.log('RUNNING GROQ QUALITATIVE SCRUTINY FINDINGS REGRESSION TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  // ─── TEST 1: Real Persisted Report for AICTE-2026-ADDI-964129 ────────────────
  await asyncTest('Test 1: Report cmvwi1q4x0037ucj8cwc3fe25 exists and contains PARTIAL_ANALYSIS metadata with 3 substantive findings', async () => {
    const report = await prisma.reviewReport.findUnique({
      where: { id: 'cmvwi1q4x0037ucj8cwc3fe25' }
    });
    assert(report, 'Report cmvwi1q4x0037ucj8cwc3fe25 must exist in database');
    assert.strictEqual(report.applicationId, 'cmvwhykwf0003ucj8uf9r28qq', 'Must match Additional Course application');
    assert.strictEqual(report.reportType, 'AI_SCRUTINY_PRE_CHECK', 'Report type must be AI_SCRUTINY_PRE_CHECK');

    const meta = JSON.parse(report.metadataJson);
    assert(meta, 'Metadata JSON must be valid');
    assert(['PARTIAL_ANALYSIS', 'SUCCESS'].includes(meta.llmAnalysis?.status), 'Status must be PARTIAL_ANALYSIS or SUCCESS');
    assert(meta.llmAnalysis?.findingsCount >= 3, 'Findings count in meta must be at least 3');
    assert(Array.isArray(meta.llmFindings), 'llmFindings must be an array');
    assert(meta.llmFindings.length >= 3, 'Must have at least 3 preserved substantive findings');
    
    // Check substantive content of findings
    const f1 = meta.llmFindings[0];
    assert.strictEqual(f1.finding_type, 'MISSING_SUPPORTING_EVIDENCE');
    assert(decodeURIComponent(f1.explanation).includes('Leetcode Pbm Statement.pdf'));
    assert(decodeURIComponent(f1.evidence_excerpt).includes('Leetcode Pbm No') || f1.evidence_excerpt.includes('Leetcode'));
  });

  // ─── TEST 2: Autonomous Agent Action contains Groq Advisory Observations ────
  await asyncTest('Test 2: Autonomous Agent Action for application contains Groq advisory observations in draft notice', async () => {
    // Check AI service actions endpoint
    const secret = 'aicte_agent_secret_prod_2026_x89f_secure_token';
    const res = await fetch('http://127.0.0.1:8000/api/v1/agent/applications/cmvwhykwf0003ucj8uf9r28qq/actions', {
      headers: { 'X-Service-Authorization': `Bearer ${secret}` }
    });
    assert.strictEqual(res.status, 200, 'AI agent service actions endpoint must return 200');
    const actions = await res.json();
    assert(actions.length > 0, 'Must have at least one agent action');
    
    const defAction = actions.slice().reverse().find(a => a.action_type === 'PROPOSE_DEFICIENCY_NOTICE');
    assert(defAction, 'Must have PROPOSE_DEFICIENCY_NOTICE action');
    const payload = defAction.input_payload;
    const advisoryObs = payload.draft_notice?.advisory_observations || payload.advisory_observations || [];
    assert(advisoryObs.length > 0, 'Advisory observations must be present in action payload');
    assert(advisoryObs.some(o => o.finding_type === 'MISSING_SUPPORTING_EVIDENCE'), 'Must contain MISSING_SUPPORTING_EVIDENCE advisory observation');
  });

  // ─── TEST 3: Frontend Page Code Verification: PARTIAL_ANALYSIS Handled ──────
  test('Test 3: Frontend page.jsx handles PARTIAL_ANALYSIS state distinctly with warning banner and retry button', () => {
    const pageContent = fs.readFileSync(path.join(__dirname, '../app/app/aicte/applications/[id]/page.jsx'), 'utf8');
    assert(pageContent.includes('aiMeta?.llmAnalysis?.status === "PARTIAL_ANALYSIS"'), 'Must have distinct check for PARTIAL_ANALYSIS');
    assert(pageContent.includes('Partial Qualitative Scrutiny'), 'Must render Partial Qualitative Scrutiny banner');
    assert(pageContent.includes('Retry Qualitative LLM Scrutiny'), 'Must render retry button');
    assert(pageContent.includes('handleTriggerAi({ forceRerun: true, retryLlm: true })'), 'Must trigger AI with retryLlm: true');
  });

  // ─── TEST 4: Frontend Page Code Verification: Findings Rendered in PARTIAL_ANALYSIS ──
  test('Test 4: Frontend page.jsx renders findings when status is SUCCESS OR PARTIAL_ANALYSIS', () => {
    const pageContent = fs.readFileSync(path.join(__dirname, '../app/app/aicte/applications/[id]/page.jsx'), 'utf8');
    assert(
      pageContent.includes('(aiMeta?.llmAnalysis?.status === "SUCCESS" || aiMeta?.llmAnalysis?.status === "PARTIAL_ANALYSIS")'),
      'Findings rendering container must accept both SUCCESS and PARTIAL_ANALYSIS'
    );
    assert(
      !pageContent.includes('{aiMeta?.llmAnalysis?.status === "SUCCESS" && (\n                          <div className="space-y-2">\n                            {(!aiMeta?.llmFindings'),
      'Old exclusive SUCCESS gate must not be present'
    );
  });

  // ─── TEST 5: Frontend Page Code Verification: Qualitative Summary Supported ─
  test('Test 5: Frontend page.jsx displays Qualitative Review Synthesis summary when present', () => {
    const pageContent = fs.readFileSync(path.join(__dirname, '../app/app/aicte/applications/[id]/page.jsx'), 'utf8');
    assert(pageContent.includes('Qualitative Review Synthesis'), 'Must display Qualitative Review Synthesis header');
    assert(pageContent.includes('aiMeta.llmAnalysis.summary'), 'Must display summary content');
  });

  // ─── TEST 6: Frontend Page Code Verification: TECHNICAL_FAILURE Banner ──────
  test('Test 6: Frontend page.jsx handles TECHNICAL_FAILURE with red alert and retry button', () => {
    const pageContent = fs.readFileSync(path.join(__dirname, '../app/app/aicte/applications/[id]/page.jsx'), 'utf8');
    assert(pageContent.includes('aiMeta?.llmAnalysis?.status === "TECHNICAL_FAILURE"'), 'Must check for TECHNICAL_FAILURE');
    assert(pageContent.includes('Qualitative Scrutiny Technical Failure'), 'Must render Technical Failure title');
  });

  // ─── TEST 7: Frontend Page Code Verification: SKIPPED Banner ────────────────
  test('Test 7: Frontend page.jsx handles SKIPPED state with advisory note', () => {
    const pageContent = fs.readFileSync(path.join(__dirname, '../app/app/aicte/applications/[id]/page.jsx'), 'utf8');
    assert(pageContent.includes('aiMeta?.llmAnalysis?.status === "SKIPPED"'), 'Must check for SKIPPED');
    assert(pageContent.includes('Qualitative LLM Scrutiny Skipped'), 'Must render Skipped title');
  });

  // ─── TEST 8: Frontend Page Code Verification: DISABLED Banner ───────────────
  test('Test 8: Frontend page.jsx handles DISABLED state cleanly', () => {
    const pageContent = fs.readFileSync(path.join(__dirname, '../app/app/aicte/applications/[id]/page.jsx'), 'utf8');
    assert(pageContent.includes('aiMeta?.llmAnalysis?.status === "DISABLED"'), 'Must check for DISABLED');
    assert(pageContent.includes('Qualitative Scrutiny Disabled'), 'Must render Disabled title');
  });

  // ─── TEST 9: AgentDeficiencyProposalCard Discretionary Review Gate ──────────
  test('Test 9: AgentDeficiencyProposalCard includes officer review checkboxes and textareas for Groq observations', () => {
    const pageContent = fs.readFileSync(path.join(__dirname, '../app/app/aicte/applications/[id]/page.jsx'), 'utf8');
    assert(pageContent.includes('Groq Qualitative Scrutiny Observations'), 'Must render Groq observations header in deficiency card');
    assert(pageContent.includes('Officer Discretion Gate'), 'Must display Officer Discretion Gate badge');
    assert(pageContent.includes('Included in Official Notice Draft'), 'Must display notice inclusion indicator');
    assert(pageContent.includes('Officer Editable Observation Text'), 'Must permit officer text editing');
  });

  // ─── TEST 10: No Fake or Hardcoded Mock Findings ────────────────────────────
  test('Test 10: Verify frontend contains no fake or hardcoded mock LLM findings', () => {
    const pageContent = fs.readFileSync(path.join(__dirname, '../app/app/aicte/applications/[id]/page.jsx'), 'utf8');
    assert(!pageContent.includes('mockFindings'), 'Must not contain mockFindings');
    assert(!pageContent.includes('fakeFindings'), 'Must not contain fakeFindings');
    assert(pageContent.includes('aiMeta.llmFindings.map'), 'Must dynamically map from authoritative aiMeta.llmFindings');
  });

  console.log('\n================================================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
  console.log('================================================================\n');

  await prisma.$disconnect();

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(async (e) => {
  console.error('Test runner fatal error:', e);
  await prisma.$disconnect();
  process.exit(1);
});

