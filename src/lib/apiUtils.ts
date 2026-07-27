/**
 * apiUtils.ts
 * Utility for safe JSON fetching that prevents "Unexpected token 'I', Internal Server Error" JSON parse crashes.
 */

export async function safeFetchJson<T = any>(url: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, options)
    if (!res.ok) {
      console.warn(`[safeFetchJson] HTTP ${res.status} for ${url}`)
      return null
    }
    const contentType = res.headers.get("content-type") || ""
    if (!contentType.includes("application/json")) {
      const text = await res.text()
      console.warn(`[safeFetchJson] Non-JSON response for ${url}:`, text.slice(0, 100))
      return null
    }
    return (await res.json()) as T
  } catch (err: any) {
    console.error(`[safeFetchJson] Exception for ${url}:`, err?.message || err)
    return null
  }
}
