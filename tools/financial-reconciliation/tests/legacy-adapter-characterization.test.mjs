import assert from 'node:assert/strict';
import { buildLegacyDocumentResult } from '../reconciliation-legacy-document-adapter.mjs';
const fake = (input, { vig }) => ({ vig, commissionPct: input.commissionPct || 50, deadCost: 10, tariff: 2, profit: 20, cardFee: 1, additionalCosts: 3, sources: input.lineItems.map(x => ({ source: x.source || 'purchaseOrder' })), unresolvedLines: input.lineItems.filter(x => x.source === 'unresolved'), failed: input.lineItems.some(x => x.source === 'unresolved') ? 'UNRESOLVED_PHYSICAL_COST' : null });
const run = (type, lines, existing = {}) => buildLegacyDocumentResult({ document: { id: `${type}-1`, type, date: '2025-02-01', subtotal: 100, total: 110 }, vig: 1.3, allowlist: ['cf_salesperson_vig','cf_commision_from_profit','cf_dead_cost_total','cf_dead_cost_with_vig','cf_profit','cf_dead_profit_actual'], existingFields: existing, payments: [{ mode: 'card' }], additionalCosts: 3, lineItems: lines, calculateDocument: fake });
for (const type of ['invoice','quote','sales_order']) { const changed = run(type, [{ source: 'purchaseOrder' }]); assert.equal(changed.forwardPayload.type, type); const noop = run(type, [{ source: 'purchaseOrder' }], { cf_salesperson_vig: 1.3, cf_commision_from_profit: 50, cf_dead_cost_total: 10, cf_dead_cost_with_vig: 12, cf_profit: 20, cf_dead_profit_actual: 24 }); assert.equal(noop.noOp, true); const failed = run(type, [{ source: 'unresolved' }]); assert.equal(failed.forwardPayload, null); assert.equal(failed.failures.length, 1); }
const nonphysical = run('invoice', [{ source: 'nonphysical' }]); assert.equal(nonphysical.documentAccounting.noPhysicalCostRequiredDocuments, 1);
for (const value of ['', null, 0]) { const result = run('invoice', [{ source: 'purchaseOrder' }], { cf_profit: value }); assert.ok(result.rollbackPayload || result.noOp); }
console.log('LEGACY_ADAPTER_CHARACTERIZATION=PASS');
console.log('LEGACY_AGGREGATION_PARITY=PASS');
console.log('SINGLE_LEGACY_CALCULATION_CALL=PASS');
