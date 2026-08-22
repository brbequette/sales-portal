import { NextResponse } from "next/server"
import OpenAI, { toFile, type Uploadable } from "openai"
import { requireAdministrator } from "@/lib/auth-helpers"
import { getOpenAIApiKey } from "@/lib/ai-client"

export const maxDuration = 120
function text(value: unknown, max = 1000) { return String(value || "").trim().slice(0, max) }
async function dataImage(value: unknown, name: string): Promise<Uploadable | null> {
  const match = String(value || "").match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/)
  if (!match) return null
  return toFile(Buffer.from(match[2], "base64"), `${name}.${match[1].split("/")[1]}`, { type: match[1] })
}

export async function POST(request: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  try {
    const apiKey = getOpenAIApiKey()
    if (!apiKey) return NextResponse.json({ error: "OpenAI image generation is not configured in this environment." }, { status: 503 })
    const body = await request.json()
    const currentFlyer = await dataImage(body.currentFlyer, "current-flyer")
    const images = (await Promise.all([dataImage(body.giveawayImage, "giveaway-reference"), dataImage(body.productImage, "titan-product-reference"), dataImage(body.logoImage, "official-titan-logo"), dataImage(body.styleReference, "style-guidance-only")])).filter(Boolean) as Uploadable[]
    if (currentFlyer) images.unshift(currentFlyer)
    const benefits = Array.isArray(body.bullets) ? body.bullets.map((item: unknown) => text(item, 180)).filter(Boolean).slice(0, 3) : []
    const prompt = `Use case: ads-marketing
Asset type: finished portrait SMS promotion flyer
Primary request: ${currentFlyer ? `Revise the supplied current flyer while preserving its successful composition and all campaign facts. Apply this edit request precisely: "${text(body.revisionPrompt, 1200)}"` : "Generate a completely fresh, fully designed Titan Diamond USA contractor promotion flyer."} Do not use boxes, form fields, UI cards, web-page styling, or a reusable template grid. Integrate the supplied product photographs naturally into one cohesive dramatic advertisement.
User creative direction: "${text(body.creationPrompt, 1600) || "Use your best judgment for a premium, dramatic contractor promotion."}" Follow this for composition, setting, mood, lighting, and emphasis only. It cannot override any locked campaign fact or asset below.
Input images are named by role. The file named official-titan-logo is the exact logo to use. The file named style-guidance-only is not content: it controls only visual energy, typography character, color relationships, and composition quality. Never place, composite, trace, reproduce, or use any pixels, products, people, logos, wording, offers, or background from that reference flyer in the output.
Visual direction: premium photorealistic national power-tool advertisement; gritty black industrial construction background, concrete dust, sparks, fractured stone, dramatic rim lighting, distressed bold typography, black/white/${text(body.accent, 40) || "orange"} palette. Match the energy and presentation quality of Titan Diamond's prior contractor SMS flyers.
Composition: portrait 4:5, one continuous poster composition with giant hierarchy, product imagery as the hero, benefit copy integrated into the art, and a strong bottom call-to-action. No empty boxes.

Include this campaign information as visible finished-flyer copy:
HEADLINE (verbatim): "${text(body.headline, 160)}"
SUBHEADLINE (verbatim): "${text(body.subheadline, 240)}"
OFFER PRICE: "${text(body.price, 60)}"
TOTAL VALUE: "${text(body.value, 60)}"
SAVINGS: "${text(body.savings, 60)}"
GIVEAWAY PRODUCT: "${text(body.giveawayName, 180)}"
TITAN PRODUCT: "${text(body.productName, 180)}"
QUANTITY: "${text(body.quantity, 30)}"
BENEFIT 1: "${benefits[0] || "BUILT FOR PROFESSIONAL CONTRACTORS"}"
BENEFIT 2: "${benefits[1] || "PREMIUM QUALITY. MAXIMUM PERFORMANCE."}"
BENEFIT 3: "${benefits[2] || "LIMITED TIME OFFER"}"
SHIPPING: "${body.freeShipping ? "FREE SHIPPING INCLUDED" : "SHIPPING AVAILABLE"}"
CTA (verbatim): "${text(body.cta, 180)}"
REP (verbatim): "${text(body.repName, 100)}"
PHONE (verbatim): "${text(body.repPhone, 50)}"
WEBSITE (verbatim): "TDUSALES.COM"

Constraints: The result itself is the finished flyer. Use the exact supplied facts and the supplied official Titan logo. Do not redraw or substitute the logo, and do not reuse a logo from any reference flyer. Do not invent prices, savings, products, specifications, logos, phone numbers, or warranty claims. Do not add placeholder copy. Keep text legible and spelled exactly as provided. No watermark.`
    const client = new OpenAI({ apiKey, maxRetries: 0, timeout: 110_000 })
    const common = { model: "gpt-image-1", prompt, n: 1, size: "1024x1536" as const, quality: "high" as const, output_format: "jpeg" as const, output_compression: 90 }
    const response = images.length ? await client.images.edit({ ...common, image: images, input_fidelity: "high" }) : await client.images.generate(common)
    const image = response.data?.[0]?.b64_json
    if (!image) throw new Error("OpenAI did not return a finished flyer")
    return NextResponse.json({ success: true, imageUrl: `data:image/jpeg;base64,${image}` })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Flyer generation failed" }, { status: 500 })
  }
}
