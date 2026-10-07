import { Prisma, type PrismaClient } from '@prisma/client'

type Reader = Pick<PrismaClient, '$queryRaw'>
export class TaskHubInputError extends Error {}
export function taskHubClock(params: Record<string, string | undefined>, now = new Date()) {
  const day = params.day || now.toISOString().slice(0, 10)
  const offset = Number(params.offset || 0)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || !Number.isFinite(offset) || Math.abs(offset) > 900) throw new TaskHubInputError('Invalid calendar date or timezone')
  const midnight = new Date(`${day}T00:00:00Z`)
  const zone = params.zone || 'UTC'
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(now) } catch { throw new TaskHubInputError('Invalid timezone') }
  const start = params.dayStart ? new Date(params.dayStart) : new Date(+midnight + offset * 60000)
  const end = params.dayEnd ? new Date(params.dayEnd) : new Date(+midnight + (offset + 1440) * 60000)
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || +end <= +start || +end - +start > 26*3600000) throw new TaskHubInputError('Invalid day boundaries')
  return { now, midnight, start, end, offset, zone }
}

export function taskHubCte(ownerId: string | null, params: Record<string, string | undefined>, now = new Date()) {
  const clock = taskHubClock(params, now)
  return Prisma.sql`WITH scoped AS (
    SELECT t.*, a.name AS "accountName", a."zohoId" AS "accountZohoId", a."rawData"->>'Phone' AS "accountPhone",
      d.name AS "dealName", d."zohoId" AS "dealZohoId", u.name AS "ownerName",
      CASE WHEN t.type IS NULL OR t.type = 'Task' THEN CASE
        WHEN t.subject ILIKE '%call%' THEN 'Call' WHEN t.subject ILIKE '%email%' THEN 'Email'
        WHEN t.subject ILIKE '%text%' OR t.subject ILIKE '%sms%' THEN 'Text'
        WHEN t.subject ILIKE '%process%' THEN 'Processing' ELSE 'Task' END ELSE t.type END AS "effectiveType",
      t.status NOT IN ('Completed', 'Cancelled') AS "isOpen",
      CASE WHEN t."dueDate"::time = '00:00:00' THEN t."dueDate" AT TIME ZONE ${clock.zone} AT TIME ZONE 'UTC' ELSE t."dueDate" END AS "calendarDue"
    FROM "Task" t LEFT JOIN "Account" a ON a.id=t."accountId" LEFT JOIN "Deal" d ON d.id=t."dealId"
    LEFT JOIN "User" u ON u.id=t."ownerId"
    WHERE ${ownerId ? Prisma.sql`t."ownerId"=${ownerId}` : Prisma.sql`TRUE`}
  ), classified AS (
    SELECT *, CASE WHEN "effectiveType" IN ('Call','Email','Text') THEN 'communication'
      WHEN "effectiveType" IN ('Processing','Fulfillment','Integration') THEN 'process'
      WHEN "accountId" IS NOT NULL OR "dealId" IS NOT NULL THEN 'sales' ELSE 'process' END AS category,
      "isOpen" AND "calendarDue" < ${clock.end} AND "calendarDue" >= ${clock.start} AS "isToday",
      "isOpen" AND "dueDate" < ${clock.now} AND ("dueDate"::time <> '00:00:00' OR "dueDate" < ${clock.midnight}) AS "isOverdue"
    FROM scoped
  ), flagged AS (
    SELECT *, CASE WHEN "isOpen" AND COALESCE("accountId", "dealId", "leadId") IS NOT NULL THEN
      (COUNT(*) FILTER (WHERE "isOpen") OVER (PARTITION BY "ownerId", COALESCE("accountId", "dealId", "leadId", id), "effectiveType",
        regexp_replace(lower(trim(subject)), '[[:space:]]+', ' ', 'g'), "dueDate"::date))::int ELSE 1 END AS "duplicateCount"
    FROM classified
  )`
}

export async function readTaskHub(db: Reader, ownerId: string | null, params: Record<string, string | undefined>) {
  const page = Math.max(1, Math.min(1000000, Math.trunc(Number(params.page) || 1)))
  const pageSize = Math.max(1, Math.min(100, Math.trunc(Number(params.pageSize) || 50)))
  const cte = taskHubCte(ownerId, params)
  const clauses: Prisma.Sql[] = []
  const status = params.status || 'open'
  if (status === 'open') clauses.push(Prisma.sql`"isOpen"`)
  if (status === 'completed') clauses.push(Prisma.sql`status='Completed'`)
  if (status === 'overdue' || params.queue === 'overdue') clauses.push(Prisma.sql`"isOverdue"`)
  if (params.queue === 'today') clauses.push(Prisma.sql`"isToday"`)
  if (params.queue === 'waiting') clauses.push(Prisma.sql`"isOpen" AND status='Waiting on someone else'`)
  if (params.queue === 'duplicates') clauses.push(Prisma.sql`"isOpen" AND "duplicateCount">1`)
  if (params.type && params.type !== 'all') clauses.push(Prisma.sql`"effectiveType"=${params.type}`)
  if (params.priority && params.priority !== 'all') clauses.push(Prisma.sql`lower(priority)=lower(${params.priority})`)
  if (params.accountId) clauses.push(Prisma.sql`"accountId"=${params.accountId}`)
  if (params.search?.trim()) {
    const q = `%${params.search.trim().replace(/[\\%_]/g, '\\$&')}%`
    clauses.push(Prisma.sql`(subject ILIKE ${q} OR description ILIKE ${q} OR "accountName" ILIKE ${q} OR "dealName" ILIKE ${q} OR "ownerName" ILIKE ${q})`)
  }
  for (const key of ['start', 'end'] as const) if (params[key]) {
    const value = new Date(params[key]!)
    if (!Number.isFinite(+value)) throw new TaskHubInputError('Invalid due-date range')
    clauses.push(key === 'start' ? Prisma.sql`"calendarDue">=${value}` : Prisma.sql`"calendarDue"<${value}`)
  }
  const base = clauses.length ? Prisma.join(clauses, ' AND ') : Prisma.sql`TRUE`
  const category = params.category && params.category !== 'all' ? Prisma.sql`AND category=${params.category}` : Prisma.empty
  const order = params.sort === 'priority' ? Prisma.sql`CASE lower(priority) WHEN 'high' THEN 0 WHEN 'low' THEN 2 ELSE 1 END, "dueDate" ASC NULLS LAST, id`
    : params.sort === 'status' ? Prisma.sql`status, "dueDate" ASC NULLS LAST, id` : Prisma.sql`"dueDate" ASC NULLS LAST, id`
  const [rows, categories, queueRows] = await Promise.all([
    db.$queryRaw<any[]>(Prisma.sql`${cte} SELECT * FROM flagged WHERE ${base} ${category} ORDER BY ${order} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
    db.$queryRaw<Array<{ category: string; count: number }>>(Prisma.sql`${cte} SELECT category, COUNT(*)::int AS count FROM flagged WHERE ${base} GROUP BY category`),
    db.$queryRaw<any[]>(Prisma.sql`${cte} SELECT COUNT(*) FILTER (WHERE "isOpen")::int AS open,
      COUNT(*) FILTER (WHERE "isToday")::int AS today, COUNT(*) FILTER (WHERE "isOverdue")::int AS overdue,
      COUNT(*) FILTER (WHERE "isOpen" AND status='Waiting on someone else')::int AS waiting,
      COUNT(*) FILTER (WHERE "isOpen" AND "duplicateCount">1)::int AS duplicates FROM flagged`),
  ])
  const categoryCounts: Record<string, number> = { all: 0, communication: 0, sales: 0, process: 0 }
  for (const row of categories) { categoryCounts[row.category] = row.count; categoryCounts.all += row.count }
  const total = categoryCounts[params.category || 'all'] || 0
  return { success: true, tasks: rows.map(t => ({ ...t, title: t.subject, type: t.effectiveType,
    priority: String(t.priority).toLowerCase() === 'high' ? 'High' : String(t.priority).toLowerCase() === 'low' ? 'Low' : 'Normal',
    accountDbId: t.accountId, accountId: t.accountZohoId, dealDbId: t.dealId, dealId: t.dealZohoId,
    actionUrl: t.accountId ? `/account?id=${encodeURIComponent(t.accountId)}` : '#',
  })), pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) }, categoryCounts, queues: queueRows[0] }
}
