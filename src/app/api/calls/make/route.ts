import { NextRequest, NextResponse } from "next/server"
import { getZohoAccessToken } from "@/lib/zoho-auth"
import { initiateZohoVoiceCall, resolveAccount } from "@/lib/communications"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { fromNumber, toNumber, accountId, mode } = body

    if (mode === "mark-connected") {
      const account = await resolveAccount(accountId)
      if (account) {
        await prisma.account.update({
          where: { id: account.id },
          data: { lastCalledAt: new Date() },
        })
      }

      return NextResponse.json({ success: true })
    }

    const accessToken = await getZohoAccessToken()
    if (!accessToken) {
      return NextResponse.json({ success: false, error: "Could not retrieve Zoho access token" }, { status: 502 })
    }

    const callResult = await initiateZohoVoiceCall({ accessToken, fromNumber, toNumber })

    if (!callResult.success) {
      return NextResponse.json(
        { success: false, error: callResult.error || "Zoho Voice rejected the call request" },
        { status: callResult.status || 502 }
      )
    }

    const account = await resolveAccount(accountId)
    if (account) {
      await prisma.account.update({
        where: { id: account.id },
        data: { lastCalledAt: new Date() },
      })
    }

    return NextResponse.json({
      success: true,
      zohoCallId: callResult.zohoCallId,
      fromNumber: callResult.fromNumber,
      toNumber: callResult.toNumber,
      message: "Call initiated successfully"
    })
  } catch (err: unknown) {
    console.error("Make Call Error:", err)
    const message = err instanceof Error ? err.message : "Failed to initiate call"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
