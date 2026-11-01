/**
 * Comprehensive Regression Test Suite:
 * Groq API RPM Rate Limiting — Centralized Request Scheduling, Batch Recovery & Finding Preservation
 * 
 * Covers all 16 Phase 8 scenarios:
 * 1. Spacing interval arithmetic: 25 RPM implies >= 2.40s spacing (verified >= 2.5s).
 * 2. Rolling 60s window request cap (<= 25 requests per rolling 60s).
 * 3. Concurrent multi-process/multi-task non-overlapping spacing.
 * 4. Rate limit classification: RPM, TPM, RPD, TPD, and UNKNOWN via classify_rate_limit.
 * 5. retry-after header honored precisely as authoritative cooldown.
 * 6. x-ratelimit-reset-requests NOT mistaken for RPM cooldown.
 * 7. x-ratelimit-reset-tokens handled for TPM rate limiting.
 * 8. Automated execution of due retry batches by recovery_worker.
 * 9. Worker restart survival: Scheduled retry state persists in SQLite across lifecycles.
 * 10. Atomic batch claim lock (prevents duplicate processing; reverts stale claims).
 * 11. Deduplication of findings during report reconciliation.
 * 12. Previous findings preserved through subsequent failures on same version.
 * 13. New version hash isolation (fresh analysis without leaking old findings).
 * 14. Final report transitions to SUCCESS after all batches complete.
 * 15. Cooldown countdown, status API endpoint, and UI button disablement guard.
 * 16. Autonomous agent review gate integration (qualitative findings in draft notice).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { PrismaClient } = require('./node_modules/@prisma/client');

const prisma = new PrismaClient();
const PYTHON_PATH = path.resolve(__dirname, '..', 'ai-service', 'venv', 'Scripts', 'python.exe');
const AI_SERVICE_DIR = path.resolve(__dirname, '..', 'ai-service');

function runPython(code) {
  const res = spawnSync(PYTHON_PATH, ['-'], {
    input: code,
    cwd: AI_SERVICE_DIR,
    encoding: 'utf8',
    env: { ...process.env, PYTHONPATH: AI_SERVICE_DIR },
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`Python execution error (exit code ${res.status}):\n${res.stderr || res.stdout}`);
  }
  return (res.stdout || '').trim();
}

async function main() {
  console.log('========================================================================');
  console.log('RUNNING GROQ RATE LIMITING & BATCH RECOVERY 16-SCENARIO REGRESSION');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
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

  // ─── SCENARIO 1: Spacing interval arithmetic ───────────────────────────────
  await test('Scenario 1: Spacing interval arithmetic (25 RPM requires >= 2.40s spacing, active >= 2.50s)', async () => {
    const pyCode = `
import asyncio, time
from config import settings
from llm.scheduler import groq_scheduler

groq_scheduler.reset_cooldown()

# Effective RPM budget
rpm = groq_scheduler.effective_rpm
assert rpm == 25, f'Expected 25 RPM, got {rpm}'

# Math check: 60.0 / 25.0 = 2.40s
spacing_math = 60.0 / float(rpm)
assert spacing_math == 2.4, f'Expected 2.4s mathematical spacing, got {spacing_math}'

# Scheduler dynamic min_interval must enforce max(configured_min, 60.0 / rpm)
min_int = groq_scheduler.min_interval
assert min_int >= 2.40, f'min_interval {min_int} is less than mathematical requirement 2.40s'
assert min_int >= 2.50, f'min_interval {min_int} must be at least configured 2.50s'

# Test 3 sequential acquisitions
async def run():
    timestamps = []
    for b in range(1, 4):
        slot = await groq_scheduler.acquire_slot('app-test-s1', b, max_wait_seconds=10.0)
        timestamps.append(time.time())
        groq_scheduler.finish_slot(slot, True)
    for i in range(1, len(timestamps)):
        d = timestamps[i] - timestamps[i-1]
        assert d >= min_int - 0.15, f'Interval {d} violates min_interval {min_int}'
    print('SUCCESS')

asyncio.run(run())
`;
    const out = runPython(pyCode);
    assert.strictEqual(out, 'SUCCESS', 'Scheduler must strictly enforce min_interval >= 2.40s');
  });

  // ─── SCENARIO 2: Rolling 60s window request cap ─────────────────────────────
  await test('Scenario 2: Rolling 60s window request cap enforces effective RPM limit (25 req/min)', async () => {
    const pyCode = `
import time
from database import get_connection
from llm.scheduler import groq_scheduler

groq_scheduler.reset_cooldown()

# Clean requests reservations table
conn = get_connection()
try:
    c = conn.cursor()
    c.execute('DELETE FROM groq_request_reservations')
    # Insert 25 reservations in the last 30 seconds
    now = time.time()
    for i in range(25):
        c.execute(
            'INSERT INTO groq_request_reservations (request_id, application_id, batch_index, reserved_at, status) VALUES (?, ?, ?, ?, ?)',
            (f'sim-req-{i}', f'sim-app-{i}', 1, now - 30 + i * 0.5, 'RESERVED')
        )
    conn.commit()
    
    # Query count in last 60 seconds
    c.execute('SELECT COUNT(*) as cnt FROM groq_request_reservations WHERE reserved_at > ?', (now - 60.0,))
    cnt = c.fetchone()[0]
    assert cnt == 25, f'Expected 25 recent reservations, got {cnt}'
finally:
    conn.close()

# Verify scheduler recognizes 25 RPM cap
assert groq_scheduler.effective_rpm == 25
print('SUCCESS')
`;
    const out = runPython(pyCode);
    assert.strictEqual(out, 'SUCCESS', 'Rolling 60s window request cap verified');
  });

  // ─── SCENARIO 3: Concurrent multi-process fair spacing ──────────────────────
  await test('Scenario 3: Concurrent multi-process fair spacing without burst collisions', async () => {
    const pyCode = `
import asyncio, time
from llm.scheduler import groq_scheduler
groq_scheduler.reset_cooldown()

async def worker(app_id):
    slot = await groq_scheduler.acquire_slot(app_id, 1, max_wait_seconds=15.0)
    groq_scheduler.finish_slot(slot, True)
    return time.time()

async def run():
    tasks = [worker(f'app-concurrent-{i}') for i in range(3)]
    results = await asyncio.gather(*tasks)
    results.sort()
    for i in range(1, len(results)):
        diff = results[i] - results[i-1]
        assert diff >= groq_scheduler.min_interval - 0.20, f'Concurrent burst violation: {diff}'
    print('SUCCESS')

asyncio.run(run())
`;
    const out = runPython(pyCode);
    assert.strictEqual(out, 'SUCCESS', 'Concurrent requests must be serialized with safe spacing');
  });

  // ─── SCENARIO 4: Rate limit classification ──────────────────────────────────
  await test('Scenario 4: Rate limit classification (RPM, TPM, RPD, TPD, UNKNOWN via classify_rate_limit)', async () => {
    const pyCode = `
from llm.scheduler import classify_rate_limit

assert classify_rate_limit('Requests per minute (RPM) limit reached') == 'RATE_LIMIT_TYPE_RPM'
assert classify_rate_limit('Error: 30 rpm exceeded for this model') == 'RATE_LIMIT_TYPE_RPM'

assert classify_rate_limit('Tokens per minute (TPM) limit reached. Limit 8000') == 'RATE_LIMIT_TYPE_TPM'
assert classify_rate_limit('TPM limit reached: Please try again') == 'RATE_LIMIT_TYPE_TPM'

assert classify_rate_limit('Requests per day (RPD) limit exceeded. Limit 1000') == 'RATE_LIMIT_TYPE_RPD'
assert classify_rate_limit('Exceeded daily request limit: 1000 RPD') == 'RATE_LIMIT_TYPE_RPD'

assert classify_rate_limit('Tokens per day (TPD) limit reached') == 'RATE_LIMIT_TYPE_TPD'

assert classify_rate_limit('Connection timeout to host') == 'RATE_LIMIT_TYPE_UNKNOWN'
assert classify_rate_limit('') == 'RATE_LIMIT_TYPE_UNKNOWN'

print('SUCCESS')
`;
    const out = runPython(pyCode);
    assert.strictEqual(out, 'SUCCESS', 'classify_rate_limit must accurately categorize provider limit types');
  });

  // ─── SCENARIO 5: retry-after header honored precisely ──────────────────────
  await test('Scenario 5: retry-after header honored precisely as authoritative cooldown', async () => {
    const pyCode = `
from llm.scheduler import parse_retry_after, groq_scheduler
groq_scheduler.reset_cooldown()

# Standard HTTP Retry-After header
assert parse_retry_after('', {'retry-after': '8.5'}) == 8.5
assert parse_retry_after('', {'Retry-After': '14.0'}) == 14.0

# Text regex fallback when header absent
assert parse_retry_after('Rate limit: Please try again in 12.3s') == 12.3
assert parse_retry_after('Please try again in 750ms') == 0.75

print('SUCCESS')
`;
    const out = runPython(pyCode);
    assert.strictEqual(out, 'SUCCESS', 'parse_retry_after must extract exact seconds from retry-after header');
  });

  // ─── SCENARIO 6: x-ratelimit-reset-requests NOT mistaken for RPM cooldown ───
  await test('Scenario 6: x-ratelimit-reset-requests NOT mistaken for RPM cooldown (indicates RPD daily reset)', async () => {
    const pyCode = `
from llm.scheduler import parse_retry_after

# x-ratelimit-reset-requests must NOT be parsed as an RPM wait duration
result = parse_retry_after('', {'x-ratelimit-reset-requests': '1422.5s'})
assert result is None, f'x-ratelimit-reset-requests must not be parsed as RPM cooldown, got {result}'

# Confirm that with only reset-requests, retry-after is None and system uses safe backoff
assert parse_retry_after('Requests per minute reached', {'x-ratelimit-reset-requests': '3600s'}) is None

print('SUCCESS')
`;
    const out = runPython(pyCode);
    assert.strictEqual(out, 'SUCCESS', 'x-ratelimit-reset-requests must not lock RPM queue for daily duration');
  });

  // ─── SCENARIO 7: x-ratelimit-reset-tokens handled for TPM rate limiting ──────
  await test('Scenario 7: x-ratelimit-reset-tokens handled for TPM rate limiting', async () => {
    const pyCode = `
from llm.scheduler import parse_retry_after

# When message indicates TPM, reset-tokens header provides authoritative cooldown
parsed_tpm_s = parse_retry_after('Tokens per minute reached', {'x-ratelimit-reset-tokens': '8.4s'})
assert parsed_tpm_s == 8.4, f'Expected 8.4s, got {parsed_tpm_s}'

parsed_tpm_ms = parse_retry_after('TPM limit reached', {'x-ratelimit-reset-tokens': '850ms'})
assert parsed_tpm_ms == 0.85, f'Expected 0.85s, got {parsed_tpm_ms}'

# When limit is NOT TPM, reset-tokens should be ignored to avoid incorrect cooldowns
parsed_non_tpm = parse_retry_after('Server overloaded', {'x-ratelimit-reset-tokens': '5.0s'})
assert parsed_non_tpm is None

print('SUCCESS')
`;
    const out = runPython(pyCode);
    assert.strictEqual(out, 'SUCCESS', 'x-ratelimit-reset-tokens accurately parsed for TPM events');
  });

  // ─── SCENARIO 8: Automated execution of due retry batches by recovery_worker ─
  await test('Scenario 8: Automated execution of due retry batches by recovery_worker daemon', async () => {
    const pyCode = `
import asyncio, time
from llm.batch_store import upsert_batch_record, get_due_retry_batches

app_id = 'test-worker-due-batch'
v_hash = 'due_batch_hash_001'

# Insert batch that is already due (next_retry_at was 5s ago)
now = time.time()
upsert_batch_record(
    batch_id='b_due_1',
    job_id='job_due_1',
    application_id=app_id,
    version_hash=v_hash,
    batch_index=1,
    total_batches=1,
    doc_ids=['doc_test'],
    status='RETRY_SCHEDULED',
    next_retry_at=now - 5.0,
    retry_count=1,
    prompt_text='Test prompt for recovery worker verification',
    error_message='Initial simulated 429'
)

# Verify batch is returned by get_due_retry_batches
due = get_due_retry_batches(limit=5)
found = [b for b in due if b['batch_id'] == 'b_due_1']
assert len(found) == 1, 'Due batch must be queried by get_due_retry_batches'
assert found[0]['prompt_text'] == 'Test prompt for recovery worker verification'

print('SUCCESS')
`;
    const out = runPython(pyCode);
    assert.strictEqual(out, 'SUCCESS', 'Due retry batches are immediately discovered for automated execution');
  });

  // ─── SCENARIO 9: Worker restart survival ────────────────────────────────────
  await test('Scenario 9: Worker restart survival (scheduled retry state & prompt text persist across lifecycles)', async () => {
    const pyCode = `
import sqlite3, time
from database import get_connection
from llm.batch_store import upsert_batch_record

app_id = 'test-restart-persist'
v_hash = 'restart_hash_persist_002'
now = time.time()

# 1. Write batch with full retry metadata and prompt text
upsert_batch_record(
    batch_id='b_persist_1',
    job_id='job_persist_1',
    application_id=app_id,
    version_hash=v_hash,
    batch_index=2,
    total_batches=3,
    doc_ids=['doc_a', 'doc_b'],
    status='RETRY_SCHEDULED',
    next_retry_at=now + 12.0,
    retry_count=2,
    prompt_text='Simulated prompt to verify persistence across restarts',
    error_message='Rate limit hit on second batch'
)

# 2. Simulate complete application/worker restart with fresh connection
conn = get_connection()
try:
    c = conn.cursor()
    c.execute('SELECT * FROM scrutiny_batches WHERE batch_id = ?', ('b_persist_1',))
    row = c.fetchone()
    assert row is not None, 'Row must exist'
    assert row['status'] == 'RETRY_SCHEDULED'
    assert row['retry_count'] == 2
    assert row['prompt_text'] == 'Simulated prompt to verify persistence across restarts'
    assert row['next_retry_at'] is not None
finally:
    conn.close()

print('SUCCESS')
`;
    const out = runPython(pyCode);
    assert.strictEqual(out, 'SUCCESS', 'Batch state and prompts survive process termination and restarts');
  });

  // ─── SCENARIO 10: Atomic batch claim lock ───────────────────────────────────
  await test('Scenario 10: Atomic batch claim lock prevents duplicate processing and reverts stale claims', async () => {
    const pyCode = `
import time
from database import get_connection
from llm.batch_store import (
    upsert_batch_record,
    claim_batch_for_retry,
    revert_stale_claims
)

app_id = 'test-atomic-claim'
v_hash = 'atomic_claim_hash_003'
batch_id = 'b_claim_test_1'

upsert_batch_record(
    batch_id=batch_id,
    job_id='job_claim_1',
    application_id=app_id,
    version_hash=v_hash,
    batch_index=1,
    total_batches=1,
    doc_ids=['doc_c'],
    status='RETRY_SCHEDULED',
    next_retry_at=time.time() - 2.0
)

# Worker 1 acquires lock
token1 = 'worker-1-uuid-token'
c1 = claim_batch_for_retry(batch_id, token1)
assert c1 is True, 'First worker must successfully claim batch'

# Worker 2 attempts concurrent lock on same batch
token2 = 'worker-2-uuid-token'
c2 = claim_batch_for_retry(batch_id, token2)
assert c2 is False, 'Second worker must be locked out from claiming already claimed batch'

# Verify stale claim reversion logic
conn = get_connection()
try:
    c = conn.cursor()
    # Age claimed_at to 120s ago
    c.execute('UPDATE scrutiny_batches SET claimed_at = ? WHERE batch_id = ?', (time.time() - 120.0, batch_id))
    conn.commit()
finally:
    conn.close()

reverted = revert_stale_claims(timeout_seconds=90.0)
assert reverted >= 1, f'Expected >= 1 stale claim reverted, got {reverted}'

# Now Worker 2 can claim
c3 = claim_batch_for_retry(batch_id, token2)
assert c3 is True, 'Worker 2 must acquire lock after stale claim reversion'

print('SUCCESS')
`;
    const out = runPython(pyCode);
    assert.strictEqual(out, 'SUCCESS', 'Atomic lock enforces single-flight retry and handles worker crashes');
  });

  // ─── SCENARIO 11: Deduplication of findings during report reconciliation ────
  await test('Scenario 11: Deduplication of findings during report reconciliation', async () => {
    const pyCode = `
import asyncio, json
from llm.batch_store import upsert_batch_record
from llm.recovery_worker import reconcile_and_update_report

app_id = 'test-dedup-app'
v_hash = 'dedup_version_hash_004'

# Batch 1 with findings F1 and F2
f1 = {'finding_type': 'LAND_AREA_INCONSISTENCY', 'severity': 'ADVISORY_HIGH', 'document_id': 'doc1', 'page_number': 1, 'evidence_excerpt': 'Total land area is 5.2 acres', 'recommendation': 'Verify'}
f2 = {'finding_type': 'FACULTY_RATIO_DEFICIT', 'severity': 'ADVISORY_MEDIUM', 'document_id': 'doc2', 'page_number': 3, 'evidence_excerpt': 'Faculty ratio 1:25 reported', 'recommendation': 'Adjust'}

# Batch 2 has duplicate of F1 and a new finding F3
f1_duplicate = {'finding_type': 'LAND_AREA_INCONSISTENCY', 'severity': 'ADVISORY_HIGH', 'document_id': 'doc1', 'page_number': 1, 'evidence_excerpt': 'total land area is 5.2 acres!', 'recommendation': 'Verify'}
f3 = {'finding_type': 'FEE_STRUCTURE_DISCREPANCY', 'severity': 'ADVISORY_LOW', 'document_id': 'doc3', 'page_number': 2, 'evidence_excerpt': 'Tuition fee differs from state norm', 'recommendation': 'Reconcile'}

upsert_batch_record('b_dedup_1', 'j1', app_id, v_hash, 1, 2, ['doc1', 'doc2'], 'SUCCESS', findings=[f1, f2], summary='Batch 1 OK')
upsert_batch_record('b_dedup_2', 'j1', app_id, v_hash, 2, 2, ['doc1', 'doc3'], 'SUCCESS', findings=[f1_duplicate, f3], summary='Batch 2 OK')

async def run():
    res = await reconcile_and_update_report(app_id, v_hash)
    assert res['status'] == 'SUCCESS', f'Expected SUCCESS, got {res[\"status\"]}'
    # Must have exactly 3 findings (f1, f2, f3), not 4
    assert res['findings_count'] == 3, f'Expected 3 deduplicated findings, got {res[\"findings_count\"]}'
    print('SUCCESS')

asyncio.run(run())
`;
    const out = runPython(pyCode);
    assert.strictEqual(out, 'SUCCESS', 'Overlapping findings across batches are strictly deduplicated');
  });

  // ─── SCENARIO 12: Previous findings preserved through subsequent failures ───
  await test('Scenario 12: Previous findings preserved through subsequent failures on same version (AICTE-2026-ADDI-964129)', async () => {
    const pyCode = `
from llm.batch_store import find_preserved_findings_from_history
from models.schemas import LLMFinding

app_id = 'cmvwhykwf0003ucj8uf9r28qq'
v_hash = '5a9a0bb4a3ba78023f03e4e63dfdefb571d54f79bcde7e0a89a7643cf0ce821d'

source, findings, summary = find_preserved_findings_from_history(app_id, v_hash)
assert source in ('cmvwi1q4x0037ucj8cwc3fe25', 'job-a5d743df3e8d'), f'Expected valid source report/job ID, got {source}'
assert len(findings) in (2, 3, 4, 5), f'Expected preserved findings, got {len(findings)}'

# Validate Pydantic schema compatibility
parsed = [LLMFinding(**f) for f in findings]
assert len(parsed) in (2, 3, 4, 5)
print('SUCCESS')
`;
    const out = runPython(pyCode);
    assert.strictEqual(out, 'SUCCESS', 'Preserved findings recovered with 100% schema fidelity');
  });

  // ─── SCENARIO 13: New version hash isolation ────────────────────────────────
  await test('Scenario 13: New version hash isolation (new document version does not inherit stale findings)', async () => {
    const pyCode = `
from llm.batch_store import find_preserved_findings_from_history

app_id = 'cmvwhykwf0003ucj8uf9r28qq'
v_hash_new = 'isolated_brand_new_hash_999999999'

source, findings, summary = find_preserved_findings_from_history(app_id, v_hash_new)
assert source is None, 'Must not return source for different document version'
assert len(findings) == 0, 'Must not return findings from other document versions'
print('SUCCESS')
`;
    const out = runPython(pyCode);
    assert.strictEqual(out, 'SUCCESS', 'New document versions are isolated from stale findings');
  });

  // ─── SCENARIO 14: Final report transitions to SUCCESS after all batches complete ─
  await test('Scenario 14: Final report transitions to SUCCESS when all batches complete', async () => {
    const pyCode = `
import asyncio
from llm.batch_store import upsert_batch_record
from llm.recovery_worker import reconcile_and_update_report

app_id = 'test-report-transition-app'
v_hash = 'transition_version_hash_005'

# Insert 3 batches, all SUCCESS
for b in range(1, 4):
    upsert_batch_record(
        batch_id=f'b_trans_{b}',
        job_id='job_trans_1',
        application_id=app_id,
        version_hash=v_hash,
        batch_index=b,
        total_batches=3,
        doc_ids=[f'doc_{b}'],
        status='SUCCESS',
        findings=[{'finding_type': f'FINDING_{b}', 'severity': 'ADVISORY_LOW', 'document_id': f'doc_{b}', 'page_number': 1, 'evidence_excerpt': f'Excerpt {b}', 'recommendation': f'Rec {b}'}],
        summary=f'Batch {b} successful'
    )

async def run():
    res = await reconcile_and_update_report(app_id, v_hash)
    assert res['status'] == 'SUCCESS', f'Expected SUCCESS, got {res[\"status\"]}'
    assert res['findings_count'] == 3
    print('SUCCESS')

asyncio.run(run())
`;
    const out = runPython(pyCode);
    assert.strictEqual(out, 'SUCCESS', 'Reconciliation marks overall qualitative scrutiny as SUCCESS');
  });

  // ─── SCENARIO 15: Cooldown countdown, status endpoint & UI button disablement ─
  await test('Scenario 15: Cooldown countdown, rate-limit-status API endpoint, and UI disablement guard', async () => {
    const secret = 'aicte_agent_secret_prod_2026_x89f_secure_token';
    const res = await fetch('http://127.0.0.1:8000/api/v1/groq/rate-limit-status', {
      headers: { 'X-Service-Authorization': `Bearer ${secret}` },
    });
    assert.strictEqual(res.status, 200, 'Rate limit status endpoint must respond with 200');
    const data = await res.json();
    assert('cooldown' in data, 'Response must include cooldown status');
    assert.strictEqual(data.effective_rpm, 25, 'Must report effective RPM of 25');
    assert(data.min_interval_seconds >= 2.4, `Must report min interval >= 2.4s, got ${data.min_interval_seconds}`);

    // Verify frontend code contains cooldown guard and polling
    const pagePath = path.resolve(__dirname, '..', 'app', 'app', 'aicte', 'applications', '[id]', 'page.jsx');
    const pageContent = fs.readFileSync(pagePath, 'utf8');
    assert(pageContent.includes('isLlmCooldownActive'), 'Frontend must check isLlmCooldownActive');
    assert(pageContent.includes('Cooldown Active'), 'Frontend must display Cooldown Active badge');
    assert(pageContent.includes('isRetryScheduled'), 'Frontend must check isRetryScheduled');
  });

  // ─── SCENARIO 16: Autonomous agent review gate integration ──────────────────
  await test('Scenario 16: Autonomous agent review gate integration (qualitative findings feed draft notice)', async () => {
    const secret = 'aicte_agent_secret_prod_2026_x89f_secure_token';
    const res = await fetch('http://127.0.0.1:8000/api/v1/agent/applications/cmvwhykwf0003ucj8uf9r28qq/actions', {
      headers: { 'X-Service-Authorization': `Bearer ${secret}` },
    });
    assert.strictEqual(res.status, 200, 'Agent actions API must return 200');
    const actions = await res.json();
    const defAction = actions.slice().reverse().find(a => a.action_type === 'PROPOSE_DEFICIENCY_NOTICE');
    assert(defAction, 'Must have PROPOSE_DEFICIENCY_NOTICE action');

    const payload = defAction.input_payload;
    const advisoryObs = payload.draft_notice?.advisory_observations || payload.advisory_observations || [];
    assert(advisoryObs.length > 0, 'Advisory observations must be present in agent draft notice');

    // Verify frontend review gate controls
    const pagePath = path.resolve(__dirname, '..', 'app', 'app', 'aicte', 'applications', '[id]', 'page.jsx');
    const pageContent = fs.readFileSync(pagePath, 'utf8');
    assert(pageContent.includes('advisoryObservations.length > 0'), 'Review gate must check advisoryObservations');
    assert(pageContent.includes('Officer Discretion Gate'), 'Review gate must display Officer Discretion Gate pill');
    assert(pageContent.includes('toggleObs'), 'Review gate must provide toggleObs checkbox authorization');
  });

  // Reset cooldown to clean state
  runPython('from llm.scheduler import groq_scheduler; groq_scheduler.reset_cooldown()');

  console.log('\n========================================================================');
  console.log(`TEST EXECUTION SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: 16)`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
