import { PrismaClient } from "@prisma/client"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const prisma = new PrismaClient()
const applyChanges = process.argv.includes("--apply")
const vendorCatalog = JSON.parse(await readFile(path.resolve("output/vendor/gtdiamond-product-catalog.json"), "utf8"))
const imageManifest = JSON.parse(await readFile(path.resolve("public/images/vendor/gtdiamond-web/manifest.json"), "utf8"))

const normalize = value => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "")
const skuCandidates = value => [...new Set([normalize(value), ...String(value || "")
  .split(/\s+[/,|]\s+/)
  .map(part => part.replace(/^ZENESIS(?:™|®)?\s*/i, ""))
  .map(normalize)
  .filter(candidate => candidate.length >= 3)])]
const imageBySource = new Map(imageManifest.assets.map(asset => [asset.sourceUrl, asset.optimizedPublicPath]))
const vendorProducts = vendorCatalog.products
  .map(product => ({ ...product, normalizedSkus: skuCandidates(product.sku) }))
  .filter(product => product.normalizedSkus.length)

try {
  const localProducts = await prisma.product.findMany({
    select: { id: true, sku: true, name: true, imageUrl: true, source: true, manufacturer: true, vendor: true, application: true, equipment: true, productType: true, showOnWeb: true, giftItem: true },
    orderBy: { sku: "asc" },
  })

  const matched = []
  const unmatchedLocal = []
  for (const local of localProducts) {
    const localSku = normalize(local.sku)
    const candidates = vendorProducts.map(vendor => {
      const matchedSku = vendor.normalizedSkus
        .filter(candidate => localSku === candidate || localSku.startsWith(candidate))
        .sort((a, b) => b.length - a.length)[0]
      return matchedSku ? { vendor, matchedSku } : null
    }).filter(Boolean).sort((a, b) => b.matchedSku.length - a.matchedSku.length)
    const longest = candidates[0]
    const equallySpecific = longest ? candidates.filter(candidate => candidate.matchedSku.length === longest.matchedSku.length) : []
    if (!longest || equallySpecific.length !== 1) {
      unmatchedLocal.push({ ...local, reason: longest ? "ambiguous_vendor_family" : "no_vendor_family" })
      continue
    }
    const vendor = longest.vendor
    const featuredImage = imageBySource.get(vendor.featuredImage) || null
    matched.push({
      local,
      vendor,
      matchedVendorSku: longest.matchedSku,
      featuredImage,
      galleryImages: vendor.galleryImages.map(sourceUrl => imageBySource.get(sourceUrl)).filter(Boolean),
      imageAction: featuredImage ? (local.imageUrl ? "review_existing" : "safe_fill_missing") : "no_optimized_featured_image",
    })
  }

  const matchedVendorIds = new Set(matched.map(match => match.vendor.databaseId))
  const unmatchedVendor = vendorProducts.filter(product => !matchedVendorIds.has(product.databaseId))
  let appliedImageCount = 0
  let appliedMetadataProductCount = 0
  let appliedMetadataFieldCount = 0
  if (applyChanges) {
    const safeMatches = matched.filter(match => match.imageAction === "safe_fill_missing" && match.featuredImage)
    const results = await prisma.$transaction(safeMatches.map(match => prisma.product.updateMany({
      where: { id: match.local.id, OR: [{ imageUrl: null }, { imageUrl: "" }] },
      data: { imageUrl: match.featuredImage },
    })))
    appliedImageCount = results.reduce((sum, result) => sum + result.count, 0)

    const metadataUpdates = matched.map(match => {
      const data = {}
      if (!match.local.application && match.vendor.applications.length) data.application = match.vendor.applications.join(", ")
      if (!match.local.equipment && match.vendor.machines.length) data.equipment = match.vendor.machines.join(", ")
      if (!match.local.productType && match.vendor.typeName) data.productType = match.vendor.typeName
      if (!match.local.vendor) data.vendor = "General Tool"
      if (!match.local.manufacturer && match.vendor.brands.length) data.manufacturer = match.vendor.brands.map(brand => brand === "general-tool" ? "General Tool" : brand.toUpperCase()).join(", ")
      return { id: match.local.id, data }
    }).filter(update => Object.keys(update.data).length)
    if (metadataUpdates.length) {
      await prisma.$transaction(metadataUpdates.map(update => prisma.product.update({ where: { id: update.id }, data: update.data })))
      appliedMetadataProductCount = metadataUpdates.length
      appliedMetadataFieldCount = metadataUpdates.reduce((sum, update) => sum + Object.keys(update.data).length, 0)
    }
  }
  const report = {
    generatedAt: new Date().toISOString(),
    localProductCount: localProducts.length,
    vendorFamilyCount: vendorProducts.length,
    matchedLocalCount: matched.length,
    safeMissingImageCount: matched.filter(match => match.imageAction === "safe_fill_missing").length,
    existingImageReviewCount: matched.filter(match => match.imageAction === "review_existing").length,
    unmatchedLocalCount: unmatchedLocal.length,
    unmatchedVendorFamilyCount: unmatchedVendor.length,
    applyChanges,
    appliedImageCount,
    appliedMetadataProductCount,
    appliedMetadataFieldCount,
    matched,
    unmatchedLocal,
    unmatchedVendor,
  }
  const outputPath = path.resolve("output/vendor/gtdiamond-product-match-report.json")
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({ outputPath, ...Object.fromEntries(Object.entries(report).filter(([, value]) => typeof value === "number")) }))
} finally {
  await prisma.$disconnect()
}
