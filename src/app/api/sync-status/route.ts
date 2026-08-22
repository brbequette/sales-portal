import { NextResponse } from 'next/server'
import {
  getSyncConfig,
  getSyncStatus,
  isTableStale,
  ageMinutes,
  SYNC_TABLES,
} from '@/lib/sync-config'
import { requireAdministrator } from '@/lib/auth-helpers'

/**
 * GET /api/sync-status
 *
 * Returns per-table staleness data from the DB only.
 * Zero Zoho API calls. Used by the frontend to show
 * "last synced X min ago" badges and pulse the Sync Now button.
 */
export async function GET() {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse

  try {
    const [config, status] = await Promise.all([getSyncConfig(), getSyncStatus()])

    const result: Record<string, any> = {}

    for (const table of SYNC_TABLES) {
      const tStatus = status[table]
      const tConfig = config[table]
      const age = ageMinutes(tStatus.lastSyncAt)

      result[table] = {
        lastSyncAt: tStatus.lastSyncAt,
        ageMinutes: age,
        lastCount: tStatus.lastCount,
        lastError: tStatus.lastError,
        intervalMinutes: tConfig.intervalMinutes,
        enabled: tConfig.enabled,
        isStale: isTableStale(tStatus, tConfig),
        isManualOnly: !tConfig.enabled || tConfig.intervalMinutes === 0,
      }
    }

    return NextResponse.json({ success: true, tables: result })
  } catch (err: any) {
    console.error('sync-status error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
