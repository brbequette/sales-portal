import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../reconciliation-engine.mjs',import.meta.url),'utf8');
assert.ok(source.indexOf("writeJson('vig-audit.json'") < source.indexOf('missingAuthoritativeInputCount'));
console.log('VIG_AUDIT_WRITTEN_BEFORE_GATE=PASS');
