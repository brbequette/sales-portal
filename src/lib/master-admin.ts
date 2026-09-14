import crypto from "node:crypto"
import { prisma } from "./prisma"
import { isMasterAdminRole } from "./roles"

const MAX_DELEGATION_MS = 60 * 60 * 1000

function hashReference(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex")
}

export async function startDelegatedSession(input: {
  actorUserId: string
  subjectUserId: string
  reason: string
  sessionId?: string
  durationMs?: number
}) {
  const actor = await prisma.user.findUnique({ where: { id: input.actorUserId }, select: { id: true, role: true } })
  const subject = await prisma.user.findUnique({ where: { id: input.subjectUserId }, select: { id: true } })
  if (!actor || !isMasterAdminRole(actor.role) || !subject || actor.id === subject.id) throw new Error("DELEGATION_NOT_AUTHORIZED")
  const reason = input.reason.trim()
  if (!reason) throw new Error("DELEGATION_REASON_REQUIRED")
  const durationMs = Math.min(Math.max(input.durationMs || 15 * 60 * 1000, 60_000), MAX_DELEGATION_MS)
  const row = await prisma.delegatedSession.create({ data: {
    actorUserId: actor.id, subjectUserId: subject.id, reason,
    expiresAt: new Date(Date.now() + durationMs), sessionId: input.sessionId,
  } })
  await prisma.authAuditEvent.create({ data: {
    eventType: "DELEGATED_SESSION_STARTED", actorUserId: actor.id, subjectUserId: subject.id,
    reasonCode: "USER_DELEGATION", entityIdHash: hashReference(row.id), sessionId: input.sessionId,
  } })
  return { id: row.id, actorUserId: row.actorUserId, subjectUserId: row.subjectUserId, expiresAt: row.expiresAt }
}

export async function stopDelegatedSession(id: string, actorUserId: string) {
  const row = await prisma.delegatedSession.findUnique({ where: { id } })
  if (!row || row.actorUserId !== actorUserId || row.revokedAt) throw new Error("DELEGATION_NOT_FOUND")
  await prisma.delegatedSession.update({ where: { id }, data: { revokedAt: new Date() } })
  await prisma.authAuditEvent.create({ data: {
    eventType: "DELEGATED_SESSION_STOPPED", actorUserId, subjectUserId: row.subjectUserId,
    reasonCode: "USER_DELEGATION", entityIdHash: hashReference(id), sessionId: row.sessionId,
  } })
}

export async function getActiveDelegatedSession(id: string, actorUserId: string) {
  const row = await prisma.delegatedSession.findUnique({ where: { id } })
  if (!row || row.actorUserId !== actorUserId || row.revokedAt || row.expiresAt <= new Date()) return null
  return row
}
