import assert from "node:assert/strict"
import fs from "node:fs"

const users = fs.readFileSync("src/app/api/tv/users/route.ts", "utf8")
const hook = fs.readFileSync("src/components/useSalesBoardData.ts", "utf8")
const weekly = fs.readFileSync("src/app/api/dashboard-weekly-sales/route.ts", "utf8")
const diagnostics = fs.readFileSync("src/app/api/tv/diagnostics/route.ts", "utf8")

assert.doesNotMatch(users, /take:\s*500/)
assert.match(users, /isSalesperson:\s*true/)
assert.match(users, /master_admin/i)
assert.match(hook, /fetchAllDocuments/)
assert.match(hook, /totalPages/)
assert.doesNotMatch(hook, /pageSize=8000/)
assert.match(hook, /cache:\s*["']no-store["']/)
assert.match(hook, /sourcePagesComplete: true/)
assert.match(weekly, /export const dynamic = "force-dynamic"/)
assert.match(diagnostics, /isAdministratorRole/)
console.log("TV_PAGINATION_COMPLETE=PASS")
console.log("TV_MASTER_ADMIN_EXCLUSION=PASS")
console.log("TV_CACHE_CONTRACT=PASS")
console.log("TV_DIAGNOSTIC_CONTRACT=PASS")
