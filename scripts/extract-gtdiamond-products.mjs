import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

const origin = "https://www.gtdiamond.com"
const categories = ["pro-blades", "saw-blades", "turbo-blades", "bridge-saw-blades", "core-bits", "grinding", "polishing", "tile-stone"]
const productPattern = /\{"databaseId":(\d+),"name":"([^"]*)","sku":"([^"]*)","slug":"([^"]*)","productCategories":\{"nodes":.*?"featuredImage":\{"node":(\{.*?\}|null)\},"galleryImages":\{"nodes":(\[.*?\])\},"applications":(\[.*?\]),"brands":(\[.*?\]),"machines":(\[.*?\]),"productLine":"([^"]*)","typeName":"([^"]*)"\}/gs

function decodeFlightMarkup(html) {
  return html
    .replaceAll("\\u0026", "&")
    .replaceAll("\\u003c", "<")
    .replaceAll("\\u003e", ">")
    .replaceAll('\\"', '"')
    .replaceAll("\\/", "/")
}

function parseJson(value, fallback) {
  try { return JSON.parse(value) } catch { return fallback }
}

const byId = new Map()
for (const category of categories) {
  const sourcePage = `${origin}/product-category/${category}`
  const response = await fetch(sourcePage, { headers: { "user-agent": "Titan Diamond catalog metadata importer/1.0" } })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${sourcePage}`)
  const decoded = decodeFlightMarkup(await response.text())
  for (const match of decoded.matchAll(productPattern)) {
    const featuredNode = parseJson(match[5], null)
    const galleryNodes = parseJson(match[6], [])
    const record = byId.get(match[1]) || {
      databaseId: Number(match[1]),
      name: match[2],
      sku: match[3],
      slug: match[4],
      categories: [],
      sourcePages: [],
      featuredImage: featuredNode?.sourceUrl || null,
      galleryImages: galleryNodes.map(image => image.sourceUrl).filter(Boolean),
      applications: parseJson(match[7], []),
      brands: parseJson(match[8], []),
      machines: parseJson(match[9], []),
      productLine: match[10],
      typeName: match[11],
    }
    if (!record.categories.includes(category)) record.categories.push(category)
    if (!record.sourcePages.includes(sourcePage)) record.sourcePages.push(sourcePage)
    byId.set(match[1], record)
  }
}

const products = [...byId.values()].sort((a, b) => a.sku.localeCompare(b.sku))
const outputPath = path.resolve("output/vendor/gtdiamond-product-catalog.json")
await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify({
  source: origin,
  extractedAt: new Date().toISOString(),
  categoryCount: categories.length,
  productCount: products.length,
  products,
}, null, 2)}\n`)
console.log(JSON.stringify({ outputPath, productCount: products.length, categories: Object.fromEntries(categories.map(category => [category, products.filter(product => product.categories.includes(category)).length])) }))
