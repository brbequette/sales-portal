import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkAccountOwnership } from "@/lib/auth-helpers"

// Resolve the outbound caller-ID number: explicit override  to  env  to  default
// Zoho number from system settings  to  legacy fallback.
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
 * their handset and log the call afterwards -- the UI is never blocked.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { fromNumber, toNumber, accountId } = body

    if (!accountId) return NextResponse.json({ error: "An account is required to place a call" }, { status: 400 })
    const access = await checkAccountOwnership(accountId)
    if (!access.authorized) return access.errorResponse || NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const to = normalize(toNumber)
    if (!to) {
      return NextResponse.json({ error: "Missing destination number" }, { status: 400 })
    }

    const from = normalize(await resolveFromNumber(fromNumber))
    const webSdkConfigured = Boolean(process.env.NEXT_PUBLIC_ZOHO_VOICE_WEBSDK_API_KEY?.trim())
    // Calls are placed in the authenticated browser via Zoho Voice WebSDK or
    // ZDialer. Never claim the server placed a call when it only returned config.
    return NextResponse.json({
      success: true,
      placed: false,
      mode: webSdkConfigured ? "zoho_voice_websdk" : "zdialer_or_tel",
      fromNumber: from,
      toNumber: to,
      message: webSdkConfigured ? "Ready for browser WebSDK dialing" : "Zoho WebSDK API key is not configured; use ZDialer or the device dialer",
    })
  } catch (err: any) {
    console.error("Make Call Error:", err)
    return NextResponse.json({ error: "Failed to initiate call" }, { status: 500 })
  }
}
