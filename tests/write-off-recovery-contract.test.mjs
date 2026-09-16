import assert from 'node:assert/strict'
import fs from 'node:fs'

const schema = fs.readFileSync('prisma/schema.prisma', 'utf8')
const approval = fs.readFileSync('src/app/api/write-off-recovery/[id]/approve/route.ts', 'utf8')
const adjustments = fs.readFileSync('src/app/api/write-off-recovery/[id]/adjustments/route.ts', 'utf8')
const legacy = fs.readFileSync('src/app/api/invoices/write-off/route.ts', 'utf8')

for (const model of ['WriteOffRecoveryCase', 'WriteOffRecoveryCostComponent', 'WriteOffReturnInspection', 'WriteOffRecoveryLedgerEvent', 'WriteOffRecoveryPolicy']) assert.match(schema, new RegExp(`model ${model}`))
assert.match(schema, /idempotencyKey\s+String\s+@unique/g)
assert.match(fs.readFileSync('prisma/migrations/20260915183000_write_off_recovery/migration.sql', 'utf8'), /BEFORE UPDATE OR DELETE ON "WriteOffRecoveryLedgerEvent"/)
assert.match(approval, /COMMISSION_REVERSAL/)
assert.match(approval, /COST_RESPONSIBILITY_DEBIT/)
assert.match(approval, /Dry run is stale/)
assert.match(approval, /isolationLevel: "Serializable"/)
assert.match(adjustments, /version = recoveryCase\.version \+ 1/)
assert.match(adjustments, /ACCEPTED_RESELLABLE/)
assert.match(legacy, /Direct write-off is disabled/)
assert.doesNotMatch(approval, /ZOHO_|zoho.*fetch|fetch\(/i)
console.log('WRITE_OFF_SCHEMA=PASS')
console.log('SEPARATE_LEDGER_EVENTS=PASS')
console.log('DRY_RUN_AND_IDEMPOTENCY=PASS')
console.log('ZOHO_SYNC_GATED=PASS')
