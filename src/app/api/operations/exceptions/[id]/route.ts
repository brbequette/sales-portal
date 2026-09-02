import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const { id } = await context.params
  const body = await request.json()
  if (!body.resolvedEntityId && body.action !== "dismiss") return NextResponse.json({ error: "A reviewed local entity is required" }, { status: 400 })
  const actor = auth.session?.user?.dbId || auth.session?.user?.id || auth.session?.user?.email
  const existing = await prisma.integrationException.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Exception not found" }, { status: 404 })
  if (existing.status !== "OPEN") return NextResponse.json({ error: "Exception has already been reviewed" }, { status: 409 })
  const nextStatus = body.action === "dismiss" ? "DISMISSED" : "RESOLVED"
  const exception = await prisma.$transaction(async tx => {
    const row = await tx.integrationException.update({ where: { id }, data: { status: nextStatus, resolvedEntityId: body.resolvedEntityId || null, resolvedBy: actor, resolvedAt: new Date() } })
    await tx.operationalEvent.create({ data: { entityType: row.entityType, entityId: row.resolvedEntityId || row.externalId, entityNumber: row.externalNumber, eventType: nextStatus === "RESOLVED" ? "INTEGRATION_EXCEPTION_RESOLVED" : "INTEGRATION_EXCEPTION_DISMISSED", title: `${row.exceptionType} ${nextStatus.toLowerCase()}`, detail: row.summary, status: nextStatus === "RESOLVED" ? "SUCCESS" : "INFO", actorId: actor, actorName: auth.session?.user?.name || auth.session?.user?.email, metadata: { exceptionId: row.id, integration: row.integration, externalId: row.externalId, resolvedEntityId: row.resolvedEntityId } } })
    return row
  })
  return NextResponse.json({ success: true, exception, message: "Review decision recorded. The next sync will apply the approved immutable link." })
}
