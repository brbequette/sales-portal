import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

// The manifest covers exactly these files; sha256-manifest.json is deliberately
// excluded to avoid recursive hashing.
export const REGISTRATION_ARTIFACT_FILES = Object.freeze([
  'reconciliation-summary.json',
  'ready-forward-payload.json',
  'ready-rollback-snapshot.json',
  'unresolved-cost-report.json',
  'uncertain-classification-report.json',
  'payload-review.json',
  'vig-audit.json',
  'redaction-audit.json'
]);

export const sha256Hex = value => crypto.createHash('sha256').update(value).digest('hex');
export const isFullSha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export async function buildSha256Manifest(directory) {
  const manifest = {};
  for (const name of REGISTRATION_ARTIFACT_FILES) {
    if (name.includes('/') || name.includes('\\')) throw new Error('MANIFEST_PATH_INVALID');
    const filePath = path.join(directory, name);
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat?.isFile()) throw new Error(`MANIFEST_REQUIRED_FILE_MISSING:${name}`);
    manifest[name] = sha256Hex(await fs.readFile(filePath));
  }
  return Object.freeze(manifest);
}

export function canonicalPackageFingerprint(manifest, format = 'reconciliation-artifact-registration-v1') {
  const names = Object.keys(manifest).sort();
  if (names.length !== REGISTRATION_ARTIFACT_FILES.length || names.some(name => !REGISTRATION_ARTIFACT_FILES.includes(name))) throw new Error('MANIFEST_FILE_SET_INVALID');
  if (new Set(names).size !== names.length || names.some(name => !isFullSha256(manifest[name]))) throw new Error('MANIFEST_INVALID');
  const canonical = JSON.stringify({ format, manifest: Object.fromEntries(names.map(name => [name, manifest[name]])) });
  return sha256Hex(Buffer.from(canonical, 'utf8'));
}
