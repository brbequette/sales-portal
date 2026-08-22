import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedDbUser } from "@/lib/session-user"

export async function POST(req: Request) {
  try {
    const auth = await getAuthenticatedDbUser()
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { leadId, disposition, notes, callbackDate } = await req.json()
    if (!leadId || !disposition) {
      return NextResponse.json({ error: "leadId and disposition are required" }, { status: 400 })
    }

    const lead = await prisma.lead.findUnique({ where: { id: leadId } })
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 })
    }
    if (!auth.isAdmin && lead.ownerId !== auth.user.id && lead.claimedById !== auth.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const updatedLead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        disposition,
        dispositionNotes: notes || null,
        dispositionAt: new Date(),
        lastCalledAt: new Date(),
        status: disposition === "CONVERTED" ? "Converted" : (disposition === "SCHEDULED_CALLBACK" ? "Follow Up" : lead.status)
      }
    })

    // If scheduled callback, create a Task
    if (disposition === "SCHEDULED_CALLBACK" && callbackDate) {
      await prisma.task.create({
        data: {
          zohoId: `task_lead_${leadId}_${Date.now()}`,
          subject: `Callback Lead: ${lead.company} (${lead.firstName || ''} ${lead.lastName || ''})`,
          description: notes || "Scheduled callback from lead disposition",
          status: "Not Started",
          priority: "High",
          dueDate: new Date(callbackDate),
          ownerId: auth.user.id
        }
      })
    }

    return NextResponse.json({
      success: true,
      lead: updatedLead,
      message: `Disposition '${disposition}' saved for lead ${lead.company}`
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
