import assert from 'node:assert/strict';
import path from 'node:path';
process.env.RECONCILIATION_INPUTS = process.env.RECONCILIATION_INPUTS || path.resolve('tmp/Titan_Zoho_Reconciliation_Inputs_2026-09-08');
const { parseSources } = await import('../reconciliation-engine.mjs');
const { parseEmbeddedEntriesComplete, inventoryEmbeddedBreakdown, associateEmbeddedCostTokens, matchEmbeddedEntriesToLines } = await import('../reconciliation-calculations.mjs');
const { docs } = await parseSources();
const expected = { invoice: { documents: 7879, lines: 30484, costTokens: 15076, positive: 10941, zero: 4135 }, quote: { documents: 7864, lines: 26886, costTokens: 5601, positive: 2442, zero: 3159 }, sales_order: { documents: 387, lines: 1400 } };
const result = {};
for (const type of ['invoice', 'quote']) {
  const parserInventory = { costTokens: 0, positiveCostEntries: 0, zeroCostEntries: 0, negativeCostEntries: 0, blankCostEntries: 0, nonnumericCostEntries: 0, malformedCostEntries: 0, associatedEntries: 0, droppedTokens: 0, duplicateAssociations: 0, overlappingEntries: 0 };
  const matchingOutcomes = { candidateEntries: 0, positiveCandidates: 0, zeroCandidates: 0, matchedBySkuAlias: 0, matchedByItemIdAlias: 0, matchedByExactItemName: 0, matchedByOccurrenceAndQuantity: 0, matchedByExactDocumentOrdinal: 0, ambiguousEntries: 0, unmatchedEntries: 0, duplicateLineMatchRejected: 0, positivePhysicalLinesResolved: 0, zeroEntriesMatchedToNonphysicalLines: 0, zeroEntriesMatchedToPhysicalLinesButRejected: 0 };
  for (const doc of docs.filter(d => d.type === type)) {
    const value = doc.row.cf_items_dc_breakdown || '';
    if (!value) continue;
    const parsed = parseEmbeddedEntriesComplete(value);
    const associated = associateEmbeddedCostTokens(value);
    const inventory = inventoryEmbeddedBreakdown(value);
    parserInventory.costTokens += inventory.costTokens;
    parserInventory.positiveCostEntries += inventory.classified.positive;
    parserInventory.zeroCostEntries += inventory.classified.zero;
    parserInventory.negativeCostEntries += inventory.classified.negative;
    parserInventory.blankCostEntries += inventory.classified.blank;
    parserInventory.nonnumericCostEntries += inventory.classified.nonnumeric;
    parserInventory.malformedCostEntries += inventory.classified.malformedNumeric;
    parserInventory.associatedEntries += associated.associatedEntries;
    parserInventory.droppedTokens += associated.droppedCostTokens;
    parserInventory.duplicateAssociations += associated.duplicateAssociations;
    parserInventory.overlappingEntries += associated.overlappingEntries;
    matchingOutcomes.candidateEntries += associated.entries.length;
    matchingOutcomes.positiveCandidates += associated.entries.filter(e => e.cost > 0).length;
    matchingOutcomes.zeroCandidates += associated.entries.filter(e => e.cost === 0).length;
    const lines = doc.lineItems.map(line => ({ sku: line.sku || line.product_sku, itemId: line.product_id, itemName: line.item_name, physical: true }));
    const matched = matchEmbeddedEntriesToLines(associated.entries, lines).counters;
    for (const key of Object.keys(matchingOutcomes)) if (key in matched) matchingOutcomes[key] += matched[key];
  }
  assert.equal(parserInventory.costTokens, expected[type].costTokens);
  assert.equal(parserInventory.positiveCostEntries, expected[type].positive);
  assert.equal(parserInventory.zeroCostEntries, expected[type].zero);
  assert.equal(parserInventory.associatedEntries, expected[type].costTokens);
  assert.equal(parserInventory.costTokens, parserInventory.associatedEntries);
  assert.equal(parserInventory.droppedTokens + parserInventory.duplicateAssociations + parserInventory.overlappingEntries, 0);
  assert.equal(matchingOutcomes.candidateEntries, matchingOutcomes.positiveCandidates + matchingOutcomes.zeroCandidates);
  result[type] = { parserInventory, matchingOutcomes };
}
for (const [type, e] of Object.entries(expected)) { const rows = docs.filter(d => d.type === type); assert.equal(rows.length, e.documents); assert.equal(rows.reduce((n, d) => n + d.lineItems.length, 0), e.lines); }
assert.equal(result.invoice.parserInventory.positiveCostEntries + result.quote.parserInventory.positiveCostEntries, 13383);
assert.equal(result.invoice.parserInventory.zeroCostEntries + result.quote.parserInventory.zeroCostEntries, 7294);
console.log(JSON.stringify(result));
