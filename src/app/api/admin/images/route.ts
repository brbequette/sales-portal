import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getZohoAccessToken, ZOHO_ORGANIZATION_ID, ZOHO_DC } from "../../../../../netlify/functions/lib/zoho-auth"
import fs from "fs"
import path from "path"
import { execSync } from "child_process"

const BASE_ALL_PICS_DIR = "C:\\Users\\titan\\Documents\\Titan Diamond\\All Pics"
const ALL_PICS_DIR = fs.existsSync(BASE_ALL_PICS_DIR)
  ? BASE_ALL_PICS_DIR
  : "/tmp/all-pics-storage"

const PROCESSED_DIR = path.join(ALL_PICS_DIR, "processed")

const BASE_PUBLIC_DIR = "C:\\Users\\titan\\Documents\\Titan Diamond\\AUTOMATIONS\\sales-portal\\public\\product-images"
const PUBLIC_PRODUCT_IMAGES_DIR = fs.existsSync(BASE_PUBLIC_DIR)
  ? BASE_PUBLIC_DIR
  : "/tmp/product-images"

// Utility to clean SKU
function cleanSkuStem(stem: string) {
  return stem.replace(/\s*\([\w\s,\./]+\)\s*\d*$/, "").trim().toUpperCase()
}

function getDirStats(dirPath: string) {
  if (!fs.existsSync(dirPath)) return { count: 0, size: 0 }
  const files = fs.readdirSync(dirPath)
  let count = 0
  let size = 0
  for (const f of files) {
    const filePath = path.join(dirPath, f)
    try {
      const stat = fs.statSync(filePath)
      if (stat.isFile()) {
        count++
        size += stat.size
      }
    } catch {}
  }
  return { count, size }
}

export async function GET(req: NextRequest) {
  try {
    if (!fs.existsSync(ALL_PICS_DIR)) {
      fs.mkdirSync(ALL_PICS_DIR, { recursive: true })
    }
    if (!fs.existsSync(PROCESSED_DIR)) {
      fs.mkdirSync(PROCESSED_DIR, { recursive: true })
    }

    // Gather file names from ALL_PICS_DIR
    const imageFiles: string[] = []
    if (fs.existsSync(ALL_PICS_DIR)) {
      const files = fs.readdirSync(ALL_PICS_DIR)
      imageFiles.push(...files.filter(f => /\.(png|jpg|jpeg)$/i.test(f)))
    }

    // Gather file names from PUBLIC_PRODUCT_IMAGES_DIR and merge unique items (avoid duplicate stems)
    if (fs.existsSync(PUBLIC_PRODUCT_IMAGES_DIR)) {
      const publicFiles = fs.readdirSync(PUBLIC_PRODUCT_IMAGES_DIR)
      const mainPublicImages = publicFiles.filter(f => /\.(png|jpg|jpeg)$/i.test(f) && !f.includes("_detail_"))
      for (const f of mainPublicImages) {
        if (!imageFiles.includes(f)) {
          imageFiles.push(f)
        }
      }
    }

    // Fetch all products from Database
    const dbProducts = await prisma.product.findMany({
      select: {
        id: true,
        sku: true,
        name: true,
        description: true,
        price: true,
        category: true,
      }
    })

    const results = []

    for (const f of imageFiles) {
      const ext = path.extname(f)
      const stem = path.basename(f, ext)
      const cleanedStem = cleanSkuStem(stem)

      // Find matching db products
      const matches = dbProducts.filter(p => {
        const skuUpper = p.sku.toUpperCase()
        return skuUpper === cleanedStem || skuUpper.startsWith(cleanedStem) || cleanedStem.startsWith(skuUpper)
      })

      // Check if processed file exists in either transient processed or public static folder
      const processedPath = path.join(PROCESSED_DIR, `${stem}.png`)
      const publicPath = path.join(PUBLIC_PRODUCT_IMAGES_DIR, `${stem}.png`)
      const isProcessed = fs.existsSync(processedPath) || fs.existsSync(publicPath)

      // Check for closeups in either directory
      const detailAPath = path.join(PROCESSED_DIR, `${stem}_detail_a.png`)
      const publicDetailAPath = path.join(PUBLIC_PRODUCT_IMAGES_DIR, `${stem}_detail_a.png`)
      const hasDetailA = fs.existsSync(detailAPath) || fs.existsSync(publicDetailAPath)

      const detailBPath = path.join(PROCESSED_DIR, `${stem}_detail_b.png`)
      const publicDetailBPath = path.join(PUBLIC_PRODUCT_IMAGES_DIR, `${stem}_detail_b.png`)
      const hasDetailB = fs.existsSync(detailBPath) || fs.existsSync(publicDetailBPath)

      // Check if already staged in Zoho or public app
      let isStaged = false
      let stagedUrl = null
      if (matches.length > 0) {
        try {
          const parsed = JSON.parse(matches[0].description || "{}")
          if (parsed.image && parsed.image.includes("/product-images/")) {
            isStaged = true
            stagedUrl = parsed.image
          }
        } catch {}
      }

      results.push({
        fileName: f,
        stem,
        cleanedStem,
        isProcessed,
        hasDetailA,
        hasDetailB,
        isStaged,
        stagedUrl,
        matches: matches.map(m => ({ id: m.id, sku: m.sku, name: m.name, price: m.price, category: m.category })),
      })
    }

    // Filter products needing images
    const needsImages = dbProducts.filter(p => {
      try {
        const desc = JSON.parse(p.description || "{}")
        return !desc.image
      } catch {
        return !p.description
      }
    }).map(p => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      price: p.price,
      category: p.category
    }))

    // Storage metrics
    const rawStats = getDirStats(ALL_PICS_DIR)
    const processedStats = getDirStats(PROCESSED_DIR)
    const archiveStats = getDirStats(path.join(ALL_PICS_DIR, "archive"))
    const publicStats = getDirStats(PUBLIC_PRODUCT_IMAGES_DIR)

    return NextResponse.json({
      success: true,
      files: results,
      needsImages,
      allProducts: dbProducts.map(p => ({ id: p.id, sku: p.sku, name: p.name, price: p.price, category: p.category })),
      storage: {
        raw: rawStats,
        processed: processedStats,
        archive: archiveStats,
        public: publicStats
      }
    })
  } catch (error: any) {
    console.error("GET staged images error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body

    const AUTOMATIONS_DIR = "C:\\Users\\titan\\Documents\\Titan Diamond\\AUTOMATIONS"
    const isLocal = fs.existsSync(AUTOMATIONS_DIR)

    if (action === "process") {
      const { fileName } = body
      if (!fileName) return NextResponse.json({ success: false, error: "Missing fileName" }, { status: 400 })

      if (!isLocal) {
        return NextResponse.json({
          success: false,
          error: "Image processing requires Python. Please run the sales portal locally to process raw files."
        })
      }

      // Run python processing script
      const cmd = `python "${AUTOMATIONS_DIR}\\process_product_images.py" --edit-json "{\\"file\\": \\"${fileName}\\"}"`
      const output = execSync(cmd, { cwd: AUTOMATIONS_DIR }).toString()
      
      try {
        const res = JSON.parse(output)
        return NextResponse.json({ success: true, data: res })
      } catch {
        return NextResponse.json({ success: false, error: "Failed to parse script output", output })
      }
    }

    if (action === "edit") {
      const { fileName, brightness, contrast, rotation, badges } = body
      if (!fileName) return NextResponse.json({ success: false, error: "Missing fileName" }, { status: 400 })

      // Build JSON options for python script
      const config = {
        file: fileName,
        brightness: brightness || 1.0,
        contrast: contrast || 1.0,
        rotation: rotation || 0,
        badges: badges || {}
      }

      if (!isLocal) {
        return NextResponse.json({
          success: false,
          error: "Image editing requires Python. Please run the sales portal locally to edit images."
        })
      }

      // Escaping double quotes inside double quotes for windows cmd
      const escapedJson = JSON.stringify(config).replace(/"/g, '\\"')
      const cmd = `python "${AUTOMATIONS_DIR}\\process_product_images.py" --edit-json "${escapedJson}"`
      const output = execSync(cmd, { cwd: AUTOMATIONS_DIR }).toString()

      try {
        const res = JSON.parse(output)
        return NextResponse.json({ success: true, data: res })
      } catch {
        return NextResponse.json({ success: false, error: "Failed to apply edits", output })
      }
    }

    if (action === "stage") {
      const { fileName, sku } = body
      if (!fileName || !sku) return NextResponse.json({ success: false, error: "Missing fileName or sku" }, { status: 400 })

      const ext = path.extname(fileName)
      const stem = path.basename(fileName, ext)

      const processedMain = path.join(PROCESSED_DIR, `${stem}.png`)
      const processedA = path.join(PROCESSED_DIR, `${stem}_detail_a.png`)
      const processedB = path.join(PROCESSED_DIR, `${stem}_detail_b.png`)

      if (!fs.existsSync(processedMain)) {
        return NextResponse.json({ success: false, error: "Processed main image not found" }, { status: 404 })
      }

      // Ensure public target folder exists
      if (!fs.existsSync(PUBLIC_PRODUCT_IMAGES_DIR)) {
        fs.mkdirSync(PUBLIC_PRODUCT_IMAGES_DIR, { recursive: true })
      }

      // 1. Copy to App Public Folder (Main + Closeups)
      const publicMain = path.join(PUBLIC_PRODUCT_IMAGES_DIR, `${stem}.png`)
      fs.copyFileSync(processedMain, publicMain)
      
      if (fs.existsSync(processedA)) {
        fs.copyFileSync(processedA, path.join(PUBLIC_PRODUCT_IMAGES_DIR, `${stem}_detail_a.png`))
      }
      if (fs.existsSync(processedB)) {
        fs.copyFileSync(processedB, path.join(PUBLIC_PRODUCT_IMAGES_DIR, `${stem}_detail_b.png`))
      }

      // 2. Fetch the Product from DB
      const product = await prisma.product.findUnique({ where: { sku } })
      if (!product) {
        return NextResponse.json({ success: false, error: `Product with SKU ${sku} not found in database.` }, { status: 404 })
      }

      let parsedDesc: any = {}
      try {
        parsedDesc = JSON.parse(product.description || "{}")
      } catch {
        parsedDesc = { text: product.description || "" }
      }

      const itemId = parsedDesc.itemId
      let zohoUploaded = false

      // 3. Upload image to Zoho Books if Item ID is available
      if (itemId) {
        try {
          const token = await getZohoAccessToken()
          const url = `https://www.zohoapis.${ZOHO_DC}/books/v3/items/${itemId}/image?organization_id=${ZOHO_ORGANIZATION_ID}`
          
          // Construct form-data upload
          const formData = new FormData()
          const fileBuffer = fs.readFileSync(processedMain)
          const blob = new Blob([fileBuffer], { type: "image/png" })
          formData.append("image", blob, `${stem}.png`)

          const uploadRes = await fetch(url, {
            method: "POST",
            headers: {
              Authorization: `Zoho-oauthtoken ${token}`
            },
            body: formData
          })

          if (uploadRes.ok) {
            zohoUploaded = true
          } else {
            console.warn("Zoho image upload non-ok response status:", uploadRes.status)
          }
        } catch (e: any) {
          console.error("Error uploading to Zoho Books:", e.message)
        }
      }

      // 4. Update Product Description with the App path
      parsedDesc.image = `/product-images/${stem}.png`
      // Save details to the info metadata if available
      parsedDesc.detail_a = fs.existsSync(processedA) ? `/product-images/${stem}_detail_a.png` : null
      parsedDesc.detail_b = fs.existsSync(processedB) ? `/product-images/${stem}_detail_b.png` : null

      await prisma.product.update({
        where: { sku },
        data: {
          description: JSON.stringify(parsedDesc)
        }
      })

      return NextResponse.json({
        success: true,
        zohoUploaded,
        stagedUrl: parsedDesc.image,
        message: `Successfully staged SKU ${sku}`
      })
    }

    if (action === "extract-catalog") {
      const { fileName } = body
      if (!fileName) return NextResponse.json({ success: false, error: "Missing fileName" }, { status: 400 })

      const filePath = path.join(ALL_PICS_DIR, fileName)
      if (!fs.existsSync(filePath)) {
        return NextResponse.json({ success: false, error: `File not found at ${filePath}` }, { status: 404 })
      }

      if (!isLocal) {
        return NextResponse.json({
          success: false,
          error: "Catalog extraction requires Python. Please run the sales portal locally to extract catalogs."
        })
      }

      const cmd = `python "${AUTOMATIONS_DIR}\\smart_image_extractor.py" "${filePath}"`
      const output = execSync(cmd, { cwd: AUTOMATIONS_DIR }).toString()

      try {
        const lines = output.trim().split("\n")
        const jsonStr = lines[lines.length - 1]
        const data = JSON.parse(jsonStr)
        return NextResponse.json({ success: true, extracted: data })
      } catch (err: any) {
        return NextResponse.json({ success: false, error: "Extraction failed to return json", output, details: err.message })
      }
    }

    if (action === "resolve-conflict") {
      const { sku, primaryFile, detailAFile, detailBFile, discardFiles } = body
      if (!sku) return NextResponse.json({ success: false, error: "Missing sku" }, { status: 400 })

      // 1. Process / Rename Primary main image
      if (primaryFile) {
        const srcPath = path.join(ALL_PICS_DIR, primaryFile)
        const destPath = path.join(ALL_PICS_DIR, `${sku}${path.extname(primaryFile)}`)
        if (fs.existsSync(srcPath) && srcPath !== destPath) {
          fs.renameSync(srcPath, destPath)
        }
      }

      // 2. Handle Detail crop mapping if provided
      if (detailAFile) {
        const srcPath = path.join(ALL_PICS_DIR, detailAFile)
        const destPath = path.join(ALL_PICS_DIR, `${sku}_detail_a${path.extname(detailAFile)}`)
        if (fs.existsSync(srcPath) && srcPath !== destPath) {
          fs.renameSync(srcPath, destPath)
        }
      }

      if (detailBFile) {
        const srcPath = path.join(ALL_PICS_DIR, detailBFile)
        const destPath = path.join(ALL_PICS_DIR, `${sku}_detail_b${path.extname(detailBFile)}`)
        if (fs.existsSync(srcPath) && srcPath !== destPath) {
          fs.renameSync(srcPath, destPath)
        }
      }

      // 3. Move discarded conflicting files to archive
      const archiveDir = path.join(ALL_PICS_DIR, "archive")
      if (discardFiles && Array.isArray(discardFiles)) {
        if (!fs.existsSync(archiveDir)) {
          fs.mkdirSync(archiveDir, { recursive: true })
        }
        for (const f of discardFiles) {
          const srcPath = path.join(ALL_PICS_DIR, f)
          if (fs.existsSync(srcPath)) {
            fs.renameSync(srcPath, path.join(archiveDir, f))
          }
        }
      }

      if (!isLocal) {
        return NextResponse.json({
          success: false,
          error: "Conflict resolution re-processing requires Python. Please run the sales portal locally to resolve conflicts."
        })
      }

      // 4. Trigger auto re-process on the new set
      const targetFileName = `${sku}${path.extname(primaryFile || ".png")}`
      const cmd = `python "${AUTOMATIONS_DIR}\\process_product_images.py" --edit-json "{\\"file\\": \\"${targetFileName}\\"}"`
      execSync(cmd, { cwd: AUTOMATIONS_DIR })

      // Update static map
      const mapCmd = `python "${AUTOMATIONS_DIR}\\generate_image_map.py"`
      execSync(mapCmd, { cwd: AUTOMATIONS_DIR })

      return NextResponse.json({ success: true, message: `Successfully resolved duplicate conflict for SKU ${sku}` })
    }

    if (action === "clear-archive") {
      const archiveDir = path.join(ALL_PICS_DIR, "archive")
      if (fs.existsSync(archiveDir)) {
        const archivedFiles = fs.readdirSync(archiveDir)
        for (const f of archivedFiles) {
          try {
            fs.unlinkSync(path.join(archiveDir, f))
          } catch {}
        }
      }
      return NextResponse.json({ success: true, message: "Archived folders cleared successfully." })
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 })
  } catch (error: any) {
    console.error("POST staged images error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
