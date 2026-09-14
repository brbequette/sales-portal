import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { RECONCILIATION_ARTIFACT_FILES, validateReconciliationArtifactPackage } from '../../src/lib/reconciliation-artifact-contract.ts';

const runDir = process.argv[2];
const outputDir = process.argv[3] || path.join(path.dirname(runDir || process.cwd()), 'registration-packages');
if (!runDir) throw new Error('RUN_DIRECTORY_REQUIRED');
const files = {};
for (const name of RECONCILIATION_ARTIFACT_FILES) files[name] = await fs.readFile(path.join(runDir, name), 'utf8');
const manifest = JSON.parse(files['sha256-manifest.json']);
for (const name of RECONCILIATION_ARTIFACT_FILES.filter(file => file !== 'sha256-manifest.json')) {
  const actual = crypto.createHash('sha256').update(files[name]).digest('hex');
  if (manifest?.[name] !== actual) throw new Error('MANIFEST_HASH_MISMATCH');
}
const parsed = Object.fromEntries(Object.entries(files).map(([name, value]) => [name, JSON.parse(value)]));
const validation = validateReconciliationArtifactPackage(files);
const packageJson = JSON.stringify({ format: 'reconciliation-artifact-registration-v1', files });
const compressed = gzipSync(Buffer.from(packageJson), { level: 9, mtime: 0 });
await fs.mkdir(outputDir, { recursive: true });
const output = path.join(outputDir, `${validation.fingerprint}.reconciliation-artifact.json.gz`);
await fs.writeFile(output, compressed, { flag: 'wx' }).catch(async error => { if (error.code === 'EEXIST') { const existing = await fs.readFile(output); if (!existing.equals(compressed)) throw new Error('PACKAGE_FINGERPRINT_COLLISION'); return; } throw error; });
const summary = parsed['reconciliation-summary.json'];
console.log(JSON.stringify({ packagePath: output, fingerprint: validation.fingerprint, fileCount: RECONCILIATION_ARTIFACT_FILES.length, readyCount: validation.readyCount, blockedCount: validation.blockedCount, status: summary.status }));
