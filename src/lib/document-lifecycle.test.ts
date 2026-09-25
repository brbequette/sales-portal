import { describe, expect, it } from 'vitest'

import { buildDocumentLifecycleRefreshToken } from './document-lifecycle'

describe('buildDocumentLifecycleRefreshToken', () => {
  it('changes when a purchase order appears after document refresh', () => {
    expect(buildDocumentLifecycleRefreshToken([])).toBe('')
    expect(buildDocumentLifecycleRefreshToken([{ zohoId: 'po-1', status: 'draft' }])).toBe('po-1:draft')
  })

  it('changes when an existing purchase order status changes', () => {
    const draft = buildDocumentLifecycleRefreshToken([{ id: 'po-1', status: 'draft' }])
    const issued = buildDocumentLifecycleRefreshToken([{ id: 'po-1', status: 'issued' }])
    expect(issued).not.toBe(draft)
  })
})
