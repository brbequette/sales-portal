/**
 * sessionCache — lightweight TTL-keyed cache backed by sessionStorage
 *
 * Data is stored per browser session and expires after `ttlMs` milliseconds.
 * On cache miss (expired or absent) the caller should fetch fresh data.
 *
 * For data that should survive page navigation within a session (WARM data).
 * Use localCache (localStorage) for COLD data that should persist between sessions.
 */

interface CacheEntry<T> {
  data: T
  cachedAt: number // Date.now()
}

// ── sessionStorage (WARM data: survives navigation, cleared on tab close) ─────

export function sessionGet<T>(key: string, ttlMs: number): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(`sc:${key}`)
    if (!raw) return null
    const entry: CacheEntry<T> = JSON.parse(raw)
    if (Date.now() - entry.cachedAt > ttlMs) {
      sessionStorage.removeItem(`sc:${key}`)
      return null
    }
    return entry.data
  } catch {
    return null
  }
}

export function sessionSet<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return
  try {
    const entry: CacheEntry<T> = { data, cachedAt: Date.now() }
    sessionStorage.setItem(`sc:${key}`, JSON.stringify(entry))
  } catch {
    // Quota exceeded — silently skip caching
  }
}

export function sessionDel(key: string): void {
  if (typeof window === 'undefined') return
  try { sessionStorage.removeItem(`sc:${key}`) } catch {}
}

export function sessionDelPrefix(prefix: string): void {
  if (typeof window === 'undefined') return
  try {
    const keys = Object.keys(sessionStorage).filter(k => k.startsWith(`sc:${prefix}`))
    keys.forEach(k => sessionStorage.removeItem(k))
  } catch {}
}

// ── localStorage (COLD data: persists between sessions) ──────────────────────

export function localGet<T>(key: string, ttlMs: number): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(`lc:${key}`)
    if (!raw) return null
    const entry: CacheEntry<T> = JSON.parse(raw)
    if (Date.now() - entry.cachedAt > ttlMs) {
      localStorage.removeItem(`lc:${key}`)
      return null
    }
    return entry.data
  } catch {
    return null
  }
}

export function localSet<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return
  try {
    const entry: CacheEntry<T> = { data, cachedAt: Date.now() }
    localStorage.setItem(`lc:${key}`, JSON.stringify(entry))
  } catch {}
}

export function localDel(key: string): void {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(`lc:${key}`) } catch {}
}

// ── TTL constants ─────────────────────────────────────────────────────────────

export const TTL = {
  /** 5 minutes — accounts list, frequently filtered */
  FIVE_MIN:    5  * 60 * 1000,
  /** 10 minutes — collections, rep stats */
  TEN_MIN:     10 * 60 * 1000,
  /** 15 minutes — commissions */
  FIFTEEN_MIN: 15 * 60 * 1000,
  /** 30 minutes — users list, campaign templates */
  THIRTY_MIN:  30 * 60 * 1000,
  /** 1 hour — media assets */
  ONE_HOUR:    60 * 60 * 1000,
  /** 24 hours — phone numbers, product catalog */
  ONE_DAY:     24 * 60 * 60 * 1000,
} as const
