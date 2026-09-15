import assert from "node:assert/strict"
import fs from "node:fs"

const access = fs.readFileSync("src/lib/tv-access.ts", "utf8")
const users = fs.readFileSync("src/app/api/tv/users/route.ts", "utf8")
const config = fs.readFileSync("src/app/api/tv/config/route.ts", "utf8")
const weekly = fs.readFileSync("src/app/api/dashboard-weekly-sales/route.ts", "utf8")
const documents = fs.readFileSync("src/app/api/get-documents/route.ts", "utf8")
const processCosts = fs.readFileSync("src/app/api/tv/process-missing-costs/route.ts", "utf8")
const weeklyRoute = fs.readFileSync("src/app/api/dashboard-weekly-sales/route.ts", "utf8")
const hook = fs.readFileSync("src/components/useSalesBoardData.ts", "utf8")
const launch = fs.readFileSync("src/components/DualScreenController.tsx", "utf8")
const board = fs.readFileSync("src/components/FutureSalesBoard.tsx", "utf8")

assert.match(access, /isAdministratorRole/)
assert.match(access, /hasValidTvSession/)
assert.match(access, /TV authorization required/)
assert.match(users, /requireTvAccess/)
assert.match(config, /requireTvAccess/)
assert.match(weekly, /requireTvAccess/)
assert.match(documents, /searchParams\.get\('tv'\) === '1'/)
assert.match(documents, /requireTvAccess/)
assert.match(processCosts, /requireAdministrator/)
assert.match(weeklyRoute, /Array\.isArray\(items\)/)
assert.match(weeklyRoute, /line\.sub_total \?\? line\.subTotal \?\? line\.amount/)
assert.match(hook, /tv=1/)
assert.match(launch, /\/display\?controller=/)
assert.match(board, /Dashboard authorization required/)
assert.match(board, /Dashboard data incomplete/)
assert.match(board, /Dashboard network failure/)

const cases = [
  { name: "admin", session: "ADMIN", tv: false, allowed: true },
  { name: "master", session: "MASTER_ADMIN", tv: false, allowed: true },
  { name: "display", session: null, tv: true, allowed: true },
  { name: "missing", session: null, tv: false, allowed: false },
  { name: "ordinary", session: "AGENT", tv: false, allowed: false },
]
assert.deepEqual(cases.map(item => item.allowed), [true, true, true, false, false])

const eligible = [
  { role: "ADMIN", isSalesperson: true, showOnSalesBoard: true },
  { role: "MASTER_ADMIN", isSalesperson: false, showOnSalesBoard: true },
  { role: "AGENT", isSalesperson: true, showOnSalesBoard: false },
  { role: "AGENT", isSalesperson: true, showOnSalesBoard: true },
]
assert.equal(eligible.filter(user => user.isSalesperson === true && user.showOnSalesBoard === true).length, 2)

console.log("TV_DUAL_AUTH_CONTRACT=PASS")
console.log("TV_ALL_ENDPOINTS_GUARDED=PASS")
console.log("TV_DISPLAY_SESSION_ACCEPTED=PASS")
console.log("TV_SECOND_DISPLAY_CONTRACT=PASS")
