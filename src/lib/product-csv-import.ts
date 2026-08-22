import { parse } from "csv-parse/sync"

export type CatalogImportProduct = {
  sku: string
  name: string
  descriptionText: string
  price: number
  cost: number
  category: string
  manufacturer: string
  vendor: string
  productType: string
  toolType: string
  equipment: string
  application: string
  size: string
  materials: string[]
  attributes: Record<string, string | string[] | number | boolean>
  imageUrl: string
  barcode: string
  weightGrams: number | null
  status: string
}

type CsvRow = Record<string, string>

const META_FIELDS: Array<[string, string]> = [
  ["Blade Diameter (product.metafields.custom.blade_diameter)", "Blade Diameter"],
  ["Equipment (product.metafields.custom.equipment)", "Equipment"],
  ["Segment Height (product.metafields.custom.segment_height)", "Segment Height"],
  ["Slot Type (product.metafields.custom.slot_type)", "Slot Type"],
  ["Blade material (product.metafields.shopify.blade-material)", "Blade Material"],
  ["Color (product.metafields.shopify.color-pattern)", "Color"],
  ["Handle material (product.metafields.shopify.handle-material)", "Handle Material"],
  ["Suitable for material type (product.metafields.shopify.suitable-for-material-type)", "Suitable Materials"],
]

const CORE_COLUMNS = new Set([
  "Handle", "Title", "Body (HTML)", "Vendor", "Product Category", "Type", "Tags", "Published",
  "Variant SKU", "Variant Price", "Variant Compare At Price", "Variant Barcode", "Variant Grams",
  "Image Src", "Variant Image", "Cost per item", "Status",
])

const attributeLabel = (column: string) => column
  .replace(/\s*\(product\.metafields\.[^)]+\)\s*$/i, "")
  .replace(/^Google Shopping\s*\/\s*/i, "Google Shopping: ")
  .trim()

const clean = (value: unknown) => String(value ?? "").trim()
const numberValue = (value: unknown) => {
  const parsed = Number.parseFloat(clean(value).replace(/[$,]/g, ""))
  return Number.isFinite(parsed) ? parsed : 0
}
const stripHtml = (value: string) => value
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ")
  .trim()

const splitValues = (value: string) => Array.from(new Set(value
  .split(/[;,|]/)
  .map(part => part.trim().replace(/-/g, " "))
  .filter(Boolean)))

function inferToolType(row: CsvRow) {
  const haystack = `${clean(row.Title)} ${clean(row["Product Category"])} ${clean(row.Type)}`.toLowerCase()
  const types: Array<[RegExp, string]> = [
    [/core bit/, "Core Bit"], [/blade/, "Blade"], [/polish/, "Polishing Tool"],
    [/grind|cup wheel/, "Grinding Tool"], [/drill/, "Drill Bit"], [/router/, "Router Bit"],
    [/saw/, "Saw"], [/adapter/, "Adapter"], [/pad/, "Pad"], [/wheel/, "Wheel"],
  ]
  return types.find(([pattern]) => pattern.test(haystack))?.[1] || clean(row.Type)
}

function inferApplication(row: CsvRow, materials: string[]) {
  if (materials.length) return materials.join(", ")
  const description = stripHtml(clean(row["Body (HTML)"]))
  const match = description.match(/(?:ideal|suitable) for (?:cutting |use (?:on|with) )?([^.;]+)/i)
  return clean(match?.[1])
}

function inferEquipment(row: CsvRow) {
  const explicit = clean(row["Equipment (product.metafields.custom.equipment)"])
  if (explicit) return explicit
  const description = stripHtml(clean(row["Body (HTML)"]) || clean(row["SEO Description"]))
  return clean(description.match(/compatible with\s+([^.;]+)/i)?.[1])
}

function inferSize(row: CsvRow) {
  const description = stripHtml(clean(row["Body (HTML)"]) || clean(row["SEO Description"]))
  const described = clean(description.match(/\bsize\s*:\s*([^.;]+)/i)?.[1])
  return described || clean(row["Blade Diameter (product.metafields.custom.blade_diameter)"])
}

export function parseProductCsv(csvText: string): CatalogImportProduct[] {
  const rows = parse(csvText.replace(/^\uFEFF/, ""), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as CsvRow[]

  const handleImages = new Map<string, string>()
  for (const row of rows) {
    const handle = clean(row.Handle).toLowerCase()
    const image = clean(row["Variant Image"]) || clean(row["Image Src"])
    if (handle && image && !handleImages.has(handle)) handleImages.set(handle, image)
  }

  const products = new Map<string, CatalogImportProduct>()
  for (const row of rows) {
    const sku = clean(row["Variant SKU"]).toUpperCase()
    if (!sku) continue
    const materials = splitValues(clean(row["Suitable for material type (product.metafields.shopify.suitable-for-material-type)"]))
    const bladeMaterials = splitValues(clean(row["Blade material (product.metafields.shopify.blade-material)"]))
    const attributes: CatalogImportProduct["attributes"] = {}
    for (const [column, label] of META_FIELDS) {
      const value = clean(row[column])
      if (value) attributes[label] = label.includes("Material") ? splitValues(value) : value
    }
    for (const [column, rawValue] of Object.entries(row)) {
      const value = clean(rawValue)
      if (!value || CORE_COLUMNS.has(column) || META_FIELDS.some(([known]) => known === column)) continue
      if (/^(Option\d (Name|Value)|SEO |Google Shopping|.*product\.metafields\.)/i.test(column)) {
        attributes[attributeLabel(column)] = /^(true|false)$/i.test(value) ? value.toLowerCase() === "true" : value
      }
    }
    const tags = splitValues(clean(row.Tags))
    if (tags.length) attributes.Tags = tags
    const compareAt = numberValue(row["Variant Compare At Price"])
    if (compareAt) attributes["Compare At Price"] = compareAt
    attributes.Published = clean(row.Published).toUpperCase() === "TRUE"

    const handle = clean(row.Handle).toLowerCase()
    const product: CatalogImportProduct = {
      sku,
      name: clean(row.Title) || sku,
      descriptionText: stripHtml(clean(row["Body (HTML)"]) || clean(row["SEO Description"])),
      price: numberValue(row["Variant Price"]),
      cost: numberValue(row["Cost per item"]),
      category: clean(row["Product Category"]) || "General",
      manufacturer: clean(row.Vendor),
      vendor: clean(row.Vendor),
      productType: clean(row.Type) || clean(row["Product Category"]).split(" > ").pop() || "General",
      toolType: inferToolType(row),
      equipment: inferEquipment(row),
      application: inferApplication(row, materials),
      size: inferSize(row),
      materials: Array.from(new Set([...materials, ...bladeMaterials])),
      attributes,
      imageUrl: clean(row["Variant Image"]) || clean(row["Image Src"]) || handleImages.get(handle) || "",
      barcode: clean(row["Variant Barcode"]),
      weightGrams: numberValue(row["Variant Grams"]) || null,
      status: clean(row.Status).toLowerCase() || "active",
    }
    products.set(sku, product)
  }
  return [...products.values()]
}

export function buildZohoDescription(product: CatalogImportProduct) {
  const primaryLabels = new Set(["Blade Diameter", "Equipment", "Blade Material", "Suitable Materials"])
  const additional = Object.entries(product.attributes)
    .filter(([label, value]) => !primaryLabels.has(label) && value !== "" && value !== false)
    .map(([label, value]) => `${label}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
  const details = [
    product.descriptionText,
    product.productType && `Product Type: ${product.productType}`,
    product.toolType && `Tool Type: ${product.toolType}`,
    product.equipment && `Equipment: ${product.equipment}`,
    product.application && `Application: ${product.application}`,
    product.size && `Size: ${product.size}`,
    product.materials.length && `Materials: ${product.materials.join(", ")}`,
    ...additional,
  ].filter(Boolean)
  return details.join("\n")
}
