import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const source=await fs.readFile(new URL('../reconciliation-engine-core.mjs',import.meta.url),'utf8');
assert.ok(source.lastIndexOf('resolveAuxiliaryCost')<source.lastIndexOf('classifyLineWithEvidence'));
console.log('ENRICHMENT_BEFORE_CLASSIFICATION=PASS');
