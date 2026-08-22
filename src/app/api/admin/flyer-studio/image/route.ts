import { NextResponse } from "next/server"
import { requireAdministrator } from "@/lib/auth-helpers"

const ALLOWED = ["amazon.com", "media-amazon.com", "ssl-images-amazon.com", "homedepot.com", "hdstatic.net", "lowes.com", "lowesassets.com"]

export async function GET(request: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  try {
    const source = new URL(new URL(request.url).searchParams.get("url") || "")
    const host = source.hostname.toLowerCase()
    if (source.protocol !== "https:" || !ALLOWED.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
      return NextResponse.json({ error: "Image host is not allowed" }, { status: 400 })
    }
    const response = await fetch(source, { cache: "no-store", signal: AbortSignal.timeout(10000) })
    const type = response.headers.get("content-type") || ""
    if (!response.ok || !type.startsWith("image/")) throw new Error("Image could not be loaded")
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength > 8_000_000) throw new Error("Image is too large")
    return new NextResponse(bytes, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600" } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid image" }, { status: 422 })
  }
}
