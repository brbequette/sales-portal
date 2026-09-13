import assert from 'node:assert/strict';
import { buildDocumentResult } from '../reconciliation-document-builder.mjs';
const doc={id:'fixture',type:'invoice',row:{cf_commission_from_profit:''}};
const existing={cf_salesperson_vig:0,cf_commision_from_profit:0,cf_dead_cost_total:0,cf_dead_cost_with_vig:0,cf_profit:0,cf_dead_profit_actual:0};
const r=buildDocumentResult(doc,{status:'ready',vig:1.3,vigReason:'baseline',calculation:{deadCost:10,tariff:2,cardFee:1,additionalCosts:3,profit:20},existingFields:existing,deadCostTotals:{purchaseOrder:10},refunds:0});
assert.equal(r.documentId,'fixture'); assert.equal(r.status,'ready'); assert.equal(r.vigRate,1.3); assert.equal(r.commissionPct,50); assert.ok(r.forwardPayload); assert.ok(Array.isArray(r.forwardPayload.customFields)); assert.deepEqual(r.rollbackPayload.customFields.map(x=>x.apiName).sort(),r.forwardPayload.customFields.map(x=>x.apiName).sort());
const u=buildDocumentResult(doc,{status:'uncertain',existingFields:existing}); assert.equal(u.forwardPayload,null); assert.equal(u.diagnostic.exclusionReason,'UNCERTAIN');
console.log('DOCUMENT_RESULT_BUILDER=PASS'); console.log('DOCUMENT_RESULT_PARITY=PASS');
