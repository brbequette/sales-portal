const { PrismaClient } = require("@prisma/client")
const fs = require("fs")
const path = require("path")

const prisma = new PrismaClient()

function cleanSkuStem(stem) {
  return stem.replace(/\s*\([\w\s,\./]+\)\s*\d*$/, "").trim().toUpperCase()
}

function cleanSku(sku) {
  let cleaned = sku.trim().toUpperCase()
  if (cleaned.startsWith("TDU-")) {
    cleaned = cleaned.substring(4)
  }
  return cleaned
}

async function main() {
  const imagesDir = path.join(__dirname, "../public/product-images")
  if (!fs.existsSync(imagesDir)) {
    console.error(`Images directory not found at ${imagesDir}`)
    return
  }

  const files = fs.readdirSync(imagesDir)
  const mainStems = {}

  // Gather all main processed images (ignore detail crops)
  for (const f of files) {
    if (f.endsWith(".png") && !f.includes("_detail_")) {
      const ext = path.extname(f)
      const stem = path.basename(f, ext)
      const cleanStem = cleanSkuStem(stem)
      mainStems[cleanStem] = f
    }
  }

  console.log(`Gathered ${Object.keys(mainStems).length} unique image stems from public folder.`)

  // Fetch all products from DB
  const dbProducts = await prisma.product.findMany({
    select: {
      id: true,
      sku: true,
      name: true,
      description: true
    }
  })
  console.log(`Fetched ${dbProducts.length} products from the database.`)

  const skuToImage = {}
  let matchCount = 0

  const MANUAL_OVERRIDES = {
    "TDU-SKP68GM": "Skid Plates .png",
    "TDU-SKP10GM": "Skid Plates .png",
    "TDU-SKP12GM": "Skid Plates .png",
    "TDU-SKP14GM": "Skid Plates .png",
    "TDU-ASHT04A2SET": "ASHT-SET.png"
  }

  for (const p of dbProducts) {
    const rawSku = p.sku.trim().toUpperCase()
    const cleanP = cleanSku(rawSku)
    
    let matchedFile = null

    // Strategy 0: Manual Overrides
    if (MANUAL_OVERRIDES[rawSku]) {
      matchedFile = MANUAL_OVERRIDES[rawSku]
    } else if (mainStems[cleanP]) {
      matchedFile = mainStems[cleanP]
    } else {
      // Strategy 2: Prefix match (Cleaned SKU starts with stem, or vice-versa)
      let longestMatchLen = 0
      for (const [cs, filename] of Object.entries(mainStems)) {
        if (cleanP.startsWith(cs) && cs.length >= 2) {
          if (cs.length > longestMatchLen) {
            longestMatchLen = cs.length
            matchedFile = filename
          }
        }
      }

      // Strategy 3: Stem starts with clean SKU
      if (!matchedFile) {
        for (const [cs, filename] of Object.entries(mainStems)) {
          if (cs.startsWith(cleanP) && cleanP.length >= 2) {
            matchedFile = filename
            break
          }
        }
      }
    }

    if (matchedFile) {
      matchCount++
      const stemBase = path.basename(matchedFile, ".png")
      
      const detailA = `${stemBase}_detail_a.png`
      const detailB = `${stemBase}_detail_b.png`
      
      const hasDetailA = files.includes(detailA)
      const hasDetailB = files.includes(detailB)

      skuToImage[rawSku] = {
        image: `/product-images/${matchedFile}`,
        detail_a: hasDetailA ? `/product-images/${detailA}` : null,
        detail_b: hasDetailB ? `/product-images/${detailB}` : null
      }
    }
  }

  // Save the mapping
  const outputPath = path.join(__dirname, "../src/lib/image-map.json")
  fs.writeFileSync(outputPath, JSON.stringify(skuToImage, null, 2), "utf-8")
  
  console.log(`Successfully mapped ${matchCount} products. Map saved to ${outputPath}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
