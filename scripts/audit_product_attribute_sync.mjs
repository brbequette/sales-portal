import fs from "node:fs/promises"
import { parse } from "csv-parse/sync"

const csvPath = process.argv[2] || "Sopify data/sproductinfo.csv"
const required = ["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REFRESH_TOKEN", "ZOHO_ORGANIZATION_ID"]
for (const key of required) if (!process.env[key]) throw new Error(`Missing ${key}`)

const rows = parse((await fs.readFile(csvPath, "utf8")).replace(/^\uFEFF/, ""), {
  columns: true,
  skip_empty_lines: true,
  relax_column_count: true,
  trim: true,
})
const bySku = new Map()
for (const row of rows) {
  const sku = String(row["Variant SKU"] || "").trim().toUpperCase()
  if (sku) bySku.set(sku, row)
}

const dc = process.env.ZOHO_DC || "com"
const tokenBody = new URLSearchParams({
  refresh_token: process.env.ZOHO_REFRESH_TOKEN,
  client_id: process.env.ZOHO_CLIENT_ID,
  client_secret: process.env.ZOHO_CLIENT_SECRET,
  grant_type: "refresh_token",
})
const tokenResponse = await fetch(`https://accounts.zoho.${dc}/oauth/v2/token`, { method: "POST", body: tokenBody })
if (!tokenResponse.ok) throw new Error(`Token request failed (${tokenResponse.status})`)
const tokenJson = await tokenResponse.json()
if (!tokenJson.access_token) throw new Error("Zoho did not return an access token")
const headers = { Authorization: `Zoho-oauthtoken ${tokenJson.access_token}` }
const base = `https://www.zohoapis.${dc}/books/v3`
const org = encodeURIComponent(process.env.ZOHO_ORGANIZATION_ID)

async function zohoJson(url) {
  const response = await fetch(url, { headers })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || (body.code !== undefined && body.code !== 0)) {
    throw new Error(body.message || `Zoho request failed (${response.status})`)
  }
  return body
}

const fieldData = await zohoJson(`${base}/settings/fields?organization_id=${org}&entity=item&filter_custom_fields=true`)
const fields = (fieldData.fields || fieldData.custom_fields || []).map(field => ({
  id: String(field.customfield_id || field.field_id || ""),
  label: String(field.label || ""),
  apiName: String(field.api_name || ""),
  dataType: String(field.data_type || field.dataType || ""),
  active: field.is_active !== false,
}))
const zohoItems = []
for (let page = 1; ; page++) {
  const data = await zohoJson(`${base}/items?organization_id=${org}&page=${page}&per_page=200&filter_by=Status.All`)
  zohoItems.push(...(data.items || []))
  if (!data.page_context?.has_more_page) break
}
const zohoSkus = new Set(zohoItems.map(item => String(item.sku || "").trim().toUpperCase()).filter(Boolean))
const sourceSkus = [...bySku.keys()]
const itemBySku = new Map(zohoItems.map(item => [String(item.sku || "").trim().toUpperCase(), item]))
const desiredLabels = ["Product Type", "Tool Type", "Equipment", "Application", "Size", "Materials", "Segment Height", "Slot Type", "Blade Diameter"]
const normalize = value => String(value || "").toLowerCase().replace(/^cf_/, "").replace(/[^a-z0-9]+/g, "")
const desiredFields = desiredLabels.map(label => ({
  label,
  match: fields.find(field => normalize(field.label) === normalize(label) || normalize(field.apiName) === normalize(label)) || null,
}))
const equipmentColumn = "Equipment (product.metafields.custom.equipment)"
const sizeColumn = "Blade Diameter (product.metafields.custom.blade_diameter)"
const materialsColumn = "Suitable for material type (product.metafields.shopify.suitable-for-material-type)"
const hasDescriptionSize = row => /\bsize\s*:\s*[^.;<]+/i.test(String(row["Body (HTML)"] || row["SEO Description"] || ""))
const verificationSamples = []
for (const sku of sourceSkus.filter(sku => zohoSkus.has(sku)).slice(0, 3)) {
  const listed = itemBySku.get(sku)
  const detail = await zohoJson(`${base}/items/${encodeURIComponent(listed.item_id)}?organization_id=${org}`)
  const item = detail.item || {}
  const customFields = [...(item.custom_fields || []), ...(item.item_custom_fields || [])]
  verificationSamples.push({
    sku,
    itemId: String(item.item_id || listed.item_id),
    populatedAttributeFields: customFields
      .filter(field => field.value !== null && field.value !== undefined && field.value !== "")
      .map(field => String(field.api_name || field.label || field.customfield_id || ""))
      .filter(field => /product_type|tool_type|equipment|application|size|materials|segment_height|slot_type|blade_diameter/i.test(field)),
  })
}

const report = {
  generatedAt: new Date().toISOString(),
  source: {
    rows: rows.length,
    uniqueSkus: sourceSkus.length,
    withEquipment: sourceSkus.filter(sku => String(bySku.get(sku)[equipmentColumn] || "").trim()).length,
    withApplicationMaterial: sourceSkus.filter(sku => String(bySku.get(sku)[materialsColumn] || "").trim()).length,
    withBladeDiameter: sourceSkus.filter(sku => String(bySku.get(sku)[sizeColumn] || "").trim()).length,
    withDescriptionSize: sourceSkus.filter(sku => hasDescriptionSize(bySku.get(sku))).length,
  },
  zoho: {
    items: zohoItems.length,
    itemsWithSku: zohoSkus.size,
    sourceSkuMatches: sourceSkus.filter(sku => zohoSkus.has(sku)).length,
    sourceSkusMissingInZoho: sourceSkus.filter(sku => !zohoSkus.has(sku)),
    desiredFields,
    availableItemFields: fields,
    verificationSamples,
  },
}
await fs.mkdir("outputs/product-attribute-sync", { recursive: true })
await fs.writeFile("outputs/product-attribute-sync/audit.json", JSON.stringify(report, null, 2))
console.log(JSON.stringify({ source: report.source, zoho: { ...report.zoho, sourceSkusMissingInZoho: report.zoho.sourceSkusMissingInZoho.length, availableItemFields: fields.length } }, null, 2))
