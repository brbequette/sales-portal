import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const handler = readFileSync('netlify/functions/zoho-update-status.ts', 'utf8')

describe('Zoho quote status transition contract', () => {
  it('moves a draft quote through sent before accepted without emailing it', () => {
    expect(handler).toContain("if (currentStatus === 'draft')")
    expect(handler).toContain("await postStatus('sent')")
    expect(handler).toContain("await postStatus('accepted')")
    expect(handler).not.toContain('/email?organization_id=')
  })

  it('persists the intermediate sent state before attempting acceptance', () => {
    const quoteTransition = handler.slice(handler.indexOf("if (action === 'accepted')"))
    const sentCall = quoteTransition.indexOf("await postStatus('sent')")
    const sentPersistence = quoteTransition.indexOf("data: { status: 'sent'")
    const acceptedCall = quoteTransition.indexOf("await postStatus('accepted')")
    expect(sentCall).toBeGreaterThan(-1)
    expect(sentPersistence).toBeGreaterThan(sentCall)
    expect(acceptedCall).toBeGreaterThan(sentPersistence)
  })

  it('fails closed for unsupported authoritative states and preserves provider diagnostics', () => {
    expect(handler).toContain("currentStatus !== 'sent' && currentStatus !== 'accepted'")
    expect(handler).toContain("Quote cannot be accepted from status")
    expect(handler).toContain("data?.code != null ? ` [${data.code}]` : ''")
  })
})
