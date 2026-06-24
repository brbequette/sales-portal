import { NextResponse } from "next/server"
import { getZohoAccessToken } from "@/lib/zoho-auth"
import { resolveOutboundVoiceNumber } from "@/lib/communications"

export async function GET() {
  try {
    const [accessToken, outboundNumber] = await Promise.all([
      getZohoAccessToken(),
      resolveOutboundVoiceNumber(),
    ])

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: "Could not retrieve Zoho access token" },
        { status: 502 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        accessToken,
        outboundNumber,
        defaultCountry: "us",
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load Zoho Voice SDK config"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
