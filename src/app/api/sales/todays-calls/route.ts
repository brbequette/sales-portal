import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { isAdministratorRole } from "@/lib/roles"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  const actorId = session.user.dbId || session.user.id
  const isAdmin = isAdministratorRole(session.user.role)
  const now = new Date()
  const dormantCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

  const accounts = await prisma.account.findMany({
    where: {
      ...(isAdmin ? {} : { ownerId: actorId }),
      OR: [
        { tasks: { some: { status: { notIn: ["Completed", "COMPLETED"] }, dueDate: { lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) } } } },
        { nextActionDate: { lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) } },
        { lastPurchaseAt: { lte: dormantCutoff } },
        { lastCalledAt: null },
      ],
    },
    select: {
      id: true, name: true, status: true, quality: true, timeZone: true,
      lastPurchaseAt: true, lastCalledAt: true, nextActionDate: true, ownerId: true,
      contacts: { orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }], take: 3, select: { id: true, firstName: true, lastName: true, phone: true, mobilePhone: true, designation: true, isPrimary: true } },
      tasks: { where: { status: { notIn: ["Completed", "COMPLETED"] } }, orderBy: { dueDate: "asc" }, take: 5, select: { id: true, subject: true, priority: true, dueDate: true, type: true } },
      callLogs: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true, direction: true, aiSummary: true, createdAt: true } },
      communicationEvents: { orderBy: { occurredAt: "desc" }, take: 1, select: { channel: true, eventType: true, summary: true, occurredAt: true } },
    },
    take: 500,
  })

  const queue = accounts.map(account => {
    const overdueTasks = account.tasks.filter(task => task.dueDate && task.dueDate <= now)
    const primary = account.contacts.find(contact => contact.isPrimary) || account.contacts[0]
    const phone = primary?.mobilePhone || primary?.phone || null
    let score = 0
    const reasons: string[] = []
    if (overdueTasks.length) { score += 45 + Math.min(overdueTasks.length * 5, 20); reasons.push(`${overdueTasks.length} overdue follow-up${overdueTasks.length === 1 ? "" : "s"}`) }
    if (account.nextActionDate && account.nextActionDate <= now) { score += 35; reasons.push("promised next action is due") }
    if (!account.lastCalledAt) { score += 15; reasons.push("no completed call recorded") }
    else {
      const daysSinceCall = Math.floor((now.getTime() - account.lastCalledAt.getTime()) / 86400000)
      if (daysSinceCall >= 30) { score += Math.min(daysSinceCall, 60); reasons.push(`${daysSinceCall} days since last call`) }
    }
    if (account.lastPurchaseAt && account.lastPurchaseAt <= dormantCutoff) { score += 25; reasons.push("customer may be due for reactivation") }
    if (!phone) { score -= 100; reasons.push("phone number needs review") }
    return {
      ...account,
      score,
      reasons,
      recommendedReason: reasons[0] || "relationship check-in",
      primaryContact: primary || null,
      phone,
    }
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 100)

  return NextResponse.json({ success: true, generatedAt: now, queue })
}
