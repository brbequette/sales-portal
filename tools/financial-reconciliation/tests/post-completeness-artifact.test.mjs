import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const { buildArtifactHashManifest } = await import('../reconciliation-engine.mjs');
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'artifact-hash-'));
try {
  await fs.writeFile(path.join(dir, 'valid.json'), '{}');
  const manifest = await buildArtifactHashManifest(dir);
  assert.ok(manifest['valid.json']);
  await fs.mkdir(path.join(dir, 'zip-directory'));
  await assert.rejects(() => buildArtifactHashManifest(dir), /ARTIFACT_NOT_FILE category=DIRECTORY_WHERE_FILE_EXPECTED name=zip-directory/);
  console.log('POST_COMPLETENESS_ARTIFACT=PASS');
} finally { await fs.rm(dir, { recursive: true, force: true }); }
