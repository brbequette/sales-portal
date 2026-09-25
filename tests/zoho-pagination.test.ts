import { describe, expect, it, vi } from 'vitest'
import { fetchZohoPages } from '../src/lib/zoho-pagination'

function response(payload: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('bounded Zoho pagination', () => {
  it.each([0, 1, 49, 50, 51, 200])('returns one complete Books page containing %i records', async count => {
    const fetchImpl = vi.fn(async () => response({ items: Array.from({ length: count }, (_, id) => ({ id })), page_context: { has_more_page: false } }))
    const result = await fetchZohoPages({ baseUrl: 'https://example.test/items?per_page=200', headers: {}, kind: 'books', selectRecords: value => value.items, startedAt: 0, now: () => 0, fetchImpl: fetchImpl as typeof fetch })
    expect(result).toMatchObject({ complete: true, pages: 1 })
    expect(result.records).toHaveLength(count)
  })

  it('fetches the 201st record from a second page without duplication', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => String(url).endsWith('page=1')
      ? response({ data: Array.from({ length: 200 }, (_, id) => ({ id })), info: { more_records: true } })
      : response({ data: [{ id: 200 }], info: { more_records: false } }))
    const result = await fetchZohoPages<{ id: number }>({ baseUrl: 'https://example.test/leads?per_page=200', headers: {}, kind: 'crm', selectRecords: value => value.data, startedAt: 0, now: () => 0, fetchImpl: fetchImpl as typeof fetch })
    expect(result).toMatchObject({ complete: true, pages: 2 })
    expect(result.records.map(record => record.id)).toEqual(Array.from({ length: 201 }, (_, id) => id))
  })

  it('treats CRM 204 as a complete empty delta without parsing JSON', async () => {
    const result = await fetchZohoPages({ baseUrl: 'https://example.test/leads', headers: {}, kind: 'crm', selectRecords: value => value.data, startedAt: 0, now: () => 0, fetchImpl: vi.fn(async () => response(null, 204)) as typeof fetch })
    expect(result).toEqual({ records: [], pages: 1, complete: true })
  })

  it('reports a bounded or timed-out page walk as incomplete', async () => {
    const fetchImpl = vi.fn(async () => response({ items: [{ id: 1 }], page_context: { has_more_page: true } }))
    const bounded = await fetchZohoPages({ baseUrl: 'https://example.test/items', headers: {}, kind: 'books', selectRecords: value => value.items, startedAt: 0, now: () => 0, maxPages: 2, fetchImpl: fetchImpl as typeof fetch })
    expect(bounded).toMatchObject({ complete: false, pages: 2, nextPage: 3, incompleteReason: 'bounded page limit (2) reached' })
    const timedOut = await fetchZohoPages({ baseUrl: 'https://example.test/items', headers: {}, kind: 'books', selectRecords: value => value.items, startedAt: 0, now: () => 51, timeoutMs: 55, completionReserveMs: 5, fetchImpl: fetchImpl as typeof fetch })
    expect(timedOut).toMatchObject({ complete: false, pages: 0, incompleteReason: 'timeout before next page' })
  })

  it('resumes at the durable continuation page', async () => {
    const urls: string[] = []
    const result = await fetchZohoPages({ baseUrl: 'https://example.test/items', headers: {}, kind: 'books', selectRecords: value => value.items, startedAt: 0, now: () => 0, startPage: 11, maxPages: 2, fetchImpl: vi.fn(async url => { urls.push(String(url)); return response({ items: [{ id: urls.length }], page_context: { has_more_page: urls.length === 1 } }) }) as typeof fetch })
    expect(urls).toEqual(['https://example.test/items?page=11', 'https://example.test/items?page=12'])
    expect(result).toMatchObject({ complete: true, pages: 2 })
  })

  it('surfaces provider errors instead of returning false completion', async () => {
    await expect(fetchZohoPages({ baseUrl: 'https://example.test/items', headers: {}, kind: 'books', selectRecords: value => value.items, startedAt: 0, now: () => 0, fetchImpl: vi.fn(async () => new Response('provider failed', { status: 503 })) as typeof fetch }))
      .rejects.toThrow('Zoho API returned 503: provider failed')
  })
})
