import { NextRequest, NextResponse } from "next/server"
import fs from "fs"
import path from "path"

const ALL_PICS_DIR = process.env.ALL_PICS_DIR || "/tmp/all-pics-storage"

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 })
    }

    const uploadDir = ALL_PICS_DIR

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const filename = file.name
    const targetPath = path.join(uploadDir, filename)

    // Save file
    fs.writeFileSync(targetPath, buffer)
    console.log(`Uploaded file saved to ${targetPath}`)

    return NextResponse.json({
      success: true,
      fileName: filename,
      size: file.size,
      message: `File ${filename} uploaded successfully.`
    })
  } catch (error: any) {
    console.error("Upload handler error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
