import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
process.env.RECONCILIATION_INPUTS ||= path.resolve('tmp/Titan_Zoho_Reconciliation_Inputs_2026-09-08');
const { parseSources } = await import('../reconciliation-engine.mjs');
const { loadCostSources } = await import('../reconciliation-cost-sources.mjs');
const { runReconciliationCore } = await import('../reconciliation-engine-core.mjs');
const { buildRuntimeArtifacts, writeRuntimeArtifacts } = await import('../reconciliation-artifact-core.mjs');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'reconciliation-artifact-'));
try {
  const { docs } = await parseSources();
  const core = runReconciliationCore({ docs, costSources: await loadCostSources(process.env.RECONCILIATION_INPUTS) });
  const artifacts = buildRuntimeArtifacts({ coreResult: core, documentIds: docs.map(d => d.id) });
  await writeRuntimeArtifacts({ outputDir: temp, coreResult: core, documentIds: docs.map(d => d.id) });
  const writtenBlocker = JSON.parse(await fs.readFile(path.join(temp, 'reconciliation-blocker-analysis.json'), 'utf8'));
  assert.equal(writtenBlocker.conservation.lineTotal, 58770);
  assert.equal(writtenBlocker.conservation.documentTotal, 16130);
  assert.equal(writtenBlocker.conservation.unresolvedMatrixTotal, core.lineAccounting.physicalUnresolved);
  assert.equal(writtenBlocker.conservation.uncertainMatrixTotal, core.lineAccounting.uncertain);
  assert.equal(writtenBlocker.conservation.failuresTotal, core.lineAccounting.physicalUnresolved + core.lineAccounting.uncertain);
  assert.equal(Array.isArray(writtenBlocker.outcomes), false);
  assert.equal(artifacts.outcomes.length, 58770);
  assert.equal(artifacts.documents.length, 16130);
  assert.ok((core.lineAccounting.sources.embeddedBreakdown || 0) > 0);
  for (const outcome of artifacts.outcomes.filter(x => x.kind === 'physical-resolved' && ['embeddedBreakdown', 'purchaseOrder', 'itemExportPurchaseRate'].includes(x.costResolution.source))) {
    assert.ok(outcome.costResolution.sourceRecordId);
    assert.ok(outcome.costResolution.lookupKeyType);
    if (outcome.costResolution.source === 'purchaseOrder') assert.ok(outcome.costResolution.effectiveDate);
  }
  assert.equal(artifacts.forward.length, artifacts.rollback.length);
  assert.ok(artifacts.forward.length > 0);
  assert.ok(artifacts.forward.every(x => Array.isArray(x.customFields) ? x.customFields.length > 0 : Object.keys(x.customFields || {}).length > 0));
  assert.equal(artifacts.forward.length, artifacts.documents.filter(d => d.status === 'ready' && !d.noOp).length);
  const unresolvedMatrixCount = Object.values(artifacts.diagnostic.blockerMatrices.unresolved).reduce((a, b) => a + b, 0);
  const uncertainMatrixCount = Object.values(artifacts.diagnostic.blockerMatrices.uncertain).reduce((a, b) => a + b, 0);
  assert.equal(unresolvedMatrixCount, core.lineAccounting.physicalUnresolved);
  assert.equal(uncertainMatrixCount, core.lineAccounting.uncertain);
  const serialized = JSON.stringify(artifacts.diagnostic.sourceSamples).toLowerCase();
  for (const key of ['"cost"', '"amount"', '"price"', '"total"', '"rate"']) assert.equal(serialized.includes(key), false);
  await fs.writeFile(path.join(temp, 'diagnostic.json'), JSON.stringify(artifacts.diagnostic));
  assert.equal((await fs.readdir(temp)).length, 4);
  console.log(`RUNTIME_ARTIFACT_COUNTS=${JSON.stringify({ outcomes: artifacts.outcomes.length, documents: artifacts.documents.length, uncertain: core.lineAccounting.uncertain, embedded: core.lineAccounting.sources.embeddedBreakdown, forward: artifacts.forward.length })}`);
  console.log('RUNTIME_ARTIFACT_INTEGRATION=PASS');
  console.log('RESOLVED_PROVENANCE_COMPLETE=PASS');
  console.log('NONEMPTY_CALCULATED_PAYLOADS=PASS');
  console.log('FORWARD_ROLLBACK_PAIRING=PASS');
  console.log('BLOCKER_DIAGNOSTIC_INTEGRATION=PASS');
} finally {
  await fs.rm(temp, { recursive: true, force: true });
  assert.equal((await fs.readdir(path.dirname(temp))).includes(path.basename(temp)), false);
}
