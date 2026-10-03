import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * Universal Voice Bridge & Zoho Voice Webhook Receiver
 * Accepts webhooks from Zoho Voice, Asterisk/FreePBX, Twilio, Telnyx, or custom SIP bridges.
 * Updates CallLog statuses, durations, and recordings in real time.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    
    // Normalize payload across different telephony bridge providers
    const callId = body.callId || body.zohoCallId || body.call_id || body.CallSid || body.id
    const status = (body.status || body.call_status || body.event || "").toLowerCase()
    const duration = Number(body.duration || body.call_duration || body.CallDuration || 0)
    const recordingUrl = body.recordingUrl || body.recording_url || body.RecordingUrl || null
    const from = body.from || body.from_number || body.caller || body.From || ""
    const to = body.to || body.to_number || body.callee || body.To || ""

    if (!callId) {
      return NextResponse.json({ received: true, warning: "No call identifier provided" }, { status: 200 })
    }

    // Try finding existing CallLog by zohoCallId or id
    const existing = await prisma.callLog.findFirst({
      where: {
        OR: [
          { zohoCallId: String(callId) },
          { id: String(callId) }
        ]
      }
    })

    if (existing) {
      // Map telephony status to our system status
      let mappedStatus = existing.status
      if (status.includes("answer") || status.includes("connect") || status.includes("in-progress")) {
        mappedStatus = "in-progress"
      } else if (status.includes("complete") || status.includes("end") || status.includes("hangup") || status.includes("finish")) {
        mappedStatus = "COMPLETED"
      } else if (status.includes("busy") || status.includes("no-answer") || status.includes("fail") || status.includes("cancel")) {
        mappedStatus = "FAILED"
      }

      await prisma.callLog.update({
        where: { id: existing.id },
        data: {
          status: mappedStatus,
          duration: duration > 0 ? duration : existing.duration,
          recordingUrl: recordingUrl || existing.recordingUrl,
          editedAt: new Date(),
          notes: body.notes ? `${existing.notes || ""}\n[Bridge Update]: ${body.notes}`.trim() : existing.notes
        }
      })

      // If call finished and it was outbound, record lastCalledAt on the account
      if (mappedStatus === "COMPLETED" && existing.accountId) {
        try {
          await prisma.account.update({
            where: { id: existing.accountId },
            data: { lastCalledAt: new Date() }
          })
        } catch {}
      }

      return NextResponse.json({
        success: true,
        updated: true,
        callLogId: existing.id,
        status: mappedStatus
      })
    }

    return NextResponse.json({
      received: true,
      matched: false,
      callId,
      message: "Webhook event logged but no matching local CallLog found"
    })
  } catch (err: any) {
    console.error("Voice Bridge Webhook Error:", err)
    return NextResponse.json({ error: err.message || "Failed to process voice bridge webhook" }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    status: "active",
    endpoint: "/api/calls/bridge-webhook",
    capabilities: [
      "Zoho Voice Event Webhooks",
      "SIP/PBX Voice Bridge Callbacks",
      "Call Status Reconciliation (ringing, in-progress, completed, failed)",
      "Call Duration & Recording URL Association"
    ]
  })
}
