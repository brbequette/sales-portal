const { PrismaClient } = require("@prisma/client")
const fs = require("fs")
const path = require("path")
require("dotenv").config()

const prisma = new PrismaClient()

async function main() {
  const imageMapPath = path.join(__dirname, "../src/lib/image-map.json")
  if (!fs.existsSync(imageMapPath)) {
    console.error(`Image map file not found at ${imageMapPath}`)
    return
  }

  const imageMap = JSON.parse(fs.readFileSync(imageMapPath, "utf-8"))
  console.log(`Loaded ${Object.keys(imageMap).length} SKUs from image-map.json`)

  console.log("Loading products from local database...")
  const dbProducts = await prisma.product.findMany()
  console.log(`Loaded ${dbProducts.length} products from database.`)

  const updateOps = []
  let updateCount = 0

  for (const p of dbProducts) {
    const skuUpper = p.sku.trim().toUpperCase()
    const mapped = imageMap[skuUpper]

    if (mapped) {
      let descObj = {}
      try {
        descObj = JSON.parse(p.description || '{}')
      } catch {
        descObj = { text: p.description || '' }
      }

      // Check if image paths are already set and matching
      const hasImageDiff = 
        descObj.image !== mapped.image ||
        descObj.detail_a !== mapped.detail_a ||
        descObj.detail_b !== mapped.detail_b

      if (hasImageDiff) {
        descObj.image = mapped.image
        descObj.detail_a = mapped.detail_a
        descObj.detail_b = mapped.detail_b

        updateOps.push(
          prisma.product.update({
            where: { id: p.id },
            data: {
              description: JSON.stringify(descObj)
            }
          })
        )
      }
    }
  }

  console.log(`Found ${updateOps.length} products that need image backfilling in the database.`)

  // Execute database updates in batches of 100
  for (let i = 0; i < updateOps.length; i += 100) {
    const chunk = updateOps.slice(i, i + 100)
    await prisma.$transaction(chunk)
    updateCount += chunk.length
    console.log(`Backfilled ${updateCount}/${updateOps.length} products with photos...`)
  }

  console.log(`Database photo backfill complete! Updated ${updateCount} products directly in the database.`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
