import { NextResponse } from "next/server"
import OpenAI from "openai"
import { requireAdministrator } from "@/lib/auth-helpers"
import { getOpenAIApiKey } from "@/lib/ai-client"

type ExtractedProduct = {
  title?: string
  brand?: string
  model?: string
  sku?: string
  price?: string | number
  currency?: string
  availability?: string
  description?: string
  features?: string[]
}

export async function POST(request: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const apiKey = getOpenAIApiKey()
  if (!apiKey) return NextResponse.json({ error: "OpenAI vision is not configured in the development environment." }, { status: 503 })

  try {
    const { screenshot, sourceUrl } = await request.json() as { screenshot?: string; sourceUrl?: string }
    if (!screenshot?.match(/^data:image\/(?:png|jpeg|webp);base64,/)) return NextResponse.json({ error: "Upload a valid JPG, PNG, or WebP screenshot." }, { status: 400 })
    if (screenshot.length > 8_100_000) return NextResponse.json({ error: "The screenshot is larger than 6 MB." }, { status: 413 })

    const client = new OpenAI({ apiKey, maxRetries: 1, timeout: 60_000 })
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: [
        { type: "text", text: "Extract the giveaway product shown in this retailer screenshot. Return JSON only with: title, brand, model, sku, price (numeric string without currency symbol), currency, availability, description (concise factual product summary), and features (array of up to 8 factual visible marketing/specification bullets). Never invent missing facts; use empty strings or an empty array. Ignore retailer navigation, ads, recommendations, financing, and unrelated products." },
        { type: "image_url", image_url: { url: screenshot, detail: "high" } },
      ] }],
    })
    const content = response.choices[0]?.message?.content
    if (!content) throw new Error("Vision returned no product data")
    const extracted = JSON.parse(content) as ExtractedProduct
    const title = String(extracted.title || "").trim()
    if (!title) return NextResponse.json({ error: "No clear product title was found. Upload a screenshot that includes the product title and main image." }, { status: 422 })
    const price = String(extracted.price || "").replace(/[^0-9.]/g, "")
    return NextResponse.json({ success: true, product: {
      retailer: "Screenshot import", title, brand: String(extracted.brand || ""), model: String(extracted.model || ""), sku: String(extracted.sku || ""),
      price, currency: String(extracted.currency || "USD"), availability: String(extracted.availability || ""), description: String(extracted.description || ""),
      features: Array.isArray(extracted.features) ? extracted.features.map(String).map((value) => value.trim()).filter(Boolean).slice(0, 8) : [], sourceUrl: String(sourceUrl || ""), imageUrl: screenshot,
    } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to extract product details"
    return NextResponse.json({ error: message }, { status: 422 })
  }
}
