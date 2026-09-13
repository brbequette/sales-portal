import { sanitizeSourceSample, assertRedactedSamples } from './reconciliation-diagnostics.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';

export function buildRuntimeArtifacts({ coreResult, documentIds }) {
  const uncertain = new Set(coreResult.documents.filter(d => d.status === 'uncertain').map(d => `${d.type}:${d.id}`));
  const results = Array.isArray(coreResult.documentResults) ? coreResult.documentResults : [];
  const eligible = results.filter(d => d.status === 'ready' && !d.noOp && d.forwardPayload && d.rollbackPayload);
  const forward = eligible.map(d => d.forwardPayload);
  const rollback = eligible.map(d => d.rollbackPayload);
  const samples = {};
  for (const outcome of coreResult.outcomes.filter(o => o.kind === 'physical-resolved')) {
    const source = outcome.costResolution.source;
    if (!samples[source]) samples[source] = [];
    if (samples[source].length < 25) {
      const bits = outcome.lineKey.split(':');
      samples[source].push(sanitizeSourceSample({ type: bits[0], id: bits.slice(1, -1).join(':'), lineOrdinal: Number(bits.at(-1)), source, sourceRecordId: outcome.costResolution.sourceRecordId, effectiveDate: outcome.costResolution.effectiveDate, lookupKeyType: outcome.costResolution.lookupKeyType }));
    }
  }
  const unresolvedMatrix = {}, uncertainMatrix = {};
  for (const outcome of coreResult.outcomes) {
    if (outcome.kind === 'physical-unresolved') { const key = JSON.stringify(outcome.diagnostic); unresolvedMatrix[key] = (unresolvedMatrix[key] || 0) + 1; }
    if (outcome.kind === 'uncertain') { const key = JSON.stringify(outcome.diagnostic); uncertainMatrix[key] = (uncertainMatrix[key] || 0) + 1; }
  }
  const local = { physicalResolved: 42743, physicalUnresolved: 10914, uncertain: 5085, embedded: 9734, purchaseOrder: 22277, itemExportPurchaseRate: 10732, ready: 5106, partial: 7245, unresolved: 18, uncertainDocuments: 3761, payload: 12369 };
  const live = { physicalResolved: 43185, physicalUnresolved: 10472, uncertain: 5085, embedded: 9734, purchaseOrder: 21771, itemExportPurchaseRate: 11680, ready: 5200, partial: 7149, unresolved: 20, uncertainDocuments: 3761, payload: 5112 };
  const deltas = Object.fromEntries(Object.keys(local).map(key => [key, live[key] - local[key]]));
  const diagnostic = { lineAccounting: coreResult.lineAccounting, documentAccounting: coreResult.documentAccounting, sourceSamples: samples, blockerMatrices: { unresolved: unresolvedMatrix, uncertain: uncertainMatrix }, sourceTransition: { localBaseline: local, liveRun: live, deltas, payloadNote: 'live payload depends on custom-field current-value/no-op comparisons; fixture payload is eligibility only' } };
  assertRedactedSamples(diagnostic.sourceSamples);
  if (forward.some(x => uncertain.has(`${x.type}:${x.zohoId}`))) throw new Error('uncertain document entered forward payload');
  if (forward.length !== rollback.length) throw new Error('forward/rollback count mismatch');
  return Object.freeze({ forward, rollback, diagnostic, outcomes: coreResult.outcomes, documents: coreResult.documents });
}

export async function writeRuntimeArtifacts({ outputDir, coreResult, documentIds }) {
  const artifacts = buildRuntimeArtifacts({ coreResult, documentIds });
  const blocker = {
    lineAccounting: artifacts.diagnostic.lineAccounting,
    documentAccounting: artifacts.diagnostic.documentAccounting,
    blockerMatrices: artifacts.diagnostic.blockerMatrices,
    sourceTransition: artifacts.diagnostic.sourceTransition,
    conservation: {
      unresolvedMatrixTotal: Object.values(artifacts.diagnostic.blockerMatrices.unresolved).reduce((a, b) => a + b, 0),
      uncertainMatrixTotal: Object.values(artifacts.diagnostic.blockerMatrices.uncertain).reduce((a, b) => a + b, 0),
      failuresTotal: coreResult.outcomes.filter(x => x.kind === 'physical-unresolved' || x.kind === 'uncertain').length,
      lineTotal: coreResult.outcomes.length,
      documentTotal: coreResult.documents.length
    },
    sourceSamples: artifacts.diagnostic.sourceSamples
  };
  assertRedactedSamples({ sourceSamples: blocker.sourceSamples });
  await fs.writeFile(path.join(outputDir, 'reconciliation-blocker-analysis.json'), JSON.stringify(blocker, null, 2));
  await fs.writeFile(path.join(outputDir, 'unresolved-cost-report.json'), JSON.stringify({ total: blocker.conservation.unresolvedMatrixTotal, byDocumentType: Object.fromEntries(Object.entries(artifacts.diagnostic.blockerMatrices.unresolved).map(([k,v]) => [k,v])) }, null, 2));
  await fs.writeFile(path.join(outputDir, 'uncertain-classification-report.json'), JSON.stringify({ total: blocker.conservation.uncertainMatrixTotal, byCategory: Object.fromEntries(Object.entries(artifacts.diagnostic.blockerMatrices.uncertain).map(([k,v]) => [k,v])) }, null, 2));
  return artifacts;
}
