import { createHash } from "node:crypto"
import { prisma } from "./prisma"

export async function getActiveSyncJob(jobId: string) {
  return prisma.syncJob.findUnique({ where: { id: jobId } })
}

export function isSyncJobCancelled(job: { cancelRequestedAt: Date | null; status: string }) {
  return Boolean(job.cancelRequestedAt) || job.status === "CANCELLED_PARTIAL" || job.status === "CANCELLED"
}

export function documentRefHash(documentType: string, documentId: string) {
  return createHash("sha256").update(`${documentType}:${documentId}`).digest("hex")
}

export async function assertSyncJobWritable(jobId?: string) {
  if (!jobId) return null
  const job = await getActiveSyncJob(jobId)
  if (!job) throw new Error("SYNC_JOB_NOT_FOUND")
  if (isSyncJobCancelled(job)) throw new Error("SYNC_CANCELLED_BEFORE_WRITE")
  return job
}

export async function recordSyncWriteAttempt(input: { jobId?: string; documentType: string; documentId: string; status: string; beforeHash?: string; afterHash?: string; errorCategory?: string }) {
  if (!input.jobId) return
  await prisma.syncJobWriteAudit.upsert({
    where: { jobId_documentType_documentRefHash: { jobId: input.jobId, documentType: input.documentType, documentRefHash: documentRefHash(input.documentType, input.documentId) } },
    update: { status: input.status, beforeHash: input.beforeHash, afterHash: input.afterHash, errorCategory: input.errorCategory },
    create: { jobId: input.jobId, documentType: input.documentType, documentRefHash: documentRefHash(input.documentType, input.documentId), status: input.status, beforeHash: input.beforeHash, afterHash: input.afterHash, errorCategory: input.errorCategory },
  })
}
