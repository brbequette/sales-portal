type CacheEntry = { value: unknown; expiresAt: number }

const responseCache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<unknown>>()

/** Share identical local read requests across independently mounted widgets. */
export async function fetchSharedJson<T>(url: string, maxAgeMs = 15_000): Promise<T> {
  const cached = responseCache.get(url)
  if (cached && cached.expiresAt > Date.now()) return cached.value as T

  const pending = inFlight.get(url)
  if (pending) return pending as Promise<T>

  const request = fetch(url, { cache: "no-store" })
    .then(async response => {
      if (!response.ok) throw new Error(`${url} returned ${response.status}`)
      const value = await response.json() as T
      responseCache.set(url, { value, expiresAt: Date.now() + maxAgeMs })
      return value
    })
    .finally(() => inFlight.delete(url))

  inFlight.set(url, request)
  return request
}

export function clearSharedJson(url: string) {
  responseCache.delete(url)
}
