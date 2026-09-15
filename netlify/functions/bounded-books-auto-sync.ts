import { schedule } from '@netlify/functions'
import { prisma } from '../../src/lib/prisma'
import { boundedBooksDateRange, collectBoundedBooks, redactedCounts, type ReadTransport } from '../../src/lib/bounded-books-import'
import { getZohoAccessToken, ZOHO_DC, ZOHO_ORGANIZATION_ID } from '../../src/lib/zoho-auth'

const AUTO_KEY = 'BOUNDED_BOOKS_AUTO_SYNC_ENABLED'
const LOCK_TIMEOUT_MS = 45 * 60 * 1000

function transport(): ReadTransport {
  return { async get(path, query) {
    const token = await getZohoAccessToken()
    const params = new URLSearchParams({ organization_id: ZOHO_ORGANIZATION_ID, ...Object.fromEntries(Object.entries(query).map(([key, value]) => [key, String(value)])) })
    const response = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/${path}?${params}`, { headers: { Authorization: `Zoho-oauthtoken ${token}` } })
    return { status: response.status, json: () => response.json() as Promise<Record<string, unknown>> }
  } }
}

export function isAutoSyncEnabled(env: Record<string, string | undefined> = process.env) { return env[AUTO_KEY] === '1' }

export async function runBoundedBooksAutoSync(now = new Date()) {
  if (!isAutoSyncEnabled()) {
    console.log('BOUNDED_BOOKS_AUTO_SYNC_SKIPPED reason=DISABLED durationMs=0')
    return { status: 'SKIPPED', range: null, zohoCalls: 0, databaseWrites: 0 }
  }
  const range = boundedBooksDateRange(now)
  const nowMs = Date.now()
  const existing = await prisma.boundedBooksImportLock.findUnique({ where: { key: 'bounded-books-auto-sync' } })
  if (existing && existing.expiresAt.getTime() > nowMs) {
    console.log(`BOUNDED_BOOKS_AUTO_SYNC_SKIPPED range=${range.startDate}:${range.endDate} reason=ACTIVE_LOCK durationMs=0`)
    return { status: 'SKIPPED', range, zohoCalls: 0, databaseWrites: 0 }
  }
  await prisma.boundedBooksImportLock.upsert({ where: { key: 'bounded-books-auto-sync' }, update: { claimedAt: new Date(nowMs), expiresAt: new Date(nowMs + LOCK_TIMEOUT_MS) }, create: { key: 'bounded-books-auto-sync', expiresAt: new Date(nowMs + LOCK_TIMEOUT_MS) } })
  const run = await prisma.boundedBooksImportJob.create({ data: { actorId: 'scheduled', triggerType: 'SCHEDULED', enabled: true, startDate: range.startDate, endDate: range.endDate, status: 'RUNNING', stage: 'READ' } })
  try {
    const collection = await collectBoundedBooks(transport(), range)
    const durationMs = Date.now() - nowMs
    await prisma.boundedBooksImportJob.update({ where: { id: run.id }, data: { status: 'COMPLETE', stage: 'COMPLETE', completedAt: new Date(), heartbeatAt: new Date(), durationMs, importedCounts: collection.counts, pageCounts: collection.pages, total: Object.values(collection.counts).reduce((sum, value) => sum + value, 0), processed: Object.values(collection.counts).reduce((sum, value) => sum + value, 0), succeeded: Object.values(collection.counts).reduce((sum, value) => sum + value, 0) } })
    console.log(`BOUNDED_BOOKS_AUTO_SYNC_COMPLETE runId=${run.id} range=${range.startDate}:${range.endDate} durationMs=${durationMs} counts=${JSON.stringify(redactedCounts(collection))}`)
    return { status: 'COMPLETE', range, counts: redactedCounts(collection), zohoCalls: Object.values(collection.pages).reduce((total, pages) => total + pages, 0), databaseWrites: 1 }
  } catch (error) {
    const reason = error instanceof Error ? error.message.replace(/[^A-Z0-9_]/g, '').slice(0, 64) || 'IMPORT_FAILED' : 'IMPORT_FAILED'
    await prisma.boundedBooksImportJob.update({ where: { id: run.id }, data: { status: 'FAILED', stage: 'FAILED', errorCategory: reason, completedAt: new Date(), durationMs: Date.now() - nowMs } }).catch(() => undefined)
    console.log(`BOUNDED_BOOKS_AUTO_SYNC_FAILED runId=${run.id} range=${range.startDate}:${range.endDate} reason=${reason} durationMs=${Date.now() - nowMs}`)
    throw error
  } finally {
    await prisma.boundedBooksImportLock.delete({ where: { key: 'bounded-books-auto-sync' } }).catch(() => undefined)
  }
}

export const handler = schedule('*/15 * * * *', async () => {
  const result = await runBoundedBooksAutoSync()
  return { statusCode: 200, body: JSON.stringify({ status: result.status, range: result.range, counts: 'counts' in result ? result.counts : undefined }) }
})
