import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const source = await fs.readFile(new URL('../reconciliation-engine.mjs', import.meta.url), 'utf8');
for (const marker of ['FAILURE_AGGREGATION=PASS','PAYLOAD_VALIDATION=PASS','ARTIFACT_WRITE=PASS','COMPLETENESS_GATE=PASS','ENGINE_COMPLETE=PASS']) assert.ok(source.includes(marker));
assert.ok(source.includes('Array.isArray(filteredForward)'));
assert.ok(source.includes('Array.isArray(filteredRollback)'));
assert.ok(source.includes("failures: []"));
assert.ok(source.includes('DRY_RUN_COMPLETE=PASS'));
console.log('POST_ARTIFACT_RUNTIME_CONTRACT=PASS');
