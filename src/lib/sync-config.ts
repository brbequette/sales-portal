import { prisma } from './prisma'

/** All syncable data tables */
export type SyncTable = 'leads' | 'invoices' | 'salesOrders' | 'accounts'
export const SYNC_TABLES: SyncTable[] = ['leads', 'invoices', 'salesOrders', 'accounts']

export interface TableSyncConfig {
  enabled: boolean
  /** 0 = manual only */
  intervalMinutes: number
}

export interface SyncConfig {
  leads: TableSyncConfig
  invoices: TableSyncConfig
  salesOrders: TableSyncConfig
  accounts: TableSyncConfig
}

export interface TableSyncStatus {
  lastSyncAt: string | null   // ISO string
  lastCount: number
  lastError: string | null
}

export interface SyncStatus {
  leads: TableSyncStatus
  invoices: TableSyncStatus
  salesOrders: TableSyncStatus
  accounts: TableSyncStatus
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  leads:       { enabled: false, intervalMinutes: 0 },  // manual only by default
  invoices:    { enabled: false, intervalMinutes: 0 },
  salesOrders: { enabled: false, intervalMinutes: 0 },
  accounts:    { enabled: false, intervalMinutes: 0 },
}

export const DEFAULT_SYNC_STATUS: SyncStatus = {
  leads:       { lastSyncAt: null, lastCount: 0, lastError: null },
  invoices:    { lastSyncAt: null, lastCount: 0, lastError: null },
  salesOrders: { lastSyncAt: null, lastCount: 0, lastError: null },
  accounts:    { lastSyncAt: null, lastCount: 0, lastError: null },
}

// ─────────────────────────────────────────────
// Getters
// ─────────────────────────────────────────────

export async function getSyncConfig(): Promise<SyncConfig> {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'sync_config' } })
  if (!row?.value) return DEFAULT_SYNC_CONFIG
  try {
    return { ...DEFAULT_SYNC_CONFIG, ...JSON.parse(row.value) }
  } catch {
    return DEFAULT_SYNC_CONFIG
  }
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'sync_status' } })
  if (!row?.value) return DEFAULT_SYNC_STATUS
  try {
    return { ...DEFAULT_SYNC_STATUS, ...JSON.parse(row.value) }
  } catch {
    return DEFAULT_SYNC_STATUS
  }
}

// ─────────────────────────────────────────────
// Setters
// ─────────────────────────────────────────────

export async function saveSyncConfig(config: SyncConfig): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: 'sync_config' },
    update: { value: JSON.stringify(config) },
    create: { key: 'sync_config', value: JSON.stringify(config) },
  })
}

export async function updateTableSyncStatus(
  table: SyncTable,
  patch: Partial<TableSyncStatus>
): Promise<void> {
  const current = await getSyncStatus()
  current[table] = { ...current[table], ...patch }
  await prisma.systemSetting.upsert({
    where: { key: 'sync_status' },
    update: { value: JSON.stringify(current) },
    create: { key: 'sync_status', value: JSON.stringify(current) },
  })
}

// ─────────────────────────────────────────────
// Staleness helpers
// ─────────────────────────────────────────────

export function isTableStale(
  tableStatus: TableSyncStatus,
  tableConfig: TableSyncConfig
): boolean {
  if (!tableConfig.enabled || tableConfig.intervalMinutes === 0) return false // manual only
  if (!tableStatus.lastSyncAt) return true
  const ageMs = Date.now() - new Date(tableStatus.lastSyncAt).getTime()
  return ageMs > tableConfig.intervalMinutes * 60 * 1000
}

export function ageMinutes(lastSyncAt: string | null): number | null {
  if (!lastSyncAt) return null
  return Math.floor((Date.now() - new Date(lastSyncAt).getTime()) / 60000)
}
