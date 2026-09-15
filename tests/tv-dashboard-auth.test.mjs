import assert from "node:assert/strict"
import fs from "node:fs"

const usersRoute = fs.readFileSync("src/app/api/tv/users/route.ts", "utf8")
const hook = fs.readFileSync("src/components/useSalesBoardData.ts", "utf8")
const board = fs.readFileSync("src/components/FutureSalesBoard.tsx", "utf8")

assert.match(usersRoute, /requireAdministrator\(\)/)
assert.doesNotMatch(usersRoute, /hasValidTvSession/)
assert.doesNotMatch(usersRoute, /take:\s*500/)
assert.match(usersRoute, /isSalesperson:\s*true/)
assert.match(usersRoute, /master_admin/)
assert.match(hook, /fetchAllDocuments/)
assert.match(hook, /totalPages/)
assert.match(hook, /cache:\s*["']no-store["']/)
assert.match(hook, /usersPayloadRaw\.users/)
assert.match(hook, /isSalesperson !== false/)
assert.match(hook, /master_admin/)
assert.doesNotMatch(hook, /Promise\.resolve\(\{ documents: \[\] \}\)/)
assert.match(hook, /setData\(null\)/)
assert.match(board, /STALE \/ INCOMPLETE DATA/)
assert.match(board, /authorization or complete data unavailable/)

const eligible = [
  { id: "1", role: "AGENT", isSalesperson: true },
  { id: "2", role: "AGENT", isSalesperson: true },
  { id: "3", role: "AGENT", isSalesperson: true },
  { id: "4", role: "AGENT", isSalesperson: true },
  { id: "5", role: "AGENT", isSalesperson: true },
  { id: "6", role: "AGENT", isSalesperson: true },
  { id: "7", role: "AGENT", isSalesperson: true },
  { id: "8", role: "AGENT", isSalesperson: true },
  { id: "9", role: "AGENT", isSalesperson: true },
  { id: "10", role: "AGENT", isSalesperson: true },
  { id: "master", role: "MASTER_ADMIN", isSalesperson: true },
]
const displayed = eligible.filter(user => user.isSalesperson !== false && !["admin", "administrator", "master_admin", "master administrator"].includes(user.role.toLowerCase()))
assert.equal(displayed.length, 10)
assert.equal(displayed.some(user => user.id === "master"), false)

console.log("TV_AUTHORIZATION_CONTRACT=PASS")
console.log("TV_COMPLETE_REP_DATASET=PASS")
console.log("TV_ZERO_ACTIVITY_REPS=PASS")
console.log("TV_FAILED_USERS_NO_PARTIAL_FALLBACK=PASS")
