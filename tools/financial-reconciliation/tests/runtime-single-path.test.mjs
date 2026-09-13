import assert from 'node:assert/strict';
import fs from 'node:fs';
const engine = fs.readFileSync(new URL('../reconciliation-engine.mjs', import.meta.url), 'utf8');
assert.equal((engine.match(/runReconciliationCore\s*\(/g) || []).length, 1);
assert.doesNotMatch(engine, /buildLegacyDocumentResult/);
assert.match(engine, /writeRuntimeArtifacts\s*\(/);
const afterCore = engine.slice(engine.indexOf('const runtimeArtifacts = await writeRuntimeArtifacts'));
assert.doesNotMatch(afterCore, /calculateDocument\s*\(/);
console.log('SINGLE_RUNTIME_CALCULATION_PATH=PASS');
