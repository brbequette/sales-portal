/**
 * zohoCache.ts
 * In-memory TTL caching engine for Zoho API queries and heavy database queries.
 * Prevents hitting Zoho's 5,000–25,000 daily API rate limit quota.
 */

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

class ZohoCache {
  private cache = new Map<string, CacheEntry<any>>()
  private defaultTTLMs = 5 * 60 * 1000 // 5 minutes default TTL

  /**
   * Get a cached value by key, or return null if expired or missing.
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }
    return entry.data as T
  }

  /**
   * Set a cached value with optional TTL in milliseconds.
   */
  set<T>(key: string, data: T, ttlMs: number = this.defaultTTLMs): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs
    })
  }

  /**
   * Delete a specific key from cache (e.g. after a mutation).
   */
  invalidate(key: string): void {
    this.cache.delete(key)
  }

  /**
   * Invalidate all keys matching a prefix (e.g. "invoices:*").
   */
  invalidatePrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Clear entire cache.
   */
  clear(): void {
    this.cache.clear()
  }
}

// Export singleton instance on globalThis for hot reload stability
const globalForCache = globalThis as unknown as { zohoCache?: ZohoCache }
export const zohoCache = globalForCache.zohoCache || new ZohoCache()
if (process.env.NODE_ENV !== "production") globalForCache.zohoCache = zohoCache
