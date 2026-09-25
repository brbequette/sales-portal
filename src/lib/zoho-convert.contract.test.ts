import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const handler = readFileSync('netlify/functions/zoho-convert.ts', 'utf8')
const ui = readFileSync('src/components/useInvoiceDetailsData.ts', 'utf8')

describe('Zoho document conversion safety contract', () => {
  it('uses the documented sales-order create endpoint and body builder', () => {
    expect(handler).toContain('buildSalesOrderFromQuotePayload(originalData)')
    expect(handler).toContain('`${baseUrl}/salesorders?organization_id=${ORG_ID}`')
    expect(handler).not.toContain('salesorders?organization_id=${ORG_ID}&estimate_id=${sourceId}')
  })

  it('prevents duplicate or ambiguous submissions', () => {
    expect(handler).toContain('providerWriteOperation.upsert')
    expect(handler).toContain('operation.state === "SYNCING" || operation.state === "AMBIGUOUS"')
    expect(handler).toContain('state: "AMBIGUOUS"')
    expect(handler).toContain('state: "SUCCEEDED"')
  })

  it('persists an authoritative synchronization baseline with converted documents', () => {
    expect(handler).toContain('const syncedAt = new Date()')
    expect(handler).toContain('lastZohoModifiedTime: providerModifiedAt')
    expect(handler).toContain('lastSyncedAt: syncedAt')
    expect(handler).toContain('appModifiedAt: syncedAt')
    expect(handler).toContain('rawData: data[resultKey] || {}')
  })

  it('reopens only a definitively failed operation after the corrected payload changes', () => {
    expect(handler).toContain('const sourceStatus = String(originalData?.status || "").trim().toUpperCase()')
    expect(handler).toContain('JSON.stringify({ sourceType, booksSourceId, sourceStatus, targetType, payload })')
    expect(handler).toContain('operation.state !== "FAILED"')
    expect(handler).toContain('where: { operationKey, state: "FAILED", requestFingerprint: operation.requestFingerprint }')
    expect(handler).toContain('requestFingerprint,\n          state: "PENDING"')
    expect(handler).toContain('operation.state === "FAILED" && operation.requestFingerprint === requestFingerprint')
  })

  it('preserves provider diagnostics in the UI', () => {
    expect(ui).toContain('const data = await res.json().catch(() => null)')
    expect(ui).toContain('data?.providerState')
    expect(ui).toContain('data?.code')
  })
})
