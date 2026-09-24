import { describe, expect, it } from 'vitest'
import {
  zohoBooksSinceParam,
  zohoCrmModifiedSince,
  zohoCrmReadHeaders,
} from '../src/lib/zoho-incremental-filter'

describe('Zoho incremental request contracts', () => {
  it('formats Books cursors as full timestamps with numeric UTC offsets', () => {
    expect(decodeURIComponent(zohoBooksSinceParam('2026-09-23T12:34:56.000Z')))
      .toBe('&last_modified_time=2026-09-23T12:32:56+0000')
  })

  it('puts CRM cursors in If-Modified-Since instead of the query string', () => {
    expect(zohoCrmModifiedSince('2026-09-23T12:34:56.000Z'))
      .toBe('2026-09-23T12:32:56+00:00')
    expect(zohoCrmReadHeaders('token', '2026-09-23T12:34:56.000Z')).toEqual({
      Authorization: 'Zoho-oauthtoken token',
      'If-Modified-Since': '2026-09-23T12:32:56+00:00',
    })
  })

  it('omits incremental filters for missing or malformed cursors', () => {
    expect(zohoBooksSinceParam(null)).toBe('')
    expect(zohoBooksSinceParam('not-a-date')).toBe('')
    expect(zohoCrmModifiedSince(undefined)).toBeNull()
    expect(zohoCrmReadHeaders('token', 'invalid')).toEqual({
      Authorization: 'Zoho-oauthtoken token',
    })
  })
})
