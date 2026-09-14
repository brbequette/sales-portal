import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildSha256Manifest, canonicalPackageFingerprint, REGISTRATION_ARTIFACT_FILES, isFullSha256 } from '../reconciliation-manifest.mjs';
const { validateReconciliationArtifactPackage } = await import('../../../src/lib/reconciliation-artifact-contract.ts');

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'manifest-contract-'));
try {
  for (const name of REGISTRATION_ARTIFACT_FILES) await fs.writeFile(path.join(dir, name), JSON.stringify({ safe: true }));
  const manifest = await buildSha256Manifest(dir);
  assert.equal(Object.keys(manifest).length, REGISTRATION_ARTIFACT_FILES.length);
  assert.ok(Object.values(manifest).every(isFullSha256));
  assert.deepEqual(manifest, await buildSha256Manifest(dir));
  const fingerprint = canonicalPackageFingerprint(manifest);
  await fs.writeFile(path.join(dir, REGISTRATION_ARTIFACT_FILES[0]), JSON.stringify({ safe: false }));
  const changed = await buildSha256Manifest(dir);
  assert.notEqual(changed[REGISTRATION_ARTIFACT_FILES[0]], manifest[REGISTRATION_ARTIFACT_FILES[0]]);
  assert.notEqual(canonicalPackageFingerprint(changed), fingerprint);
  const files = {};
  for (const name of REGISTRATION_ARTIFACT_FILES) files[name] = await fs.readFile(path.join(dir, name), 'utf8');
  const current = await buildSha256Manifest(dir);
  files['sha256-manifest.json'] = JSON.stringify(current);
  assert.throws(() => validateReconciliationArtifactPackage({ ...files, 'unknown.json': '{}' }), /ARTIFACT_FILE_SET_INVALID/);
  const truncated = { ...files, 'sha256-manifest.json': JSON.stringify({ ...current, [REGISTRATION_ARTIFACT_FILES[0]]: current[REGISTRATION_ARTIFACT_FILES[0]].slice(0, 16) }) };
  assert.throws(() => validateReconciliationArtifactPackage(truncated), /MANIFEST_INVALID/);
  const upper = { ...files, 'sha256-manifest.json': JSON.stringify({ ...current, [REGISTRATION_ARTIFACT_FILES[0]]: current[REGISTRATION_ARTIFACT_FILES[0]].toUpperCase() }) };
  assert.throws(() => validateReconciliationArtifactPackage(upper), /MANIFEST_INVALID/);
  console.log('FULL_SHA256_MANIFEST=PASS');
  console.log('CANONICAL_SHA256_MANIFEST=PASS');
  console.log('MANIFEST_PRODUCER_CONSUMER_PARITY=PASS');
  console.log('ARTIFACT_FINGERPRINT=PASS');
} finally { await fs.rm(dir, { recursive: true, force: true }); }
