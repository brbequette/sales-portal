'use client'
import { useState } from 'react'
import { useSyncStatus, SyncTable } from '@/hooks/useSyncStatus'

const TABLE_LABELS: Record<SyncTable, { label: string; icon: string }> = {
  leads:       { label: 'Leads',        icon: '👤' },
  invoices:    { label: 'Invoices',     icon: '🧾' },
  salesOrders: { label: 'Sales Orders', icon: '📦' },
  accounts:    { label: 'Accounts',     icon: '🏢' },
}

function formatAge(minutes: number | null): string {
  if (minutes === null) return 'never'
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hrs = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hrs}h ${mins}m ago` : `${hrs}h ago`
}

interface SyncRowProps {
  table: SyncTable
  isSyncing: boolean
  onSync: (table: SyncTable) => void
}

function SyncRow({ table, isSyncing, onSync }: SyncRowProps) {
  const { tables } = useSyncStatus()
  const t = tables[table]
  const meta = TABLE_LABELS[table]

  const isStale = t.isStale
  const hasError = !!t.lastError
  const neverSynced = !t.lastSyncAt

  let statusColor = 'text-neutral-500'
  let dotColor = 'bg-neutral-600'
  if (hasError) { statusColor = 'text-red-400'; dotColor = 'bg-red-500' }
  else if (neverSynced) { statusColor = 'text-neutral-400'; dotColor = 'bg-neutral-500' }
  else if (isStale) { statusColor = 'text-amber-400'; dotColor = 'bg-amber-500 animate-pulse' }
  else { statusColor = 'text-emerald-400'; dotColor = 'bg-emerald-500' }

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors group">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm">{meta.icon}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
            <span className="text-xs font-bold text-white truncate">{meta.label}</span>
            {t.isManualOnly && (
              <span className="text-[10px] px-1 py-0.5 rounded bg-white/10 text-neutral-400 font-bold flex-shrink-0">
                MANUAL
              </span>
            )}
          </div>
          <p className={`text-[11px] ${statusColor} truncate`}>
            {hasError
              ? `Error: ${t.lastError}`
              : neverSynced
              ? 'Not yet synced'
              : `Synced ${formatAge(t.ageMinutes)}${t.lastCount > 0 ? ` · ${t.lastCount} records` : ''}`}
          </p>
        </div>
      </div>
      <button
        onClick={() => onSync(table)}
        disabled={isSyncing}
        title={`Force sync ${meta.label} from Zoho`}
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-[10px] font-bold bg-indigo-600/80 hover:bg-indigo-500 text-white rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isSyncing ? '…' : 'Sync'}
      </button>
    </div>
  )
}

interface SyncStatusBarProps {
  /** Which tables to show. Defaults to all. */
  tables?: SyncTable[]
  /** Show as a compact floating button instead of expanded panel */
  compact?: boolean
  className?: string
}

export default function SyncStatusBar({
  tables = ['leads', 'invoices', 'salesOrders', 'accounts'],
  compact = false,
  className = '',
}: SyncStatusBarProps) {
  const { isSyncing, syncNow, lastRefreshed } = useSyncStatus()
  const [expanded, setExpanded] = useState(false)
  const [syncingTable, setSyncingTable] = useState<SyncTable | null>(null)

  const handleSyncTable = async (table: SyncTable) => {
    setSyncingTable(table)
    await syncNow([table], true)
    setSyncingTable(null)
  }

  const handleSyncAll = async () => {
    await syncNow(tables, true)
  }

  if (compact) {
    return (
      <div className={`relative ${className}`}>
        <button
          onClick={() => setExpanded(e => !e)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
            isSyncing
              ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-300'
              : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white hover:border-white/20'
          }`}
        >
          <span className={isSyncing ? 'animate-spin inline-block' : ''}>⟳</span>
          <span>{isSyncing ? 'Syncing…' : 'Sync'}</span>
        </button>

        {expanded && (
          <div
            className="absolute right-0 top-full mt-2 w-72 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
            onMouseLeave={() => setExpanded(false)}
          >
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <span className="text-xs font-black text-white uppercase tracking-wider">Zoho Sync</span>
              <button
                onClick={handleSyncAll}
                disabled={isSyncing}
                className="text-[10px] font-bold px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors disabled:opacity-40"
              >
                {isSyncing ? 'Syncing…' : 'Sync All'}
              </button>
            </div>
            <div className="p-2 space-y-0.5">
              {tables.map(t => (
                <SyncRow
                  key={t}
                  table={t}
                  isSyncing={isSyncing || syncingTable === t}
                  onSync={handleSyncTable}
                />
              ))}
            </div>
            {lastRefreshed && (
              <div className="px-4 py-2 border-t border-white/5 text-[10px] text-neutral-600">
                Status checked {formatAge(Math.floor((Date.now() - lastRefreshed.getTime()) / 60000))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Expanded panel mode
  return (
    <div className={`bg-zinc-900/80 border border-white/10 rounded-xl overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <div>
          <span className="text-sm font-black text-white">Zoho Sync Status</span>
          {lastRefreshed && (
            <p className="text-[10px] text-neutral-500 mt-0.5">
              Status checked {formatAge(Math.floor((Date.now() - lastRefreshed.getTime()) / 60000))}
            </p>
          )}
        </div>
        <button
          onClick={handleSyncAll}
          disabled={isSyncing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className={isSyncing ? 'animate-spin inline-block' : ''}>⟳</span>
          {isSyncing ? 'Syncing…' : 'Sync All'}
        </button>
      </div>
      <div className="p-2 space-y-0.5">
        {tables.map(t => (
          <SyncRow
            key={t}
            table={t}
            isSyncing={isSyncing || syncingTable === t}
            onSync={handleSyncTable}
          />
        ))}
      </div>
    </div>
  )
}
