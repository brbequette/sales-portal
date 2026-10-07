import { Prisma, type PrismaClient } from '@prisma/client'
import { TaskHubInputError } from './task-hub-data'

export async function readTaskOutcomeReport(db: Pick<PrismaClient, '$queryRaw'>, ownerId: string | null, params: Record<string, string | undefined>) {
  const start = new Date(params.start || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
  const end = new Date(params.end || new Date().toISOString())
  const offset = Number(params.offset || 0)
  const bucket = ['day', 'week', 'month'].includes(params.bucket || '') ? params.bucket! : 'day'
  const zone = params.zone || 'UTC'
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(start) } catch { throw new TaskHubInputError('Invalid timezone or reporting date') }
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || start >= end || +end - +start > 732 * 86400000 || !Number.isFinite(offset) || Math.abs(offset) > 900) throw new TaskHubInputError('Choose a valid reporting range of two years or less')
  const cte = Prisma.sql`WITH outcomes AS (
    SELECT o.*, t.subject, t."ownerId", t."dealId", COALESCE(o."accountId", t."accountId", d."accountId") AS "linkedAccountId",
      date_trunc(${bucket}, o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${zone})::date::text AS bucket
    FROM "TaskOutcome" o JOIN "Task" t ON t.id=o."taskId" LEFT JOIN "Deal" d ON d.id=t."dealId"
    WHERE o."createdAt">=${start} AND o."createdAt"<${end} AND ${ownerId ? Prisma.sql`t."ownerId"=${ownerId}` : Prisma.sql`TRUE`}
  ), linked AS (
    SELECT i.id, i.amount, i."paymentMade", i.balance, i."invoiceNumber", i."accountId", o.bucket, o."createdAt", o.id AS "outcomeId",
      COALESCE(NULLIF(i."rawData"->>'currency_code',''), 'Unknown currency') AS currency,
      row_number() OVER (PARTITION BY i.id ORDER BY o."createdAt", o.id) AS rank
    FROM outcomes o JOIN "Invoice" i ON i."accountId"=o."linkedAccountId" AND (
      (o."documentType"='INVOICE' AND (i.id=o."documentId" OR i."zohoId"=o."documentId")) OR
      (o."documentType"='SALES_ORDER' AND (i."salesOrderZohoId"=o."documentId" OR EXISTS (
        SELECT 1 FROM "SalesOrder" s WHERE s.id=o."documentId" AND s."accountId"=i."accountId" AND s."zohoId"=i."salesOrderZohoId"))) OR
      (o."documentType"='QUOTE' AND (i."estimateZohoId"=o."documentId" OR EXISTS (
        SELECT 1 FROM "Quote" q WHERE q.id=o."documentId" AND q."accountId"=i."accountId" AND q."zohoId"=i."estimateZohoId")))
    ) WHERE lower(i.status) NOT IN ('draft','void','voided','cancelled','canceled') AND NOT i."isWrittenOff"
  )`
  const [buckets, revenue, recent] = await Promise.all([
    db.$queryRaw<any[]>(Prisma.sql`${cte} SELECT bucket, COUNT(*)::int AS outcomes,
      COUNT(*) FILTER (WHERE position('task_completion_' in id)=1 OR "outcomeType"='COMPLETED')::int AS completed,
      COUNT(*) FILTER (WHERE "outcomeType"='WON')::int AS won, COUNT(*) FILTER (WHERE "outcomeType"='LOST')::int AS lost,
      COUNT(*) FILTER (WHERE "outcomeType"='NO_ANSWER')::int AS "noAnswer", COUNT(*) FILTER (WHERE "followUpAt" IS NOT NULL)::int AS "followUps"
      FROM outcomes GROUP BY bucket ORDER BY bucket DESC`),
    db.$queryRaw<any[]>(Prisma.sql`${cte} SELECT bucket, currency, COUNT(*)::int AS invoices, SUM(amount)::float AS invoiced,
      SUM(COALESCE("paymentMade",0))::float AS collected, SUM(COALESCE(balance,0))::float AS outstanding,
      COUNT(*) FILTER (WHERE "paymentMade" IS NULL OR balance IS NULL)::int AS "missingPaymentSummary"
      FROM linked WHERE rank=1 GROUP BY bucket,currency ORDER BY bucket DESC,currency`),
    db.$queryRaw<any[]>(Prisma.sql`${cte} SELECT o.id, o."taskId", o.subject, o."outcomeType", o.summary, o."nextAction", o."followUpAt", o."actorName", o."createdAt",
      o."linkedAccountId" AS "accountId", a.name AS "accountName", o."documentType", o."documentId"
      FROM outcomes o LEFT JOIN "Account" a ON a.id=o."linkedAccountId" ORDER BY o."createdAt" DESC,o.id DESC LIMIT 50`),
  ])
  return { success: true, buckets, revenue, recent, bucket, start, end, scope: ownerId ? 'My tasks' : 'Team tasks', generatedAt: new Date() }
}
