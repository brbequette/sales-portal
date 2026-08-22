import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"
import { buildZohoDescription, parseProductCsv, type CatalogImportProduct } from "@/lib/product-csv-import"
import { getZohoAccessToken, ZOHO_DC, ZOHO_ORGANIZATION_ID } from "../../../../../../netlify/functions/lib/zoho-auth"

export const runtime = "nodejs"
export const maxDuration = 60

type ZohoItem = {
  item_id: string; sku?: string; image_name?: string; name?: string; rate?: number
  purchase_rate?: number; description?: string; product_type?: string
  custom_fields?: Array<{ customfield_id?: string; value?: unknown }>
  item_custom_fields?: Array<{ customfield_id?: string; value?: unknown }>
}
type ZohoField = { customfield_id?: string; field_id?: string; label?: string; api_name?: string }
type ImportFailure = { sku: string; message: string }
type ImportDiff = { sku: string; field: string; current: unknown; incoming: unknown; action: "fill" | "preserve" | "create"; reason: string }
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)

const zohoBase = `https://www.zohoapis.${ZOHO_DC}/books/v3`
const authHeaders = (token: string) => ({ Authorization: `Zoho-oauthtoken ${token}` })

async function zohoJson(url: string, token: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(20000),
    headers: { ...authHeaders(token), ...(init?.headers || {}) },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || (body.code !== undefined && body.code !== 0)) {
    throw new Error(body.message || `Zoho request failed (${response.status})`)
  }
  return body
}

async function fetchZohoItems(token: string) {
  const result = new Map<string, ZohoItem>()
  let page = 1
  let hasMore = true
  while (hasMore) {
    const data = await zohoJson(`${zohoBase}/items?organization_id=${ZOHO_ORGANIZATION_ID}&page=${page}&per_page=200&filter_by=Status.All`, token)
    for (const item of data.items || []) {
      if (item.sku) result.set(String(item.sku).trim().toUpperCase(), item)
    }
    hasMore = Boolean(data.page_context?.has_more_page)
    page++
  }
  return result
}

async function fetchItemCustomFields(token: string) {
  const data = await zohoJson(`${zohoBase}/settings/fields?organization_id=${ZOHO_ORGANIZATION_ID}&entity=item&filter_custom_fields=true`, token)
  const fields = (data.fields || data.custom_fields || []) as ZohoField[]
  return new Map<string, string>(fields
    .filter(field => field.customfield_id || field.field_id)
    .flatMap(field => {
      const id = String(field.customfield_id || field.field_id)
      return [field.label, field.api_name]
        .filter((key): key is string => Boolean(key))
        .map(key => [key.toLowerCase(), id] as [string, string])
    }))
}

function zohoCustomFields(product: CatalogImportProduct, available: Map<string, string>, existing?: ZohoItem, fillOnly = true) {
  const values: Record<string, string> = {
    "product type": product.productType,
    "tool type": product.toolType,
    equipment: product.equipment,
    application: product.application,
    size: product.size,
    materials: product.materials.join(", "),
    barcode: product.barcode,
    "image url": product.imageUrl,
  }
  for (const [label, value] of Object.entries(product.attributes)) {
    values[label.toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value)
  }
  const populatedIds = new Set([...(existing?.custom_fields || []), ...(existing?.item_custom_fields || [])]
    .filter(field => field.value !== null && field.value !== undefined && field.value !== "")
    .map(field => field.customfield_id))
  return Object.entries(values).flatMap(([label, value]) => {
    const id = available.get(label) || available.get(`cf_${label.replace(/\s+/g, "_")}`)
    return id && value && (!fillOnly || !populatedIds.has(id)) ? [{ customfield_id: id, value }] : []
  })
}

async function syncZohoItem(product: CatalogImportProduct, existing: ZohoItem | undefined, token: string, fields: Map<string, string>, fillOnly: boolean) {
  const incoming = {
    name: product.name,
    sku: product.sku,
    rate: product.price,
    purchase_rate: product.cost,
    description: buildZohoDescription(product),
    product_type: "goods",
    custom_fields: zohoCustomFields(product, fields, existing, fillOnly),
  }
  const payload: Record<string, unknown> = existing && fillOnly
    ? Object.fromEntries(Object.entries(incoming).filter(([key, value]) => {
        if (key === "custom_fields") return Array.isArray(value) && value.length > 0
        const current = existing[key as keyof ZohoItem]
        return current === null || current === undefined || current === "" || current === 0
      }))
    : incoming
  if (existing && Object.keys(payload).length === 0) return existing.item_id
  const url = existing
    ? `${zohoBase}/items/${existing.item_id}?organization_id=${ZOHO_ORGANIZATION_ID}`
    : `${zohoBase}/items?organization_id=${ZOHO_ORGANIZATION_ID}`
  const data = await zohoJson(url, token, {
    method: existing ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  return String(existing?.item_id || data.item?.item_id || "")
}

async function syncZohoImage(product: CatalogImportProduct, itemId: string, token: string) {
  if (!product.imageUrl || !itemId) return false
  const source = await fetch(product.imageUrl, { signal: AbortSignal.timeout(20000) })
  if (!source.ok) throw new Error(`Image download failed (${source.status})`)
  const contentType = source.headers.get("content-type") || "image/jpeg"
  const extension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg"
  const form = new FormData()
  form.append("image", new Blob([await source.arrayBuffer()], { type: contentType }), `${product.sku}.${extension}`)
  await zohoJson(`${zohoBase}/items/${itemId}/image?organization_id=${ZOHO_ORGANIZATION_ID}`, token, { method: "POST", body: form })
  return true
}

function localData(product: CatalogImportProduct, itemId?: string, existingDescription?: string | null): Prisma.ProductUncheckedCreateInput {
  let existingMeta: Record<string, unknown> = {}
  try { existingMeta = JSON.parse(existingDescription || "{}") } catch { existingMeta = {} }
  const description = JSON.stringify({
    ...existingMeta,
    text: product.descriptionText,
    cost: product.cost,
    retail: product.price,
    image: product.imageUrl,
    itemId: itemId || existingMeta.itemId || undefined,
    status: product.status,
    attributes: product.attributes,
  })
  return {
    sku: product.sku,
    name: product.name,
    description,
    price: product.price,
    category: product.category,
    application: product.application || null,
    size: product.size || null,
    manufacturer: product.manufacturer || null,
    vendor: product.vendor || null,
    productType: product.productType || null,
    toolType: product.toolType || null,
    equipment: product.equipment || null,
    materials: product.materials,
    attributes: product.attributes,
    imageUrl: product.imageUrl || null,
    barcode: product.barcode || null,
    weightGrams: product.weightGrams,
    source: "shopify-csv",
  }
}

const isEmpty = (value: unknown) => value === null || value === undefined || value === "" || value === 0 ||
  (Array.isArray(value) && value.length === 0) ||
  (typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 0)

function fillOnlyData(incoming: Prisma.ProductUncheckedCreateInput, existing: Record<string, unknown>) {
  const result: Record<string, unknown> = {}
  for (const [field, value] of Object.entries(incoming)) {
    if (field === "sku") continue
    if (isEmpty(existing[field]) && !isEmpty(value)) result[field] = value
  }
  let oldMeta: Record<string, unknown> = {}
  let newMeta: Record<string, unknown> = {}
  try { oldMeta = JSON.parse(String(existing.description || "{}")) } catch { oldMeta = {} }
  try { newMeta = JSON.parse(String(incoming.description || "{}")) } catch { newMeta = {} }
  const mergedMeta = { ...oldMeta }
  for (const [field, value] of Object.entries(newMeta)) {
    if (isEmpty(mergedMeta[field]) && !isEmpty(value)) mergedMeta[field] = value
  }
  if (JSON.stringify(mergedMeta) !== JSON.stringify(oldMeta)) result.description = JSON.stringify(mergedMeta)
  const oldAttributes = (existing.attributes && typeof existing.attributes === "object" && !Array.isArray(existing.attributes)) ? existing.attributes as Record<string, unknown> : {}
  const newAttributes = (incoming.attributes && typeof incoming.attributes === "object" && !Array.isArray(incoming.attributes)) ? incoming.attributes as Record<string, unknown> : {}
  const mergedAttributes = { ...newAttributes, ...oldAttributes }
  if (JSON.stringify(mergedAttributes) !== JSON.stringify(oldAttributes)) result.attributes = mergedAttributes
  const oldMaterials = Array.isArray(existing.materials) ? existing.materials : []
  const newMaterials = Array.isArray(incoming.materials) ? incoming.materials : []
  const mergedMaterials = Array.from(new Set([...oldMaterials, ...newMaterials]))
  if (mergedMaterials.length !== oldMaterials.length) result.materials = mergedMaterials
  return result as Prisma.ProductUncheckedUpdateInput
}

function productDiffs(product: CatalogImportProduct, existing?: Record<string, unknown>): ImportDiff[] {
  if (!existing) return [{ sku: product.sku, field: "product", current: null, incoming: product.name, action: "create", reason: "SKU does not exist in the portal" }]
  const incoming = localData(product)
  const diffs: ImportDiff[] = []
  const labels: Record<string, string> = {
    name: "Name", price: "Price", category: "Category", application: "Application", size: "Size",
    manufacturer: "Manufacturer", vendor: "Vendor", productType: "Product type", toolType: "Tool type",
    equipment: "Equipment", materials: "Materials", imageUrl: "Image", barcode: "Barcode", weightGrams: "Weight",
  }
  for (const [field, label] of Object.entries(labels)) {
    const current = existing[field]
    const value = incoming[field as keyof typeof incoming]
    if (isEmpty(value)) continue
    if (isEmpty(current)) diffs.push({ sku: product.sku, field: label, current, incoming: value, action: "fill", reason: "Existing field is empty" })
    else if (JSON.stringify(current) !== JSON.stringify(value)) diffs.push({ sku: product.sku, field: label, current, incoming: value, action: "preserve", reason: "Existing non-empty value differs; it will be preserved" })
  }
  const currentAttributes = (existing.attributes && typeof existing.attributes === "object" && !Array.isArray(existing.attributes)) ? existing.attributes as Record<string, unknown> : {}
  for (const [label, value] of Object.entries(product.attributes)) {
    const current = currentAttributes[label]
    if (isEmpty(current)) diffs.push({ sku: product.sku, field: `Attribute: ${label}`, current, incoming: value, action: "fill", reason: "Attribute does not exist" })
    else if (JSON.stringify(current) !== JSON.stringify(value)) diffs.push({ sku: product.sku, field: `Attribute: ${label}`, current, incoming: value, action: "preserve", reason: "Existing attribute differs; it will be preserved" })
  }
  return diffs
}

export async function POST(request: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  try {
    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) return NextResponse.json({ error: "CSV file is required" }, { status: 400 })
    if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "CSV must be 20 MB or smaller" }, { status: 413 })

    const mode = form.get("mode") === "apply" ? "apply" : "preview"
    const requestedZoho = form.get("syncZoho") === "true"
    const syncZoho = mode === "apply" && requestedZoho
    const syncImages = syncZoho && form.get("syncImages") === "true"
    const fillOnly = form.get("fillOnly") !== "false"
    const createMissing = form.get("createMissing") === "true"
    const offset = Math.max(0, Number.parseInt(String(form.get("offset") || "0"), 10) || 0)
    const requestedLimit = Number.parseInt(String(form.get("limit") || "50"), 10) || 50
    const limit = Math.min(Math.max(requestedLimit, 1), syncZoho ? 50 : 5000)
    const allProducts = parseProductCsv(await file.text())
    const batch = allProducts.slice(offset, offset + limit)
    const existingLocal = await prisma.product.findMany({
      where: { sku: { in: batch.map(product => product.sku), mode: "insensitive" } },
      select: {
        id: true, sku: true, name: true, description: true, price: true, category: true, stock: true,
        subjectToVig: true, giftItem: true, size: true, application: true, manufacturer: true, vendor: true,
        qualityTier: true, productType: true, toolType: true, equipment: true, materials: true, attributes: true,
        imageUrl: true, barcode: true, weightGrams: true, source: true,
      },
    })
    const localBySku = new Map(existingLocal.map(product => [product.sku.toUpperCase(), product]))
    const summary = {
      rows: allProducts.length,
      batchStart: offset,
      batchSize: batch.length,
      nextOffset: offset + batch.length < allProducts.length ? offset + batch.length : null,
      createLocal: batch.filter(product => !localBySku.has(product.sku)).length,
      skippedMissing: !createMissing ? batch.filter(product => !localBySku.has(product.sku)).length : 0,
      updateLocal: batch.filter(product => localBySku.has(product.sku)).length,
      withImages: batch.filter(product => product.imageUrl).length,
      withAttributes: batch.filter(product => Object.keys(product.attributes).length).length,
      createdZoho: 0,
      updatedZoho: 0,
      uploadedImages: 0,
      fillOnly,
      createMissing,
      diffs: batch.flatMap(product => productDiffs(product, localBySku.get(product.sku))).slice(0, 2000) as ImportDiff[],
      questionableCount: 0,
      failures: [] as ImportFailure[],
    }
    summary.questionableCount = summary.diffs.filter(diff => diff.action !== "fill").length
    if (mode === "preview") {
      return NextResponse.json({ success: true, mode, summary, sample: batch.slice(0, 10) })
    }

    let token = ""
    let zohoItems = new Map<string, ZohoItem>()
    let customFields = new Map<string, string>()
    if (syncZoho) {
      token = await getZohoAccessToken()
      ;[zohoItems, customFields] = await Promise.all([fetchZohoItems(token), fetchItemCustomFields(token)])
    }

    for (const product of batch) {
      const localExisting = localBySku.get(product.sku)
      if (!localExisting && !createMissing) continue
      let itemId: string | undefined
      try {
        const zohoExisting = zohoItems.get(product.sku)
        itemId = syncZoho && (zohoExisting || createMissing) ? await syncZohoItem(product, zohoExisting, token, customFields, fillOnly) : undefined
        if (syncZoho) {
          if (zohoExisting) summary.updatedZoho++
          else if (createMissing) summary.createdZoho++
        }
        if (syncImages && itemId && (!fillOnly || !zohoExisting?.image_name) && await syncZohoImage(product, itemId, token)) summary.uploadedImages++
      } catch (error: unknown) {
        summary.failures.push({ sku: product.sku, message: `Zoho: ${errorMessage(error) || "sync failed"}` })
      }
      try {
        const data = localData(product, itemId, localExisting?.description)
        if (localExisting) await prisma.product.update({ where: { id: localExisting.id }, data: fillOnly ? fillOnlyData(data, localExisting) : data })
        else await prisma.product.create({ data })
      } catch (error: unknown) {
        summary.failures.push({ sku: product.sku, message: `Catalog: ${errorMessage(error) || "import failed"}` })
      }
    }
    return NextResponse.json({ success: summary.failures.length === 0, mode, summary })
  } catch (error: unknown) {
    console.error("Product CSV import failed:", error)
    return NextResponse.json({ error: errorMessage(error) || "Product CSV import failed" }, { status: 500 })
  }
}
