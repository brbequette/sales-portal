import assert from 'node:assert/strict';
import { buildHistoricalInvoiceCostIndex, resolveHistoricalInvoiceCost } from '../reconciliation-cost-sources.mjs';
const index = buildHistoricalInvoiceCostIndex([{ zohoId: 'INV-1', issueDate: '2026-01-01', items: { line_items: [{ zoho_line_item_id: 'L1', purchase_rate: '12.50' }, { item_id: 'P2', cost: 0 }] } }]);
const hit = resolveHistoricalInvoiceCost(index, 'INV-1', { zoho_line_item_id: 'L1' }, 0);
assert.deepEqual({ cost: hit.cost, source: hit.source, lookupKeyType: hit.lookupKeyType }, { cost: 12.5, source: 'historicalInvoiceJson', lookupKeyType: 'historicalLineId' });
assert.equal(resolveHistoricalInvoiceCost(index, 'INV-1', { item_id: 'P2' }, 1), null);
assert.equal(buildHistoricalInvoiceCostIndex([{ zohoId: 'P', items: { line_items: [{ purchase_rate: '0' }] }, rawData: {} }]).stats.zeroOrInvalid, 1);
console.log('HISTORICAL_INVOICE_JSON_PATH=PASS');
console.log('NO_SELLING_PRICE_AS_COST=PASS');
