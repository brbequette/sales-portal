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
    const response = await fetch(`https://voice.zoho.com/rest/json/zv/logs/voicerecording?recording_filename=${encodeURIComponent(filename)}&mode=play`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: "*/*" }, signal: AbortSignal.timeout(20000), redirect: "error", cache: "no-store",
    })
    if (!response.ok || !response.body) return NextResponse.json({ error: "Provider recording is unavailable" }, { status: 502 })
    // Voice currently returns valid MP3 bytes as application/octet-stream.
    // Validate file signature instead of trusting either MIME or extension alone.
    const maxBytes = 25 * 1024 * 1024
    if (Number(response.headers.get("content-length")) > maxBytes) {
      await response.body.cancel()
      return NextResponse.json({ error: "Recording exceeds playback size limit" }, { status: 413 })
    }
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.length
      if (size > maxBytes) { await reader.cancel(); return NextResponse.json({ error: "Recording exceeds playback size limit" }, { status: 413 }) }
      chunks.push(chunk.value)
    }
    const bytes = Buffer.concat(chunks)
    const mp3 = filename.toLowerCase().endsWith(".mp3") && bytes.length >= 4 &&
      (bytes.subarray(0, 3).toString() === "ID3" || (bytes[0] === 255 && (bytes[1] & 224) === 224 && (bytes[1] & 6) !== 0 && (bytes[2] & 240) !== 240))
    const wav = filename.toLowerCase().endsWith(".wav") && bytes.length >= 12 && bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WAVE"
    if (!mp3 && !wav) return NextResponse.json({ error: "Provider recording failed audio format validation" }, { status: 502 })
    return new Response(bytes, { headers: { "Content-Type": mp3 ? "audio/mpeg" : "audio/wav", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } })

  } catch {
    return NextResponse.json({ error: "Recording retrieval failed" }, { status: 502 })
  }
}
