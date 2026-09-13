import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { LEGACY_CONTEXT_DEPENDENCY_MAP } from '../reconciliation-calculation-context.mjs';
const source=await fs.readFile(new URL('../reconciliation-engine.mjs',import.meta.url),'utf8');
const deps=['buildAuthoritativeVigInput','buildVigTimeline','buildRuntimeVigContract','calculateDocument','commissionPct','payments','additionalCosts','lineItems','allowlist','doc.date','doc.row'];
for(const dep of deps) assert.ok(source.includes(dep),`legacy dependency missing: ${dep}`);
assert.ok(source.includes('calculateDocument('));
assert.ok(source.includes('vigTimeline.vigByDocument'));
assert.ok(source.includes('vigTimeline.audit'));
assert.equal(source.includes('vigMapForDocuments('), false);
for(const [dependency,mapping] of Object.entries(LEGACY_CONTEXT_DEPENDENCY_MAP)){assert.equal(typeof mapping,'string');assert.ok(mapping.length>0,`missing mapping: ${dependency}`)}
console.log('LEGACY_CONTEXT_DEPENDENCIES=PASS');
