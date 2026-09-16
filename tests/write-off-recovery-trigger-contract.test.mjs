import assert from "node:assert/strict"
import fs from "node:fs"
import { auditZohoApiCallSites } from "../scripts/audit-zoho-api-call-sites.mjs"

const trigger = fs.readFileSync("src/lib/write-off-recovery-trigger.ts", "utf8")
const bounded = fs.readFileSync("src/app/api/admin/bounded-books-import/route.ts", "utf8")
const scheduledBounded = fs.readFileSync("netlify/functions/bounded-books-auto-sync.ts", "utf8")
const recoveryPage = fs.readFileSync("src/app/write-off-recovery/page.tsx", "utf8")
const recoveryApi = fs.readFileSync("src/app/api/write-off-recovery/route.ts", "utf8")
const approval = fs.readFileSync("src/app/api/write-off-recovery/[id]/approve/route.ts", "utf8")
const schema = fs.readFileSync("prisma/schema.prisma", "utf8")
const migration = fs.readFileSync("prisma/migrations/20260916190000_write_off_recovery_bounded_trigger/migration.sql", "utf8")

assert.match(trigger, /WRITE_OFF_SOURCE_FIELD = "cf_written_off"/)
assert.match(trigger, /AUTOMATIC_RECOVERY_RATE_BPS = 5000/)
assert.match(trigger, /WRITE_OFF_TRIGGER_ZOHO_CALLS = 0/)
assert.doesNotMatch(trigger, /["']server-only["']/)
assert.doesNotMatch(trigger, /fetch\(|getZohoAccessToken|zohoapis/i)
assert.match(bounded, /persistBoundedImportedInvoices\(prisma, collection\.records\.invoices/)
assert.match(scheduledBounded, /persistBoundedImportedInvoices\(prisma, collection\.records\.invoices/)
assert.match(trigger, /incomingPayload: row/)
assert.match(trigger, /previousPayload: existing\?\.items/)
assert.match(trigger, /writeOffTriggerZohoCalls \+= (?:persisted\.triggerResult|anomaly)\.zohoCalls/)
assert.match(trigger, /if \(incomingObservation\.anomalyCode\) return \{ invoice, triggerResult: null \}/)
assert.match(trigger, /observationKind: "PARSE_ANOMALY"/)
assert.match(trigger, /writeOffParseAnomalyFailures \+= 1/)
assert.doesNotMatch(trigger, /MALFORMED_CF_WRITTEN_OFF/)
assert.equal((bounded.match(/fetch\(`https:\/\/www\.zohoapis/g) || []).length, 1, "bounded import keeps its single paginated transport call site")
assert.match(scheduledBounded, /from ['"]\.\.\/\.\.\/src\/lib\/write-off-recovery-trigger['"]/)

const sourceFiles = fs.readdirSync("src", { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name))
  .map(entry => `${entry.parentPath.replaceAll("\\", "/")}/${entry.name}`)
const clientImporters = sourceFiles.filter(file => {
  const source = fs.readFileSync(file, "utf8")
  return /^\s*["']use client["']/m.test(source) && /write-off-recovery-trigger/.test(source)
})
assert.deepEqual(clientImporters, [], "client components must not import the authoritative recovery trigger")

for (const localReadSurface of [recoveryPage, recoveryApi, approval]) {
  assert.doesNotMatch(localReadSurface, /getZohoAccessToken|zohoapis|ZOHO_/i)
}
assert.match(recoveryApi, /where: management \? \{\} : \{ responsibleRepId: user\.id \}/)
assert.match(recoveryApi, /scope: management \? "management" : "personal"/)

assert.match(schema, /@@unique\(\[triggerSourceField, triggerZohoInvoiceId\]\)/)
assert.match(schema, /idempotencyKey\s+String\s+@unique/)
assert.match(migration, /WriteOffRecoveryTriggerRecord_immutable/)
assert.match(migration, /BEFORE UPDATE OR DELETE/)
assert.match(approval, /evidenceStatus !== "READY_FOR_DRY_RUN"/)
assert.match(approval, /Salesperson snapshot is required before approval/)
assert.doesNotMatch(trigger, /WriteOffRecoveryLedgerEvent|ledgerEvent|payout|wage/i)

const changedFinancialSurfaces = [
  "src/components/DashboardView.tsx",
  "src/components/ExecutiveRepStats.tsx",
  "src/components/GlobalTopBar.tsx",
  "src/components/useDashboardController.ts",
  "src/app/commissions/page.tsx",
  "netlify/functions/get-commissions.ts",
  "netlify/functions/get-rep-stats.ts",
]
for (const file of changedFinancialSurfaces) assert.ok(fs.existsSync(file))

const zohoSites = auditZohoApiCallSites()
assert.ok(zohoSites.length > 0)
assert.equal(zohoSites.filter(site => site.file.includes("write-off-recovery-trigger") || site.file.includes("app/write-off-recovery")).length, 0)

console.log("WRITE_OFF_TRIGGER_CONTRACT=PASS")
console.log("RECOVERY_PAGE_ZOHO_CALLS=0")
console.log("TRIGGER_ADDITIONAL_ZOHO_CALLS_PER_N_INVOICES=0")
