import { Handler } from "@netlify/functions"
import OpenAI from "openai"
import { scriptTemplates } from "./lib/script-templates"
import { PrismaClient } from "@prisma/client"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "dummy_key",
})

const prisma = new PrismaClient()

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, message: "Method Not Allowed" })
    }
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { 
      accountId, 
      accountName, 
      industry, 
      status, 
      quality, 
      tags, 
      lastPurchase, 
      callType, 
      daysSinceLastPurchase, 
      totalRevenue, 
      invoices, 
      primaryContact, 
      ownerName 
    } = body

    // 1. Fetch CallScripts and CallLogs from DB if accountId is provided
    let dbScripts: any[] = []
    let callHistory: any[] = []
    
    try {
      dbScripts = await prisma.callScript.findMany({
        where: { isActive: true }
      })

      if (accountId) {
        callHistory = await prisma.callLog.findMany({
          where: { accountId },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            createdAt: true,
            status: true,
            notes: true,
            direction: true
          }
        })
      }
    } catch (dbErr) {
      console.error("Failed to fetch from DB:", dbErr)
      // Continue without DB data if it fails
    }

    // Format DB Scripts for the prompt
    const availableScriptsText = dbScripts.length > 0 
      ? dbScripts.map(s => `--- Script: ${s.name} (${s.callType}) ---\n${s.content}\n`).join("\n")
      : "No additional scripts found in the database. Rely on general sales knowledge."

    // Format Call History for the prompt
    const historyText = callHistory.length > 0
      ? callHistory.map(h => `[${new Date(h.createdAt).toLocaleDateString()}] ${h.direction} - ${h.status}: ${h.notes || "No notes"}`).join("\n")
      : "No previous call history available."

    // 2. Determine the best blade to pitch based on industry, tags, or past order items
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
Your goal is to write a highly persuasive, fluid, and natural-sounding sales script.

You have access to a database of approved Call Scripts. You MUST use these scripts, specifically the "Fact-Finding Script", as the foundation for every account interaction.
Here are the available scripts from the database:
${availableScriptsText}

Advanced Sales Methodologies to apply:
- Consultative Selling: Ask open-ended questions to uncover true pain points.
- SPIN Selling: Focus on Situation, Problem, Implication, and Need-Payoff questions.
- Challenger Sale: Teach the customer something new, tailor the message, and take control of the conversation.
- Value-Based Selling: Focus on how the product improves their bottom line, saves time, or reduces wear and tear.
- Urgency Creation: Give them a reason to act today.

Core Sales Pitch Hook (Manufacturer's relationship strategy):
- "With this new release, our manufacturer wants us to give away free blades to our customers to build new relationships." (If it is a cold call or re-engagement/outreach, use this exact strategy/hook!)

Reference Pitch Guidelines for the recommended product (${recommendedBlade.name}):
- Price tier: ${recommendedBlade.priceRange}
- Intended Applications: ${recommendedBlade.applications.join(", ")}
- Key features: ${recommendedBlade.keyFeatures.join(" | ")}

Titan Diamond Industry Lingo (Use naturally):
- "like a hot knife through butter"
- "pull itself through the cut"
- "let the blade do the work"
- "made under higher heat and lower pressure"
- "last twice as long without sacrificing speed"

Writing Rules:
- Make it sound like a real human speaking casually but professionally. No robotic structures.
- Address the client by their First Name if known.
- Introduce yourself using the Rep Name.
- Do NOT use any brackets or placeholders (e.g., [Client Name]). Use the actual data provided.
- Provide a clear "Talking Script" section.
- Provide a "Next-Best Actions / Insights" section at the bottom for the rep.

CRITICAL INSTRUCTIONS based on Call Type:
- IF Cold Call: Start with fact-finding only. Do NOT pitch products until enough information is collected. Recommend the next appropriate script path.
- IF Account Update: Provide recommended products to pitch (e.g., ${recommendedBlade.name}), suggest quantities, and suggest pricing. Base recommendations on previous purchases and needs. Give clear talking points.
`

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

    contextPrompt += `\nPrevious Call Logs (Pre-fill fact finding from this history):\n${historyText}\n`
    
    if (callType === 'Cold Call') {
      contextPrompt += `Context: This is a Cold Call. DO NOT pitch products. Focus entirely on fact-finding using the available scripts. Identify pain points, decision makers, and usage patterns.\n`
    } else if (callType === 'Objection Handling') {
      contextPrompt += `Context: The client previously objected. Address the objections seen in the call logs. Pitch the ${recommendedBlade.name} focusing on value, consultative selling, and why the segments are made under higher heat and lower pressure to last longer.\n`
    } else if (callType === 'Overdue Invoice') {
      contextPrompt += `Context: The client has an overdue invoice. Be polite but firm, applying a consultative approach to understand the delay while maintaining the relationship.\n`
    } else if (typeof daysSinceLastPurchase === 'number' && daysSinceLastPurchase > 365) {
      contextPrompt += `Context: Re-engagement call. They haven't bought in over a year. Pitch the free blade hook to re-establish the relationship, and reference the ${recommendedBlade.name}.\n`
    } else {
      contextPrompt += `Context: Account Update / Active Client. Pitch an upgrade or restock of the ${recommendedBlade.name}. Recommend quantities and pricing based on their history. Reference their recent items directly so it feels personalized.\n`
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: contextPrompt }
      ],
      temperature: 0.7,
      max_tokens: 500, // Increased to allow for Next Best Actions and quantities
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
