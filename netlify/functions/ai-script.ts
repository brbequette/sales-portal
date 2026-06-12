import { Handler } from "@netlify/functions"
import OpenAI from "openai"
import { scriptTemplates } from "./lib/script-templates"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "dummy_key",
})

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, message: "Method Not Allowed" })
    }
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { accountName, industry, status, quality, tags, lastPurchase, callType, daysSinceLastPurchase, totalRevenue, invoices, primaryContact, ownerName } = body

    // 1. Determine the best blade to pitch based on industry, tags, or past order items
    const lowerIndustry = (industry || "").toLowerCase()
    const lowerTags = (tags || "").toLowerCase()
    const allTextContext = `${lowerIndustry} ${lowerTags} ${JSON.stringify(invoices || [])}`.toLowerCase()

    let recommendedBlade = scriptTemplates[0] // Default to Dark Knight
    if (allTextContext.includes("tile") || allTextContext.includes("marble") || allTextContext.includes("granite") || allTextContext.includes("porcelain") || allTextContext.includes("ceramic")) {
      recommendedBlade = scriptTemplates.find(b => b.name === "Titan Razor Blade") || recommendedBlade
    } else if (allTextContext.includes("brick") || allTextContext.includes("block") || allTextContext.includes("paver") || allTextContext.includes("stone") || allTextContext.includes("masonry") || allTextContext.includes("landscape")) {
      recommendedBlade = scriptTemplates.find(b => b.name === "The Medusa Blade") || recommendedBlade
    } else if (allTextContext.includes("hard reinforced") || allTextContext.includes("hard concrete") || allTextContext.includes("soft bond")) {
      recommendedBlade = scriptTemplates.find(b => b.name === "The King Turbo") || recommendedBlade
    } else if (allTextContext.includes("ductile") || allTextContext.includes("iron") || allTextContext.includes("pipe") || allTextContext.includes("rebar") || allTextContext.includes("utility")) {
      recommendedBlade = scriptTemplates.find(b => b.name === "The Spartan Blade") || recommendedBlade
    } else if (allTextContext.includes("warhammer")) {
      recommendedBlade = scriptTemplates.find(b => b.name === "The Warhammer") || recommendedBlade
    } else if (allTextContext.includes("titan")) {
      recommendedBlade = scriptTemplates.find(b => b.name === "The Titan") || recommendedBlade
    }

    const systemPrompt = `You are an elite B2B sales representative for Titan Diamond. 
Your goal is to write a highly persuasive, fluid, and natural-sounding sales script to use when calling a client.

Core Sales Pitch Hook (Manufacturer's relationship strategy):
- "With this new release, our manufacturer wants us to give away free blades to our customers to build new relationships." (If it is a cold call or re-engagement/outreach, use this exact strategy/hook!)

Reference Pitch Guidelines for the recommended product (${recommendedBlade.name}):
- Price tier: ${recommendedBlade.priceRange}
- Intended Applications: ${recommendedBlade.applications.join(", ")}
- Key features: ${recommendedBlade.keyFeatures.join(" | ")}
- Standard product pitch: "${recommendedBlade.pitchTemplate}"

Titan Diamond Industry Lingo (Use naturally):
- "like a hot knife through butter"
- "pull itself through the cut"
- "let the blade do the work"
- "made under higher heat and lower pressure"
- "last twice as long without sacrificing speed"

Writing Rules:
- Make it sound like a real human speaking casually but professionally. No robotic structures.
- Keep it short (3-4 sentences maximum).
- Address the client by their First Name if known.
- Introduce yourself using the Rep Name.
- Do NOT use any brackets or placeholders (e.g., [Client Name]). Use the actual data provided.`

    let contextPrompt = `Client Company: ${accountName}\n`
    if (primaryContact?.firstName) contextPrompt += `Client First Name: ${primaryContact.firstName}\n`
    if (ownerName) contextPrompt += `Your Name (Rep): ${ownerName}\n`
    contextPrompt += `Industry: ${industry}\nAccount Quality: ${quality}\nAccount Tags: ${tags || 'None'}\n`
    contextPrompt += `Last Purchase Date: ${lastPurchase}\nDays Since Last Purchase: ${daysSinceLastPurchase || 'Unknown'}\nLifetime Value: $${totalRevenue || 'Unknown'}\nCall Type: ${callType || 'Standard'}\n`
    
    if (invoices && invoices.length > 0) {
      contextPrompt += `\nRecent Order History:\n`
      invoices.forEach((inv: any, i: number) => {
        contextPrompt += `- Order ${i+1}: $${inv.amount}. Items: ${inv.items ? JSON.stringify(inv.items) : 'General Assortment'}\n`
      })
    }
    contextPrompt += `\n`
    
    if (callType === 'Cold Call') {
      contextPrompt += `Context: This is an outreach call. Pitch the free blade hook to build a relationship, find out what size blade they run, and introduce the ${recommendedBlade.name}.\n`
    } else if (callType === 'Objection Handling') {
      contextPrompt += `Context: The client previously objected due to budget constraints. Pitch the ${recommendedBlade.name} and explain how the segments are made under higher heat and lower pressure to last longer, making the investment worth every penny.\n`
    } else if (callType === 'Overdue Invoice') {
      contextPrompt += `Context: The client has an overdue invoice. Be polite but firm, asking for a status update on the payment while maintaining the relationship.\n`
    } else if (typeof daysSinceLastPurchase === 'number' && daysSinceLastPurchase > 365) {
      contextPrompt += `Context: This client has not purchased anything in over a year. We need to re-engage them. Pitch the free blade hook to re-establish the relationship, and reference the ${recommendedBlade.name}.\n`
    } else {
      contextPrompt += `Context: This is an active client. Pitch them an upgrade or ask if they need a restock of the ${recommendedBlade.name}. Reference their recent items directly so it feels personalized.\n`
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: contextPrompt }
      ],
      temperature: 0.7,
      max_tokens: 150,
    })

    const script = response.choices[0].message?.content || "Could not generate script."

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, script })
    }

  } catch (error: any) {
    console.error('OpenAI API Error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}
