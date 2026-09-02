import fs from "node:fs/promises"
import path from "node:path"

const apply = process.argv.includes("--apply")
const confirmed = process.argv.includes("--confirm") && process.argv.includes("RESTORE_SIGNATURE_DESCRIPTIONS")
if (apply && !confirmed) throw new Error("Apply requires --confirm RESTORE_SIGNATURE_DESCRIPTIONS")

const rollbackPath = "outputs/zoho-image-publish/2026-08-21T20-29-58-107Z/rollback-titan-themes.json"
const planPath = "outputs/product-attribute-sync/import-plan.json"
const resultPath = "outputs/product-attribute-sync/zoho-sync-results.final.json"
const rollback = JSON.parse(await fs.readFile(rollbackPath, "utf8"))
const plan = JSON.parse(await fs.readFile(planPath, "utf8")).products || []
const results = JSON.parse(await fs.readFile(resultPath, "utf8")).results || []

const normalizeSku = value => String(value || "").trim().toUpperCase()
const planBySku = new Map(plan.map(item => [normalizeSku(item.sku), item]))
const successful = new Set(results.filter(item => item.status === "ok" && item.action === "updated").map(item => normalizeSku(item.sku)))
const candidates = rollback.flatMap(item => {
  const sku = normalizeSku(item.sku)
  const changed = planBySku.get(sku)
  if (!successful.has(sku) || !changed) return []
  let original
  try { original = JSON.parse(item.description || "{}") } catch { return [] }
  if (!original.itemId || typeof original.text !== "string") return []
  return [{ sku, itemId: String(original.itemId), originalDescription: original.text, accidentalDescription: String(changed.zohoDescription || "") }]
})

const required = ["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REFRESH_TOKEN", "ZOHO_ORGANIZATION_ID"]
for (const key of required) if (!process.env[key]) throw new Error(`Missing ${key}`)
const dc = process.env.ZOHO_DC || "com"
const tokenResponse = await fetch(`https://accounts.zoho.${dc}/oauth/v2/token`, {
  method: "POST",
  body: new URLSearchParams({
    refresh_token: process.env.ZOHO_REFRESH_TOKEN,
    client_id: process.env.ZOHO_CLIENT_ID,
    client_secret: process.env.ZOHO_CLIENT_SECRET,
    grant_type: "refresh_token",
  }),
})
if (!tokenResponse.ok) throw new Error(`Zoho token request failed (${tokenResponse.status})`)
const token = (await tokenResponse.json()).access_token
if (!token) throw new Error("Zoho access token missing")

const base = `https://www.zohoapis.${dc}/books/v3/items`
const org = encodeURIComponent(process.env.ZOHO_ORGANIZATION_ID)
const headers = { Authorization: `Zoho-oauthtoken ${token}` }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const audit = []

for (const candidate of candidates) {
  const response = await fetch(`${base}/${encodeURIComponent(candidate.itemId)}?organization_id=${org}`, { headers })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body.code !== 0) {
    audit.push({ ...candidate, originalDescription: undefined, accidentalDescription: undefined, status: "READ_FAILED", error: body.message || `HTTP ${response.status}` })
    continue
  }
  const liveDescription = String(body.item?.description || "")
  const status = liveDescription === candidate.accidentalDescription
    ? "READY_TO_RESTORE"
    : liveDescription === candidate.originalDescription ? "ALREADY_ORIGINAL" : "CONFLICT_SKIPPED"
  audit.push({ ...candidate, liveDescription, status })
  await sleep(250)
}

const runId = new Date().toISOString().replace(/[:.]/g, "-")
const outputDir = path.join("outputs", "zoho-description-repair", runId)
await fs.mkdir(outputDir, { recursive: true })
await fs.writeFile(path.join(outputDir, "before.json"), JSON.stringify({ createdAt: new Date().toISOString(), apply, audit }, null, 2))

if (apply) {
  for (const item of audit.filter(entry => entry.status === "READY_TO_RESTORE")) {
    const response = await fetch(`${base}/${encodeURIComponent(item.itemId)}?organization_id=${org}`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ description: item.originalDescription }),
    })
    const body = await response.json().catch(() => ({}))
    item.restoreStatus = response.ok && body.code === 0 ? "RESTORED" : "RESTORE_FAILED"
    if (item.restoreStatus === "RESTORE_FAILED") item.restoreError = body.message || `HTTP ${response.status}`
    await sleep(1100)
  }
}

await fs.writeFile(path.join(outputDir, "result.json"), JSON.stringify({ completedAt: new Date().toISOString(), apply, audit }, null, 2))
const summary = {
  outputDir,
  candidates: audit.length,
  ready: audit.filter(item => item.status === "READY_TO_RESTORE").length,
  alreadyOriginal: audit.filter(item => item.status === "ALREADY_ORIGINAL").length,
  conflictsSkipped: audit.filter(item => item.status === "CONFLICT_SKIPPED").length,
  readFailed: audit.filter(item => item.status === "READ_FAILED").length,
  restored: audit.filter(item => item.restoreStatus === "RESTORED").length,
  restoreFailed: audit.filter(item => item.restoreStatus === "RESTORE_FAILED").length,
}
console.log(JSON.stringify(summary, null, 2))
if (summary.readFailed || summary.restoreFailed) process.exitCode = 2
