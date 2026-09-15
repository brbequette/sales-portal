export const BOUNDED_BOOKS_RESOURCES = [
  { key: 'invoices', endpoint: 'invoices', collection: 'invoices', id: 'invoice_id' },
  { key: 'salesOrders', endpoint: 'salesorders', collection: 'salesorders', id: 'salesorder_id' },
  { key: 'quotes', endpoint: 'estimates', collection: 'estimates', id: 'estimate_id' },
  { key: 'payments', endpoint: 'customerpayments', collection: 'customerpayments', id: 'payment_id' },
  { key: 'creditNotes', endpoint: 'creditnotes', collection: 'creditnotes', id: 'creditnote_id' },
] as const

export type BoundedResourceKey = typeof BOUNDED_BOOKS_RESOURCES[number]['key']
export type ImportStatus = 'PREVIEW' | 'RUNNING' | 'CANCELLED_PARTIAL' | 'COMPLETE' | 'FAILED'

export interface ReadTransport {
  get(path: string, query: Record<string, string | number>): Promise<{ status: number; json(): Promise<Record<string, unknown>> }>
}

export interface ProgressEvent {
  stage: string
  resource: string
  page: number
  count: number
}

export interface BoundedRange { startDate: string; endDate: string }

export interface BoundedCollection {
  range: BoundedRange
  records: Record<BoundedResourceKey, Record<string, unknown>[]>
  counts: Record<BoundedResourceKey, number>
  pages: Record<BoundedResourceKey, number>
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

export function boundedBooksDateRange(now = new Date(), timeZone = process.env.COMPANY_TIMEZONE || 'America/Phoenix'): BoundedRange {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const value = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])) as Record<string, string>
  const endDate = `${value.year}-${value.month}-${value.day}`
  const end = new Date(`${endDate}T12:00:00Z`)
  const start = Number(value.day) <= 7
    ? new Date(Date.UTC(Number(value.year), Number(value.month) - 2, 1, 12))
    : new Date(end.getTime() - 7 * DAY_MS)
  const startParts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(start)
  const startValue = Object.fromEntries(startParts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])) as Record<string, string>
  return validateBoundedRange(`${startValue.year}-${startValue.month}-${startValue.day}`, endDate)
}

export function validateBoundedRange(startDate: unknown, endDate: unknown): BoundedRange {
  if (typeof startDate !== 'string' || typeof endDate !== 'string' || !DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    throw new Error('INVALID_DATE_RANGE')
  }
  const start = new Date(`${startDate}T00:00:00.000Z`)
  const end = new Date(`${endDate}T23:59:59.999Z`)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || startDate > endDate || end.getTime() - start.getTime() >= 31 * DAY_MS) {
    throw new Error('INVALID_DATE_RANGE')
  }
  return { startDate, endDate }
}

function pageContext(data: Record<string, unknown>): { hasMore: boolean; present: boolean } {
  const context = data.page_context
  if (!context || typeof context !== 'object') return { hasMore: false, present: false }
  return { hasMore: (context as Record<string, unknown>).has_more_page === true, present: true }
}

export async function collectBoundedBooks(
  transport: ReadTransport,
  range: BoundedRange,
  onProgress?: (event: ProgressEvent) => Promise<void> | void,
  signal?: { cancelled: () => boolean | Promise<boolean> },
): Promise<BoundedCollection> {
  const records = {} as BoundedCollection['records']
  const counts = {} as BoundedCollection['counts']
  const pages = {} as BoundedCollection['pages']
  for (const resource of BOUNDED_BOOKS_RESOURCES) {
    const rows: Record<string, unknown>[] = []
    const seenPages = new Set<string>()
    let page = 1
    let hasMore = true
    while (hasMore) {
      if (await signal?.cancelled()) throw new Error('CANCELLED')
      if (page > 1000) throw new Error('PAGE_LIMIT_EXCEEDED')
      const marker = `${resource.endpoint}:${page}`
      if (seenPages.has(marker)) throw new Error('REPEATED_PAGE')
      seenPages.add(marker)
      const response = await transport.get(resource.endpoint, {
        date_start: range.startDate, date_end: range.endDate, page, per_page: 200,
        sort_column: 'date', sort_order: 'D',
      })
      if (response.status < 200 || response.status >= 300) throw new Error(`ZOHO_READ_${response.status}`)
      const data = await response.json()
      const context = pageContext(data)
      if (!context.present) throw new Error('INCOMPLETE_PAGINATION')
      const pageRows: unknown[] = Array.isArray(data[resource.collection]) ? data[resource.collection] as unknown[] : []
      for (const row of pageRows) if (row && typeof row === 'object') rows.push(row as Record<string, unknown>)
      await onProgress?.({ stage: 'READ', resource: resource.key, page, count: pageRows.length })
      hasMore = context.hasMore
      page += 1
    }
    records[resource.key] = rows
    counts[resource.key] = rows.length
    pages[resource.key] = page - 1
  }
  return Object.freeze({ range, records: Object.freeze(records), counts: Object.freeze(counts), pages: Object.freeze(pages) })
}

export function redactedCounts(collection: BoundedCollection) {
  return Object.freeze({ ...collection.counts, pages: collection.pages, range: collection.range })
}
