import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getZohoAccessToken, ZOHO_ORGANIZATION_ID, ZOHO_DC } from "../../../../../netlify/functions/lib/zoho-auth"
import fs from "fs"
import path from "path"
import { execSync } from "child_process"

const ALL_PICS_DIR = "C:\\Users\\titan\\Documents\\Titan Diamond\\All Pics"
const PROCESSED_DIR = path.join(ALL_PICS_DIR, "processed")
const PUBLIC_PRODUCT_IMAGES_DIR = "C:\\Users\\titan\\Documents\\Titan Diamond\\AUTOMATIONS\\sales-portal\\public\\product-images"

// Utility to clean SKU
function cleanSkuStem(stem: string) {
  return stem.replace(/\s*\([\w\s,\./]+\)\s*\d*$/, "").trim().toUpperCase()
}

export async function GET(req: NextRequest) {
  try {
    if (!fs.existsSync(ALL_PICS_DIR)) {
      return NextResponse.json({ success: false, error: "Images directory not found" }, { status: 404 })
    }

    // List all files in All Pics
    const files = fs.readdirSync(ALL_PICS_DIR)
    const imageFiles = files.filter(f => /\.(png|jpg|jpeg)$/i.test(f))

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

      // Check if processed file exists
      const processedPath = path.join(PROCESSED_DIR, `${stem}.png`)
      const isProcessed = fs.existsSync(processedPath)

      // Check for closeups
      const detailAPath = path.join(PROCESSED_DIR, `${stem}_detail_a.png`)
      const detailBPath = path.join(PROCESSED_DIR, `${stem}_detail_b.png`)
      const hasDetailA = fs.existsSync(detailAPath)
      const hasDetailB = fs.existsSync(detailBPath)

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

    return NextResponse.json({ success: true, files: results })
  } catch (error: any) {
    console.error("GET staged images error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body

    if (action === "process") {
      const { fileName } = body
      if (!fileName) return NextResponse.json({ success: false, error: "Missing fileName" }, { status: 400 })

      // Run python processing script
      const cmd = `python "C:\\Users\\titan\\Documents\\Titan Diamond\\AUTOMATIONS\\process_product_images.py" --edit-json "{\\"file\\": \\"${fileName}\\"}"`
      const output = execSync(cmd, { cwd: "C:\\Users\\titan\\Documents\\Titan Diamond\\AUTOMATIONS" }).toString()
      
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

      // Escaping double quotes inside double quotes for windows cmd
      const escapedJson = JSON.stringify(config).replace(/"/g, '\\"')
      const cmd = `python "C:\\Users\\titan\\Documents\\Titan Diamond\\AUTOMATIONS\\process_product_images.py" --edit-json "${escapedJson}"`
      const output = execSync(cmd, { cwd: "C:\\Users\\titan\\Documents\\Titan Diamond\\AUTOMATIONS" }).toString()

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

      const cmd = `python "C:\\Users\\titan\\Documents\\Titan Diamond\\AUTOMATIONS\\smart_image_extractor.py" "${filePath}"`
      const output = execSync(cmd, { cwd: "C:\\Users\\titan\\Documents\\Titan Diamond\\AUTOMATIONS" }).toString()

      try {
        const lines = output.trim().split("\n")
        const jsonStr = lines[lines.length - 1]
        const data = JSON.parse(jsonStr)
        return NextResponse.json({ success: true, extracted: data })
      } catch (err: any) {
        return NextResponse.json({ success: false, error: "Extraction failed to return json", output, details: err.message })
      }
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 })
  } catch (error: any) {
    console.error("POST staged images error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
