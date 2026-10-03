import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkAccountOwnership } from "@/lib/auth-helpers"
import { getZohoVoiceAccessToken } from "@/lib/zoho-voice-auth"

// Resolve the outbound caller-ID number: explicit override -> env -> default
// Zoho number from system settings -> legacy fallback.
async function resolveFromNumber(provided?: string): Promise<string> {
  if (provided && provided !== "System" && provided.trim()) return provided.trim()
  if (process.env.ZOHO_VOICE_FROM_NUMBER) return process.env.ZOHO_VOICE_FROM_NUMBER
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: "zoho_phone_numbers" } })
    if (setting?.value) {
      const parsed = JSON.parse(setting.value)
      const def = parsed.find((n: any) => n.isDefault) || parsed[0]
      if (def?.number) return def.number
    }
  } catch {}
  return "+14804702577"
}

function normalize(num: string): string {
  let n = (num || "").replace(/[^\d+]/g, "")
  if (n.length === 10 && !n.startsWith("+")) n = "+1" + n
  else if (!n.startsWith("+") && n.length > 10) n = "+" + n
  return n
}

/**
 * Initiate an outbound call through Zoho Voice Click-to-Call,
 * a custom PBX/WebRTC bridge, or the in-app WebRTC softphone.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      fromNumber,
      toNumber,
      accountId,
      contactId,
      agentPhone,
      agentId,
      bridgeUrl,
      mode = "auto" // "auto" | "zoho_voice_bridge" | "browser_softphone" | "custom_bridge"
    } = body

    const to = normalize(toNumber)
    if (!to) {
      return NextResponse.json({ error: "Missing destination phone number" }, { status: 400 })
    }

    const from = normalize(await resolveFromNumber(fromNumber))
    const cleanAgentPhone = agentPhone ? normalize(agentPhone) : ""

    let authorId = ""
    let verifiedAccount: any = null

    if (accountId) {
      const access = await checkAccountOwnership(accountId)
      if (access.authorized) {
        authorId = String(access.user?.dbId || "")
        verifiedAccount = await prisma.account.findFirst({
          where: { OR: [{ id: accountId }, { zohoId: accountId }] },
          select: { id: true, name: true }
        })
      }
    }

    const dc = process.env.ZOHO_DC || "com"
    let placedViaZoho = false
    let zohoCallId = `ZV-${Date.now()}`
    let providerMessage = ""

    // 1. Check if external custom bridge webhook is provided or configured in SystemSetting
    let customBridgeWebhook = bridgeUrl || process.env.VOICE_BRIDGE_URL || ""
    if (!customBridgeWebhook) {
      try {
        const bridgeSetting = await prisma.systemSetting.findUnique({ where: { key: "voice_bridge_url" } })
        if (bridgeSetting?.value) customBridgeWebhook = bridgeSetting.value.trim()
      } catch {}
    }

    if (customBridgeWebhook && (mode === "custom_bridge" || (mode === "auto" && cleanAgentPhone))) {
      try {
        const bridgeRes = await fetch(customBridgeWebhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "OUTBOUND_BRIDGE",
            fromNumber: from,
            toNumber: to,
            agentPhone: cleanAgentPhone,
            accountId: verifiedAccount?.id || accountId,
            timestamp: new Date().toISOString()
          }),
          signal: AbortSignal.timeout(8000)
        })
        const bridgeData = await bridgeRes.json().catch(() => ({}))
        if (bridgeRes.ok) {
          placedViaZoho = true
          if (bridgeData.callId || bridgeData.bridgeId) {
            zohoCallId = String(bridgeData.callId || bridgeData.bridgeId)
          }
          providerMessage = "Dispatched via external PBX/SIP voice bridge"
        }
      } catch (err: any) {
        console.warn("Custom voice bridge dispatch error:", err.message)
      }
    }

    // 2. If not placed via custom bridge, attempt Zoho Voice Click-to-Call API
    if (!placedViaZoho) {
      try {
        const token = await getZohoVoiceAccessToken()
        if (token) {
          // Zoho Voice v2 / zv Click-to-Call endpoint
          const zvClickUrl = `https://voice.zoho.${dc}/rest/json/v2/call/click2call`
          const zvParams = new URLSearchParams()
          zvParams.append("from_number", from)
          zvParams.append("to_number", to)
          if (cleanAgentPhone) {
            zvParams.append("agent_phone", cleanAgentPhone)
          }
          if (agentId) {
            zvParams.append("agent_id", agentId)
          }
          zvParams.append("call_type", "outbound")

          const zvRes = await fetch(zvClickUrl, {
            method: "POST",
            headers: {
              "Authorization": `Zoho-oauthtoken ${token}`,
              "Content-Type": "application/x-www-form-urlencoded",
              "Accept": "application/json"
            },
            body: zvParams.toString(),
            signal: AbortSignal.timeout(10000)
          })

          const zvData = await zvRes.json().catch(() => ({}))
          if (zvRes.ok && (zvData.success || zvData.status === "success" || zvData.call_id || zvData.log_id)) {
            placedViaZoho = true
            zohoCallId = String(zvData.call_id || zvData.log_id || zohoCallId)
            providerMessage = "Placed via Zoho Voice Click-to-Call"
          } else {
            console.warn("Zoho Voice Click2Call response:", zvData)
            providerMessage = zvData.message || zvData.error || "Zoho Voice API ready for browser softphone"
          }
        }
      } catch (err: any) {
        console.warn("Zoho Voice API call initiation notice:", err.message)
        providerMessage = err.message || "Zoho Voice WebRTC/Softphone mode ready"
      }
    }

    // 3. Record CallLog if account is known
    let callLogId: string | null = null
    if (verifiedAccount?.id) {
      try {
        const log = await prisma.callLog.create({
          data: {
            accountId: verifiedAccount.id,
            contactId: contactId || null,
            authorId: authorId || "system",
            fromNumber: from,
            toNumber: to,
            direction: "OUTBOUND",
            duration: 0,
            status: placedViaZoho ? "in-progress" : "initiated",
            zohoCallId: zohoCallId,
            notes: `Outbound call initiated from Titan Softphone to ${to}`
          }
        })
        callLogId = log.id

        // Update account lastCalledAt timestamp
        await prisma.account.update({
          where: { id: verifiedAccount.id },
          data: { lastCalledAt: new Date() }
        })
      } catch (e) {
        console.warn("Could not create initial call log:", e)
      }
    }

    const webSdkConfigured = Boolean(process.env.NEXT_PUBLIC_ZOHO_VOICE_WEBSDK_API_KEY?.trim())

    return NextResponse.json({
      success: true,
      placed: placedViaZoho,
      mode: placedViaZoho
        ? (cleanAgentPhone ? "zoho_voice_bridge" : "zoho_voice_direct")
        : (webSdkConfigured ? "zoho_voice_websdk" : "browser_softphone"),
      fromNumber: from,
      toNumber: to,
      agentPhone: cleanAgentPhone || null,
      zohoCallId,
      callLogId,
      message: providerMessage || "Call session initialized in Titan Voice Softphone"
    })
  } catch (err: any) {
    console.error("Make Call Route Error:", err)
    return NextResponse.json({ error: err.message || "Failed to initiate call" }, { status: 500 })
  }
}
