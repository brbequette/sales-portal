import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../reconciliation-engine.mjs', import.meta.url), 'utf8');
const declaration = source.indexOf('const coreResult = runStage');
assert.ok(declaration >= 0);
for (const match of source.matchAll(/\bcoreResult\b/g)) {
  if (match.index < declaration) assert.fail(`coreResult referenced before initialization at ${match.index}`);
}
assert.ok(source.indexOf('buildVigTimeline') < declaration);
assert.ok(source.indexOf('vigTimeline.vigByDocument') < declaration);
assert.ok(source.lastIndexOf('writeRuntimeArtifacts') > declaration);
console.log('RUNTIME_ORCHESTRATION_ORDER=PASS');
console.log('NO_CORE_TEMPORAL_DEAD_ZONE=PASS');
