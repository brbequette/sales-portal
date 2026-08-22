import { NextResponse } from "next/server"
import { requireAdministrator } from "@/lib/auth-helpers"
import { createAIChatCompletion } from "@/lib/ai-client"

type CopyInput = {
  product?: { title?: string; brand?: string; retailer?: string; description?: string; features?: string[]; price?: string }
  blade?: { name?: string; sku?: string; size?: string; application?: string; description?: string; price?: number }
  rep?: { name?: string; phone?: string; email?: string }
  promotion?: { sellingPrice?: number; customerValue?: number; customerSavings?: number; freeShipping?: boolean; bladeQuantity?: number }
}

function safeFallback({ product = {}, blade = {}, rep = {}, promotion = {} }: CopyInput) {
  const target = product.title || "your contractor equipment"
  const bladeName = blade.name || "Titan Diamond blade"
  const repName = rep.name || "your Titan sales representative"
  return {
    headline: target ? `GET A ${target} BONUS` : "CONTRACTOR BONUS INCLUDED",
    subheadline: `${promotion.bladeQuantity || 1}× ${bladeName} contractor package — built for crews who cut for a living.`,
    body: `Stock up with Titan Diamond and get more value on the job. ${product.description || `This limited promotion pairs ${bladeName} with ${target}.`}`,
    bullets: [
      product.features?.[0] || (blade.sku ? `Titan blade: ${blade.sku}` : "Professional contractor blade package"),
      product.features?.[1] || (blade.size ? `${blade.size} blade selected for the package` : "Rugged performance for demanding applications"),
      promotion.freeShipping ? "Free shipping included in this promotion" : "Limited-time contractor pricing",
    ],
    cta: `CALL OR TEXT ${(rep.name || "YOUR TITAN REP").toUpperCase()} TODAY`,
    smsCopy: `LIMITED OFFER: Get ${target} with a qualifying ${bladeName} contractor package.${promotion.freeShipping ? " Free shipping included." : ""} Contact ${repName} while supplies last.`,
    emailSubject: `Contractor offer: ${target} with your Titan blade package`,
    emailPreheader: `${promotion.customerValue ? `$${promotion.customerValue.toFixed(2)} total value. ` : ""}Built for contractors. Available for a limited time.`,
  }
}

export async function POST(request: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse

  const input = await request.json() as CopyInput & { tone?: string }
  const { product, blade, rep, promotion, tone = "confident" } = input
  try {
    const completion = await createAIChatCompletion({
      temperature: 0.55,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You recreate Titan Diamond USA's established high-impact contractor flyer voice: short giant offer headline, urgent limited-time language, clear bonus/giveaway, blade-package details, three factual benefit bullets, value, shipping offer, and direct call-or-text CTA. Use punchy uppercase-ready wording like BUY ONE GET ONE, FREE BONUS, CONTRACTOR DEAL, STOCK UP NOW, BUILT FOR PROS. Never invent technical claims, warranties, prices, values, compatibility, or savings; only use supplied facts. Return JSON only with headline, subheadline, body, bullets (exactly 3 strings), cta, smsCopy, emailSubject, emailPreheader." },
        { role: "user", content: JSON.stringify({ task: "Create complete flyer and email copy from the selected giveaway, active Titan blade, promotion economics, and assigned rep. Every visible claim must be recreatable from these inputs.", tone, giveawayProduct: product, activeTitanProduct: blade, promotion, salesRep: rep }) },
      ],
    })
    const content = completion.response.choices[0]?.message?.content || "{}"
    return NextResponse.json({ success: true, copy: JSON.parse(content), provider: completion.provider, model: completion.model })
  } catch (error) {
    const warning = error instanceof Error ? error.message : "AI copy generation was unavailable"
    return NextResponse.json({ success: true, copy: safeFallback(input), provider: "template", model: "contractor-safe-fallback", warning })
  }
}
