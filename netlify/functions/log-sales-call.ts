import { Handler } from "@netlify/functions"

import { prisma } from "./lib/prisma"
const ZOHO_DC = process.env.ZOHO_DC || 'com'

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method not allowed" }) }

  try {
    const body = JSON.parse(event.body || "{}")
    const {
      accountId,
      outcome,
      notes,
      callerName,
      contactReached,
      spokeTo,
      followUpDate,
      durationMinutes,
      userId,

      // ── Fact-Finding Fields ──────────────────────────────────────────
      // These map directly to Account fields and are persisted immediately
      factFinding,
      // factFinding shape:
      // {
      //   bladeSizes?: string        — e.g. "4\", 7\", 9\""
      //   materialsCut?: string      — e.g. "Concrete, Asphalt, Granite"
      //   currentSupplier?: string   — competitor or "Titan only"
      //   averageBladeCost?: string  — e.g. "$45-65"
      //   productInterest?: string[] — e.g. ["turbo_blade","cup_wheel"]
      //   qualityPreference?: string — "PREMIUM"|"MID"|"ECONOMY"
      //   monthlyVolume?: string     — estimated spend
      //   jobTypes?: string          — "residential","commercial","industrial"
      //   purchaseAuthority?: string — "yes"|"no"|"influences"
      //   competitorPrice?: string   — what competitor charges
      //   painPoints?: string        — free text
      //   readyToBuy?: string        — "immediate"|"next_month"|"evaluating"|"no"
      //   tags?: string              — updated tags
      // }
    } = body

    if (!accountId) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "accountId required" }) }

    // ── Resolve account ──────────────────────────────────────────────
    const account = await prisma.account.findFirst({
      where: { OR: [{ id: accountId }, { zohoId: accountId }] }
    })
    if (!account) return { statusCode: 404, headers: cors, body: JSON.stringify({ error: "Account not found" }) }

    // ── Resolve caller ───────────────────────────────────────────────
    let caller = userId
      ? await prisma.user.findUnique({ where: { id: userId } })
      : null
    if (!caller) {
      caller = await prisma.user.findFirst({ where: { email: { contains: "@titandiamond" } } })
    }
    if (!caller) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "No user found" }) }

    // ── Build note content ───────────────────────────────────────────
    const outcomeLabels: Record<string, string> = {
      left_voicemail:  "Voicemail Left",
      no_answer:       "No Answer",
      check_in:        "Check-in Call",
      pitch:           "Product Pitch",
      order_placed:    "Order Placed",
      follow_up:       "Follow Up",
      callback_requested: "Callback Requested",
      not_interested:  "Not Interested",
      other:           "Other",
    }

    const productLabels: Record<string, string> = {
      turbo_blade:      "Turbo Blades",
      continuous_rim:   "Continuous Rim Blades",
      segmented_blade:  "Segmented Blades",
      core_bit:         "Core Bits",
      cup_wheel:        "Cup Wheels / Grinding",
      polishing_pads:   "Polishing Pads",
      hand_pad:         "Hand Pads",
      crack_chaser:     "Crack Chasers",
      other_product:    "Other Products",
    }

    const readyLabels: Record<string, string> = {
      immediate:   "Ready to Buy — Immediate",
      next_month:  "Likely — Next Month",
      evaluating:  "Evaluating Options",
      no:          "Not Buying Now",
    }

    // Main call section
    const noteLines: string[] = [
      `📞 Sales Call — ${outcomeLabels[outcome] || outcome || "Outreach"}`,
      contactReached ? `Spoke With: ${spokeTo || "Contact"}` : "No contact reached",
      durationMinutes ? `Duration: ${durationMinutes} min` : null,
      notes ? `Notes: ${notes}` : null,
      followUpDate ? `Follow-up Scheduled: ${followUpDate}` : null,
      `By: ${callerName || caller.name || "Sales Rep"}`,
    ].filter(Boolean) as string[]

    // Fact-finding section — only append if any data was collected
    const ff = factFinding || {}
    const ffLines: string[] = []

    if (ff.bladeSizes)        ffLines.push(`Blade Sizes Used: ${ff.bladeSizes}`)
    if (ff.materialsCut)      ffLines.push(`Materials Cut: ${ff.materialsCut}`)
    if (ff.currentSupplier)   ffLines.push(`Current Supplier: ${ff.currentSupplier}`)
    if (ff.averageBladeCost)  ffLines.push(`Avg Blade Cost: ${ff.averageBladeCost}`)
    if (ff.crewCount)         ffLines.push(`Crew Count: ${ff.crewCount}`)
    if (ff.bladesPerOrder)    ffLines.push(`Blades Per Order: ${ff.bladesPerOrder}`)
    if (ff.improvementPriority) ffLines.push(`Improvement Priority: ${ff.improvementPriority}`)
    if (ff.competitorPrice)   ffLines.push(`Competitor Pricing: ${ff.competitorPrice}`)
    if (ff.monthlyVolume)     ffLines.push(`Est. Monthly Volume: ${ff.monthlyVolume}`)
    if (ff.jobTypes)          ffLines.push(`Job Types: ${ff.jobTypes}`)
    if (ff.purchaseAuthority) ffLines.push(`Purchase Authority: ${ff.purchaseAuthority === "yes" ? "Decision Maker" : ff.purchaseAuthority === "influences" ? "Influences Purchase" : "Not Decision Maker"}`)
    if (ff.readyToBuy)        ffLines.push(`Buying Timeline: ${readyLabels[ff.readyToBuy] || ff.readyToBuy}`)
    if (ff.qualityPreference) ffLines.push(`Quality Preference: ${ff.qualityPreference}`)
    if (ff.productInterest?.length) {
      const products = (ff.productInterest as string[]).map((p: string) => productLabels[p] || p).join(", ")
      ffLines.push(`Products of Interest: ${products}`)
    }
    if (ff.painPoints)        ffLines.push(`Pain Points: ${ff.painPoints}`)

    const fullContent = ffLines.length > 0
      ? noteLines.join("\n") + "\n\n📋 FACT-FINDING:\n" + ffLines.join("\n")
      : noteLines.join("\n")

    // Determine sentiment
    let sentiment = "neutral"
    if (["order_placed", "pitch", "immediate"].includes(outcome) || ff.readyToBuy === "immediate") {
      sentiment = "positive"
    } else if (["not_interested", "no_answer"].includes(outcome) || ff.readyToBuy === "no") {
      sentiment = "negative"
    }

    // ── Build account update payload ─────────────────────────────────
    // Only write fields that were actually filled in — never blank out existing data
    const accountUpdate: Record<string, any> = {
      lastCalledAt: new Date(),
    }

    if (ff.bladeSizes?.trim())       accountUpdate.bladeSizes       = ff.bladeSizes.trim()
    if (ff.materialsCut?.trim())     accountUpdate.materialsCut     = ff.materialsCut.trim()
    if (ff.currentSupplier?.trim())  accountUpdate.currentSupplier  = ff.currentSupplier.trim()
    if (ff.averageBladeCost?.trim()) accountUpdate.averageBladeCost = ff.averageBladeCost.trim()
    if (ff.crewCount?.trim())        accountUpdate.crewCount        = ff.crewCount.trim()
    if (ff.bladesPerOrder?.trim())   accountUpdate.bladesPerOrder   = ff.bladesPerOrder.trim()
    if (ff.improvementPriority?.trim()) accountUpdate.improvementPriority = ff.improvementPriority.trim()
    if (ff.tags?.trim())             accountUpdate.tags             = ff.tags.trim()

    // Map quality preference to account quality field
    if (ff.qualityPreference) {
      const qMap: Record<string, string> = {
        PREMIUM: "HOT",
        MID:     "WARM",
        ECONOMY: "COLD",
      }
      accountUpdate.quality = qMap[ff.qualityPreference] || account.quality
    }

    // If they're ready to buy immediately, bump nextActionDate to tomorrow
    if (ff.readyToBuy === "immediate" && !followUpDate) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      accountUpdate.nextActionDate = tomorrow
    } else if (followUpDate) {
      accountUpdate.nextActionDate = new Date(followUpDate)
    }

    // ── Atomic write: note + account update ─────────────────────────
    const [note] = await prisma.$transaction([
      prisma.note.create({
        data: {
          accountId: account.id,
          authorId: caller.id,
          content: fullContent,
          isAutoGenerated: false,
          sentiment,
        }
      }),
      prisma.account.update({
        where: { id: account.id },
        data: accountUpdate,
      }),
    ])

    // Push Note to Zoho CRM
    if (account.zohoId) {
      const { pushZohoNote } = await import("./lib/zoho-auth")
      await pushZohoNote(account.zohoId, `Sales Call Log: ${outcomeLabels[outcome] || outcome}`, fullContent)
    }

    // ── Follow-up task ───────────────────────────────────────────────
    if (followUpDate) {
      try {
        const taskSubject = ff.readyToBuy === "immediate"
          ? `🔥 HOT LEAD — Follow-up with ${account.name}`
          : `Follow-up call with ${account.name}`

        const taskDesc = [
          `Sales follow-up from call on ${new Date().toLocaleDateString()}.`,
          notes ? `Call Notes: ${notes}` : null,
          ff.productInterest?.length
            ? `Interested In: ${(ff.productInterest as string[]).map((p: string) => productLabels[p] || p).join(", ")}`
            : null,
          ff.readyToBuy ? `Buying Timeline: ${readyLabels[ff.readyToBuy] || ff.readyToBuy}` : null,
        ].filter(Boolean).join("\n")

        // First create locally
        const localTask = await prisma.task.create({
          data: {
            zohoId: `local-task-${Date.now()}`,
            subject: taskSubject,
            description: taskDesc,
            status: "Not Started",
            priority: ff.readyToBuy === "immediate" ? "High" : "Normal",
            dueDate: new Date(followUpDate),
            ownerId: caller.id,
            accountId: account.id,
          }
        })

        // Then try to sync to Zoho CRM (non-blocking)
        if (caller.zohoId) {
          const { getZohoAccessToken } = await import("./lib/zoho-auth")
          getZohoAccessToken().then(token => {
            const zohoPayload = {
              data: [{
                Subject: taskSubject,
                Description: taskDesc,
                Status: "Not Started",
                Priority: ff.readyToBuy === "immediate" ? "High" : "Normal",
                Due_Date: followUpDate,
                Owner: { id: caller!.zohoId },
                What_Id: { id: account.zohoId },
                $se_module: "Accounts",
              }]
            }
            fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Tasks`, {
              method: "POST",
              headers: {
                Authorization: `Zoho-oauthtoken ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(zohoPayload),
            }).then(res => res.json()).then(data => {
              const zohoTaskId = data?.data?.[0]?.details?.id
              if (zohoTaskId) {
                prisma.task.update({
                  where: { id: localTask.id },
                  data: { zohoId: zohoTaskId },
                }).catch(e => console.warn("Could not update task zohoId:", e.message))
              }
            }).catch(e => console.warn("Zoho task sync failed (non-fatal):", e.message))
          }).catch(e => console.warn("Token fetch for task sync failed:", e.message))
        }
      } catch (taskErr: any) {
        console.warn("Failed to create follow-up task:", taskErr.message)
      }
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        noteId: note.id,
        accountUpdated: Object.keys(accountUpdate).filter(k => k !== "lastCalledAt"),
      })
    }

  } catch (err: any) {
    console.error("log-sales-call error:", err)
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) }
  }
}
