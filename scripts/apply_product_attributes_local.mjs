import fs from "node:fs/promises"
import { createRequire } from "node:module"

const requireFromApp = createRequire("/app/server.js")
const { PrismaClient } = requireFromApp("@prisma/client")
const prisma = new PrismaClient()
const planPath = process.argv[2] || "/tmp/product-attribute-plan.json"
const apply = process.argv.includes("--apply")
const plan = JSON.parse(await fs.readFile(planPath, "utf8"))
const products = plan.products || []

const existing = await prisma.product.findMany({ where: { sku: { in: products.map(product => product.sku) } } })
const bySku = new Map(existing.map(product => [product.sku.toUpperCase(), product]))
const creates = products.filter(product => !bySku.has(product.sku))
const updates = products.filter(product => bySku.has(product.sku))
const summary = { products: products.length, updates: updates.length, creates: creates.length, applied: apply }
console.log(JSON.stringify(summary, null, 2))

if (apply) {
  const rollback = existing.map(product => ({
    sku: product.sku,
    size: product.size,
    application: product.application,
    manufacturer: product.manufacturer,
    vendor: product.vendor,
    productType: product.productType,
    toolType: product.toolType,
    equipment: product.equipment,
    materials: product.materials,
    attributes: product.attributes,
    imageUrl: product.imageUrl,
    barcode: product.barcode,
    weightGrams: product.weightGrams,
    source: product.source,
  }))
  await fs.writeFile("/tmp/product-attribute-local-rollback.json", JSON.stringify({ generatedAt: new Date().toISOString(), existing: rollback, createdSkus: creates.map(p => p.sku) }, null, 2))

  let completed = 0
  for (let offset = 0; offset < products.length; offset += 50) {
    const batch = products.slice(offset, offset + 50)
    await prisma.$transaction(batch.map(product => {
      const current = bySku.get(product.sku)
      const attributeData = {
        size: product.size || null,
        application: product.application || null,
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
      if (current) return prisma.product.update({ where: { id: current.id }, data: attributeData })
      return prisma.product.create({ data: {
        sku: product.sku,
        name: product.name,
        description: JSON.stringify({ text: product.descriptionText, cost: product.cost, retail: product.price, image: product.imageUrl, status: product.status, attributes: product.attributes }),
        price: product.price,
        category: product.category || "General",
        ...attributeData,
      } })
    }))
    completed += batch.length
    console.log(`LOCAL_PROGRESS\t${completed}/${products.length}`)
  }
}
await prisma.$disconnect()
