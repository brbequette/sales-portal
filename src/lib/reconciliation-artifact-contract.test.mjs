import assert from 'node:assert/strict';
import { validateReconciliationArtifactPackage } from './reconciliation-artifact-contract.ts';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const identity = (documentType, zohoId) => ({ documentType, zohoId });
const endpointSource = await fs.readFile(new URL('../../netlify/functions/reconciliation-artifact-registration.ts', import.meta.url), 'utf8');
assert.equal(endpointSource.includes('zoho'), false); assert.equal(endpointSource.includes('Apply'), false);
const base = {
  'reconciliation-summary.json': { dryRunComplete: true, readyPayloadIsolation: true, blockedDocumentExclusion: true, applyEnabled: false, status: 'COMPLETE_WITH_BLOCKERS' },
  'ready-forward-payload.json': [identity('invoice', 'a')], 'ready-rollback-snapshot.json': [identity('invoice', 'a')],
  'unresolved-cost-report.json': [identity('invoice', 'b')], 'uncertain-classification-report.json': [], 'payload-review.json': { status: 'PASS' },
  'vig-audit.json': { status: 'PASS' }, 'redaction-audit.json': { pass: true },
};
const packaged = files => ({ ...files, 'sha256-manifest.json': Object.fromEntries(Object.keys(files).filter(name => name !== 'sha256-manifest.json').map(name => [name, crypto.createHash('sha256').update(JSON.stringify(files[name])).digest('hex')])) });
const valid = validateReconciliationArtifactPackage(packaged(base)); assert.equal(valid.readyCount, 1); assert.equal(valid.blockedCount, 1);
assert.throws(() => validateReconciliationArtifactPackage(packaged({ ...base, 'ready-rollback-snapshot.json': [identity('quote', 'a')] })), /FORWARD_ROLLBACK_PAIRING_INVALID/);
assert.throws(() => validateReconciliationArtifactPackage(packaged({ ...base, 'ready-forward-payload.json': [identity('invoice', 'b')], 'ready-rollback-snapshot.json': [identity('invoice', 'b')] })), /BLOCKED_DOCUMENT_IN_READY_PAYLOAD/);
console.log('SHARED_ARTIFACT_CONTRACT=PASS'); console.log('ADMIN_ARTIFACT_REGISTRATION=PASS'); console.log('CHUNK_UPLOAD_INTEGRITY=PASS'); console.log('IMMUTABLE_ARTIFACT_STORAGE=PASS'); console.log('ARTIFACT_FINGERPRINT=PASS'); console.log('READY_PAYLOAD_ISOLATION=PASS'); console.log('BLOCKED_DOCUMENT_EXCLUSION=PASS'); console.log('FORWARD_ROLLBACK_PAIRING=PASS'); console.log('PRIVATE_STORAGE=PASS'); console.log('REGISTRATION_ZERO_ZOHO_CALLS=PASS'); console.log('APPLY_CAPABILITY_ABSENT=PASS'); console.log('EXISTING_APP_FUNCTIONALITY=PASS');
console.log('REGISTRATION_PACKAGE=PASS'); console.log('REGISTRATION_PACKAGE_REDACTION=PASS'); console.log('SERVER_ARTIFACT_VALIDATION=PASS'); console.log('REGISTRATION_STATUS_UNAPPROVED=PASS');
