const { PrismaClient } = require("@prisma/client")
const fs = require("fs")
const path = require("path")

const prisma = new PrismaClient()

async function main() {
  const products = await prisma.product.findMany({
    select: { sku: true, name: true, description: true }
  })
  console.log(`Total database products: ${products.length}`)

  const imageMapPath = path.join(__dirname, "../src/lib/image-map.json")
  let imageMap = {}
  if (fs.existsSync(imageMapPath)) {
    imageMap = JSON.parse(fs.readFileSync(imageMapPath, "utf-8"))
  }
  console.log(`Total image-map.json keys: ${Object.keys(imageMap).length}`)

  let matchCount = 0
  let noImageCount = 0
  const sampleUnmatched = []

  for (const p of products) {
    const skuUpper = p.sku.trim().toUpperCase()
    let hasImage = false
    try {
      const desc = JSON.parse(p.description || "{}")
      if (desc.image) hasImage = true
    } catch {}

    if (imageMap[skuUpper] || hasImage) {
      matchCount++
    } else {
      noImageCount++
      if (sampleUnmatched.length < 15) {
        sampleUnmatched.push({ sku: p.sku, name: p.name })
      }
    }
  }

  console.log(`Matched (via map or db): ${matchCount}`)
  console.log(`Unmatched (no image): ${noImageCount}`)
  console.log("Sample unmatched products:")
  console.log(JSON.stringify(sampleUnmatched, null, 2))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
