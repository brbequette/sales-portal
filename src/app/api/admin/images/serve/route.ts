import { NextRequest, NextResponse } from "next/server"
import fs from "fs"
import path from "path"

const BASE_ALL_PICS_DIR = "C:\\Users\\titan\\Documents\\Titan Diamond\\All Pics"
const ALL_PICS_DIR = fs.existsSync(BASE_ALL_PICS_DIR)
  ? BASE_ALL_PICS_DIR
  : "/tmp/all-pics-storage"

const PROCESSED_DIR = path.join(ALL_PICS_DIR, "processed")

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const file = searchParams.get("file")
    const type = searchParams.get("type") || "raw"

    if (!file) {
      return new Response("Missing file parameter", { status: 400 })
    }

    // Clean filename to prevent directory traversal
    const safeFile = path.basename(file)
    let filePath = ""

    // Resolve file based on requested type
    if (type === "processed") {
      filePath = path.join(PROCESSED_DIR, safeFile.endsWith(".png") ? safeFile : `${path.basename(safeFile, path.extname(safeFile))}.png`)
    } else if (type === "detail_a" || type === "detail_b" || type === "detail_c" || type === "detail_d") {
      const ext = path.extname(safeFile)
      const stem = path.basename(safeFile, ext)
      filePath = path.join(PROCESSED_DIR, `${stem}_${type}.png`)
    } else {
      filePath = path.join(ALL_PICS_DIR, safeFile)
    }

    // Check if the file exists in our transient/active directories
    if (!fs.existsSync(filePath)) {
      // Fallback: Check if it exists in the public build folder of the repo
      const ext = path.extname(safeFile)
      const stem = path.basename(safeFile, ext)
      
      let relativeFileName = safeFile
      if (type === "processed" && !safeFile.endsWith(".png")) {
        relativeFileName = `${stem}.png`
      } else if (type === "detail_a" || type === "detail_b" || type === "detail_c" || type === "detail_d") {
        relativeFileName = `${stem}_${type}.png`
      }

      const publicPath = path.join(process.cwd(), "public", "product-images", relativeFileName)
      if (fs.existsSync(publicPath)) {
        filePath = publicPath
      } else {
        // Double fallback: check if we can serve the file by stripping extension differences
        return new Response("File not found in storage or public assets", { status: 404 })
      }
    }

    const fileBuffer = fs.readFileSync(filePath)
    const ext = path.extname(filePath).toLowerCase()
    
    let contentType = "image/png"
    if (ext === ".jpg" || ext === ".jpeg") {
      contentType = "image/jpeg"
    } else if (ext === ".gif") {
      contentType = "image/gif"
    } else if (ext === ".webp") {
      contentType = "image/webp"
    }

    return new Response(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    })
  } catch (err: any) {
    return new Response(err.message, { status: 500 })
  }
}
