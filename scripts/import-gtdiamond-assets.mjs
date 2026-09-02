import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

const origin = "https://www.gtdiamond.com"
const categories = [
  "pro-blades",
  "saw-blades",
  "turbo-blades",
  "bridge-saw-blades",
  "core-bits",
  "grinding",
  "polishing",
  "tile-stone",
]
const outputRoot = path.resolve("output/vendor/gtdiamond-originals")
const manifestPath = path.join(outputRoot, "manifest.json")
const assetPattern = /https:\/\/admin\.gtdiamond\.com\/wp-content\/uploads\/[^"'<>\\\s]+?\.(?:png|jpe?g|webp)/gi

async function fetchRequired(url) {
  const response = await fetch(url, { headers: { "user-agent": "Titan Diamond catalog asset importer/1.0" } })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`)
  return response
}

function localPathFor(sourceUrl) {
  const parsed = new URL(sourceUrl)
  const marker = "/wp-content/uploads/"
  const relative = decodeURIComponent(parsed.pathname.slice(parsed.pathname.indexOf(marker) + marker.length))
  return path.join(outputRoot, ...relative.split("/").map(part => part.replace(/[<>:"|?*]/g, "-")))
}

await mkdir(outputRoot, { recursive: true })
const inventory = new Map()

for (const category of categories) {
  const pageUrl = `${origin}/product-category/${category}`
  const html = await (await fetchRequired(pageUrl)).text()
  const urls = [...html.matchAll(assetPattern)].map(match => match[0].replaceAll("\\/", "/"))
  for (const sourceUrl of new Set(urls)) {
    const record = inventory.get(sourceUrl) || { sourceUrl, sourcePages: [], categories: [] }
    if (!record.sourcePages.includes(pageUrl)) record.sourcePages.push(pageUrl)
    if (!record.categories.includes(category)) record.categories.push(category)
    inventory.set(sourceUrl, record)
  }
}

const records = [...inventory.values()].sort((a, b) => a.sourceUrl.localeCompare(b.sourceUrl))
let downloaded = 0
let failed = 0

for (const record of records) {
  const destination = localPathFor(record.sourceUrl)
  const archivePath = path.relative(path.resolve("output"), destination).split(path.sep).join("/")
  try {
    const response = await fetchRequired(record.sourceUrl)
    const bytes = Buffer.from(await response.arrayBuffer())
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, bytes)
    Object.assign(record, {
      archivePath,
      contentType: response.headers.get("content-type"),
      byteLength: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      downloadedAt: new Date().toISOString(),
    })
    downloaded += 1
  } catch (error) {
    record.error = error instanceof Error ? error.message : String(error)
    failed += 1
  }
}

await writeFile(manifestPath, `${JSON.stringify({
  source: origin,
  generatedAt: new Date().toISOString(),
  categories,
  assetCount: records.length,
  downloaded,
  failed,
  rightsNote: "Publicly accessible vendor assets. Confirm Titan's publishing rights and SKU mapping before referencing them in customer-facing pages.",
  assets: records,
}, null, 2)}\n`)

console.log(JSON.stringify({ manifestPath, assetCount: records.length, downloaded, failed }))
