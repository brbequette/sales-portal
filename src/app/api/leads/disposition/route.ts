import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedDbUser } from "@/lib/session-user"

const DISPOSITIONS = new Set(["PRIMARY_BUYER", "NO_ANSWER", "LEFT_VOICEMAIL", "SCHEDULED_CALLBACK", "NOT_THE_BUYER", "NO_LONGER_WITH_COMPANY", "OUT_OF_BUSINESS", "WRONG_NUMBER", "DO_NOT_CALL", "NOT_INTERESTED", "LEFT_COMPANY", "EXCLUDED"])

export async function POST(req: Request) {
  try {
    const auth = await getAuthenticatedDbUser()
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { leadId, disposition, notes, callbackDate } = await req.json()
    if (!leadId || !DISPOSITIONS.has(disposition)) return NextResponse.json({ error: "A valid leadId and disposition are required" }, { status: 400 })

    const lead = await prisma.lead.findUnique({ where: { id: leadId } })
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 })
    if (!auth.isAdmin && lead.ownerId !== auth.user.id && lead.claimedById !== auth.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    let callbackAt: Date | null = null
    if (disposition === "SCHEDULED_CALLBACK") {
      callbackAt = new Date(callbackDate)
      if (!callbackDate || Number.isNaN(callbackAt.getTime())) return NextResponse.json({ error: "A valid callback date and time are required" }, { status: 400 })
    }

    const taskKey = `task_lead_${leadId}_callback`
    const result = await prisma.$transaction(async tx => {
      const updatedLead = await tx.lead.update({
        where: { id: leadId },
        data: { disposition, dispositionNotes: notes?.trim() || null, dispositionAt: new Date(), lastCalledAt: new Date(), status: disposition === "SCHEDULED_CALLBACK" ? "Follow Up" : lead.status },
      })

      let callbackTask = null
      if (callbackAt) {
        callbackTask = await tx.task.upsert({
          where: { zohoId: taskKey },
          update: { subject: `Callback Lead: ${lead.company} (${lead.firstName || ""} ${lead.lastName || ""})`, description: notes?.trim() || "Scheduled callback from lead disposition", status: "Not Started", priority: "High", dueDate: callbackAt, ownerId: lead.claimedById || lead.ownerId, leadId },
          create: { zohoId: taskKey, subject: `Callback Lead: ${lead.company} (${lead.firstName || ""} ${lead.lastName || ""})`, description: notes?.trim() || "Scheduled callback from lead disposition", status: "Not Started", priority: "High", dueDate: callbackAt, ownerId: lead.claimedById || lead.ownerId, leadId, type: "Call" },
        })
      } else {
        await tx.task.updateMany({ where: { zohoId: taskKey, status: { notIn: ["Completed", "Cancelled"] } }, data: { status: "Cancelled" } })
      }
      return { updatedLead, callbackTask }
    })

    return NextResponse.json({ success: true, lead: result.updatedLead, callbackTaskId: result.callbackTask?.id || null, message: `Disposition '${disposition}' saved for lead ${lead.company}` })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save disposition"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
