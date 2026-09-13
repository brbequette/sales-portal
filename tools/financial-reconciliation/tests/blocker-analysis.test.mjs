import assert from 'node:assert/strict';
import { assertRedactedSamples } from '../reconciliation-diagnostics.mjs';
assert.equal(assertRedactedSamples({ failureReferences: { total: 2, byReason: { X: 2 } }, lineAccounting: { total: 3 } }), true);
for (const key of ['zohoId', 'sourceRecordId', 'cost', 'amount', 'customer', 'description']) assert.throws(() => assertRedactedSamples({ [key]: 'sensitive' }), /forbidden/);
assert.throws(() => assertRedactedSamples({ failureReferences: [{ zohoId: '123' }] }), /forbidden/);
console.log('BLOCKER_ANALYSIS_REDACTION=PASS');
