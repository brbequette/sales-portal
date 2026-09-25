import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'netlify/functions/zoho-fulfillment.ts'), 'utf8')

describe('dropship purchase-order safety contract', () => {
  it('requires a stable request id and durable provider-write claim', () => {
    expect(source).toContain('requestId')
    expect(source).toContain('providerWriteOperation.upsert')
    expect(source).toContain('providerWriteOperation.updateMany')
    expect(source).toContain('state: "AMBIGUOUS"')
    expect(source).toContain('state: "SUCCEEDED"')
  })

  it('does not fabricate or fetch fallback cost', () => {
    expect(source).not.toContain('dbProd.price * 0.50')
    expect(source).not.toContain('purchaseRate = parseFloat(soItem.rate)')
    expect(source).not.toContain('/items/${soItem.item_id}')
    expect(source).toContain('validateDirectDropshipEvidence(dbProd, vendorId)')
  })

  it('never automatically retries terminal or ambiguous provider writes', () => {
    expect(source).toContain('operation.state === "SYNCING" || operation.state === "AMBIGUOUS"')
    expect(source).toContain('operation.state === "FAILED"')
    expect(source).toContain('was not resubmitted')
  })
})
