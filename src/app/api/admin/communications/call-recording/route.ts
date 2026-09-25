import { NextResponse } from "next/server"
import { requireAdministrator } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { getZohoVoiceAccessToken } from "@/lib/zoho-voice-auth"

// Explicit POST: recordings are provider reads, never part of page-facing GETs.
export async function POST(req: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  try {
    const input = await req.json()
    if (typeof input.callId !== "string") return NextResponse.json({ error: "Call ID required" }, { status: 400 })
    const call = await prisma.callLog.findUnique({ where: { id: input.callId }, select: { id: true, accountId: true, zohoCallId: true } })
    if (!call?.zohoCallId) return NextResponse.json({ error: "Call not found" }, { status: 404 })
    const audit = await prisma.operationalAction.findUnique({ where: { idempotencyKey: `voice-manual-association:${call.zohoCallId}` } })
    if (audit?.status !== "SUCCEEDED" || audit.entityId !== call.id || audit.accountId !== call.accountId) return NextResponse.json({ error: "Audited call association required" }, { status: 409 })
    const filename = (audit.payload as Record<string, unknown> | null)?.recordingFilename
    if (typeof filename !== "string" || !/^[a-zA-Z0-9_.-]{1,250}$/.test(filename)) return NextResponse.json({ error: "Provider recording filename unavailable; no filename will be guessed" }, { status: 409 })
    const token = await getZohoVoiceAccessToken()
    if (!token) return NextResponse.json({ error: "Voice connection unavailable" }, { status: 503 })
    const response = await fetch(`https://voice.zoho.com/rest/json/zv/logs/voicerecording?recording_filename=${encodeURIComponent(filename)}&mode=Play`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: "audio/*" }, signal: AbortSignal.timeout(20000), redirect: "error", cache: "no-store",
    })
    const contentType = response.headers.get("content-type") || ""
    if (!response.ok || !/^audio\//i.test(contentType) || !response.body) return NextResponse.json({ error: "Provider recording is unavailable in a playable format" }, { status: 502 })
    return new Response(response.body, { headers: { "Content-Type": contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } })
  } catch {
    return NextResponse.json({ error: "Recording retrieval failed" }, { status: 502 })
  }
}
