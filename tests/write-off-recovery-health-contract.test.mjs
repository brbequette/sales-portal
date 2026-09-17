import assert from "node:assert/strict"
import fs from "node:fs"

const route = fs.readFileSync("src/app/api/admin/write-off-recovery/health/route.ts", "utf8")
const health = fs.readFileSync("src/lib/write-off-recovery-health.ts", "utf8")
const proxy = fs.readFileSync("src/proxy.ts", "utf8")

assert.match(route, /requireMasterAdministrator\(\)/)
assert.match(route, /Cache-Control", "no-store, max-age=0"/)
assert.match(route, /readWriteOffRecoveryHealth\(prisma\)/)
assert.doesNotMatch(route + health, /fetch\(|getZohoAccessToken|zohoapis|ZOHO_/i)
assert.doesNotMatch(route + health, /\.(?:create|update|upsert|delete|executeRaw)\s*\(/)
const statements = [...health.matchAll(/Prisma\.sql`([\s\S]*?)`/g)].map(match => match[1].trim())
assert.ok(statements.length > 0)
for (const statement of statements) {
  assert.match(statement, /^(?:SELECT|WITH)\b/i)
  assert.doesNotMatch(statement, /;/)
}
assert.match(health, /automaticRecoveryCases/)
assert.match(health, /syntheticTestReady/)
assert.match(health, /legacyUnknownCount/)
assert.match(health, /checkboxLikeStringRepresentationProven/)
assert.match(health, /if \(!schemaReady\) return failClosed\(schema\)/)
assert.match(proxy, /WRITE_OFF_RECOVERY_HEALTH_PATH = '\/api\/admin\/write-off-recovery\/health'/)
assert.match(proxy, /pathname === WRITE_OFF_RECOVERY_HEALTH_PATH/)
assert.match(proxy, /Cache-Control', 'no-store, max-age=0'/)

console.log("WRITE_OFF_RECOVERY_HEALTH_CONTRACT=PASS")
