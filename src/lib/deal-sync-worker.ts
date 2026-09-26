import { prisma } from './prisma'
import { getDealSyncConfig, crmMetadata, validateDealSyncConfig, syncDealToCrm } from './deal-crm-sync'
import { reconcileInvoiceDeal } from './deal-reconciliation'

export async function runDealSyncBatch(limit = 5) {
  const config = await getDealSyncConfig()
  if (!config?.enabled) return { enabled: false, results: [] }
  validateDealSyncConfig(config, await crmMetadata())
  await prisma.$executeRaw`INSERT INTO "DealSyncJob" ("invoiceId") SELECT id FROM "Invoice" ON CONFLICT DO NOTHING`
  const results: { invoiceId: string; dealId?: string; status: string; error?: string }[] = []
  const started = Date.now()
  for (let index = 0; index < Math.min(20, Math.max(1, limit)) && Date.now() - started < 40000; index++) {
    const rows = await prisma.$queryRaw<{ invoiceId: string; revision: string; lease: string }[]>`
      UPDATE "DealSyncJob" SET "leaseUntil" = clock_timestamp() + interval '5 minutes', "attempts" = "attempts" + 1
      WHERE "invoiceId" = (SELECT j."invoiceId" FROM "DealSyncJob" j
        WHERE ("leaseUntil" IS NULL OR "leaseUntil" < clock_timestamp()) AND "nextAttemptAt" <= clock_timestamp()
        AND ("checkedAt" IS NULL OR "changedAt" > "checkedAt" OR "checkedAt" < clock_timestamp() - interval '1 day')
        ORDER BY CASE WHEN ${index === 1} AND j."lastError" IS NULL
          AND (j."checkedAt" IS NULL OR j."changedAt" > j."checkedAt")
          AND EXISTS (SELECT 1 FROM "Invoice" i JOIN "Deal" d ON d.id = i."dealId"
            WHERE i.id = j."invoiceId" AND d."rawData"->'_portalSync'->>'state' = 'SYNCED')
          THEN 0 ELSE 1 END,
          j."nextAttemptAt", j."changedAt" FOR UPDATE OF j SKIP LOCKED LIMIT 1)
      RETURNING "invoiceId", "changedAt"::text AS revision, "leaseUntil"::text AS lease`
    if (!rows[0]) break
    const job = rows[0]
    try {
      const dealId = await reconcileInvoiceDeal(job.invoiceId)
      await syncDealToCrm(dealId, config)
      await prisma.$executeRaw`UPDATE "DealSyncJob" SET "checkedAt" = CASE WHEN "changedAt" = ${job.revision}::timestamptz THEN clock_timestamp() ELSE "checkedAt" END, "leaseUntil" = NULL, "lastError" = NULL, "nextAttemptAt" = clock_timestamp() WHERE "invoiceId" = ${job.invoiceId} AND "leaseUntil" = ${job.lease}::timestamptz`
      results.push({ invoiceId: job.invoiceId, dealId, status: 'SYNCED' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'DEAL_SYNC_FAILED'
      await prisma.$executeRaw`UPDATE "DealSyncJob" SET "leaseUntil" = NULL, "lastError" = ${message}, "nextAttemptAt" = clock_timestamp() + interval '1 hour' WHERE "invoiceId" = ${job.invoiceId} AND "leaseUntil" = ${job.lease}::timestamptz`
      results.push({ invoiceId: job.invoiceId, status: 'REVIEW_REQUIRED', error: message })
    }
  }
  return { enabled: true, results }
}
