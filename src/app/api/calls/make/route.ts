import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getZohoAccessToken } from "@/lib/zoho-auth"

// Resolve the outbound caller-ID number: explicit override → env → default
// Zoho number from system settings → legacy fallback.
async function resolveFromNumber(provided?: string): Promise<string> {
  if (provided && provided !== "System") return provided
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
 * Initiate an outbound call through Zoho Voice (click-to-call).
 * When Zoho credentials/dial-out are configured, this places a real call;
 * otherwise it falls back to "manual" mode so the rep can still dial on
 * their handset and log the call afterwards — the UI is never blocked.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { fromNumber, toNumber, accountId } = body

    const to = normalize(toNumber)
    if (!to) {
      return NextResponse.json({ error: "Missing destination number" }, { status: 400 })
    }

    const from = normalize(await resolveFromNumber(fromNumber))
    const dc = process.env.ZOHO_DC || "com"
    // Override via ZOHO_VOICE_DIAL_URL if your org uses a different endpoint.
    const dialUrl = process.env.ZOHO_VOICE_DIAL_URL || `https://voice.zoho.${dc}/rest/json/v2/calls/dial`

    let token: string | null = null
    try {
      token = await getZohoAccessToken()
    } catch (e: any) {
      console.warn("[ZOHO VOICE] No access token, falling back to manual dial:", e?.message)
    }

    if (token) {
      try {
        const callData = { customerNumber: to, agentNumber: from, callerId: from }
        const formData = new FormData()
        formData.append("call_data", JSON.stringify(callData))

        const res = await fetch(dialUrl, {
          method: "POST",
          headers: { Authorization: `Zoho-oauthtoken ${token}` },
          body: formData,
        })
        const resultText = await res.text()
        let resultJson: any = {}
        try { resultJson = JSON.parse(resultText) } catch {}

        if (res.ok && resultJson.status !== "error" && resultJson.code !== "error") {
          const zohoCallId = resultJson.callId || resultJson.id || resultJson?.data?.callId || `zv_call_${Date.now()}`
          return NextResponse.json({ success: true, zohoCallId, mode: "zoho", message: "Call initiated via Zoho Voice" })
        }
        console.warn("[ZOHO VOICE] Dial API returned non-success:", resultText)
        return NextResponse.json({ success: false, error: `Zoho Voice API Error: ${resultJson.message || resultText}` })
      } catch (err: any) {
        console.warn("[ZOHO VOICE] Dial request failed:", err?.message)
        return NextResponse.json({ success: false, error: `Dial request failed: ${err?.message}` })
      }
    }

    // Graceful fallback: let the rep proceed and log the call manually.
    return NextResponse.json({
      success: true,
      zohoCallId: `manual_${Date.now()}`,
      mode: "manual",
      message: "Dial your handset to connect. Call will be logged on wrap-up.",
    })
  } catch (err: any) {
    console.error("Make Call Error:", err)
    return NextResponse.json({ error: "Failed to initiate call" }, { status: 500 })
  }
}
