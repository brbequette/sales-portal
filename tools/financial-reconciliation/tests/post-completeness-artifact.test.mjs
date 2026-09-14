import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const { buildArtifactHashManifest } = await import('../reconciliation-engine.mjs');
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'artifact-hash-'));
try {
  const names = ['reconciliation-summary.json','ready-forward-payload.json','ready-rollback-snapshot.json','unresolved-cost-report.json','uncertain-classification-report.json','payload-review.json','vig-audit.json','redaction-audit.json'];
  for (const name of names) await fs.writeFile(path.join(dir, name), '{}');
  const manifest = await buildArtifactHashManifest(dir);
  assert.equal(Object.keys(manifest).length, names.length);
  await fs.rm(path.join(dir, 'redaction-audit.json'));
  await fs.mkdir(path.join(dir, 'redaction-audit.json'));
  await assert.rejects(() => buildArtifactHashManifest(dir), /MANIFEST_REQUIRED_FILE_MISSING:redaction-audit\.json/);
  console.log('POST_COMPLETENESS_ARTIFACT=PASS');
} finally { await fs.rm(dir, { recursive: true, force: true }); }
