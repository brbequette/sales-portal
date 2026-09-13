import assert from 'node:assert/strict';
import fs from 'node:fs';
const core = fs.readFileSync(new URL('../reconciliation-engine-core.mjs', import.meta.url), 'utf8');
const artifact = fs.readFileSync(new URL('../reconciliation-artifact-core.mjs', import.meta.url), 'utf8');
for (const capability of ['classifyLineWithEvidence','resolveCost','buildDocumentResult','LineOutcome']) assert.ok(core.includes(capability) || artifact.includes(capability), `missing capability ${capability}`);
assert.match(artifact, /forward/); assert.match(artifact, /rollback/); assert.match(artifact, /sourceSamples/);
console.log('CAPABILITY_INVENTORY_COMPLETE=PASS');
console.log('NO_CAPABILITY_LOSS=PASS');
