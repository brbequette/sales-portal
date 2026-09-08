import { createHash, randomUUID } from "crypto"
import { prisma } from "@/lib/prisma"

export type OperationalActor = { id?: string | null; name?: string | null }

export function operationKey(parts: Array<string | number | null | undefined>) {
  return createHash("sha256").update(parts.map(value => String(value ?? "")).join("|")).digest("hex")
}

export function requestOperationKey(request: Request, fallback: Array<string | number | null | undefined>) {
  return request.headers.get("idempotency-key")?.trim() || operationKey([...fallback, randomUUID()])
}

export async function runOperationalAction<T>(input: {
  idempotencyKey: string
  actionType: string
  entityType: string
  entityId: string
  entityNumber?: string | null
  accountId?: string | null
  payload?: unknown
  actor?: OperationalActor
  execute: () => Promise<T>
  successTitle?: string
}): Promise<{ replayed: boolean; actionId: string; result: T }> {
  const existing = await prisma.operationalAction.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
  if (existing?.status === "SUCCEEDED") {
    return { replayed: true, actionId: existing.id, result: existing.result as T }
  }
  if (existing?.status === "RUNNING") throw new Error("This operation is already in progress")

  const action = await prisma.operationalAction.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: {
      idempotencyKey: input.idempotencyKey, actionType: input.actionType, entityType: input.entityType,
      entityId: input.entityId, entityNumber: input.entityNumber, accountId: input.accountId,
      payload: input.payload as any, status: "RUNNING", attemptCount: 1, startedAt: new Date(),
      actorId: input.actor?.id, actorName: input.actor?.name,
    },
    update: {
      status: "RUNNING", errorCode: null, errorMessage: null, startedAt: new Date(),
      attemptCount: { increment: 1 }, nextAttemptAt: null,
    },
  })

  try {
    const result = await input.execute()
    await prisma.$transaction([
      prisma.operationalAction.update({ where: { id: action.id }, data: { status: "SUCCEEDED", result: result as any, completedAt: new Date() } }),
      prisma.operationalEvent.create({ data: {
        entityType: input.entityType, entityId: input.entityId, entityNumber: input.entityNumber,
        accountId: input.accountId, eventType: input.actionType, title: input.successTitle || `${input.actionType} completed`,
        source: "PORTAL", status: "SUCCESS", metadata: { actionId: action.id }, actorId: input.actor?.id, actorName: input.actor?.name,
      } }),
    ])
    return { replayed: false, actionId: action.id, result }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown operational error"
    const attempts = action.attemptCount
    const terminal = attempts >= action.maxAttempts
    const delayMinutes = Math.min(60, 2 ** Math.max(0, attempts - 1))
    await prisma.operationalAction.update({ where: { id: action.id }, data: {
      status: terminal ? "DEAD_LETTER" : "FAILED", errorMessage: message,
      nextAttemptAt: terminal ? null : new Date(Date.now() + delayMinutes * 60_000), completedAt: new Date(),
    } })
    await prisma.operationalEvent.create({ data: {
      entityType: input.entityType, entityId: input.entityId, entityNumber: input.entityNumber,
      accountId: input.accountId, eventType: `${input.actionType}_FAILED`, title: `${input.actionType} needs attention`,
      detail: message, source: "PORTAL", status: terminal ? "CRITICAL" : "WARNING", metadata: { actionId: action.id },
      actorId: input.actor?.id, actorName: input.actor?.name,
    } })
    throw error
  }
}

export async function updateSyncState(input: {
  entityType: string; kind: "pull" | "webhook" | "write" | "success" | "failure"; error?: string
  cursor?: string; processedCount?: number; durationMs?: number
}) {
  const now = new Date()
  const data: Record<string, unknown> = {}
  if (input.kind === "pull") data.lastPullAt = now
  if (input.kind === "webhook") data.lastWebhookAt = now
  if (input.kind === "write") data.lastWriteAt = now
  if (input.kind === "success") { data.lastSuccessAt = now; data.lastError = null }
  if (input.kind === "failure") { data.lastFailureAt = now; data.lastError = input.error || "Unknown failure" }
  if (input.cursor) data.cursor = input.cursor
  if (input.processedCount != null) data.lastProcessedCount = input.processedCount
  if (input.durationMs != null) data.lastDurationMs = input.durationMs
  return prisma.integrationSyncState.upsert({
    where: { integration_entityType: { integration: "ZOHO_BOOKS", entityType: input.entityType } },
    create: { integration: "ZOHO_BOOKS", entityType: input.entityType, ...data }, update: data,
  })
}
