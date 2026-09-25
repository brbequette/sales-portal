import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

// Every provider call writer must acquire this transaction-scoped lock before
// reading the manual association. READ COMMITTED sees an association committed
// while waiting; an earlier application-level preflight is not sufficient.
export async function withVoiceCallLock<T>(sourceId: string, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  if (!sourceId || sourceId.length > 250) throw new Error("Invalid voice source ID")
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`voice-call:${sourceId}`}, 0))`
    return work(tx)
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 15000 })
}

export async function hasConfirmedVoiceAssociation(tx: Prisma.TransactionClient, sourceId: string) {
  const action = await tx.operationalAction.findUnique({
    where: { idempotencyKey: `voice-manual-association:${sourceId}` }, select: { status: true },
  })
  return action?.status === "SUCCEEDED"
}
