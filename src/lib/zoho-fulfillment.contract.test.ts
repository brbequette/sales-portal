import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'netlify/functions/zoho-fulfillment.ts'), 'utf8')
const lifecycleSource = readFileSync(join(process.cwd(), 'src/components/DocumentLifecycle.tsx'), 'utf8')
const modalSource = readFileSync(join(process.cwd(), 'src/components/InvoiceDetailsModal.tsx'), 'utf8')

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

  it('does not submit a sales-order display name to a purchase-order dropdown', () => {
    expect(source).not.toContain('api_name: "cf_sales_person"')
    expect(source).toContain('payload.zcrm_owner_id = so.salesperson_id')
  })

  it('guards purchase-order email by administrator, exact account contact, and durable idempotency', () => {
    expect(source).toContain('action === "GetPurchaseOrderEmailStatus"')
    expect(source).toContain('"Cache-Control": "no-store"')
    expect(source).toContain('operation: "EMAIL_PURCHASE_ORDER", entityType: "PURCHASE_ORDER", entityId: purchaseOrderId')
    expect(source).toContain('action === "EmailPurchaseOrder"')
    expect(source).toContain('isAdministratorRole(sessionUser.role)')
    expect(source).toContain('Recipient must exactly match a contact on the linked account')
    expect(source).toContain('operation: "EMAIL_PURCHASE_ORDER"')
    expect(source).toContain('This purchase-order email is in progress or requires reconciliation; it was not resubmitted.')
  })

  it('sends only to the explicit linked contact and never copies a vendor', () => {
    expect(source).toContain('to_mail_ids: [recipientEmail]')
    expect(source).toContain('cc_mail_ids: []')
    expect(source).toContain('bcc_mail_ids: []')
    expect(source).not.toContain('to_mail_ids: [vendor')
  })

  it('uses provider identities and snapshot numbers in the document lifecycle', () => {
    expect(lifecycleSource).toContain("data.zohoId || data.purchaseorder_id || data.id")
    expect(lifecycleSource).toContain('salesOrder?.items?.salesorder_number')
  })

  it('exposes the guarded action only to admins and never automatically retries', () => {
    expect(modalSource).toContain('isAdmin && displayData.email')
    expect(modalSource).toContain("action: 'EmailPurchaseOrder'")
    expect(modalSource).toContain("action: 'GetPurchaseOrderEmailStatus'")
    expect(modalSource).toContain("cache: 'no-store'")
    expect(modalSource).toContain("Checking email history...")
    expect(modalSource).toContain("if (status !== 'idle') return")
    expect(modalSource).toContain('The vendor will not be copied')
  })
})
