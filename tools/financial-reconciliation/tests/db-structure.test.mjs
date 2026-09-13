import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
const root = process.env.RECONCILIATION_APP_ROOT;
assert.ok(root, 'RECONCILIATION_APP_ROOT is required');
const schemaPath = path.join(root, 'prisma', 'schema.prisma');
assert.ok(fs.existsSync(schemaPath), `Prisma schema not found at ${schemaPath}`);
const schema = fs.readFileSync(schemaPath, 'utf8');
const blocks = new Map([...schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)].map(m => [m[1], new Set([...m[2].matchAll(/^\s+(\w+)\s+/gm)].map(x => x[1]))]));
const expected = { SystemSetting: ['key','value'], CompensationPlan: ['id','name','startDate','endDate','commissionRate','commissionBasis'], Product: ['sku','name','price','subjectToVig','giftItem'], Invoice: ['zohoId','issueDate','amount','items','computedProfit','computedDeadCost','computedVigRate','lineItems','payments'], Payment: ['zohoId','invoiceId','amount','mode','date','status'], LineItem: ['invoiceId','zohoLineItemId','sku','quantity','total','description'], PurchaseOrder: ['zohoId','invoiceId','items'] };
for (const [model, fields] of Object.entries(expected)) { assert.ok(blocks.has(model), `missing model ${model}`); for (const field of fields) assert.ok(blocks.get(model).has(field), `${model}.${field} is absent from schema`); }
assert.equal(blocks.get('CompensationPlan').has('effectiveDate'), false); console.log(`DB_STRUCTURE_TESTS=PASS (${Object.values(expected).flat().length} fields)`);
