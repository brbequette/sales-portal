import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"

export async function PUT(request: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const body = await request.json()
  if (!body.entityType || !body.entityId || !body.stage || !body.nextAction) return NextResponse.json({ error: "entityType, entityId, stage and nextAction are required" }, { status: 400 })
  const priority = Number(body.priority ?? 50)
  const dueAt = body.dueAt ? new Date(body.dueAt) : null
  if (!Number.isFinite(priority) || priority < 0 || priority > 100) return NextResponse.json({ error: "Priority must be between 0 and 100" }, { status: 400 })
  if (dueAt && Number.isNaN(dueAt.getTime())) return NextResponse.json({ error: "Invalid due date" }, { status: 400 })
  const status = body.status === "COMPLETED" ? "COMPLETED" : "OPEN"
  const actorId = auth.session?.user?.dbId || auth.session?.user?.id
  const actorName = auth.session?.user?.name || auth.session?.user?.email
  const assignment = await prisma.$transaction(async tx => {
    const row = await tx.workAssignment.upsert({
      where: { entityType_entityId: { entityType: String(body.entityType), entityId: String(body.entityId) } },
      create: { entityType: String(body.entityType), entityId: String(body.entityId), entityNumber: body.entityNumber, accountId: body.accountId, stage: String(body.stage), nextAction: String(body.nextAction).trim(), priority, ownerId: body.ownerId, ownerName: body.ownerName, escalationId: body.escalationId, dueAt, blockedReason: body.blockedReason, status, completedAt: status === "COMPLETED" ? new Date() : null },
      update: { stage: String(body.stage), nextAction: String(body.nextAction).trim(), priority, ownerId: body.ownerId, ownerName: body.ownerName, escalationId: body.escalationId, dueAt, blockedReason: body.blockedReason, status, completedAt: status === "COMPLETED" ? new Date() : null },
    })
    await tx.operationalEvent.create({ data: { entityType: row.entityType, entityId: row.entityId, entityNumber: row.entityNumber, accountId: row.accountId, eventType: status === "COMPLETED" ? "WORK_COMPLETED" : "WORK_ASSIGNED", title: status === "COMPLETED" ? `Completed: ${row.nextAction}` : `Assigned: ${row.nextAction}`, status: status === "COMPLETED" ? "SUCCESS" : row.blockedReason ? "WARNING" : "INFO", actorId, actorName, metadata: { assignmentId: row.id, stage: row.stage, ownerId: row.ownerId, ownerName: row.ownerName, dueAt: row.dueAt, priority: row.priority, blockedReason: row.blockedReason } } })
    return row
  })
  return NextResponse.json({ success: true, assignment })
}
