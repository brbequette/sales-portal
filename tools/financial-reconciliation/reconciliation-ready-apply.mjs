import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
const freeze = value => Object.freeze(value);
const asArray = value => Array.isArray(value) ? value : Array.isArray(value?.documents) ? value.documents : [];
const identity = item => `${item.documentType ?? item.type ?? ''}:${item.documentId ?? item.zohoId ?? ''}`;
const fieldMap = fields => new Map((Array.isArray(fields) ? fields : []).map(field => [field.apiName, field.value]));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export const APPLY_LIMITS = freeze({ canary: 10, batch: 25, retries: 3 });

function requireFile(files, name) {
  if (!files[name]) throw new Error(`APPLY_ARTIFACT_MISSING:${name}`);
  return files[name];
}

export function validateReadyApplyArtifacts({ summary, forward, rollback, payloadReview, unresolved, uncertain, expectedCount = 5365, allowlist }) {
  if (summary?.dryRunComplete !== true || summary?.status !== 'COMPLETE_WITH_BLOCKERS') throw new Error('APPLY_DRY_RUN_STATUS_INVALID');
  if (summary?.readyPayloadIsolation !== true || summary?.blockedDocumentExclusion !== true) throw new Error('APPLY_ISOLATION_MARKERS_INVALID');
  if (payloadReview?.pass !== true) throw new Error('APPLY_PAYLOAD_REVIEW_REQUIRED');
  const ready = asArray(forward); const restored = asArray(rollback);
  if (ready.length !== expectedCount || restored.length !== expectedCount) throw new Error('APPLY_ELIGIBLE_COUNT_MISMATCH');
  const readyKeys = new Set(); const rollbackKeys = new Set();
  for (const item of ready) {
    const key = identity(item); if (!item.documentId && !item.zohoId) throw new Error('APPLY_IDENTITY_MISSING');
    if (readyKeys.has(key)) throw new Error('APPLY_DUPLICATE_READY_ID'); readyKeys.add(key);
    if (!Array.isArray(item.customFields) || item.customFields.length === 0) throw new Error('APPLY_EMPTY_CUSTOM_FIELDS');
    for (const field of item.customFields) {
      if (!field?.apiName || !allowlist.has(field.apiName)) throw new Error('APPLY_FORBIDDEN_FIELD');
    }
  }
  for (const item of restored) {
    const key = identity(item); if (rollbackKeys.has(key)) throw new Error('APPLY_DUPLICATE_ROLLBACK_ID'); rollbackKeys.add(key);
  }
  for (const key of readyKeys) if (!rollbackKeys.has(key)) throw new Error('APPLY_ROLLBACK_PAIRING_MISMATCH');
  for (const key of rollbackKeys) if (!readyKeys.has(key)) throw new Error('APPLY_ROLLBACK_PAIRING_MISMATCH');
  const blocked = new Set([...asArray(unresolved?.documents), ...asArray(uncertain?.documents)].map(identity));
  for (const key of readyKeys) if (blocked.has(key)) throw new Error('APPLY_BLOCKED_DOCUMENT_OVERLAP');
  return freeze({ eligible: ready, rollback: restored, count: ready.length });
}

export async function loadReadyApplyArtifacts({ outputDir, allowlist, expectedCount = 5365 }) {
  const read = async name => JSON.parse(await fs.readFile(path.join(outputDir, name), 'utf8'));
  const files = {
    summary: await read('reconciliation-summary.json'),
    forward: await read('ready-forward-payload.json'),
    rollback: await read('ready-rollback-snapshot.json'),
    payloadReview: await read('payload-review.json'),
    unresolved: await read('unresolved-cost-report.json'),
    uncertain: await read('uncertain-classification-report.json')
  };
  return validateReadyApplyArtifacts({ ...files, allowlist, expectedCount });
}

function sanitizeAudit(entry) {
  return freeze({ documentRef: sha(identity(entry.item)), documentType: entry.item.documentType ?? entry.item.type ?? '', status: entry.status, attemptCount: entry.attemptCount, reason: entry.reason });
}

async function atomicWrite(file, value) {
  const temp = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2));
  await fs.rename(temp, file);
}

export async function executeReadyApply({ plan, client, outputDir, mode, allowlist, checkpointPath, canaryVerificationPath = null, authorization = false, expectedOrganizationId = null }) {
  if (!authorization) throw new Error('APPLY_EXPLICIT_AUTHORIZATION_REQUIRED');
  if (!client || typeof client.read !== 'function' || typeof client.update !== 'function') throw new Error('APPLY_CLIENT_REQUIRED');
  if (mode === 'resume') {
    if (!canaryVerificationPath) throw new Error('APPLY_CANARY_VERIFICATION_REQUIRED');
    const verification = JSON.parse(await fs.readFile(canaryVerificationPath, 'utf8'));
    if (verification.status !== 'PASS' || verification.mode !== 'canary') throw new Error('APPLY_CANARY_VERIFICATION_INVALID');
  }
  const limit = mode === 'canary' ? APPLY_LIMITS.canary : APPLY_LIMITS.batch;
  const items = [...plan.eligible].sort((a, b) => identity(a).localeCompare(identity(b))).slice(0, limit);
  if (mode === 'canary' && items.length > APPLY_LIMITS.canary) throw new Error('APPLY_CANARY_LIMIT');
  const rollbackById = new Map(plan.rollback.map(item => [identity(item), item]));
  if (expectedOrganizationId !== null && client.organizationId !== expectedOrganizationId) throw new Error('ORGANIZATION_MISMATCH');
  let prior = { attempted: [], verified: [] };
  if (mode === 'resume') { try { prior = JSON.parse(await fs.readFile(checkpointPath, 'utf8')); } catch { prior = { attempted: [], verified: [] }; } }
  const checkpoint = { mode, attempted: [...(prior.attempted || [])], verified: [...(prior.verified || [])], status: 'RUNNING' };
  const audit = [];
  for (const item of items) {
    const key = identity(item); if (mode === 'resume' && checkpoint.verified.includes(key)) continue;
    const before = rollbackById.get(key);
    if (!before) throw new Error('APPLY_ROLLBACK_RECORD_MISSING');
    const current = await client.read(item);
    if (!equal(current.customFields, before.customFields)) { audit.push(sanitizeAudit({ item, status: 'SKIPPED', attemptCount: 1, reason: 'STALE_SOURCE' })); checkpoint.attempted.push(key); await atomicWrite(checkpointPath, checkpoint); continue; }
    const fields = item.customFields;
    if (fields.some(field => !allowlist.has(field.apiName))) throw new Error('APPLY_FORBIDDEN_FIELD');
    let verified = false; let lastError = 'WRITE_FAILED';
    for (let attempt = 1; attempt <= APPLY_LIMITS.retries; attempt++) {
      try { await client.update(item, fields); const after = await client.read(item); if (!equal(after.customFields, fields)) throw new Error('READBACK_MISMATCH'); verified = true; audit.push(sanitizeAudit({ item, status: 'VERIFIED', attemptCount: attempt, reason: 'VERIFIED' })); break; }
      catch (error) { lastError = error?.code === 'RATE_LIMIT' ? 'RATE_LIMIT_RETRY' : error?.message === 'READBACK_MISMATCH' ? 'READBACK_MISMATCH' : 'WRITE_FAILED'; if (attempt < APPLY_LIMITS.retries) await new Promise(resolve => setTimeout(resolve, 10 * attempt)); }
    }
    checkpoint.attempted.push(key); if (verified) checkpoint.verified.push(key); await atomicWrite(checkpointPath, checkpoint);
    if (!verified) { audit.push(sanitizeAudit({ item, status: 'FAILED', attemptCount: APPLY_LIMITS.retries, reason: lastError })); break; }
  }
  checkpoint.status = 'COMPLETE'; await atomicWrite(checkpointPath, checkpoint);
  const report = freeze({ mode, attempted: audit.length, verified: audit.filter(x => x.status === 'VERIFIED').length, skippedStale: audit.filter(x => x.reason === 'STALE_SOURCE').length, failed: audit.filter(x => x.status === 'FAILED').length, audit });
  await atomicWrite(path.join(outputDir, 'apply-audit.json'), report);
  await atomicWrite(path.join(outputDir, 'verified-rollback-manifest.json'), freeze({ documents: audit.filter(x => x.status === 'VERIFIED').map(x => x.documentRef), count: report.verified, rollbackExecuted: false }));
  return report;
}

export function assertApplyDisabled({ apply = false } = {}) { if (apply) throw new Error('APPLY_REMAINS_DISABLED'); return true; }

export async function loadApplyManifest({ outputDir, allowlist, expectedCount = 5365 }) {
  const manifest = await readJson(path.join(outputDir, 'ready-forward-payload.json'));
  const rollback = await readJson(path.join(outputDir, 'ready-rollback-snapshot.json'));
  const review = await readJson(path.join(outputDir, 'payload-review.json'));
  return validateReadyApplyArtifacts({ summary: await readJson(path.join(outputDir, 'reconciliation-summary.json')), forward: manifest, rollback, payloadReview: review, unresolved: await readJson(path.join(outputDir, 'unresolved-cost-report.json')), uncertain: await readJson(path.join(outputDir, 'uncertain-classification-report.json')), allowlist, expectedCount });
}
async function readJson(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }

if (process.argv[1] && process.argv[1].endsWith('reconciliation-ready-apply.mjs')) {
  const mode = process.argv[process.argv.indexOf('--mode') + 1];
  const manifestPath = process.argv[process.argv.indexOf('--manifest') + 1];
  if (!['canary', 'resume'].includes(mode) || !manifestPath) { console.error('APPLY_MANIFEST_REQUIRED'); process.exit(2); }
  if (process.env.RECONCILIATION_APPLY_AUTHORIZED !== '1') { console.error('APPLY_EXPLICIT_AUTHORIZATION_REQUIRED'); process.exit(2); }
  console.error('APPLY_CLIENT_REQUIRED'); process.exit(2);
}
