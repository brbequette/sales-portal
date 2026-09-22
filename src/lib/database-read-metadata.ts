import 'server-only'

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

const DEFAULT_STALE_AFTER_MS = 6 * 60 * 60 * 1000

type FreshnessRow = {
  lastSuccessfulBoundedImport: Date | null
  activeRunStartedAt: Date | null
  activeRunHeartbeatAt: Date | null
  lastFailureAt: Date | null
  lastFailureReason: string | null
}

export type DatabaseFreshness = {
  source: 'POSTGRESQL'
  lastSuccessfulBoundedImport: string | null
  activeRun: { startedAt: string; heartbeatAt: string } | null
  lastFailure: { at: string; reason: string } | null
  stale: boolean
  reason: 'CURRENT' | 'NO_SUCCESSFUL_BOUNDED_IMPORT' | 'BOUNDED_IMPORT_STALE'
}

function sanitizeFailureReason(value: string | null): string {
  if (!value) return 'IMPORT_FAILED'
  const normalized = value.toUpperCase()
  if (normalized.includes('CANCEL')) return 'IMPORT_CANCELLED'
  if (normalized.includes('TIMEOUT')) return 'IMPORT_TIMEOUT'
  if (normalized.includes('AUTH')) return 'PROVIDER_AUTH_FAILURE'
  if (normalized.includes('RATE') || normalized.includes('429')) return 'PROVIDER_RATE_LIMIT'
  if (normalized.includes('SCHEMA') || normalized.includes('VALIDATION')) return 'LOCAL_SCHEMA_FAILURE'
  return 'IMPORT_FAILED'
}

/** One bounded PostgreSQL query shared by every user-facing read surface. */
export async function getDatabaseFreshness(now = new Date()): Promise<DatabaseFreshness> {
  const [row] = await prisma.$queryRaw<FreshnessRow[]>(Prisma.sql`
    SELECT
      (SELECT MAX("completedAt") FROM "BoundedBooksImportJob" WHERE status = 'COMPLETE') AS "lastSuccessfulBoundedImport",
      (SELECT "startedAt" FROM "BoundedBooksImportJob" WHERE status = 'RUNNING' ORDER BY "startedAt" DESC LIMIT 1) AS "activeRunStartedAt",
      (SELECT "heartbeatAt" FROM "BoundedBooksImportJob" WHERE status = 'RUNNING' ORDER BY "startedAt" DESC LIMIT 1) AS "activeRunHeartbeatAt",
      (SELECT COALESCE("completedAt", "startedAt") FROM "BoundedBooksImportJob" WHERE status IN ('FAILED', 'CANCELLED_PARTIAL') ORDER BY "startedAt" DESC LIMIT 1) AS "lastFailureAt",
      (SELECT COALESCE("errorCategory", "skipReason") FROM "BoundedBooksImportJob" WHERE status IN ('FAILED', 'CANCELLED_PARTIAL') ORDER BY "startedAt" DESC LIMIT 1) AS "lastFailureReason"
  `)
  const lastSuccess = row?.lastSuccessfulBoundedImport ?? null
  const stale = !lastSuccess || now.getTime() - lastSuccess.getTime() > DEFAULT_STALE_AFTER_MS
  return {
    source: 'POSTGRESQL',
    lastSuccessfulBoundedImport: lastSuccess?.toISOString() ?? null,
    activeRun: row?.activeRunStartedAt ? {
      startedAt: row.activeRunStartedAt.toISOString(),
      heartbeatAt: (row.activeRunHeartbeatAt ?? row.activeRunStartedAt).toISOString(),
    } : null,
    lastFailure: row?.lastFailureAt ? {
      at: row.lastFailureAt.toISOString(),
      reason: sanitizeFailureReason(row.lastFailureReason),
    } : null,
    stale,
    reason: !lastSuccess ? 'NO_SUCCESSFUL_BOUNDED_IMPORT' : stale ? 'BOUNDED_IMPORT_STALE' : 'CURRENT',
  }
}

export function databaseReadHeaders(startedAt: number, dbQueryCount: number | 'variable'): HeadersInit {
  return {
    'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
    'Server-Timing': `app;dur=${Math.max(0, performance.now() - startedAt).toFixed(1)}`,
    'X-Data-Source': 'POSTGRESQL',
    'X-DB-Query-Count': String(dbQueryCount),
    'X-Zoho-Calls': '0',
    'X-OAuth-Refreshes': '0',
  }
}

export const LOCAL_DATA_INCOMPLETE = 'LOCAL_DATA_INCOMPLETE' as const
