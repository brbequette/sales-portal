import { salesCallText } from "../../src/lib/sales-call-flow"
import type { Context } from "@netlify/functions"
import { createAIChatCompletion } from "../../src/lib/ai-client"
import { scriptTemplates } from "./lib/script-templates"
import { prisma } from "./lib/prisma"
import { authenticateRequest } from "./lib/auth-middleware"
import { isAdminRole } from "../../src/lib/roles"

const handler = async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return Response.json(
      { success: false, message: "Method Not Allowed" },
      { status: 405 }
    )
  }

  let sessionUser
  try {
    sessionUser = await authenticateRequest(req)
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { 
      accountId, 
      accountName, 
      industry, 
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

    // 1. Validate account access before reading account-specific call history.
    let resolvedAccountId: string | null = null
    let savedFacts: Record<string, unknown> = {}
    if (accountId) {
      const account = await prisma.account.findFirst({
        where: { OR: [{ id: accountId }, { zohoId: accountId }] },
        select: { id: true, ownerId: true, bladeSizes: true, materialsCut: true, currentSupplier: true, averageBladeCost: true, crewCount: true, bladesPerOrder: true, improvementPriority: true },
      })
      if (!account) {
        return Response.json({ error: "Account not found" }, { status: 404 })
      }
      const actorId = sessionUser.dbId || sessionUser.userId
      if (!isAdminRole(sessionUser.role) && (!actorId || account.ownerId !== actorId)) {
        return Response.json({ error: "Forbidden: This account belongs to another representative" }, { status: 403 })
      }
      resolvedAccountId = account.id
      savedFacts = { bladeSizes: account.bladeSizes, materialsCut: account.materialsCut, currentSupplier: account.currentSupplier, averageBladeCost: account.averageBladeCost, crewCount: account.crewCount, bladesPerOrder: account.bladesPerOrder, improvementPriority: account.improvementPriority }
    }

    // 2. Fetch CallScripts and authorized CallLogs from DB.
    let dbScripts: any[] = []
    let callHistory: any[] = []
    
    try {
      dbScripts = await prisma.callScript.findMany({
        where: { isActive: true, department: callType === "Overdue Invoice" ? "COLLECTIONS" : "SALES" }
      })

      if (resolvedAccountId) {
        callHistory = await prisma.callLog.findMany({
          where: { accountId: resolvedAccountId },
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

    // 3. Determine the best blade to pitch based on industry, tags, or past order items
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

    const systemPrompt = `You write practical Titan Diamond call coaching grounded in supplied account facts.
Fact finding is the opening for BOTH cold calls and account updates, not the entire call.
For cold calls, progress from buyer/permission to discovery, summarize the need, offer a suitable first order, handle concerns, then ask for a quote/order or agree a dated follow-up.
For account updates, confirm saved facts and prior product results, ask only missing/changed details, then offer a relevant restock or improvement.
Do not require all seven fact fields before an offer. Do not assume a past call means a past purchase.
Use these approved library references when relevant; do not let an opening-only script prevent a sales offer:
${availableScriptsText}
Suggested conversation structure:
${salesCallText({ type: /cold/i.test(callType || "") ? "cold" : "update" })}
Candidate product for catalog verification: ${recommendedBlade.name}. Confirm application, size, arbor, RPM and wet/dry use before recommending a SKU.
Never invent prices, savings percentages, free products, terms, guarantees, stock, urgency or delivery commitments. Only state promotion terms when supplied and verified, including paid quantity and full total. Ask the rep to confirm missing commercial details in the order tools.
For explicitly selected collections calls, focus on verified invoices and payment resolution rather than switching to a sales pitch.
Provide short numbered talking stages, a relevant objection response and Next-Best Actions. Distinguish spoken words from rep cues. Do not claim an order, follow-up, call or message was saved or sent. Respect a clear decline or do-not-call request.
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
    contextPrompt += `\nSaved account facts (confirm what changed; do not repeat the entire interview): ${JSON.stringify(savedFacts)}\n`
    
    if (/cold/i.test(callType || '')) {
      contextPrompt += `Context: This is a Cold Call. Start with fact-finding, then offer a suitable first order based on the answers. Include a transition into the offer, an objection response, and a concrete close or dated follow-up.\n`
    } else if (callType === 'Objection Handling') {
      contextPrompt += `Context: The client previously objected. Address the objections seen in the call logs. Pitch the ${recommendedBlade.name} focusing on value, consultative selling, and why the segments are made under higher heat and lower pressure to last longer.\n`
    } else if (callType === 'Overdue Invoice') {
      contextPrompt += `Context: The client has an overdue invoice. Be polite but firm, applying a consultative approach to understand the delay while maintaining the relationship.\n`
    } else if (typeof daysSinceLastPurchase === 'number' && daysSinceLastPurchase > 365) {
      contextPrompt += `Context: Re-engagement call. They haven't bought in over a year. Confirm what has changed and offer a relevant new order; verify any promotion before mentioning it. Consider the ${recommendedBlade.name}.\n`
    } else {
      contextPrompt += `Context: Account Update / Active Client. Pitch an upgrade or restock of the ${recommendedBlade.name}. Use history to ask about quantity; confirm current pricing in the order tools. Reference their recent items directly so it feels personalized.\n`
    }

    const { response } = await createAIChatCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: contextPrompt }
      ],
      temperature: 0.7,
      max_tokens: 1200, // Enough room for discovery, offer, objections and the next step.
    })

    const script = response.choices[0].message?.content || "Could not generate script."

    return Response.json({ success: true, script }, { status: 200 })

  } catch (error: any) {
    console.error('OpenAI API Error:', error)
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

export default handler
