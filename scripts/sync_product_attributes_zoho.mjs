import fs from "node:fs/promises"

const planPath = process.argv[2] || "outputs/product-attribute-sync/import-plan.json"
const apply = process.argv.includes("--apply")
const plan = JSON.parse(await fs.readFile(planPath, "utf8"))
const products = plan.products || []
const required = ["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REFRESH_TOKEN", "ZOHO_ORGANIZATION_ID"]
for (const key of required) if (!process.env[key]) throw new Error(`Missing ${key}`)
const dc = process.env.ZOHO_DC || "com"
const tokenResponse = await fetch(`https://accounts.zoho.${dc}/oauth/v2/token`, {
  method: "POST",
  body: new URLSearchParams({ refresh_token: process.env.ZOHO_REFRESH_TOKEN, client_id: process.env.ZOHO_CLIENT_ID, client_secret: process.env.ZOHO_CLIENT_SECRET, grant_type: "refresh_token" }),
})
if (!tokenResponse.ok) throw new Error(`Token request failed (${tokenResponse.status})`)
const accessToken = (await tokenResponse.json()).access_token
if (!accessToken) throw new Error("Zoho did not return an access token")
const headers = { Authorization: `Zoho-oauthtoken ${accessToken}` }
const base = `https://www.zohoapis.${dc}/books/v3`
const org = encodeURIComponent(process.env.ZOHO_ORGANIZATION_ID)
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function request(url, init = {}, attempt = 1) {
  const response = await fetch(url, { ...init, headers: { ...headers, ...(init.headers || {}) } })
  const body = await response.json().catch(() => ({}))
  if ((response.status === 429 || response.status >= 500) && attempt <= 8) {
    await sleep(Math.min(60000, 3000 * 2 ** (attempt - 1)))
    return request(url, init, attempt + 1)
  }
  if (!response.ok || (body.code !== undefined && body.code !== 0)) throw new Error(`${response.status}: ${body.message || JSON.stringify(body)}`)
  return body
}

const fieldData = await request(`${base}/settings/fields?organization_id=${org}&entity=item&filter_custom_fields=true`)
const fieldByApi = new Map((fieldData.fields || fieldData.custom_fields || []).map(field => [String(field.api_name || "").toLowerCase(), String(field.customfield_id || field.field_id || "")]))
const requiredFields = ["cf_product_type", "cf_tool_type", "cf_equipment", "cf_application", "cf_size", "cf_materials", "cf_segment_height", "cf_slot_type", "cf_blade_diameter"]
const missingFields = requiredFields.filter(name => !fieldByApi.get(name))
if (missingFields.length) throw new Error(`Missing Zoho fields: ${missingFields.join(", ")}`)

const items = []
for (let page = 1; ; page++) {
  const data = await request(`${base}/items?organization_id=${org}&page=${page}&per_page=200&filter_by=Status.All`)
  items.push(...(data.items || []))
  if (!data.page_context?.has_more_page) break
}
const bySku = new Map(items.map(item => [String(item.sku || "").trim().toUpperCase(), item]).filter(([sku]) => sku))
const preview = { products: products.length, updates: products.filter(p => bySku.has(p.sku)).length, creates: products.filter(p => !bySku.has(p.sku)).length, apply }
console.log(JSON.stringify(preview, null, 2))
if (!apply) process.exit(0)

const resultPath = "outputs/product-attribute-sync/zoho-sync-results.partial.json"
const results = []
const value = input => String(input || "").trim()
const attributeValue = (product, label) => {
  const input = product.attributes?.[label]
  return Array.isArray(input) ? input.join(", ") : value(input)
}
const customFields = product => [
  ["cf_product_type", product.productType], ["cf_tool_type", product.toolType], ["cf_equipment", product.equipment],
  ["cf_application", product.application], ["cf_size", product.size], ["cf_materials", product.materials.join(", ")],
  ["cf_segment_height", attributeValue(product, "Segment Height")], ["cf_slot_type", attributeValue(product, "Slot Type")],
  ["cf_blade_diameter", attributeValue(product, "Blade Diameter")],
].filter(([, fieldValue]) => value(fieldValue)).map(([apiName, fieldValue]) => ({ customfield_id: fieldByApi.get(apiName), value: value(fieldValue).slice(0, 255) }))

for (const [index, product] of products.entries()) {
  const existing = bySku.get(product.sku)
  try {
    // Existing Zoho descriptions are authoritative business content. Catalog
    // enrichment may add custom fields, but must never rewrite that text.
    const payload = existing ? {
      custom_fields: customFields(product),
    } : {
      name: product.name,
      sku: product.sku,
      rate: product.price,
      purchase_rate: product.cost,
      description: product.zohoDescription,
      product_type: "goods",
      custom_fields: customFields(product),
    }
    const endpoint = existing ? `${base}/items/${existing.item_id}?organization_id=${org}` : `${base}/items?organization_id=${org}`
    const data = await request(endpoint, { method: existing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    const itemId = String(existing?.item_id || data.item?.item_id || "")
    results.push({ sku: product.sku, status: "ok", action: existing ? "updated" : "created", itemId })
    if (!existing && itemId) bySku.set(product.sku, { item_id: itemId, sku: product.sku })
  } catch (error) {
    results.push({ sku: product.sku, status: "failed", action: existing ? "updated" : "created", error: String(error) })
  }
  await fs.writeFile(resultPath, JSON.stringify({ updatedAt: new Date().toISOString(), preview, results }, null, 2))
  console.log(`ZOHO_PROGRESS\t${index + 1}/${products.length}\t${results.at(-1).status.toUpperCase()}\t${product.sku}`)
  await sleep(1100)
}
const summary = { ...preview, succeeded: results.filter(r => r.status === "ok").length, failed: results.filter(r => r.status === "failed").length, failures: results.filter(r => r.status === "failed") }
await fs.writeFile("outputs/product-attribute-sync/zoho-sync-results.final.json", JSON.stringify({ completedAt: new Date().toISOString(), summary, results }, null, 2))
console.log(JSON.stringify(summary, null, 2))
