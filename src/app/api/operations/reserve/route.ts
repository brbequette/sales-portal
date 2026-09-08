import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"

export async function POST(request: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const body = await request.json()
  const key = String(body.idempotencyKey || "").trim()
  if (!key || !body.actionType || !body.entityId) return NextResponse.json({ error: "Operation key, action and entity are required" }, { status: 400 })
  const existing = await prisma.operationalAction.findUnique({ where: { idempotencyKey: key } })
  if (existing?.status === "SUCCEEDED") return NextResponse.json({ proceed: false, replayed: true, receipt: existing.result, actionId: existing.id })
  if (existing?.status === "RUNNING" && existing.startedAt && Date.now() - existing.startedAt.getTime() < 5 * 60_000) return NextResponse.json({ proceed: false, inProgress: true, actionId: existing.id, message: "This operation is already running" }, { status: 409 })
  const actorId = auth.session?.user?.dbId || auth.session?.user?.id
  const action = await prisma.operationalAction.upsert({ where: { idempotencyKey: key }, create: {
    idempotencyKey: key, actionType: String(body.actionType), entityType: String(body.entityType || "DOCUMENT"), entityId: String(body.entityId),
    entityNumber: body.entityNumber, accountId: body.accountId, payload: body.payload, status: "RUNNING", attemptCount: 1,
    startedAt: new Date(), actorId, actorName: auth.session?.user?.name || auth.session?.user?.email,
  }, update: { status: "RUNNING", startedAt: new Date(), completedAt: null, nextAttemptAt: null, errorMessage: null, attemptCount: { increment: 1 } } })
  return NextResponse.json({ proceed: true, actionId: action.id })
}

export async function PATCH(request: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const body = await request.json()
  const action = await prisma.operationalAction.findUnique({ where: { id: String(body.actionId || "") } })
  if (!action) return NextResponse.json({ error: "Operation not found" }, { status: 404 })
  const success = body.success === true
  const attempt = action.attemptCount
  const terminal = !success && attempt >= action.maxAttempts
  const receipt = success ? {
    actionId: action.id, documentNumber: action.entityNumber, action: action.actionType,
    status: "CONFIRMED", confirmedAt: new Date().toISOString(), message: body.message || `${action.entityNumber || action.entityType}: ${action.actionType} confirmed`,
  } : null
  const actionUpdate = success
    ? { status: "SUCCEEDED", result: receipt as any, completedAt: new Date() }
    : { status: terminal ? "DEAD_LETTER" : "FAILED", errorMessage: String(body.error || "Operation failed"), completedAt: new Date(), nextAttemptAt: terminal ? null : new Date(Date.now() + Math.min(60, 2 ** attempt) * 60_000) }
  await prisma.$transaction([
    prisma.operationalAction.update({ where: { id: action.id }, data: actionUpdate }),
    prisma.operationalEvent.create({ data: { entityType: action.entityType, entityId: action.entityId, entityNumber: action.entityNumber, accountId: action.accountId, eventType: success ? action.actionType : `${action.actionType}_FAILED`, title: success ? receipt!.message : `${action.actionType} needs attention`, detail: success ? undefined : String(body.error || "Operation failed"), status: success ? "SUCCESS" : terminal ? "CRITICAL" : "WARNING", actorId: action.actorId, actorName: action.actorName, metadata: { actionId: action.id } } }),
  ])
  return NextResponse.json({ success: true, receipt, status: success ? "SUCCEEDED" : terminal ? "DEAD_LETTER" : "FAILED" })
}
