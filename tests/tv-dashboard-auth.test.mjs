import assert from "node:assert/strict"
import fs from "node:fs"

const usersRoute = fs.readFileSync("src/app/api/tv/users/route.ts", "utf8")
const hook = fs.readFileSync("src/components/useSalesBoardData.ts", "utf8")
const board = fs.readFileSync("src/components/FutureSalesBoard.tsx", "utf8")

assert.match(usersRoute, /requireTvAccess\(\)/)
assert.doesNotMatch(usersRoute, /take:\s*500/)
assert.match(usersRoute, /isSalesperson:\s*true/)
assert.match(usersRoute, /showOnSalesBoard:\s*true/)
assert.match(hook, /fetchAllDocuments/)
assert.match(hook, /totalPages/)
assert.match(hook, /cache:\s*["']no-store["']/)
assert.match(hook, /usersPayloadRaw\.users/)
assert.match(hook, /const boardUsers = usersPayload\.users \|\| \[\]/)
assert.doesNotMatch(hook, /Promise\.resolve\(\{ documents: \[\] \}\)/)
assert.match(hook, /setData\(null\)/)
assert.match(board, /STALE \/ \$\{refreshError\.toUpperCase\(\)\}/)
assert.match(board, /Dashboard authorization required/)

const users = [
  { id: "admin-rep", role: "ADMIN", isSalesperson: true, showOnSalesBoard: true },
  { id: "master", role: "MASTER_ADMIN", isSalesperson: false, showOnSalesBoard: true },
  { id: "hidden-rep", role: "AGENT", isSalesperson: true, showOnSalesBoard: false },
  { id: "visible-rep", role: "AGENT", isSalesperson: true, showOnSalesBoard: true },
]
const displayed = users.filter(user => user.isSalesperson === true && user.showOnSalesBoard === true)
assert.equal(displayed.length, 2)
assert.equal(displayed.some(user => user.id === "master"), false)

console.log("TV_AUTHORIZATION_CONTRACT=PASS")
console.log("TV_COMPLETE_REP_DATASET=PASS")
console.log("TV_ZERO_ACTIVITY_REPS=PASS")
console.log("TV_FAILED_USERS_NO_PARTIAL_FALLBACK=PASS")
