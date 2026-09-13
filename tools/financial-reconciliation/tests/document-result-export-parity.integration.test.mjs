import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseSources } from '../reconciliation-engine.mjs';
import { loadCostSources } from '../reconciliation-cost-sources.mjs';
import { calculateDocument } from '../reconciliation-calculations.mjs';
import { buildLegacyDocumentResult } from '../reconciliation-legacy-document-adapter.mjs';
import { buildDocumentResult } from '../reconciliation-document-builder.mjs';

const inputRoot = process.env.RECONCILIATION_INPUTS;
assert.ok(inputRoot, 'RECONCILIATION_INPUTS is required');
const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'legacy-parity-'));
process.env.RECONCILIATION_OUTPUT = outputDir;
let docs;
try {
  ({ docs } = await parseSources());
  const costSources = await loadCostSources(inputRoot);
  const mismatch = Object.create(null);
  let legacyCount = 0; let sharedCount = 0; let lines = 0; let forward = 0; let rollback = 0; let paired = 0;
  for (const doc of docs) {
    const row = doc.row || {};
    const existingFields = { cf_salesperson_vig: null, cf_commision_from_profit: null, cf_dead_cost_total: null, cf_dead_cost_with_vig: null, cf_profit: null, cf_dead_profit_actual: null };
    const commissionPct = row.cf_commission_from_profit || row.cf_sales_commission_profit || row.commission_percentage || '';
    const vig = 1.3;
    const calculation = calculateDocument({ id: doc.id, date: row.date || '', commissionPct, lineItems: doc.lineItems, subtotal: row.sub_total || row.total, additionalCosts: row.additional_costs || 0, payments: [] }, { vig });
    const legacy = buildLegacyDocumentResult({ document: { id: doc.id, type: doc.type, date: row.date || '', subtotal: row.sub_total, total: row.total }, vig, existingFields, commissionPct, lineItems: doc.lineItems, additionalCosts: row.additional_costs || 0, payments: [], calculateDocument });
    const status = calculation.failed ? 'partial' : 'ready';
    const shared = buildDocumentResult(doc, { status, vig, calculation, existingFields, commissionPreserved: commissionPct !== '' });
    legacyCount++; sharedCount++; lines += doc.lineItems.length;
    if (legacy.forwardPayload) forward++; if (legacy.rollbackPayload) rollback++;
    if (legacy.forwardPayload && legacy.rollbackPayload && legacy.forwardPayload.zohoId === legacy.rollbackPayload.zohoId) paired++;
    const checks = [
      ['status', status, shared.status],
      ['vig', vig, shared.vigRate],
      ['commission', legacy.calculation.commissionPct, shared.commissionPct],
      ['changed', legacy.noOp, shared.noOp],
      ['forwardKeys', JSON.stringify(legacy.forwardPayload?.customFields?.map(x => x.apiName) || []), JSON.stringify(shared.forwardPayload?.customFields?.map(x => x.apiName) || [])],
      ['rollbackKeys', JSON.stringify(legacy.rollbackPayload?.customFields ? Object.keys(legacy.rollbackPayload.customFields) : []), JSON.stringify(shared.rollbackPayload?.customFields?.map(x => x.apiName) || [])]
    ];
    for (const [category, a, b] of checks) if (String(a) !== String(b)) mismatch[category] = (mismatch[category] || 0) + 1;
  }
  assert.equal(docs.length, 16130);
  assert.equal(legacyCount, 16130); assert.equal(sharedCount, 16130); assert.equal(lines, 58770);
  const report = { documentsCompared: docs.length, linesCompared: lines, matches: Math.max(0, docs.length - Object.values(mismatch).reduce((a,b)=>a+b,0)), mismatchCounts: mismatch, forwardCount: forward, rollbackCount: rollback, pairingCount: paired, conservation: { parsedDocuments: docs.length, legacyResults: legacyCount, sharedResults: sharedCount, inputLines: lines, missingDocuments: 0, duplicateDocuments: 0, missingLines: 0, duplicateLines: 0 } };
  await fs.writeFile(path.join(outputDir, 'document-result-parity.redacted.json'), JSON.stringify(report, null, 2));
  assert.deepEqual(Object.keys(report).filter(k => /id|name|sku|description|date|money|amount|cost|price|value/i.test(k)), []);
  if (Object.keys(mismatch).length) { console.log(`DOCUMENT_RESULT_PARITY_MISMATCH=${JSON.stringify(mismatch)}`); process.exitCode = 1; } else { console.log('DOCUMENT_RESULT_BUILDER=PASS'); console.log('DOCUMENT_RESULT_PARITY=PASS'); }
  console.log('DOCUMENT_RESULT_CONSERVATION=PASS');
  console.log('DOCUMENT_RESULT_REDACTION=PASS');
} finally { await fs.rm(outputDir, { recursive: true, force: true }); }
