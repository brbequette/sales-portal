import assert from 'node:assert/strict';
import { validatePayload } from '../reconciliation-lib/rules.mjs';
const violations = validatePayload([
  { zohoId: 'valid', customFields: [{ apiName: 'cf_profit', value: 1 }] },
  { zohoId: 'shape', customFields: {} },
  { zohoId: 'forbidden', customFields: [{ apiName: 'native_total', value: 1 }, { apiName: 'lineItems', value: [] }] }
]);
assert.ok(Array.isArray(violations));
assert.equal(violations.length, 3);
for (const violation of violations) assert.ok(Object.isFrozen(violation));
assert.doesNotThrow(() => { for (const violation of violations) assert.ok(violation.reason); });
console.log('PRODUCTION_PAYLOAD_VALIDATION_CONTRACT=PASS');
