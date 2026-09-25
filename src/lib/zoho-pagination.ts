const DEFAULT_TIMEOUT_MS = 55000
const DEFAULT_MAX_PAGES = 10
const DEFAULT_FETCH_TIMEOUT_MS = 15000
const DEFAULT_COMPLETION_RESERVE_MS = 5000

type ZohoPageKind = 'crm' | 'books'

export type ZohoPageResult<T> = {
  records: T[]
  pages: number
  complete: boolean
  incompleteReason?: string
  nextPage?: number
}

export async function fetchZohoPages<T>({
  baseUrl,
  headers,
  kind,
  selectRecords,
  startedAt,
  fetchImpl = fetch,
  now = Date.now,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxPages = DEFAULT_MAX_PAGES,
  fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  completionReserveMs = DEFAULT_COMPLETION_RESERVE_MS,
  startPage = 1,
}: {
  baseUrl: string
  headers: Record<string, string>
  kind: ZohoPageKind
  selectRecords: (payload: any) => T[]
  startedAt: number
  fetchImpl?: typeof fetch
  now?: () => number
  timeoutMs?: number
  maxPages?: number
  fetchTimeoutMs?: number
  completionReserveMs?: number
  startPage?: number
}): Promise<ZohoPageResult<T>> {
  const records: T[] = []
  const finalPage = startPage + maxPages - 1
  for (let page = startPage; page <= finalPage; page += 1) {
    if (now() - startedAt > timeoutMs - completionReserveMs) {
      return { records, pages: page - startPage, complete: false, incompleteReason: 'timeout before next page', nextPage: page }
    }
    const separator = baseUrl.includes('?') ? '&' : '?'
    const response = await fetchImpl(`${baseUrl}${separator}page=${page}`, {
      signal: AbortSignal.timeout(fetchTimeoutMs),
      headers,
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Zoho API returned ${response.status}: ${detail.substring(0, 100)}`)
    }
    if (response.status === 204) return { records, pages: page - startPage + 1, complete: true }

    const payload = await response.json()
    records.push(...selectRecords(payload))
    const hasMore = kind === 'crm'
      ? payload?.info?.more_records === true
      : payload?.page_context?.has_more_page === true
    if (!hasMore) return { records, pages: page - startPage + 1, complete: true }
  }
  return {
    records,
    pages: maxPages,
    complete: false,
    incompleteReason: `bounded page limit (${maxPages}) reached`,
    nextPage: finalPage + 1,
  }
}
