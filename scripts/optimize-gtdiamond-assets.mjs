import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

const sourceRoot = path.resolve("output/vendor/gtdiamond-originals")
const outputRoot = path.resolve("public/images/vendor/gtdiamond-web")
const sourceManifest = JSON.parse(await readFile(path.join(sourceRoot, "manifest.json"), "utf8"))

function productCandidate(sourceUrl) {
  const filename = decodeURIComponent(new URL(sourceUrl).pathname.split("/").pop() || "")
  const stem = filename.replace(/\.(png|jpe?g|webp)$/i, "")
  const normalized = stem
    .replace(/^Main_/i, "")
    .replace(/_Closeup_/i, "_")
    .replace(/_(?:G|C|S)_/g, "_")
    .replace(/_(?:19|20)\d{2}(?:_\d+)?$/i, "")
  return {
    sourceFilename: filename,
    productCandidate: normalized,
    skuPrefix: normalized.split("_")[0],
    view: /^Main_/i.test(stem) ? "main" : /Closeup/i.test(stem) ? "closeup" : "alternate",
  }
}

await mkdir(outputRoot, { recursive: true })
const assets = []
let failed = 0

for (const source of sourceManifest.assets) {
  const sourceFile = path.resolve("output", source.archivePath)
  const relative = path.relative(sourceRoot, sourceFile)
  const destination = path.join(outputRoot, relative.replace(/\.(png|jpe?g|webp)$/i, ".webp"))
  try {
    await mkdir(path.dirname(destination), { recursive: true })
    const info = await sharp(sourceFile)
      .rotate()
      .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, alphaQuality: 90, effort: 5 })
      .toFile(destination)
    assets.push({
      ...source,
      ...productCandidate(source.sourceUrl),
      optimizedPublicPath: `/${path.relative(path.resolve("public"), destination).split(path.sep).join("/")}`,
      optimizedByteLength: info.size,
      width: info.width,
      height: info.height,
    })
  } catch (error) {
    assets.push({ ...source, ...productCandidate(source.sourceUrl), optimizationError: error instanceof Error ? error.message : String(error) })
    failed += 1
  }
}

const products = Object.values(assets.reduce((index, asset) => {
  const key = `${asset.categories[0] || "uncategorized"}:${asset.productCandidate}`
  const product = index[key] || { key, productCandidate: asset.productCandidate, skuPrefix: asset.skuPrefix, categories: [], images: [] }
  for (const category of asset.categories) if (!product.categories.includes(category)) product.categories.push(category)
  product.images.push({ path: asset.optimizedPublicPath, view: asset.view, sourceUrl: asset.sourceUrl })
  index[key] = product
  return index
}, {}))

await writeFile(path.join(outputRoot, "manifest.json"), `${JSON.stringify({
  source: sourceManifest.source,
  generatedAt: new Date().toISOString(),
  assetCount: assets.length,
  productCandidateCount: products.length,
  failed,
  rightsNote: sourceManifest.rightsNote,
  assets,
  products,
}, null, 2)}\n`)

console.log(JSON.stringify({ assetCount: assets.length, productCandidateCount: products.length, failed, outputRoot }))
