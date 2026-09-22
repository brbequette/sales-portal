import assert from "node:assert/strict"
import fs from "node:fs"

const createHandler = fs.readFileSync("netlify/functions/campaign-job-create.ts", "utf8")
const statusHandler = fs.readFileSync("netlify/functions/campaign-job-status.ts", "utf8")
const manager = fs.readFileSync("src/lib/campaign-manager.ts", "utf8")
const topBar = fs.readFileSync("src/components/GlobalTopBar.tsx", "utf8")

for (const [name, source] of [["create", createHandler], ["continuation", statusHandler]]) {
  assert.match(source, /MISSING_CAMPAIGN_PHONE_ERROR/, `${name} path must retain the missing-phone reason`)
  assert.match(source, /campaignLog\.createMany/, `${name} path must persist recipient failure logs`)
  assert.match(source, /resolveCampaignChunkState/, `${name} path must apply provider-wide fail-fast`)
  assert.match(source, /errorMessage/, `${name} path must persist a job-level failure reason`)
  assert.match(source, /error:/, `${name} response must return the failure reason`)
}

assert.match(manager, /completedWithNoDeliveries/, "zero-delivery completion must become a visible error")
assert.match(manager, /error: data\.error \|\| this\.state\.error/, "polling must retain the server failure reason")
assert.match(topBar, /Campaign Failed/, "the global campaign banner must expose failure state")
assert.match(topBar, /campaignState\.error/, "the global campaign banner must render the failure reason")

console.log("campaign delivery contracts passed")
