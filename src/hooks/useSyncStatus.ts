'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

export type SyncTable = 'leads' | 'invoices' | 'salesOrders' | 'accounts'

export interface TableSyncState {
  lastSyncAt: string | null
  ageMinutes: number | null
  lastCount: number
  lastError: string | null
  intervalMinutes: number
  enabled: boolean
  isStale: boolean
  isManualOnly: boolean
}

export interface SyncStatusState {
  tables: Record<SyncTable, TableSyncState>
  isSyncing: boolean
  lastRefreshed: Date | null
  error: string | null
}

const POLL_INTERVAL_MS = 5 * 60 * 1000 // re-check staleness every 5 min (DB only, no Zoho)

const DEFAULT_TABLE: TableSyncState = {
  lastSyncAt: null,
  ageMinutes: null,
  lastCount: 0,
  lastError: null,
  intervalMinutes: 0,
  enabled: false,
  isStale: false,
  isManualOnly: true,
}

export function useSyncStatus() {
  const [state, setState] = useState<SyncStatusState>({
    tables: {
      leads: DEFAULT_TABLE,
      invoices: DEFAULT_TABLE,
      salesOrders: DEFAULT_TABLE,
      accounts: DEFAULT_TABLE,
    },
    isSyncing: false,
    lastRefreshed: null,
    error: null,
  })

  const isSyncingRef = useRef(false)

  /** Fetch staleness data from DB (zero Zoho calls) */
  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/sync-status')
      if (!res.ok) return
      const data = await res.json()
      if (data.success) {
        setState(prev => ({
          ...prev,
          tables: data.tables,
          lastRefreshed: new Date(),
          error: null,
        }))
      }
    } catch {
      // silently fail — don't bother the user with a status-check error
    }
  }, [])

  /** Trigger an actual Zoho sync for specified tables */
  const syncNow = useCallback(async (
    tables?: SyncTable[],
    force = false
  ): Promise<Record<string, any>> => {
    if (isSyncingRef.current) return {}
    isSyncingRef.current = true
    setState(prev => ({ ...prev, isSyncing: true, error: null }))
    try {
      const res = await fetch('/api/sync-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tables, force }),
      })
      const data = await res.json()
      // Re-fetch status after sync so UI reflects new timestamps
      await refreshStatus()
      return data.results || {}
    } catch (err: any) {
      setState(prev => ({ ...prev, error: err.message }))
      return {}
    } finally {
      isSyncingRef.current = false
      setState(prev => ({ ...prev, isSyncing: false }))
    }
  }, [refreshStatus])

  // Initial status load + 5-min polling (DB only, zero Zoho calls)
  useEffect(() => {
    refreshStatus()
    const timer = setInterval(refreshStatus, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [refreshStatus])

  return { ...state, syncNow, refreshStatus }
}
