import { NextResponse } from "next/server"
import { requireAdministrator } from "@/lib/auth-helpers"

const RETAILERS: Record<string, string> = {
  "amazon.com": "Amazon",
  "www.amazon.com": "Amazon",
  "homedepot.com": "Home Depot",
  "www.homedepot.com": "Home Depot",
  "lowes.com": "Lowe's",
  "www.lowes.com": "Lowe's",
}

import { clean, extractJsonLdProducts, extractMeta } from "@/lib/flyer-scrape"

async function fetchRetailerPage(initial: URL) {
  let current = initial
  for (let redirect = 0; redirect < 5; redirect += 1) {
    if (current.protocol !== "https:" || !RETAILERS[current.hostname.toLowerCase()]) throw new Error("Retailer redirected to an unsupported host")
    const response = await fetch(current, {
      cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(15000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; TitanDiamondProductResearch/1.0)", accept: "text/html,application/xhtml+xml", "accept-language": "en-US,en;q=0.9" },
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location) throw new Error("Retailer returned an invalid redirect")
      current = new URL(location, current)
      continue
    }
    return { response, finalUrl: current }
  }
  throw new Error("Retailer redirected too many times")
}

async function fetchReaderFallback(url: URL, retailer: string) {
  const response = await fetch(`https://r.jina.ai/${url.toString()}`, {
    cache: "no-store", signal: AbortSignal.timeout(30000),
    headers: { accept: "application/json", "x-respond-with": "markdown" },
  })
  if (!response.ok) throw new Error(`Fallback reader returned HTTP ${response.status}`)
  const raw = await response.text()
  let title = ""; let description = ""; let content = raw
  try {
    const parsed = JSON.parse(raw) as { title?: string; description?: string; content?: string; data?: { title?: string; description?: string; content?: string } }
    const result = parsed.data || parsed
    title = clean(result.title); description = clean(result.description); content = String(result.content || "")
  } catch { /* plain Markdown response */ }
  const imageCandidates = [...content.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)[^)]*\)/gi)].map((match) => match[1])
  const imageUrl = imageCandidates.find((image) => !/logo|icon|badge|sprite/i.test(image)) || ""
  const price = content.match(/(?:\$\s*|USD\s+)(\d{1,5}(?:,\d{3})*(?:\.\d{2})?)/i)?.[1]?.replaceAll(",", "") || ""
  const headings = content.split(/\r?\n/).map((line) => line.replace(/^[-*#>\s]+/, "").trim()).filter((line) => line.length > 20 && line.length < 220)
  const features = headings.filter((line) => /power|motor|blade|cut|battery|speed|inch|warranty|capacity|performance|durable|included/i.test(line)).slice(0, 8)
  if (!title) title = clean(content.match(/^Title:\s*(.+)$/mi)?.[1] || content.match(/^#\s+(.+)$/m)?.[1])
  if (!description) description = headings.slice(0, 3).join(" ").slice(0, 1000)
  const challengePage = /robot or human|access denied|captcha|verify you are human|sorry, something went wrong|page not found/i.test(`${title} ${description} ${content.slice(0, 1200)}`)
  const usefulDetailCount = [description.length >= 40, Boolean(imageUrl), Boolean(price), features.length > 0].filter(Boolean).length
  if (!title || challengePage || usefulDetailCount === 0) throw new Error("The retailer blocked both direct and fallback product access. Upload a product screenshot instead")
  return { sourceUrl: url.toString(), retailer, title, description, brand: "", model: "", sku: "", price, currency: "USD", imageUrl, availability: "", features }
}

export async function POST(request: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse

  try {
    const { url } = await request.json()
    const parsed = new URL(String(url || ""))
    if (parsed.protocol !== "https:" || !RETAILERS[parsed.hostname.toLowerCase()]) {
      return NextResponse.json({ error: "Use an HTTPS Amazon, Home Depot, or Lowe's product URL." }, { status: 400 })
    }

    const { response, finalUrl } = await fetchRetailerPage(parsed)
    if (!response.ok) {
      const fallback = await fetchReaderFallback(finalUrl, RETAILERS[finalUrl.hostname.toLowerCase()])
      return NextResponse.json({ success: true, product: fallback, warning: `The retailer blocked direct access (HTTP ${response.status}); product details were recovered through the fallback reader.` })
    }
    const html = await response.text()
    if (html.length > 5_000_000) throw new Error("Product page was too large to process safely")
    const product = extractJsonLdProducts(html)[0] || {}
    const offerValue = Array.isArray(product.offers) ? product.offers[0] : product.offers
    const offer = offerValue && typeof offerValue === "object" ? offerValue as Record<string, unknown> : {}
    const image = Array.isArray(product.image) ? product.image[0] : product.image
    const brand = product.brand && typeof product.brand === "object" ? (product.brand as Record<string, unknown>).name : product.brand
    const title = clean(product.name) || extractMeta(html, "og:title") || extractMeta(html, "twitter:title")
    const description = clean(product.description) || extractMeta(html, "og:description") || extractMeta(html, "description")
    const bulletCandidates = [...html.matchAll(/<li[^>]*(?:a-list-item|product-details)[^>]*>([\s\S]*?)<\/li>/gi)]
      .map((match) => clean(match[1])).filter((value) => value.length > 10).slice(0, 12)

    return NextResponse.json({
      success: true,
      product: {
        sourceUrl: finalUrl.toString(), retailer: RETAILERS[finalUrl.hostname.toLowerCase()],
        title, description, brand: clean(brand), model: clean(product.model || product.mpn || product.sku),
        sku: clean(product.sku || product.mpn), price: String(offer.price || extractMeta(html, "product:price:amount") || ""),
        currency: clean(offer.priceCurrency || extractMeta(html, "product:price:currency") || "USD"),
        imageUrl: clean(image) || extractMeta(html, "og:image"),
        availability: clean(offer.availability || "").split("/").pop() || "",
        features: bulletCandidates,
      },
      warning: title ? null : "This retailer blocked structured product access. Enter or paste the product details manually.",
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to import the product"
    return NextResponse.json({ error: message, editableFallback: true }, { status: 422 })
  }
}
